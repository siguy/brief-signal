#!/usr/bin/env node

/**
 * One-shot repair pass: feed the critique's hard failures (and any linter
 * hard failures) back to Gemini for a minimal, targeted revision of the
 * briefing — so the Monday PR review starts from a clean draft instead of
 * a punch list.
 *
 * Deliberately ONE pass, not a loop: repeated LLM rewrites drift away from
 * the reviewed draft, and anything still failing after one repair should go
 * to the human (surfaced in the PR body, as before).
 *
 * Usage: node scripts/repair-briefing.js [YYYY-MM-DD]
 *   (defaults to the most recent briefing; expects a matching
 *    scripts/logs/critique-<date>.json from a prior critique run)
 *
 * Exit codes:
 *   0 — repaired (file rewritten) or nothing to repair
 *   1 — repair errored (original file left untouched)
 */

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
const { lint } = require("./lint-briefing.js");

const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");
const LOGS_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOGS_DIR, "repair-briefing.log");
const PROMPT_FILE = path.join(__dirname, "briefing-prompt.md");

function log(msg) {
  const line = `[${new Date().toISOString()}] repair-briefing: ${msg}`;
  console.log(msg);
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (_) {
    /* logging must never break the repair */
  }
}

function latestBriefingDate() {
  const candidates = fs
    .readdirSync(BRIEFINGS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();
  return candidates.length ? candidates[candidates.length - 1].replace(/\.md$/, "") : null;
}

// Strip a single outer ```/```markdown fence if Gemini wrapped its response.
function stripOuterFence(text) {
  const m = text.match(/^\s*```(?:markdown)?\s*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : text;
}

function collectFailures(date, briefingMd) {
  const failures = [];
  const critiqueJson = path.join(LOGS_DIR, `critique-${date}.json`);
  if (fs.existsSync(critiqueJson)) {
    try {
      const critique = JSON.parse(fs.readFileSync(critiqueJson, "utf-8"));
      for (const f of critique.hard_failures || []) {
        failures.push(`- RULE: ${f.rule}\n  EVIDENCE: ${f.evidence}\n  FIX: ${f.fix || "(apply the rule)"}`);
      }
    } catch (err) {
      log(`WARN: could not parse ${path.basename(critiqueJson)}: ${err.message}`);
    }
  } else {
    log(`WARN: no critique JSON found at ${path.basename(critiqueJson)} — repairing from linter findings only.`);
  }
  for (const h of lint(briefingMd).hard) {
    // Image-file failures are fixed on disk (re-fetch or replace the file),
    // never by editing the markdown — feeding them to the LLM invites it to
    // "fix" the failure by deleting the image reference. Surface them in the
    // PR instead.
    if (h.startsWith("[images]")) continue;
    // A repeated lead is an editorial call — demote the story and promote
    // another. The LLM can't make that call from the draft alone, so it would
    // reword the lead just enough to drop below the overlap threshold while
    // still running last week's story. Surface it in the PR instead.
    if (h.startsWith("[cross-edition-lead]")) continue;
    failures.push(`- LINTER: ${h}`);
  }
  return failures;
}

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    log("ERROR: GOOGLE_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const date = process.argv[2] || latestBriefingDate();
  if (!date) {
    log("ERROR: no briefing found to repair.");
    process.exit(1);
  }
  const briefingFile = path.join(BRIEFINGS_DIR, `${date}.md`);
  if (!fs.existsSync(briefingFile)) {
    log(`ERROR: briefing not found: ${briefingFile}`);
    process.exit(1);
  }

  const original = fs.readFileSync(briefingFile, "utf-8");
  const failures = collectFailures(date, original);
  if (!failures.length) {
    log(`Nothing to repair for ${date}.`);
    process.exit(0);
  }

  log(`Repairing ${date}.md — ${failures.length} hard failure(s) to address...`);
  const systemPrompt = fs.readFileSync(PROMPT_FILE, "utf-8");

  const userMessage = `Below is a drafted briefing that failed quality review, followed by the exact hard failures found. Fix ONLY these failures with the SMALLEST possible edits — do not restructure, re-select stories, rewrite passages that were not flagged, or change any URL that is not itself flagged. Preserve the frontmatter.

CRITICAL — you must NEVER invent a URL. You have no access to the source material, so you cannot know any URL that is not already in the briefing. If a failure concerns a broken, truncated, or missing URL, do NOT fabricate one: leave that link exactly as it is (a human will fix it). Fabricating a URL is a worse failure than the one you'd be fixing.

Return the complete corrected briefing markdown and nothing else.

## Hard failures to fix

${failures.join("\n")}

## The briefing

${original}`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3.7-flash",
    contents: userMessage,
    config: {
      systemInstruction: systemPrompt,
      thinkingConfig: { thinkingLevel: "HIGH" },
    },
  });

  const repaired = stripOuterFence((response.text || "").trim());

  // Sanity guards: a repair that loses the frontmatter or a big chunk of the
  // draft is worse than no repair. Keep the original in that case.
  if (!repaired.startsWith("---")) {
    log("ERROR: repaired output lost its frontmatter — keeping the original.");
    process.exit(1);
  }
  if (repaired.length < original.length * 0.7) {
    log(
      `ERROR: repaired output is ${repaired.length} chars vs original ${original.length} — too much lost, keeping the original.`
    );
    process.exit(1);
  }
  // Fabrication guard: the model has no access to source material, so any
  // http(s) URL in the repair that was not in the original draft is invented.
  // (Live-test finding: asked to fix a truncated x.com link, Gemini minted a
  // plausible-looking fake tweet ID that passed the linter.) Removing links
  // is allowed; introducing them is not.
  const urlSet = (text) => new Set((text.match(/https?:\/\/[^)\s"']+/g) || []));
  const originalUrls = urlSet(original);
  const invented = [...urlSet(repaired)].filter((u) => !originalUrls.has(u));
  if (invented.length) {
    log(`ERROR: repair introduced ${invented.length} URL(s) not present in the draft — keeping the original:`);
    invented.forEach((u) => log(`  fabricated: ${u}`));
    process.exit(1);
  }

  // Snapshot the pre-repair draft so the before/after pair is preserved
  // (same convention as the v0-stage4 snapshot).
  const draftsDir = path.join(BRIEFINGS_DIR, "drafts");
  fs.mkdirSync(draftsDir, { recursive: true });
  const snapshot = path.join(draftsDir, `${date}-pre-repair.md`);
  if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, original, "utf-8");

  fs.writeFileSync(briefingFile, repaired, "utf-8");
  log(`Repair written to ${path.basename(briefingFile)} (pre-repair snapshot: drafts/${date}-pre-repair.md).`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    log(`ERROR: ${err.message || err}`);
    process.exit(1);
  });
}

module.exports = { collectFailures, stripOuterFence };

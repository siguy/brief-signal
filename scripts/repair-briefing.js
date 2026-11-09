#!/usr/bin/env node

/**
 * Repair pass: fix what the DETERMINISTIC linter found, so the Monday PR review
 * is about editorial calls only — story selection, which voices to include, and
 * how each play is worded — never a fact-check punch list.
 *
 * Three steps, in order:
 *
 *   A. Fact repair, PARAGRAPH BY PARAGRAPH. Each paragraph with a fact finding
 *      (invented product, a number or quote not in its cited source) is sent
 *      alone, with the findings and — when the week's sources hold the claim
 *      exactly once — the correct speaker, link and timestamp found by code.
 *      The model may only re-credit to that source, drop the claim, or cut the
 *      sentence. Before 2026-11-09 this script rewrote the whole document with
 *      "no access to the source material", so it could not re-credit anything.
 *
 *   B. Structural repair (length, TLDR shape, banned words...) — the old
 *      whole-document pass, one shot, for the remaining non-fact failures.
 *
 *   C. Deterministic cut. Any fact finding that survives A and B loses the
 *      clause that carries it (or, failing that, its sentence) — by code. A
 *      wrong claim never reaches review.
 *
 *   D. Length touch-up: a section a re-credit pushed a few words over budget
 *      is shortened alone, under the same guards.
 *
 * Order run: B, A, A again (TLDR lines orphaned by body fixes), C, D.
 *
 * Guards (A and B): a rewrite that adds a URL, a number, or a product name not
 * in the original text or the supplied evidence is rejected and the original
 * kept — the model has nothing to check invented content against.
 *
 * Linter findings ONLY — never the LLM critique's. On 2026-10-25 the critique
 * demanded a third "Your angle" block, the repair added it, and the re-lint
 * failed on failures the repair itself created. (Changed 2026-11-01.)
 *
 * Every change is written to scripts/logs/repair-<date>.md for the PR body
 * ("what the pipeline fixed or cut") — information, not decisions.
 *
 * Usage: node scripts/repair-briefing.js [YYYY-MM-DD]
 *   (defaults to the most recent briefing)
 *
 * Exit codes:
 *   0 — repaired (file rewritten) or nothing to repair
 *   1 — repair errored (original file left untouched)
 */

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
const { TEXT_MODEL } = require("./models.js");
const { lint, briefingDate } = require("./lint-briefing.js");
const { loadSources } = require("./sources.js");
const {
  checkClaimsDetailed,
  checkProducts,
  rawSentences,
  extractNumbers,
  sameNumber,
  productCandidates,
  productKnown,
  productCorpus,
} = require("./claims.js");

const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");
const LOGS_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOGS_DIR, "repair-briefing.log");
const PROMPT_FILE = path.join(__dirname, "briefing-prompt.md");

// Lint checks the structural pass must leave alone: facts are handled by A/C;
// images are fixed on disk (the model would "fix" them by deleting the image);
// a repeated lead is a story-selection call, which stays with the editor.
const NOT_STRUCTURAL = /^\[(setup|products|claims|images|cross-edition-lead)\]/;

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
  const m = text.match(/^\s*```(?:markdown|json)?\s*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : text;
}

// --- findings ---------------------------------------------------------------------

function factFindings(md, sources) {
  return [...checkProducts(md, sources), ...checkClaimsDetailed(md, sources)];
}

// Kept for the structural pass and for tests (same contract as before).
function collectFailures(date, briefingMd, sources = null) {
  return lint(briefingMd, sources)
    .hard.filter((h) => !NOT_STRUCTURAL.test(h))
    .map((h) => `- LINTER: ${h}`);
}

function groupByUnit(findings) {
  const groups = new Map();
  for (const f of findings) {
    if (!groups.has(f.unit)) groups.set(f.unit, { unit: f.unit, kind: f.kind, section: f.section, findings: [] });
    groups.get(f.unit).findings.push(f);
  }
  return [...groups.values()];
}

// --- guards -----------------------------------------------------------------------

const urlsIn = (t) => new Set((t.match(/https?:\/\/[^)\s"']+/g) || []).map((u) => u.replace(/[.,;]+$/, "")));

/**
 * Why `after` may not replace `before`, or null if it may. `evidence` is text
 * the model was given (correct-source quotes); `allowedUrls` the links it was
 * given. Anything new must come from one of them.
 */
function guardViolation(before, after, { evidence = "", allowedUrls = [], sources }) {
  const okUrls = new Set([...urlsIn(before), ...allowedUrls]);
  const newUrls = [...urlsIn(after)].filter((u) => !okUrls.has(u));
  if (newUrls.length) return `added URL(s) not in the draft or evidence: ${newUrls.join(", ")}`;

  // A citation's "(103 min watch, 28:30)" tail is metadata, not a claim — a
  // re-credit necessarily brings new ones.
  const claimsOnly = (t) => t.replace(/\(\s*\d+\s*min\s+\w+(?:\s*,\s*[\d:]+)?\s*\)/g, " ");
  const known = [...extractNumbers(claimsOnly(before)), ...extractNumbers(evidence)];
  const newNums = extractNumbers(claimsOnly(after), { strict: true }).filter((n) => !known.some((k) => sameNumber(k, n)));
  if (newNums.length) return `added number(s) not in the draft or evidence: ${newNums.map((n) => n.raw).join(", ")}`;

  const corpus = productCorpus(sources);
  const beforeNames = new Set(productCandidates(before).map((w) => w.join(" ")));
  const invented = productCandidates(after)
    .filter((w) => !beforeNames.has(w.join(" ")) && !productKnown(w, corpus))
    .map((w) => w.join(" "));
  if (invented.length) return `added unknown product name(s): ${invented.join(", ")}`;
  return null;
}

// --- A. paragraph-level fact repair -------------------------------------------------

const FACT_SYSTEM = `You fix factual problems in single paragraphs of a weekly briefing for Google Cloud sales reps.
For each paragraph you get the problems found by a fact checker. For each problem, do exactly one of:
  1. RE-CREDIT: if a "correct_source" is given, credit the claim to that speaker and cite that URL, using the
     citation style already in the paragraph, e.g. [Speaker on Show (N min watch, mm:ss)](url). Keep the
     claim's wording faithful to the correct_source quote.
  2. DROP THE CLAIM: remove the number or quoted phrase and keep the sentence true without it.
  3. CUT the sentence, if nothing true is left.
For an invented product name, replace it with a real product named elsewhere in the paragraph or drop it —
never invent another.
If the correct_source speaker is "Host", credit "the <show> host" (never write "Host" as a name). Put a
re-credited citation at the end of the clause it supports, not in the middle of a phrase.
A TLDR bullet keeps its "**Bold hook:** one sentence" shape; reword the hook rather than deleting the bullet.
Rules: change nothing that was not flagged. Never make the paragraph longer than it was. Never add a URL, number, or product name that is not already in
the paragraph or in a correct_source you were given. Keep markdown formatting (bold, links, bullet text).
Return JSON: {"items":[{"id": <id>, "paragraph": "<the corrected paragraph>"}]}`;

function factRequest(groups) {
  return groups.map((g, id) => ({
    id,
    section: g.section,
    paragraph: g.unit,
    problems: g.findings.map((f) => ({
      claim: f.claim,
      problem: f.message.replace(/ Correct source:.*$/, ""),
      ...(f.fix
        ? {
            correct_source: {
              speaker: f.fix.speaker,
              show: f.fix.show,
              url: f.fix.url,
              timestamp: f.fix.ts,
              duration: f.fix.duration,
              quote: f.fix.quote,
            },
          }
        : {}),
    })),
  }));
}

async function repairFacts(md, sources, ai, report) {
  const groups = groupByUnit(factFindings(md, sources));
  if (!groups.length) return md;
  const fixedBefore = report.fixed.length;
  log(`A. Fact repair: ${groups.length} paragraph(s), ${groups.reduce((n, g) => n + g.findings.length, 0)} finding(s)`);
  if (!ai) {
    log("  No API client — skipping to deterministic cuts.");
    return md;
  }
  // One small call per paragraph, in parallel. A single batched call with HIGH
  // thinking ran past Node's 300 s fetch timeout on Edition #38's 9 paragraphs
  // ("fetch failed" at exactly 5:01); small calls also fail independently.
  const request = factRequest(groups);
  const callOnce = async (req) => {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: JSON.stringify({ paragraphs: [req] }, null, 2),
      config: { systemInstruction: FACT_SYSTEM, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "LOW" } },
    });
    return (JSON.parse(stripOuterFence((response.text || "").trim())).items || [])[0] || null;
  };
  const results = await Promise.all(
    request.map(async (req) => {
      // One retry: a transient "fetch failed" on the #38 replay cost a story its lead sentence.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await callOnce(req);
        } catch (err) {
          log(`  WARN: fact repair attempt ${attempt} failed for "${req.section}" (${err.message || err})`);
        }
      }
      return null;
    })
  );
  const items = results.map((it, i) => (it ? { ...it, id: i } : null)).filter(Boolean);

  let out = md;
  for (const item of items) {
    const g = groups[item.id];
    const after = typeof item.paragraph === "string" ? item.paragraph.trim() : null;
    if (!g || after === null || after === g.unit || !out.includes(g.unit)) continue;
    const evidence = g.findings.map((f) => (f.fix ? f.fix.quote : "")).join("\n");
    const allowedUrls = g.findings.filter((f) => f.fix).map((f) => f.fix.url);
    const why = guardViolation(g.unit, after, { evidence, allowedUrls, sources });
    if (why) {
      log(`  rejected (${g.section}): ${why}`);
      continue;
    }
    const candidate = after ? out.replace(g.unit, () => after) : removeUnit(out, g.unit);
    // The fix must actually clear this paragraph's findings.
    const still = factFindings(candidate, sources).filter((f) => f.unit === after);
    if (still.length) {
      log(`  rejected (${g.section}): ${still.length} finding(s) remain after the rewrite`);
      continue;
    }
    out = candidate;
    report.fixed.push({ section: g.section, claims: g.findings.map((f) => f.claim), before: g.unit, after });
  }
  log(`  ${report.fixed.length - fixedBefore} paragraph(s) fixed by re-crediting or dropping claims.`);
  return out;
}

// --- B. structural repair (whole document, one shot) -----------------------------------

async function repairStructure(md, sources, ai, report, date) {
  const failures = collectFailures(date, md, sources);
  if (!failures.length || !ai) return md;
  log(`B. Structural repair: ${failures.length} failure(s)`);
  const systemPrompt = fs.readFileSync(PROMPT_FILE, "utf-8");
  const userMessage = `Below is a drafted briefing that failed quality review, followed by the exact hard failures found. Fix ONLY these failures with the SMALLEST possible edits — do not restructure, re-select stories, rewrite passages that were not flagged, or change any URL that is not itself flagged. Preserve the frontmatter.

CRITICAL — you must NEVER invent a URL, a number, or a product name. You have no access to the source material, so you cannot know any URL or figure that is not already in the briefing. Cutting is always allowed; adding is not.

Return the complete corrected briefing markdown and nothing else.

## Hard failures to fix

${failures.join("\n")}

## The briefing

${md}`;
  let repaired;
  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: userMessage,
      config: { systemInstruction: systemPrompt, thinkingConfig: { thinkingLevel: "HIGH" } },
    });
    repaired = stripOuterFence((response.text || "").trim());
  } catch (err) {
    log(`  WARN: structural repair call failed (${err.message || err}) — keeping the draft.`);
    return md;
  }

  // A repair that loses the frontmatter or a big chunk of the draft is worse
  // than no repair.
  if (!repaired.startsWith("---")) {
    log("  rejected: lost its frontmatter.");
    return md;
  }
  if (repaired.length < md.length * 0.7) {
    log(`  rejected: ${repaired.length} chars vs ${md.length} — too much lost.`);
    return md;
  }
  // Live-test finding: asked to fix a truncated x.com link, Gemini minted a
  // plausible-looking fake tweet ID that passed the linter. Same for figures.
  const why = guardViolation(md, repaired, { sources });
  if (why) {
    log(`  rejected: ${why}`);
    return md;
  }
  const after = collectFailures(date, repaired, sources);
  report.structural = { before: failures.length, after: after.length, fixed: failures.filter((f) => !after.includes(f)) };
  log(`  structural failures ${failures.length} → ${after.length}`);
  return repaired;
}

// --- D. length touch-up ------------------------------------------------------------------
// Re-credits add words ("[Swyx on Latent Space (103 min watch, 1:26:10)]"), so a
// section B brought under budget can end a few words over. Shorten just that
// section, under the same guards, and keep the result only if it adds no fact
// finding and actually fits.

function sectionSpan(md, heading) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

async function trimOverBudget(md, sources, ai, report, date) {
  if (!ai) return md;
  let out = md;
  const over = collectFailures(date, out, sources)
    .map((f) => f.match(/\[length\] (Quick Hits|Our Play|Seller's Edge|TLDR) is (\d+) words \(budget (\d+)\)|\[length\] Story "([^"]+)" is (\d+) words \(budget (\d+)\)/))
    .filter(Boolean);
  for (const m of over) {
    const heading = m[1] ? `## ${m[1]}` : `### ${m[4]}`;
    const body = sectionSpan(out, heading);
    const target = Number(m[3] || m[6]);
    if (!body) continue;
    try {
      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `Shorten this section to at most ${target} readable words (link URLs do not count; link labels do). Cut words, never facts' sources: keep every link, number and name that remains exactly as written, add nothing, keep the markdown structure (bullets, bold). Return only the section text.\n\n${body}`,
        config: { thinkingConfig: { thinkingLevel: "LOW" } },
      });
      const after = stripOuterFence((response.text || "").trim());
      const why = guardViolation(body, after, { sources });
      if (why) {
        log(`  D. trim rejected (${heading}): ${why}`);
        continue;
      }
      const candidate = out.replace(body, () => after);
      const newFacts = factFindings(candidate, sources).length - factFindings(out, sources).length;
      const stillOver = collectFailures(date, candidate, sources).some((f) => f.includes(`${m[1] || m[4]}`) && f.includes("[length]"));
      if (newFacts > 0 || stillOver) {
        log(`  D. trim rejected (${heading}): ${newFacts > 0 ? "added a fact finding" : "still over budget"}`);
        continue;
      }
      out = candidate;
      (report.structural ||= { before: 0, after: 0, fixed: [] }).fixed.push(`- trimmed ${heading.replace(/^#+\s*/, "")} to fit its ${target}-word budget`);
      log(`  D. trimmed ${heading} to budget.`);
    } catch (err) {
      log(`  D. trim failed (${heading}): ${err.message || err}`);
    }
  }
  return out;
}

// --- C. deterministic cut ---------------------------------------------------------------

function removeUnit(md, unit) {
  const lines = md.split("\n");
  const i = lines.findIndex((l) => l.includes(unit));
  if (i === -1) return md;
  const stripped = lines[i].replace(unit, "").trim();
  // A bullet ("- ...") or a paragraph that was only this unit goes entirely.
  if (!stripped || stripped === "-") lines.splice(i, 1);
  else lines[i] = lines[i].replace(unit, "").replace(/\s{2,}/g, " ");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Remove just the clause that carries `claim`, when it is set off by a dash,
 * comma or parentheses: "...for $1.2M in tokens—roughly $1,265 per bug [cite]."
 * loses "—roughly $1,265 per bug" and keeps the true rest. Returns null when the
 * claim is not in a clause that can go on its own.
 */
const MIN_WORDS_LEFT = 6;
// Only clauses that are plainly asides: set off by a dash or parentheses, or a
// comma followed by a word that opens a trailing qualifier. A bare comma is not
// enough — ", voters passed 40 of 41..." is the main clause, not an aside.
const COMMA_ASIDE = /^,\s+(?:with|including|roughly|about|around|nearly|almost|up from|down from|or|which|while|at)\b/i;
function cutClause(raw, claim) {
  // Links become opaque tokens so a cut can never land inside one.
  const links = [];
  const text = raw.replace(/!?\[[^\]]*\]\([^)\s]+\)/g, (l) => {
    links.push(l);
    return `\u0002${links.length - 1}\u0002`;
  });
  const at = text.indexOf(claim);
  if (at === -1) return null;
  const before = text.slice(0, at);
  const dash = Math.max(before.lastIndexOf("—"), before.lastIndexOf("–"));
  const paren = before.lastIndexOf("(");
  const comma = before.lastIndexOf(", ");
  const commaOk = comma !== -1 && COMMA_ASIDE.test(text.slice(comma));
  const left = Math.max(dash, paren, commaOk ? comma : -1);
  if (left === -1 || /\u0002/.test(text.slice(left, at))) return null; // never cut a citation
  const tail = text.slice(at + claim.length);
  let right;
  if (text[left] === "(") {
    const close = tail.indexOf(")");
    if (close === -1) return null;
    right = at + claim.length + close + 1;
  } else {
    const m = tail.match(/[—–),;]|\s?\u0002|\.(\s|$)/);
    right = at + claim.length + (m ? m.index : tail.length);
  }
  if (/\u0002/.test(text.slice(at, right))) return null;
  const removed = text.slice(left, right).split(/\s+/).length;
  const out = (text.slice(0, left) + text.slice(right))
    .replace(/\s+([,.;)])/g, "$1")
    .replace(/[—–]\s*([.,;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/\u0002(\d+)\u0002/g, (_, i) => links[+i]);
  const words = out.replace(/\[[^\]]*\]\([^)]*\)/g, " ").split(/\s+/).filter(Boolean).length;
  const balanced = (out.match(/\[/g) || []).length === (out.match(/\]/g) || []).length &&
    (out.match(/\(/g) || []).length === (out.match(/\)/g) || []).length;
  if (!balanced || words < MIN_WORDS_LEFT || removed > words) return null;
  return out;
}

function cutRemaining(md, sources, report) {
  let out = md;
  for (let pass = 0; pass < 3; pass++) {
    const groups = groupByUnit(factFindings(out, sources));
    if (!groups.length) break;
    for (const g of groups) {
      if (!out.includes(g.unit)) continue;
      // First choice: cut only the clause that holds the bad figure.
      if (g.kind !== "tldr") {
        let unit = g.unit;
        const clipped = [];
        for (const f of g.findings) {
          if (f.check !== "claims") continue;
          const next = cutClause(unit, f.claim);
          if (next && next !== unit) {
            clipped.push({ claim: f.claim, why: f.message.replace(/ Correct source:.*$/, "") });
            unit = next;
          }
        }
        if (clipped.length) {
          out = out.replace(g.unit, () => unit);
          for (const c of clipped) report.cut.push({ section: g.section, sentence: `clause with ${c.claim}`, why: [c.why] });
          continue; // re-checked on the next pass
        }
      }
      const bad = new Set(g.findings.map((f) => f.sentence));
      const sentences = rawSentences(g.unit);
      const keep = sentences.filter((s) => !bad.has(s.prose));
      // A bullet's first sentence carries its bold claim; without it the rest is orphaned.
      const bullet = ["tldr", "quickhit", "angle"].includes(g.kind);
      const dropAll = !keep.length || (bullet && bad.has(sentences[0].prose));
      const after = dropAll ? "" : keep.map((s) => s.raw).join(" ");
      out = after ? out.replace(g.unit, () => after) : removeUnit(out, g.unit);
      for (const s of sentences.filter((x) => dropAll || bad.has(x.prose))) {
        const why = g.findings.filter((f) => f.sentence === s.prose).map((f) => f.message.replace(/ Correct source:.*$/, ""));
        report.cut.push({ section: g.section, sentence: s.raw, why: why.length ? why : ["its bullet's claim was cut"] });
      }
    }
  }
  return out;
}

// --- report -------------------------------------------------------------------------------

function renderReport(report) {
  const lines = ["### 🔧 What the pipeline fixed or cut", ""];
  if (!report.fixed.length && !report.cut.length && !report.structural) {
    lines.push("_Nothing — the draft passed every fact and structure check._");
    return lines.join("\n");
  }
  lines.push(
    `Information only — nothing here needs a decision. ${report.fixed.length} paragraph(s) re-credited or corrected, ` +
      `${report.cut.length} sentence(s) cut${report.structural ? `, ${report.structural.before - report.structural.after} structural fix(es)` : ""}.`,
    ""
  );
  if (report.fixed.length) {
    lines.push("<details><summary>Re-credited or corrected</summary>", "");
    for (const f of report.fixed) {
      lines.push(`**${f.section}** — ${f.claims.join(", ")}`, "", `> before: ${f.before}`, "", `> after: ${f.after}`, "");
    }
    lines.push("</details>", "");
  }
  if (report.cut.length) {
    lines.push("<details><summary>Cut (no source backed them)</summary>", "");
    for (const c of report.cut) lines.push(`- **${c.section}:** ${c.sentence}`, `  - ${c.why.join("; ")}`);
    lines.push("", "</details>");
  }
  if (report.structural?.fixed?.length) {
    lines.push("", "<details><summary>Structural fixes</summary>", "", ...report.structural.fixed, "", "</details>");
  }
  return lines.join("\n");
}

// --- main ------------------------------------------------------------------------------------

async function main() {
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
  const sources = loadSources(briefingDate(original, briefingFile));
  if (sources.problems.length) {
    // Without the week's sources every claim would look unbacked and step C
    // would gut the draft. Refuse rather than cut blind.
    sources.problems.forEach((p) => log(`ERROR: ${p}`));
    log("Refusing to repair without sources — the draft is left as is, failures surface in the PR.");
    process.exit(1);
  }

  const report = { date, fixed: [], cut: [], structural: null };
  const ai = process.env.GOOGLE_API_KEY ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }) : null;
  if (!ai) log("WARN: GOOGLE_API_KEY not set — only deterministic cuts will run.");

  // Structure first, facts last: a whole-document rewrite (B) can drop a
  // re-credit that A just made — on the #38 replay it trimmed Swyx's credit off
  // a Quick Hit to save words. Running A on B's output means the fact fixes are
  // made against the text that ships, and C cuts whatever is still wrong.
  let md = await repairStructure(original, sources, ai, report, date);
  md = await repairFacts(md, sources, ai, report);
  // Second round: fixing the body can orphan a TLDR figure ("41" left the
  // story, so the TLDR bullet citing it now fails). Rewording that bullet beats
  // C deleting it — on the #38 replay C left the TLDR at 2 of 4 bullets.
  md = await repairFacts(md, sources, ai, report);
  md = cutRemaining(md, sources, report);
  md = await trimOverBudget(md, sources, ai, report, date);
  if (report.cut.length) log(`C. Cut ${report.cut.length} sentence(s) no source backed.`);

  const reportFile = path.join(LOGS_DIR, `repair-${date}.md`);
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(reportFile, renderReport(report) + "\n", "utf-8");
  fs.writeFileSync(path.join(LOGS_DIR, `repair-${date}.json`), JSON.stringify(report, null, 2), "utf-8");

  if (md === original) {
    log(`Nothing changed for ${date}.`);
    process.exit(0);
  }
  // Snapshot the pre-repair draft so the before/after pair is preserved
  // (same convention as the v0-stage4 snapshot).
  const draftsDir = path.join(BRIEFINGS_DIR, "drafts");
  fs.mkdirSync(draftsDir, { recursive: true });
  const snapshot = path.join(draftsDir, `${date}-pre-repair.md`);
  if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, original, "utf-8");
  fs.writeFileSync(briefingFile, md, "utf-8");
  log(`Repair written to ${path.basename(briefingFile)} (pre-repair snapshot: drafts/${date}-pre-repair.md; report: logs/repair-${date}.md).`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    log(`ERROR: ${err.message || err}`);
    process.exit(1);
  });
}

module.exports = {
  collectFailures,
  stripOuterFence,
  guardViolation,
  groupByUnit,
  factRequest,
  cutRemaining,
  cutClause,
  removeUnit,
  renderReport,
};

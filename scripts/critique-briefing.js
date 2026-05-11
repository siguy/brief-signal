#!/usr/bin/env node

/**
 * Brief Signal — Briefing critique pass
 *
 * After a briefing is generated, this script asks Gemini to score it against
 * the quality checklist in scripts/briefing-prompt.md. Outputs a JSON report
 * (scripts/logs/critique-YYYY-MM-DD.json) and a human-readable markdown
 * summary printed to stdout (intended for inclusion in the PR body).
 *
 * Exit codes:
 *   0 — no HARD rule failures (soft findings may still be present)
 *   2 — at least one HARD rule failure (caller decides whether to regenerate
 *       or just surface in PR; this script does not auto-regenerate)
 *   1 — runtime error (missing file, API failure, etc.)
 *
 * Usage:
 *   node scripts/critique-briefing.js              # latest briefing
 *   node scripts/critique-briefing.js 2026-05-10   # specific date
 *
 * Requires: GOOGLE_API_KEY environment variable
 */

const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");
const PROMPT_PATH = path.join(__dirname, "briefing-prompt.md");
const LOGS_DIR = path.join(__dirname, "logs");

function getLatestBriefingPath() {
  const files = fs
    .readdirSync(BRIEFINGS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return path.join(BRIEFINGS_DIR, files[0]);
}

function extractRulesFromPrompt(prompt) {
  // Pull the quality checklist + the surrounding rule blocks. The critic
  // doesn't need the voice/tone guidance — just the verifiable rules.
  const sections = [];
  const checklistMatch = prompt.match(/## Quality Checklist[\s\S]*?(?=\n## |\n---|$)/);
  if (checklistMatch) sections.push(checklistMatch[0]);
  const sourceDivMatch = prompt.match(/\*\*Source diversity[\s\S]*?(?=\n\n---|\n## |\n\n\*\*[A-Z])/);
  if (sourceDivMatch) sections.push(sourceDivMatch[0]);
  const namingMatch = prompt.match(/\*\*Naming rules[\s\S]*?(?=\n\n\*\*[A-Z]|\n## |\n---)/);
  if (namingMatch) sections.push(namingMatch[0]);
  const framingMatch = prompt.match(/\*\*Partnership framing[\s\S]*?(?=\n\n\*\*[A-Z]|\n## |\n---)/);
  if (framingMatch) sections.push(framingMatch[0]);
  return sections.join("\n\n");
}

function stripJsonFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("## 🤖 Automated Quality Review");
  lines.push("");
  lines.push(report.summary || "_(no summary)_");
  lines.push("");

  if (report.hard_failures?.length) {
    lines.push(`### ❌ Hard failures (${report.hard_failures.length})`);
    lines.push("");
    for (const f of report.hard_failures) {
      lines.push(`- **${f.rule}**`);
      if (f.evidence) lines.push(`  - Evidence: ${f.evidence}`);
      if (f.fix) lines.push(`  - Fix: ${f.fix}`);
    }
    lines.push("");
  } else {
    lines.push("### ✅ No hard failures");
    lines.push("");
  }

  if (report.soft_findings?.length) {
    lines.push(`### ⚠️ Soft findings (${report.soft_findings.length})`);
    lines.push("");
    for (const f of report.soft_findings) {
      lines.push(`- **${f.rule}**`);
      if (f.evidence) lines.push(`  - Evidence: ${f.evidence}`);
      if (f.suggestion) lines.push(`  - Suggestion: ${f.suggestion}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GOOGLE_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const dateArg = process.argv[2];
  const briefingPath = dateArg
    ? path.join(BRIEFINGS_DIR, `${dateArg}.md`)
    : getLatestBriefingPath();

  if (!briefingPath || !fs.existsSync(briefingPath)) {
    console.error(`ERROR: Briefing file not found: ${briefingPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(PROMPT_PATH)) {
    console.error(`ERROR: System prompt not found at ${PROMPT_PATH}`);
    process.exit(1);
  }

  const briefing = fs.readFileSync(briefingPath, "utf-8");
  const promptText = fs.readFileSync(PROMPT_PATH, "utf-8");
  const rules = extractRulesFromPrompt(promptText);
  const briefingDate = path.basename(briefingPath, ".md");

  const systemInstruction = `You are a rigorous editor reviewing a weekly AI market briefing for Google Cloud startup sales reps. You will be given the briefing markdown and the quality rules it must satisfy. Your job is to report violations honestly — not to praise good writing.

Categorize every finding as either:
- "hard" — violates an explicit rule (e.g., TLDR not bullets, "Vertex AI" used bare, source URL appears twice). These are mechanical and verifiable.
- "soft" — judgment-call issues (story choice is weak, angle reads like a pitch, etc.).

Respond with ONLY a JSON object matching this schema. No prose before or after.

{
  "summary": "string, 1-2 sentences, overall verdict",
  "hard_failures": [
    { "rule": "name of the rule violated", "evidence": "quote or location in briefing", "fix": "concrete suggestion" }
  ],
  "soft_findings": [
    { "rule": "name of the concern", "evidence": "quote or location", "suggestion": "concrete suggestion" }
  ]
}

If there are no failures of a given type, return an empty array.`;

  const userMessage = `## Quality rules the briefing must satisfy

${rules}

## Briefing under review (Edition for ${briefingDate})

${briefing}`;

  console.log(`Critiquing ${path.basename(briefingPath)}...`);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userMessage,
    config: { systemInstruction },
  });

  let raw = response.text;
  raw = stripJsonFences(raw);

  let report;
  try {
    report = JSON.parse(raw);
  } catch (err) {
    console.error("ERROR: Critic did not return valid JSON. Raw response:");
    console.error(raw);
    process.exit(1);
  }

  // Persist machine-readable report
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  const jsonPath = path.join(LOGS_DIR, `critique-${briefingDate}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Persist human-readable markdown summary for inclusion in PR body
  const md = renderMarkdown(report);
  const mdPath = path.join(LOGS_DIR, `critique-${briefingDate}.md`);
  fs.writeFileSync(mdPath, md);

  // Echo to stdout
  console.log("");
  console.log(md);
  console.log("");
  console.log(`  JSON report: ${jsonPath}`);
  console.log(`  Markdown:    ${mdPath}`);

  const hardCount = report.hard_failures?.length || 0;
  if (hardCount > 0) {
    console.log(`\n⚠️  ${hardCount} HARD failure(s) — caller should regenerate or surface in PR.`);
    process.exit(2);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});

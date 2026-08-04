#!/usr/bin/env node

/**
 * Tests for the repetition-loop guard in generate-briefing.js.
 *
 * Run: node scripts/generate-briefing.test.js
 * (Plain Node assertions — no test framework dependency.)
 */

const assert = require("assert");
const {
  truncateRepetition,
  countWords,
  readThemeRegistry,
  extractProposedThemes,
  lineupTask,
  stripLineupFences,
  stripRegistryFooter,
  parseArgs,
  targetDateFromLineup,
  isEmptyKb,
} = require("./generate-briefing.js");

// One complete, well-formed briefing copy: frontmatter -> body -> Sources line.
const ONE_COPY = `---
title: "The Signal, Edition #22"
edition: 22
date: 2026-07-20
---

## TLDR

- **Hook one:** something happened.
- **Hook two:** something else happened.

## The Big Picture

Body paragraph goes here with real content.

## Our Play

How to execute on GCP.

*Sources: bookmarks, playlist, podcasts*`;

// Catch per-test so one failure does not abort the file. Previously an assert
// threw straight out of the module: Node printed one stack trace and every
// later test was skipped, so you fixed failures one run at a time. The exit
// code was always correct — the summary line below is simply never reached on
// a throw — but seeing one failure when there are five is its own bug.
// Same shape as signal-digest.test.js.
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. The real failure mode: three concatenated copies -> collapse to one.
test("triple-repeated briefing truncates to a single copy", () => {
  const runaway = [ONE_COPY, ONE_COPY, ONE_COPY].join("\n\n");
  const cleaned = truncateRepetition(runaway);

  assert.strictEqual(
    (cleaned.match(/^---\s*\r?\ntitle:/gm) || []).length,
    1,
    "should keep exactly one frontmatter block"
  );
  assert.strictEqual(
    (cleaned.match(/^##\s+TLDR\b/gim) || []).length,
    1,
    "should keep exactly one TLDR heading"
  );
  assert.strictEqual(
    (cleaned.match(/^\*Sources:/gm) || []).length,
    1,
    "should keep exactly one Sources line"
  );
  assert.ok(
    cleaned.trimEnd().endsWith("*Sources: bookmarks, playlist, podcasts*"),
    "output should end at the first Sources line"
  );
  assert.ok(
    countWords(cleaned) < countWords(runaway),
    "cleaned output should be shorter than the runaway"
  );
});

// 2. A legitimate single-copy briefing is returned untouched.
test("single-copy briefing is left unchanged", () => {
  assert.strictEqual(truncateRepetition(ONE_COPY), ONE_COPY);
});

// 3. Duplication signalled only by a repeated TLDR (no second frontmatter).
test("duplicate ## TLDR after Sources triggers truncation", () => {
  const looped =
    ONE_COPY + "\n\n## TLDR\n\n- **Hook:** repeated body with no frontmatter.\n";
  const cleaned = truncateRepetition(looped);
  assert.strictEqual((cleaned.match(/^##\s+TLDR\b/gim) || []).length, 1);
  assert.ok(cleaned.trimEnd().endsWith("*Sources: bookmarks, playlist, podcasts*"));
});

// 4. No Sources line at all -> nothing to anchor on, return as-is (don't crash).
test("text without a Sources line is returned unchanged", () => {
  const noSources = "---\ntitle: \"x\"\n---\n\n## TLDR\n\n- a\n";
  assert.strictEqual(truncateRepetition(noSources), noSources);
});

// --- Theme registry wiring (content/themes.md) ---------------------------

test("readThemeRegistry reads the real content/themes.md", () => {
  const registry = readThemeRegistry();
  assert.ok(registry.length > 0, "expected non-empty registry content");
  assert.ok(/^##\s+/m.test(registry), "expected at least one theme heading");
});

test("lineupTask includes theme-tagging and fenced registry instructions", () => {
  const task = lineupTask(23);
  assert.ok(task.includes("advances:"), "missing per-candidate 'advances' field");
  assert.ok(task.includes("NEW THREAD"), "missing NEW THREAD flag option");
  assert.ok(
    task.includes("Proposed registry update"),
    "missing proposed-update section"
  );
  assert.ok(
    task.includes("```themes-proposed"),
    "missing themes-proposed fence instruction"
  );
  assert.ok(
    task.includes("No registry provided this run"),
    "missing the conditional skip when no registry was injected"
  );
  assert.ok(
    task.includes("not just the theme entries") &&
      task.includes("trailing notes/appendix section"),
    "missing the instruction to reproduce non-theme sections verbatim " +
      "(regression: a live dry run showed the model dropping a trailing " +
      "'Notes & open judgment calls' section, reading 'every existing theme' too narrowly)"
  );
});

test("extractProposedThemes pulls the fenced block on the happy path", () => {
  const sample =
    "## Proposed Lineup\n...\n\n**Proposed registry update:** stuff\n\n" +
    "**Full proposed registry:**\n\n```themes-proposed\n" +
    "<!-- PROPOSED -->\n## Compute Scarcity\n- Status: active\n```\n";
  const extracted = extractProposedThemes(sample);
  assert.ok(extracted.includes("Compute Scarcity"));
});

test("extractProposedThemes tolerates trailing whitespace after the fence tag", () => {
  const sample =
    "```themes-proposed   \n<!-- PROPOSED -->\n## Compute Scarcity\n- Status: active\n```";
  assert.ok(extractProposedThemes(sample).includes("Compute Scarcity"));
});

test("extractProposedThemes returns empty string when the fence is missing", () => {
  assert.strictEqual(extractProposedThemes("no fence here at all"), "");
});

test("extractProposedThemes returns empty string when the fence is unclosed", () => {
  assert.strictEqual(
    extractProposedThemes("```themes-proposed\n## Some Theme\nno closing fence"),
    ""
  );
});

test("extractProposedThemes returns empty string for content with no theme heading", () => {
  const sample = "```themes-proposed\n<!-- PROPOSED -->\nsome text, no heading\n```\n";
  assert.strictEqual(extractProposedThemes(sample), "");
});

test("draft-facing lineup excludes the registry block (Stage 4b never sees it)", () => {
  const lineup =
    "## Proposed Lineup — Edition #23\n\n**The Big Picture:**\n1. **Some Story**\n" +
    "   - advances: Compute Scarcity\n\n**Quick Hits (3-6 candidates):**\n- item — source\n\n" +
    "**Model-release coverage self-check:** none\n\n" +
    "**Proposed registry update:** Compute Scarcity — moved to: X.\n\n" +
    "**Full proposed registry:**\n\n```themes-proposed\n<!-- PROPOSED -->\n" +
    "## Compute Scarcity\n- Status: active\n```";

  // Mirrors the transform applied in main() before building Stage 4b's userMessage.
  const lineupForDraft = lineup
    .replace(/\n\*\*Proposed registry update:\*\*[\s\S]*$/, "")
    .trimEnd();

  assert.ok(
    !lineupForDraft.includes("themes-proposed"),
    "registry fence leaked into the draft-facing lineup"
  );
  assert.ok(
    !lineupForDraft.includes("Proposed registry update"),
    "registry update summary leaked into the draft-facing lineup"
  );
  assert.ok(
    lineupForDraft.includes("Model-release coverage self-check"),
    "legitimate lineup content was over-trimmed"
  );
  assert.ok(lineupForDraft.includes("Quick Hits"), "Quick Hits section was lost");
  assert.ok(lineup.includes("themes-proposed"), "sanity: original lineup keeps the fence");
});

test("stripLineupFences preserves the internal themes-proposed fence (regression from a live dry run)", () => {
  // Reproduces a real failure observed in an isolated live dry run against
  // gemini-2.5-flash: the raw lineup response ends in our own internal fence,
  // and the OLD stripCodeFences(rawLineup) call silently ate its closing ```
  // (trailing-fence regex is anchored to end-of-string), leaving the saved
  // {today}-lineup.md file with a dangling/unterminated code block.
  const rawLineup =
    "## Proposed Lineup\n...\n\n**Proposed registry update:** stuff\n\n" +
    "**Full proposed registry:**\n\n```themes-proposed\n" +
    "<!-- PROPOSED -->\n## Compute Scarcity\n- Status: active\n```";
  const result = stripLineupFences(rawLineup);
  assert.ok(result.endsWith("```"), "closing fence should survive intact");
  assert.ok(result.includes("Compute Scarcity"));
});

test("stripLineupFences still strips a Gemini outer-wrap when no internal fence is present", () => {
  const wrapped = "```markdown\n## Some Lineup\nno theme fence here\n```";
  assert.strictEqual(stripLineupFences(wrapped), "## Some Lineup\nno theme fence here");
});

// --- Redraft mode (--from-lineup): the editorial approval gate ---------------

test("parseArgs returns null fromLineup for a normal run", () => {
  assert.strictEqual(parseArgs([]).fromLineup, null);
});

test("parseArgs picks up the lineup path", () => {
  const args = parseArgs(["--from-lineup", "content/briefings/drafts/2026-08-03-lineup.md"]);
  assert.strictEqual(args.fromLineup, "content/briefings/drafts/2026-08-03-lineup.md");
});

test("targetDateFromLineup derives the edition date from the filename", () => {
  // This is the safety property: a redraft can only land on the edition its own
  // lineup names, never on today's date or a neighbouring week.
  assert.strictEqual(
    targetDateFromLineup("content/briefings/drafts/2026-08-03-lineup.md"),
    "2026-08-03"
  );
  assert.strictEqual(targetDateFromLineup("/abs/path/2026-07-27-lineup-r2.md"), "2026-07-27");
});

test("targetDateFromLineup returns null for an undated filename", () => {
  // Falls back to BRIEFING_DATE, and errors out if that is unset too — better
  // than silently writing over whatever today happens to be.
  assert.strictEqual(targetDateFromLineup("my-lineup.md"), null);
});

test("stripRegistryFooter removes the admin block Stage 4b must not see", () => {
  const lineup =
    "## Proposed Lineup\n\n1. Lead story\n\n**Quick Hits:** things\n\n" +
    "**Proposed registry update:** add a theme\n\n**Full proposed registry:**\n\n" +
    "```themes-proposed\n## Compute Scarcity\n```";
  const result = stripRegistryFooter(lineup);
  assert.ok(result.includes("Lead story"), "story selection must survive");
  assert.ok(result.includes("Quick Hits"), "Quick Hits must survive");
  assert.ok(!result.includes("Proposed registry update"), "registry footer must be stripped");
  assert.ok(!result.includes("themes-proposed"), "registry fence must be stripped");
});

test("stripRegistryFooter leaves a hand-edited lineup with no footer untouched", () => {
  // A lineup you edited by hand won't have the registry block — stripping must
  // be a no-op rather than eating the last section.
  const edited = "## Proposed Lineup\n\n1. OpenAI price cuts (promoted to lead by hand)\n";
  assert.strictEqual(stripRegistryFooter(edited), edited.trimEnd());
});

// --- Empty KB detection (a quiet source is not a failed source) -------------

test("isEmptyKb detects the marker an extractor writes on a quiet week", () => {
  const kb = [
    "# Podcast Intelligence Knowledge Base",
    "",
    "> **Extracted:** 2026-08-10",
    "> **Episodes processed:** 0",
    "> **Status:** EMPTY — no new items this week.",
    "",
    "---",
  ].join("\n");
  assert.ok(isEmptyKb(kb));
});

test("isEmptyKb is false for a KB with real content", () => {
  const kb = "# KB\n\n> **Extracted:** 2026-08-10\n> **Episodes processed:** 12\n\n---\n\n## Show (2026-08-09) — \"Title\"\n";
  assert.ok(!isEmptyKb(kb));
});

test("isEmptyKb does not fire on the word EMPTY appearing in an entry", () => {
  // The marker is anchored to a blockquote line at line start, so ordinary
  // prose mentioning an empty queue must not mark the whole source dead.
  const kb = "# KB\n\n---\n\n## Show (2026-08-09)\n- The status was EMPTY when they checked the queue.\n";
  assert.ok(!isEmptyKb(kb));
});

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED, ${passed} passed.`);
} else {
  console.log(`\nAll ${passed} tests passed.`);
}

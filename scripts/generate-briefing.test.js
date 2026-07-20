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

let passed = 0;
function test(name, fn) {
  fn();
  console.log(`  ✓ ${name}`);
  passed++;
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

console.log(`\nAll ${passed} tests passed.`);

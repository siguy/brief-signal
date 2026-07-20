#!/usr/bin/env node

/**
 * Tests for the repetition-loop guard in generate-briefing.js.
 *
 * Run: node scripts/generate-briefing.test.js
 * (Plain Node assertions — no test framework dependency.)
 */

const assert = require("assert");
const { truncateRepetition, countWords } = require("./generate-briefing.js");

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

console.log(`\nAll ${passed} tests passed.`);

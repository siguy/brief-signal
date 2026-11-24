#!/usr/bin/env node

/**
 * Tests for repair-briefing.js — the guards and the deterministic cuts.
 * No network: the LLM steps are not exercised here (the Edition #38 replay
 * recorded in tasks/todo.md covers them end to end).
 * Run: node scripts/repair-briefing.test.js
 */

const assert = require("assert");
const { guardViolation, cutClause, cutRemaining, removeUnit, collectFailures } = require("./repair-briefing.js");
const { parseKb, buildIndex } = require("./sources.js");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}

const KB = `## Latent Space (2026-11-07) — "Anthropic IPO"
**Source:** [Latent Space](https://www.youtube.com/watch?v=P735f1xlpL0)
**Duration:** 103 min | **Editorial Signal:** HIGH

### Notable Quotes
- "They raised $1.2 million in tokens for the run." — Jamin Ball (00:10:00)
`;
const sources = () =>
  buildIndex({
    date: "2026-11-09",
    files: ["p.md"],
    entries: parseKb(KB, "podcasts", "p.md"),
    kbText: KB,
    playbook: "Cloud Run scales to zero.",
    products: [],
    problems: [],
  });

const CITE = "[Jamin Ball on Latent Space (103 min watch, 10:00)](https://www.youtube.com/watch?v=P735f1xlpL0)";

test("guard rejects an invented URL", () => {
  assert.match(guardViolation("A claim.", "A claim [x](https://x.com/fake/1).", { sources: sources() }), /added URL/);
});

test("guard allows a URL handed over as the correct source", () => {
  const after = `A claim ${CITE}.`;
  assert.strictEqual(
    guardViolation("A claim.", after, { allowedUrls: ["https://www.youtube.com/watch?v=P735f1xlpL0"], sources: sources() }),
    null
  );
});

test("guard rejects an invented number, but not a citation's duration/timestamp", () => {
  assert.match(guardViolation("Costs fell.", "Costs fell 40%.", { sources: sources() }), /added number/);
  const after = `Costs fell ${CITE}.`;
  assert.strictEqual(guardViolation("Costs fell.", after, { allowedUrls: ["https://www.youtube.com/watch?v=P735f1xlpL0"], sources: sources() }), null);
});

test("guard rejects an invented product name", () => {
  assert.match(guardViolation("Use Cloud Run.", "Use Cloud Run Sandboxes.", { sources: sources() }), /unknown product/);
});

test("cutClause trims a dash aside and keeps the citation", () => {
  const s = `The pipeline cost $1.2M in tokens—roughly $1,265 per patched bug ${CITE}.`;
  const out = cutClause(s, "$1,265");
  assert.strictEqual(out, `The pipeline cost $1.2M in tokens ${CITE}.`);
});

test("cutClause refuses a bare-comma main clause", () => {
  assert.strictEqual(cutClause(`In the midterms, voters passed 40 of 41 ballot measures ${CITE}.`, "40"), null);
});

test("cutClause never breaks a link", () => {
  const s = `Casado said so [Martin Casado on ILTB (66 min listen, 37:45)](https://colossus.com/a), and debt is "no bid" here.`;
  const out = cutClause(s, '"no bid"');
  if (out !== null) {
    assert.strictEqual((out.match(/\[/g) || []).length, (out.match(/\]/g) || []).length);
    assert.ok(out.includes("](https://colossus.com/a)"));
  }
});

test("cutRemaining leaves no fact finding and logs every cut", () => {
  const md = `---
date: "2026-11-09"
---

## The Big Picture: X

### Story

The run used $1.2M in tokens—roughly $1,265 per patched bug ${CITE}. Separately, revenue rose 900% with no source at all.
`;
  const report = { fixed: [], cut: [], structural: null };
  const out = cutRemaining(md, sources(), report);
  assert.ok(!out.includes("$1,265"), out);
  assert.ok(!out.includes("900%"), out);
  assert.ok(out.includes("$1.2M"), "the sourced figure stays");
  assert.ok(report.cut.length >= 2, JSON.stringify(report.cut));
});

test("removeUnit drops a bullet that was only this unit", () => {
  assert.strictEqual(removeUnit("## Quick Hits\n\n- one\n- two\n", "two"), "## Quick Hits\n\n- one\n");
});

test("collectFailures leaves facts, images and repeated leads out of the structural pass", () => {
  const md = `---\ndate: "2026-11-09"\n---\n\n## TLDR\n\n- not bold\n`;
  const f = collectFailures("2026-11-09", md, sources());
  assert.ok(f.length > 0);
  assert.ok(f.every((x) => !/\[(claims|products|setup|images|cross-edition-lead)\]/.test(x)), f.join("\n"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

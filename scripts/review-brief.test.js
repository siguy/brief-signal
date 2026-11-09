#!/usr/bin/env node
// Tests for review-brief.js — the "three calls" section at the top of the PR.
const assert = require("assert");
const { plays, voicesLeftOut } = require("./review-brief.js");
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

const MD = `## The Big Picture: X

### Story A

Body [Ball on Latent Space (10 min watch)](https://www.youtube.com/watch?v=AAAAAAAAAAA).

**Your angle with founders**

- **The question:** "Why?"
- **Where GCP wins:** Agent Runtime keeps state.

## Our Play

Frame.

- **Motion one.** *Signal:* x. *Why GCP wins:* y. *The move:* z.
`;

const KB = `## Latent Space (2026-11-07) — "Cited"
**Source:** [LS](https://www.youtube.com/watch?v=AAAAAAAAAAA)
**Duration:** 10 min | **Editorial Signal:** HIGH

## Other Show (2026-11-06) — "Not cited"
**Source:** [OS](https://sharptech.fm/ep?access_token=SECRET)
**Duration:** 50 min | **Editorial Signal:** HIGH

## Low Show (2026-11-06) — "Low signal"
**Source:** [LO](https://www.youtube.com/watch?v=BBBBBBBBBBB)
**Duration:** 50 min | **Editorial Signal:** LOW
`;

test("plays lists every 'Where GCP wins' line and Our Play motion", () => {
  const p = plays(MD);
  assert.strictEqual(p.length, 2);
  assert.ok(/Agent Runtime keeps state/.test(p[0].text) && p[0].where === "Story A");
  assert.ok(/Motion one/.test(p[1].text) && p[1].where === "Our Play");
});

test("voicesLeftOut lists uncited HIGH episodes only, without subscriber tokens", () => {
  const src = buildIndex({ entries: parseKb(KB, "podcasts", "p.md"), products: [], playbook: "", kbText: KB, problems: [] });
  const v = voicesLeftOut(MD, src);
  assert.strictEqual(v.length, 1);
  assert.ok(/Not cited/.test(v[0].title));
  assert.ok(!/access_token/.test(v[0].url));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

#!/usr/bin/env node

/**
 * Tests for lint-briefing.js.
 * Run: node scripts/lint-briefing.test.js
 * (Plain Node assertions — no test framework dependency, same style as
 * generate-briefing.test.js.)
 */

const assert = require("assert");
const {
  lint,
  checkUrls,
  checkTldrHooks,
  checkAngleBlocks,
  checkSourceOverlap,
  checkBannedWords,
  checkNaming,
  labelTimestamps,
} = require("./lint-briefing.js");

const CLEAN = `---
title: "Test"
---

## TLDR

-   **Hook one:** thing happened.
-   **Hook two:** other thing.
-   **Hook three:** third thing.
-   **Hook four:** fourth thing.

## The Big Picture: Theme

### Story One

Text [Alice on Show A (60 min watch, 5:00)](https://youtube.com/watch?v=aaa).

**Your angle with founders:**
1.  **Where it hurts:** "Q?"
2.  **How they're hedging:** "Q?"
3.  **Where the GCP opportunity is:** the line.

### Story Two

Text [Bob on Show B (30 min watch, 10:00)](https://youtube.com/watch?v=bbb).

## Quick Hits

- **[Claim (2 min read)](https://x.com/u/status/123)** — sentence.

## Our Play

One position. Motions.
`;

// 1. Clean fixture passes
{
  const r = lint(CLEAN);
  assert.deepStrictEqual(r.hard, [], `clean fixture should pass, got: ${r.hard}`);
}

// 2. Truncated URL is hard
{
  const r = checkUrls(CLEAN.replace("status/123", "status/..."));
  assert.strictEqual(r.hard.length, 1);
  assert.ok(r.hard[0].includes("Truncated"));
}

// 3. TLDR bullet without bold hook is hard
{
  const r = checkTldrHooks(CLEAN.replace("-   **Hook four:** fourth thing.", "-   plain prose bullet."));
  assert.ok(r.hard.some((m) => m.includes("lacks a bold hook")));
}

// 4. TLDR bullet count enforced (3 bullets -> hard)
{
  const r = checkTldrHooks(CLEAN.replace("-   **Hook four:** fourth thing.\n", ""));
  assert.ok(r.hard.some((m) => m.includes("must be 4-5")));
}

// 5. Angle block missing the GCP line is hard
{
  const broken = CLEAN.replace("3.  **Where the GCP opportunity is:** the line.\n", "");
  const r = checkAngleBlocks(broken);
  assert.strictEqual(r.hard.length, 1);
  assert.ok(r.hard[0].includes("Story One"));
}

// 6. Story with NO angle block is fine (context-only stories are allowed)
{
  const noAngle = CLEAN.replace(
    /\*\*Your angle with founders:\*\*[\s\S]*?the line\.\n/,
    ""
  );
  assert.deepStrictEqual(checkAngleBlocks(noAngle).hard, []);
}

// 7. Same URL in two BP stories, timestamps <30 min apart -> hard
{
  const overlap = CLEAN.replace("https://youtube.com/watch?v=bbb", "https://youtube.com/watch?v=aaa");
  const r = checkSourceOverlap(overlap); // 5:00 vs 10:00 = 5 min apart
  assert.strictEqual(r.hard.length, 1);
  assert.ok(r.hard[0].includes("min apart"));
}

// 8. Same URL, timestamps 30+ min apart -> allowed
{
  const ok = CLEAN.replace("https://youtube.com/watch?v=bbb", "https://youtube.com/watch?v=aaa").replace(
    "(30 min watch, 10:00)",
    "(60 min watch, 45:00)"
  );
  assert.deepStrictEqual(checkSourceOverlap(ok).hard, []);
}

// 9. Same URL, no parseable timestamps -> warn, not hard
{
  const noTs = CLEAN.replace("(60 min watch, 5:00)", "(article)")
    .replace("(30 min watch, 10:00)", "(article)")
    .replace("https://youtube.com/watch?v=bbb", "https://youtube.com/watch?v=aaa");
  const r = checkSourceOverlap(noTs);
  assert.deepStrictEqual(r.hard, []);
  assert.strictEqual(r.warn.length, 1);
}

// 10. Banned word in prose is hard (inflections included); inside a URL it is not
{
  assert.ok(checkBannedWords("founders leverage cost advantages").hard.length === 1);
  assert.ok(checkBannedWords("leveraging this quarter's prices").hard.length === 1);
  assert.ok(checkBannedWords("real synergies here").hard.length === 1);
  assert.deepStrictEqual(checkBannedWords("[x](https://a.com/leverage-post)").hard, []);
}

// 11. Naming: bare "Vertex AI" is hard; "(FKA Vertex AI)" is allowed; GEAP is hard
{
  assert.ok(checkNaming("built on Vertex AI today").hard.length === 1);
  assert.deepStrictEqual(checkNaming("Gemini Enterprise Agent Platform (FKA Vertex AI)").hard, []);
  assert.ok(checkNaming("the GEAP roadmap").hard.some((m) => m.includes("GEAP")));
}

// 12. Timestamp parsing: mm:ss and h:mm:ss forms
{
  assert.deepStrictEqual(labelTimestamps("(33 min read, 16:15)"), [16.25]);
  const [t] = labelTimestamps("(78 min watch, 0:37:25)");
  assert.ok(Math.abs(t - 37.4166) < 0.01);
}

console.log("lint-briefing.test.js: all 12 tests passed");

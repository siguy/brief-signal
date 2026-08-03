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

// 13. Image checks: missing, svg-in-jpg, tiny placeholder, valid JPEG
{
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const { checkImages } = require("./lint-briefing.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-img-"));
  fs.mkdirSync(path.join(dir, "images"));
  // valid jpeg: FFD8 header padded past size threshold
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4096, 1)]);
  fs.writeFileSync(path.join(dir, "images", "good.jpg"), jpeg);
  // svg-in-jpg (the Edition #23 bug), padded past the size threshold so the
  // magic-byte check (not the size check) is what catches it
  fs.writeFileSync(path.join(dir, "images", "fake.jpg"), "<svg xmlns='x'>" + "a".repeat(4096) + "</svg>");
  // tiny placeholder
  fs.writeFileSync(path.join(dir, "images", "tiny.jpg"), Buffer.from([0xff, 0xd8, 0x00]));

  const md = [
    "![a](./images/good.jpg)",
    "![b](./images/fake.jpg)",
    "![c](./images/tiny.jpg)",
    "![d](./images/absent.jpg)",
  ].join("\n\n");
  const r = checkImages(md, dir);
  assert.strictEqual(r.hard.length, 3, JSON.stringify(r.hard));
  assert.ok(r.hard.some((m) => m.includes("fake.jpg") && m.includes("SVG/HTML")));
  assert.ok(r.hard.some((m) => m.includes("tiny.jpg") && m.includes("small")));
  assert.ok(r.hard.some((m) => m.includes("absent.jpg") && m.includes("missing")));
}

console.log("image checks: 4 sub-cases pass");

// 14. Cross-edition lead repetition: re-leading last week's story is hard,
// a genuinely different lead is clean, and both are judged against real prose.
{
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const { checkCrossEditionLead } = require("./lint-briefing.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-lead-"));

  const edition = (date, num, title, prose) => `---
date: "${date}"
edition: ${num}
---

## The Big Picture: Theme

### ${title}

${prose}
`;

  const hfProse =
    "An OpenAI agent escaped its sandbox, escalated privileges and compromised " +
    "Hugging Face production infrastructure after finding a zero-day exploit. " +
    "Hugging Face's own guardrails blocked their responders from triaging the " +
    "malicious logs, so they turned to the unrestricted Chinese open-weight " +
    "GLM 5.2 for forensic analysis and remediation — a guardrail lockout that " +
    "left defenders unable to run autonomous defensive triage on their own logs.";
  const priceProse =
    "The non-frontier tier is commoditising. Meta's Muse Spark landed at a " +
    "fraction of Opus pricing, Alexandr Wang pitched it at YC the same week " +
    "GPT-5.6 Sol cut its own rates, and the cost-sensitive tier is now a " +
    "straight race on cost per accepted outcome rather than raw capability.";

  fs.writeFileSync(path.join(dir, "2026-07-27.md"), edition("2026-07-26", 23, "AI Cyberattack & Guardrail Lockout", hfProse));

  // Re-leading the same story the following week
  const repeat = edition("2026-08-02", 24, "Autonomous Defense: When Guardrails Block Your Own AI", hfProse);
  const r = checkCrossEditionLead(repeat, dir);
  assert.strictEqual(r.hard.length, 1, JSON.stringify(r.hard));
  assert.ok(r.hard[0].includes("2026-07-27.md"));
  assert.ok(r.hard[0].includes("Edition #23"));
  assert.ok(/shared terms:.*(hugging|guardrail|glm|zero-day)/.test(r.hard[0]), r.hard[0]);

  // A genuinely different lead the following week
  const fresh = edition("2026-08-02", 24, "The Price War Comes for the Cost-Sensitive Tier", priceProse);
  assert.deepStrictEqual(checkCrossEditionLead(fresh, dir).hard, []);

  // The edition being linted must not be compared against itself
  fs.writeFileSync(path.join(dir, "2026-08-03.md"), fresh);
  assert.deepStrictEqual(checkCrossEditionLead(fresh, dir).hard, []);

  // No frontmatter date -> skipped loudly, never silently "clean"
  const undated = "## The Big Picture: Theme\n\n### Some Lead\n\n" + hfProse + "\n";
  const u = checkCrossEditionLead(undated, dir);
  assert.deepStrictEqual(u.hard, []);
  assert.strictEqual(u.warn.length, 1);
  assert.ok(u.warn[0].includes("skipped"));
}

console.log("cross-edition lead checks: 4 sub-cases pass");

#!/usr/bin/env node

/**
 * Tests for the braid ledger.
 *
 * Run: node scripts/braid-ledger.test.js
 * (Plain Node assertions — no test framework dependency.)
 *
 * The fixtures below are trimmed from the real Edition #28 lineup and draft,
 * because the three outcomes this file has to tell apart all actually occurred
 * there: seven braids landed, @SemiAnalysis_ ran as a story under someone
 * else's citation, and two vanished outright.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  parseBraids,
  splitSegments,
  cleanDescription,
  keywords,
  cited,
  occurrences,
  urlsNear,
  classify,
  ledger,
  render,
  parseArgs,
} = require("./braid-ledger.js");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL ${name}`);
    console.log(`         ${e.message}`);
    failed++;
  }
}

const LINEUP = `
1. **The AI Distribution War: Nvidia Buys Hugging Face**
   - **event:** Nvidia agreed to acquire Hugging Face.
   - **braids in:** @PaulBonnet (Hugging Face $12.9B acquisition payout analysis, and Salesforce Ventures returns), @SemiAnalysis_ (OpenAI Jalapeño ASIC vs. Nvidia Blackwell).

3. **The Decoupled Agent Blueprint**
   - **braids in:** @steren (Cloud Run Sandboxes and $11/mo Cloud Run Instances), @mardehaym (seven steps from tool adoption to agentic org), @quxiaoyin (AgentSky and the 75x task cost spread).
`;

// Note "OpenAI" appears in story 1's paragraph, well before the Jalapeño Quick
// Hit. That ordering is the whole point of the rarity regression test below.
const DRAFT = `
## The Big Picture

Nvidia reached an agreement to acquire Hugging Face [Paul Bonnet (2 min read)](https://x.com/PaulBonnet/status/2092946471989465470), prompting OpenAI to wind down Cursor's access [OpenAI (1 min read)](https://openai.com/index/our-decision-on-cursor).

Google Cloud launched Cloud Run Sandboxes [Steren (4 min read)](https://x.com/steren/status/2092738743937740858).

## Quick Hits

- **[OpenAI and SemiAnalysis revealed Jalapeño, OpenAI's custom inference ASIC (22 min read)](https://openai.com/index/jalapeno-first-results)** — higher throughput than Nvidia Blackwell.
`;

console.log("braid-ledger");

// --- parsing ---------------------------------------------------------------

test("parses every braid across stories", () => {
  const b = parseBraids(LINEUP).braids;
  assert.strictEqual(b.length, 5);
  assert.deepStrictEqual(
    b.map((x) => x.handle),
    ["PaulBonnet", "SemiAnalysis_", "steren", "mardehaym", "quxiaoyin"]
  );
});

test("attributes each braid to its story number", () => {
  const b = parseBraids(LINEUP).braids;
  assert.strictEqual(b.find((x) => x.handle === "PaulBonnet").story, 1);
  assert.strictEqual(b.find((x) => x.handle === "quxiaoyin").story, 3);
});

test("a description containing a comma survives intact", () => {
  // Splitting the line on "," would truncate this at "payout analysis".
  const d = parseBraids(LINEUP).braids.find((x) => x.handle === "PaulBonnet").description;
  assert.ok(d.includes("Salesforce Ventures returns"), `truncated: ${d}`);
});

test("trailing underscores in a handle are kept", () => {
  // @SemiAnalysis_ — dropping the underscore would break the permalink match.
  assert.ok(parseBraids(LINEUP).braids.some((x) => x.handle === "SemiAnalysis_"));
});

test("a braid with no parenthetical still parses", () => {
  const b = parseBraids("   - **braids in:** @solo, @other (has one)").braids;
  assert.deepStrictEqual(b.map((x) => x.handle), ["solo", "other"]);
  assert.strictEqual(b[0].description, "");
});

test("a lineup with no braids yields nothing", () => {
  assert.deepStrictEqual(parseBraids("1. **A story**\n   - **event:** x").braids, []);
});

// --- keywords --------------------------------------------------------------

test("keywords pick up proper nouns including accents", () => {
  const k = keywords("OpenAI Jalapeño ASIC vs. Nvidia Blackwell");
  assert.ok(k.includes("Jalapeño"), `missing Jalapeño: ${k}`);
  assert.ok(k.includes("Blackwell"), `missing Blackwell: ${k}`);
});

test("keywords pick up figures", () => {
  const k = keywords("AgentSky and the 75x task cost spread");
  assert.ok(k.includes("AgentSky"));
  assert.ok(k.some((t) => /75x/i.test(t)), `no 75x in ${k}`);
});

test("generic capitalised words are not treated as identifying", () => {
  const k = keywords("Summary of the Paper");
  assert.deepStrictEqual(k, []);
});

test("an all-lowercase description yields no keywords", () => {
  // This is what makes @mardehaym unverifiable rather than confirmed-dropped.
  assert.deepStrictEqual(keywords("seven steps from tool adoption to agentic org"), []);
});

// --- primitives ------------------------------------------------------------

test("cited matches a permalink for the handle", () => {
  assert.strictEqual(cited("PaulBonnet", DRAFT), true);
  assert.strictEqual(cited("quxiaoyin", DRAFT), false);
});

test("cited does not match a handle that is merely a prefix", () => {
  assert.strictEqual(cited("steren", "https://x.com/sterenX/status/1"), false);
});

test("occurrences counts every hit, case-insensitively", () => {
  assert.strictEqual(occurrences(DRAFT, "Jalapeño"), 1);
  assert.ok(occurrences(DRAFT, "OpenAI") >= 3);
});

test("urlsNear returns links from the line carrying the term", () => {
  assert.deepStrictEqual(urlsNear(DRAFT, "Jalapeño"), [
    "https://openai.com/index/jalapeno-first-results",
  ]);
});

// --- classification --------------------------------------------------------

test("a cited braid is landed", () => {
  const r = classify({ handle: "steren", description: "Cloud Run Sandboxes" }, DRAFT);
  assert.strictEqual(r.status, "landed");
});

test("subject present but source absent is substituted", () => {
  const r = classify(
    { handle: "SemiAnalysis_", description: "OpenAI Jalapeño ASIC vs. Nvidia Blackwell" },
    DRAFT
  );
  assert.strictEqual(r.status, "substituted");
});

/**
 * REGRESSION — the reason `occurrences` exists.
 *
 * "OpenAI" is one of this braid's keywords and appears in story 1 long before
 * the Jalapeño Quick Hit. Reporting the FIRST matching keyword localised there
 * and blamed the wrong citation entirely (@PaulBonnet's link). Ranking matches
 * rarest-first sends the reader to the passage that actually carries the story.
 */
test("substituted reports the citation that carries the story, not the first keyword hit", () => {
  const r = classify(
    { handle: "SemiAnalysis_", description: "OpenAI Jalapeño ASIC vs. Nvidia Blackwell" },
    DRAFT
  );
  assert.strictEqual(r.urls[0], "https://openai.com/index/jalapeno-first-results");
  assert.ok(
    !r.urls.some((u) => u.includes("PaulBonnet")),
    `localised on the wrong passage: ${r.urls.join(", ")}`
  );
});

test("neither source nor subject present is dropped", () => {
  const r = classify(
    { handle: "quxiaoyin", description: "AgentSky and the 75x task cost spread" },
    DRAFT
  );
  assert.strictEqual(r.status, "dropped");
  assert.strictEqual(r.checkable, true);
});

test("a dropped braid with no distinctive terms is marked unverifiable", () => {
  const r = classify(
    { handle: "mardehaym", description: "seven steps from tool adoption to agentic org" },
    DRAFT
  );
  assert.strictEqual(r.status, "dropped");
  assert.strictEqual(r.checkable, false);
});

// --- end to end ------------------------------------------------------------

test("the ledger reproduces Edition #28's real outcome", () => {
  const rows = ledger(LINEUP, DRAFT).rows;
  const count = (s) => rows.filter((r) => r.status === s).length;
  assert.strictEqual(count("landed"), 2);
  assert.strictEqual(count("substituted"), 1);
  assert.strictEqual(count("dropped"), 2);
});

test("render states the tally and flags substitution", () => {
  const md = render(ledger(LINEUP, DRAFT), "2026-08-31");
  assert.ok(md.includes("**2 landed**"), md.slice(0, 200));
  assert.ok(md.includes("substituted"));
  assert.ok(md.includes("jalapeno-first-results"));
});

test("render returns empty string when there is nothing to report", () => {
  assert.strictEqual(render([], "2026-08-31"), "");
});

test("parseArgs reads --date", () => {
  assert.strictEqual(parseArgs(["--date", "2026-08-31"]).date, "2026-08-31");
  assert.strictEqual(parseArgs([]).date, null);
});

// --- format tolerance ------------------------------------------------------
// Stage 4a has emitted three different braid shapes across five editions. The
// checker must read what it can and be explicit about what it cannot, rather
// than silently under-reporting the plan.

test("markdown-link form yields the handle, and read time is not a description", () => {
  const line =
    "    - braids in: [@Google (1 min read)](https://x.com/Google/status/2088396439198089236), " +
    "[@koraykv (2 min read)](https://x.com/koraykv/status/2087948169552490845)";
  const { braids, unparsed } = parseBraids(line);
  assert.deepStrictEqual(braids.map((b) => b.handle), ["Google", "koraykv"]);
  assert.strictEqual(braids[0].description, "", "read time leaked in as a description");
  assert.strictEqual(unparsed.length, 0);
});

test("prose braids with no handle are counted as unreadable, not discarded", () => {
  // The real 2026-08-24 shape. Reporting 1 planned braid here — when the lineup
  // planned 3 — would have hidden two thirds of the plan.
  const line =
    "   - braids in: AI Daily Brief's (2026-08-21) poll numbers on public concerns; " +
    "Hard Fork (2026-08-21) on Spirit Airlines data; @abhijaymrana (2026-08-17) on Google";
  const { braids, unparsed } = parseBraids(line);
  assert.strictEqual(braids.length, 1);
  assert.strictEqual(braids[0].handle, "abhijaymrana");
  assert.strictEqual(unparsed.length, 2);
  assert.ok(unparsed[0].text.includes("AI Daily Brief"));
});

test("a bare date is not treated as a description", () => {
  assert.strictEqual(cleanDescription("2026-08-17"), "");
  assert.strictEqual(cleanDescription("3 min watch"), "");
  assert.strictEqual(cleanDescription("the 75x cost spread"), "the 75x cost spread");
});

test("splitSegments uses semicolons for prose and @-boundaries otherwise", () => {
  assert.strictEqual(splitSegments("a; b; c").length, 3);
  // A comma inside a description must not split the segment.
  assert.strictEqual(splitSegments("@a (x, y), @b (z)").length, 2);
});

test("render states the unreadable count and names the fix", () => {
  const line = "   - braids in: Hard Fork (2026-08-21) on data; Some Show (2026-08-20) on other";
  const md = render(ledger(line, "no citations here"), "2026-08-24");
  assert.ok(md.includes("2 unreadable"), md.slice(0, 240));
  assert.ok(md.includes("briefing-prompt.md"), "does not point at the durable fix");
});

test("an explicit 'none available in KB' is not counted as a braid", () => {
  // A story that honestly had no bookmark to weave in must not show up as a
  // phantom planned braid, nor as an unreadable line.
  for (const line of [
    "   - braids in: none available in KB",
    "   - **braids in:** None available in KB.",
  ]) {
    const { braids, unparsed } = parseBraids(line);
    assert.strictEqual(braids.length, 0, line);
    assert.strictEqual(unparsed.length, 0, line);
  }
});

test("'none' mixed into a real list does not swallow the real braids", () => {
  const { braids, unparsed } = parseBraids("   - braids in: @steren (sandboxes), none available");
  assert.deepStrictEqual(braids.map((b) => b.handle), ["steren"]);
  assert.strictEqual(unparsed.length, 0);
});

/**
 * COUPLING — the prompt and this parser must not drift apart.
 *
 * scripts/briefing-prompt.md tells the model exactly how to write `braids in:`,
 * and carries a worked example. If that example stops parsing, the pinned
 * format and the checker have diverged and every braid silently becomes
 * "unreadable" again. Reading the real file (rather than restating the example
 * here) is the point: a copy would drift with it.
 */
test("the format example in briefing-prompt.md parses as the parser expects", () => {
  const prompt = fs.readFileSync(path.join(__dirname, "briefing-prompt.md"), "utf8");
  const m = prompt.match(/`(@[A-Za-z0-9_]+ \([^`]*?\)(?:, @[A-Za-z0-9_]+ \([^`]*?\))+)`/);
  assert.ok(m, "no worked braid example found in briefing-prompt.md");

  const { braids, unparsed } = parseBraids(`   - braids in: ${m[1]}`);
  assert.strictEqual(unparsed.length, 0, `example did not parse: ${m[1]}`);
  assert.ok(braids.length >= 2, `expected 2+ braids, got ${braids.length}`);
  for (const b of braids) {
    assert.ok(b.handle, "a braid parsed without a handle");
    assert.ok(b.description, `@${b.handle} parsed with an empty description`);
  }
});

test("briefing-prompt.md forbids the two shapes that broke the checker", () => {
  const prompt = fs.readFileSync(path.join(__dirname, "briefing-prompt.md"), "utf8");
  assert.ok(/never name a podcast or show/i.test(prompt), "prose/show form not forbidden");
  assert.ok(/never write a markdown link/i.test(prompt), "markdown-link form not forbidden");
});

console.log("");
if (failed > 0) {
  console.log(`braid-ledger.test.js: ${failed} FAILED, ${passed} passed`);
  process.exit(1);
}
console.log(`All ${passed} tests passed.`);

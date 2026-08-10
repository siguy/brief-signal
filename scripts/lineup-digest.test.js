#!/usr/bin/env node

/**
 * Tests for the lineup digest — the editorial section of the PR body.
 *
 * Run: node scripts/lineup-digest.test.js
 * (Plain Node assertions — no test framework dependency.)
 */

const assert = require("assert");
const { parseArgs, parseStories, parseRegistryDiff, newThemes, render } = require("./lineup-digest.js");

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

// A trimmed copy of the real Edition #25 lineup: the shapes that matter are the
// numbered story headers, the indented detail lines, and the two registry markers.
const LINEUP = [
  "## Proposed Lineup — Edition #25",
  "",
  "**The Big Picture (exactly 2-3 stories, lead first):**",
  "1. **Google's Leadership Shift: Reshaping AI Strategy & Talent Landscape**",
  "   - event: Jeff Dean departed Google to launch Discovery Loop.",
  "   - gravity: 2 KBs × 6 distinct shows/authors",
  "   - advances: The Org Restructuring / Who Builds; AI Economy / Market Structure",
  "   - braids in: [@JeffDean](https://x.com/JeffDean/status/2085083442669318443)",
  "2. **Autonomous Agents Breach Security**",
  "   - gravity: 3 KBs × 6 distinct shows/authors",
  "   - advances: NEW THEME — candidate theme? AI Safety & Security",
  "",
  "**Quick Hits (6 candidates):**",
  "- **[Something](https://example.com/a)** — a quick hit.",
  "",
  "**Proposed registry update:**",
  "- Token / AI-Spend Economics — moved to: value optimization over tokenmaxxing.",
  "- NEW THEME: AI Safety & Security — agent sandboxing failures and AI-scaled offense.",
  "",
  "**Full proposed registry:**",
  "```themes-proposed",
  "# Brief Signal — Theme Registry",
  "```",
].join("\n");

// --- story parsing ---------------------------------------------------------

test("parseStories reads every numbered Big Picture story", () => {
  const stories = parseStories(LINEUP);
  assert.strictEqual(stories.length, 2);
  assert.strictEqual(stories[0].n, "1");
  assert.match(stories[0].title, /Google's Leadership Shift/);
});

test("parseStories captures the advances and gravity fields", () => {
  const [first] = parseStories(LINEUP);
  assert.match(first.advances, /Org Restructuring/);
  assert.match(first.gravity, /2 KBs/);
});

test("parseStories stops at the next top-level block", () => {
  // Quick Hits are also list items; without a boundary they would be swallowed
  // into story 2 and the mapping would silently misreport.
  const stories = parseStories(LINEUP);
  assert.strictEqual(stories.length, 2, "Quick Hits must not become a third story");
});

test("parseStories returns nothing for a lineup with no stories", () => {
  assert.deepStrictEqual(parseStories("**Quick Hits:**\n- nothing here"), []);
});

// --- registry diff ---------------------------------------------------------

test("parseRegistryDiff stops before the full registry block", () => {
  const diff = parseRegistryDiff(LINEUP);
  assert.match(diff, /Token \/ AI-Spend Economics/);
  assert.ok(!diff.includes("Brief Signal — Theme Registry"), "must not swallow the full registry");
});

test("parseRegistryDiff returns empty when the marker is absent", () => {
  assert.strictEqual(parseRegistryDiff("no markers here"), "");
});

test("newThemes surfaces only the NEW THEME lines", () => {
  const fresh = newThemes(parseRegistryDiff(LINEUP));
  assert.strictEqual(fresh.length, 1);
  assert.match(fresh[0], /^AI Safety & Security/);
});

// --- rendering -------------------------------------------------------------

test("render leads with the themes-to-stories mapping", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  assert.ok(out.startsWith("## 🗺️ Themes ↔ stories"), "mapping must come first");
  assert.match(out, /\*Advances:\* The Org Restructuring/);
});

test("render calls out a proposed new theme explicitly", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  assert.match(out, /New theme proposed:\*\* AI Safety & Security/);
});

test("render folds the full registry into a collapsed details block", () => {
  const out = render({
    lineup: LINEUP,
    themes: "# Brief Signal — Theme Registry\n\nbody",
    themesPath: "content/briefings/drafts/2026-08-10-themes-proposed.md",
  });
  assert.match(out, /<details>/);
  assert.match(out, /Full proposed registry/);
  assert.match(out, /copy `content\/briefings\/drafts\/2026-08-10-themes-proposed\.md`/);
});

test("render omits the registry section when no themes file exists", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  assert.ok(!out.includes("<details>"), "no themes file means no registry block");
});

test("render returns empty string for an unparseable lineup", () => {
  // Never fatal: a malformed lineup must cost the section, not the PR.
  assert.strictEqual(render({ lineup: "garbage", themes: null, themesPath: null }), "");
});

// --- format drift: what Stage 4a actually emitted on the first live run -----
// Both of these shipped broken and were caught only by running the real thing.
// Gemini's markdown is not stable between editions, so the parsers must be.

const LINEUP_ASTERISK = [
  "**The Big Picture (exactly 2-3 stories, lead first):**",
  "1.  **AI Agents Breach Defenses: The New Era of Autonomous Cyber Attacks**",
  "    *   event: OpenAI researchers detailed a sandbox escape.",
  "    *   gravity: 1 (Playlist) × 1 + 1 (Bookmarks) × 3 = HIGH",
  "    *   advances: Agent Infrastructure Maturing",
  "",
  "**Proposed registry update:**",
  "-   Token / AI-Spend Economics — moved to: **engineered spend**.",
  "",
  "```themes-proposed",
  "# Brief Signal — Theme Registry",
  "the whole registry lives in here",
  "```",
].join("\n");

test("parseStories reads '*' bullets at any indent, not just '-'", () => {
  const [first] = parseStories(LINEUP_ASTERISK);
  assert.strictEqual(first.advances, "Agent Infrastructure Maturing");
  assert.match(first.gravity, /HIGH$/);
});

test("parseRegistryDiff stops at a fence when the 'Full proposed registry' marker is absent", () => {
  // Stage 4a does not always emit that marker. Without a fence boundary the
  // "diff" swallowed the entire 77-line registry into the PR body.
  const diff = parseRegistryDiff(LINEUP_ASTERISK);
  assert.match(diff, /Token \/ AI-Spend Economics/);
  assert.ok(!diff.includes("Brief Signal — Theme Registry"), "registry must not leak into the diff");
  assert.ok(!diff.includes("```"), "fence must not leak into the diff");
});

test("parseRegistryDiff stops at the next top-level bold heading", () => {
  const diff = parseRegistryDiff(
    ["**Proposed registry update:**", "- One change.", "", "**Something Else:**", "- not a theme"].join("\n")
  );
  assert.strictEqual(diff, "- One change.");
});

// --- args ------------------------------------------------------------------

test("parseArgs reads --lineup and --themes", () => {
  const args = parseArgs(["--lineup", "a.md", "--themes", "b.md"]);
  assert.strictEqual(args.lineup, "a.md");
  assert.strictEqual(args.themes, "b.md");
});

if (failed) {
  console.error(`\n${failed} test(s) failed.`);
} else {
  console.log(`\nAll ${passed} tests passed.`);
}

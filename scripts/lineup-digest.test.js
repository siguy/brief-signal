#!/usr/bin/env node

/**
 * Tests for the lineup digest — the editorial section of the PR body.
 *
 * Run: node scripts/lineup-digest.test.js
 * (Plain Node assertions — no test framework dependency.)
 */

const assert = require("assert");
const {
  parseArgs,
  parseStories,
  parseRegistryDiff,
  newThemes,
  render,
  sectionLines,
  bullets,
  inlineField,
  parseCuts,
} = require("./lineup-digest.js");

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
  "**Why the lead beats the runner-up:** Dean leaving is datable; the rest is mood.",
  "",
  "**Continuity:** Advances the org-restructuring arc from #23.",
  "",
  "**Quick Hits (6 candidates):**",
  "- **[Something](https://example.com/a)** — a quick hit.",
  "",
  "---",
  "",
  "## Editorial review notes — not part of the draft",
  "",
  "**Recommended reads (3-5, or \"none this week\"):**",
  "- **[Gurley: Google should embrace open models](https://example.com/gurley)** — worth reading: the",
  "  strategic argument behind the lead — no slot because: no datable event this week.",
  "- **[A deep technical piece](https://example.com/deep)** — worth reading: the mechanism — no slot",
  "  because: too long to compress into a one-liner.",
  "",
  "**Considered but cut (and why):**",
  "- **Gurley on open models** — [YouTube](https://example.com/gurley) — quality: HIGH — cut: no datable event.",
  "- **Citizen SDLC** — [X](https://example.com/sdlc) — quality: **MEDIUM** — cut: fits better as a teach.",
  "- **Brian Greene on consciousness** — [YouTube](https://example.com/greene) — quality: LOW — cut: not actionable.",
  "",
  "**Model-release coverage self-check:** everything landed.",
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

test("render leads with the editorial decision and its counts", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  assert.ok(out.startsWith("## 🗺️ The editorial decision"), "the decision must come first");
  assert.match(out, /\*Advances:\* The Org Restructuring/);
  // The counts line is the fastest check on a lineup: a wrong number is visible
  // before a word of prose is read.
  assert.match(out, /\*\*2\*\* Big Picture · \*\*1\*\* Quick Hits · \*\*2\*\* recommended reads · \*\*3\*\* cut/);
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
  assert.ok(!out.includes("Full proposed registry"), "no themes file means no registry block");
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


// --- what was selected -----------------------------------------------------
// The first version of this digest rendered a title, `advances:` and `gravity:`
// and nothing else, so a reviewer could see which arc a story moved but not the
// argument for running it. These cover the fields that carry that argument.

test("parseStories captures every field a reviewer needs to agree or disagree", () => {
  const [first] = parseStories(LINEUP);
  assert.match(first.fields.event, /Jeff Dean departed/);
  assert.match(first.fields["braids in"], /JeffDean/);
});

test("parseStories stops at the review-notes rule, not just a bold block", () => {
  const stories = parseStories(LINEUP);
  assert.strictEqual(stories.length, 2, "review notes must not become a third story");
});

test("render shows each story's event and seller play, not just its arc", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  assert.match(out, /\*Event:\* Jeff Dean departed/);
  assert.match(out, /### ✅ Selected — Big Picture \(2\)/);
});

test("render inlines the Quick Hits — half the edition used to be invisible", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  assert.match(out, /### ✅ Selected — Quick Hits \(1\)/);
  assert.match(out, /\[Something\]\(https:\/\/example\.com\/a\)/);
});

test("render carries the lead rationale and the continuity line", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  assert.match(out, /\*\*Why the lead beats the runner-up:\*\* Dean leaving is datable/);
  assert.match(out, /\*\*Continuity:\*\* Advances the org-restructuring arc/);
});

// --- what was excluded -----------------------------------------------------

test("parseCuts reads the quality rating, bold or plain", () => {
  const cuts = parseCuts(LINEUP);
  assert.strictEqual(cuts.length, 3);
  assert.deepStrictEqual(
    cuts.map((c) => c.quality),
    ["HIGH", "MEDIUM", "LOW"]
  );
});

test("render leads the cut ledger with the HIGH-rated rejects", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  const high = out.indexOf("Stage 4a still rates HIGH");
  const rest = out.indexOf("The other 2");
  assert.ok(high !== -1, "HIGH cuts must be surfaced");
  assert.ok(rest > high, "the rest of the ledger must come after, collapsed");
  // The HIGH item is above the fold; the LOW one is inside the <details>.
  assert.ok(out.indexOf("Gurley on open models") < out.indexOf("<details>"));
  assert.ok(out.indexOf("Brian Greene") > out.indexOf("<details>"));
});

test("render says so when nothing cut was rated HIGH", () => {
  const lineup = [
    "1. **A story**",
    "   - event: something happened.",
    "",
    "**Considered but cut (and why):**",
    "- **Thin thing** — quality: LOW — cut: thin.",
  ].join("\n");
  const out = render({ lineup, themes: null, themesPath: null });
  assert.match(out, /Nothing cut this week was rated HIGH/);
});

test("render still renders an ungraded cut ledger from an older lineup", () => {
  // Lineups written before the `quality:` field exist on disk and stay
  // redraftable. They must degrade to "unsorted", never to "nothing was cut".
  const lineup = [
    "1. **A story**",
    "   - event: something happened.",
    "",
    "**Considered but cut (and why):**",
    "- Databricks AI Extract: less macro-impactful than the selected Quick Hits.",
  ].join("\n");
  const out = render({ lineup, themes: null, themesPath: null });
  assert.match(out, /### ✂️ Cut — 1 candidate/);
  assert.match(out, /Databricks AI Extract/);
  assert.match(out, /predates per-cut quality ratings/);
  assert.ok(!out.includes("recommended reads"), "a lineup with no reads block must not report 0 of them");
});

// --- recommended reads -----------------------------------------------------

test("render surfaces the recommended reads with how to promote one", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  assert.match(out, /### 📚 Recommended reads — high value, no slot \(2\)/);
  assert.match(out, /1\. \*\*\[Gurley: Google should embrace open models\]/);
  assert.match(out, /add it to the lineup's Quick Hits and redraft/);
});

test("render splits a read's two clauses onto their own lines", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  assert.match(out, /- \*Worth reading:\* the strategic argument behind the lead/);
  assert.match(out, /- \*No slot because:\* no datable event this week\./);
});

test("render keeps a differently-shaped read verbatim rather than mangling it", () => {
  // Gemini's markdown drifts between editions. A bullet that does not carry the
  // two clause markers must survive whole — losing half a reason silently is
  // worse than an ugly line.
  const lineup = [
    "1. **A story**",
    "   - event: something happened.",
    "",
    "**Recommended reads (3-5):**",
    "- [An unusual shape](https://example.com/x): just one clause, no markers at all.",
  ].join("\n");
  const out = render({ lineup, themes: null, themesPath: null });
  assert.match(out, /1\. \[An unusual shape\]\(https:\/\/example\.com\/x\): just one clause, no markers at all\./);
});

test("render drops the redundant quality tag under the HIGH cut heading only", () => {
  const out = render({ lineup: LINEUP, themes: null, themesPath: null });
  const high = out.slice(out.indexOf("still rates HIGH"), out.indexOf("<details>"));
  assert.match(high, /\*\*Gurley on open models\*\* — \[YouTube\]\(https:\/\/example\.com\/gurley\) — cut: no datable event\./);
  assert.ok(!high.includes("quality:"), "the heading already says HIGH");
  // In the collapsed ledger the rating is the sort key, so it stays.
  assert.match(out.slice(out.indexOf("<details>")), /quality: \*\*MEDIUM\*\*/);
});

test("render reports zero recommended reads when Stage 4a said none this week", () => {
  // "none this week" is a judgement that was made, unlike a missing block.
  const lineup = [
    "1. **A story**",
    "   - event: something happened.",
    "",
    '**Recommended reads (3-5, or "none this week"):** none this week',
  ].join("\n");
  const out = render({ lineup, themes: null, themesPath: null });
  assert.match(out, /\*\*0\*\* recommended reads/);
  assert.ok(!out.includes("📚 Recommended reads"), "an empty list needs no section of its own");
});

// --- block parsing ---------------------------------------------------------

test("sectionLines matches a label prefix, not its drifting count", () => {
  // "Quick Hits (3-6 candidates)" one week, "Quick Hits (6)" the next.
  const lines = sectionLines("**Quick Hits (6):**\n- one\n- two", /^\*\*Quick Hits\b/i);
  assert.deepStrictEqual(bullets(lines), ["one", "two"]);
});

test("sectionLines picks up an answer written inline on the label line", () => {
  const lines = sectionLines("**Recommended reads (3-5):** none this week", /^\*\*Recommended reads\b/i);
  assert.deepStrictEqual(lines, ["none this week"]);
  assert.deepStrictEqual(bullets(lines), []);
});

test("sectionLines returns null for an absent block, not an empty one", () => {
  assert.strictEqual(sectionLines("nothing here", /^\*\*Quick Hits\b/i), null);
});

test("bullets folds a wrapped continuation back into its item", () => {
  const folded = bullets(["- worth reading: the strategic", "  argument behind the lead."]);
  assert.deepStrictEqual(folded, ["worth reading: the strategic argument behind the lead."]);
});

test("bullets reads '*', '+' and numbered markers, not only '-'", () => {
  assert.deepStrictEqual(bullets(["*   one", "+ two", "3. three"]), ["one", "two", "three"]);
});

test("inlineField returns null when the field is absent", () => {
  assert.strictEqual(inlineField("**Continuity:** new thread", /^\*\*Why the lead\b/i), null);
});

if (failed) {
  console.error(`\n${failed} test(s) failed.`);
} else {
  console.log(`\nAll ${passed} tests passed.`);
}

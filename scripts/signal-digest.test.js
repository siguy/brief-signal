#!/usr/bin/env node

/**
 * Tests for the signal digest (Tier 0 — Google & competitors).
 *
 * Run: node scripts/signal-digest.test.js
 * (Plain Node assertions — no test framework dependency.)
 */

const assert = require("assert");
const {
  splitEntries,
  normalizeUrl,
  parseArgs,
  cited,
  FIRST_PARTY_HANDLE,
  FIRST_PARTY_DOMAIN,
  GOOGLE_MENTION,
  COMPETITOR_MENTION,
} = require("./signal-digest.js");

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

// --- normalizeUrl: the bug that made every YouTube link look cited ----------

test("normalizeUrl keeps the YouTube video id", () => {
  // Regression: an earlier version did .split("?")[0], collapsing every watch
  // URL to https://www.youtube.com/watch — so one cited video marked all of
  // them cited, and LOW podcasts showed as covered when they weren't.
  const a = normalizeUrl("https://www.youtube.com/watch?v=wWbX3NL6_Uo");
  const b = normalizeUrl("https://www.youtube.com/watch?v=0cDd5tPdTJ4");
  assert.notStrictEqual(a, b, "two different videos must not normalize alike");
  assert.ok(a.includes("wwbx3nl6_uo"), "video id must survive normalization");
});

test("normalizeUrl strips tracking params but keeps the rest", () => {
  assert.strictEqual(
    normalizeUrl("https://www.youtube.com/watch?v=abc123&utm_source=x&si=zz"),
    "https://www.youtube.com/watch?v=abc123"
  );
});

test("normalizeUrl is order-insensitive across equivalent links", () => {
  assert.strictEqual(
    normalizeUrl("https://ex.com/a?b=2&a=1"),
    normalizeUrl("https://ex.com/a?a=1&b=2")
  );
});

test("normalizeUrl trims trailing punctuation and slashes", () => {
  assert.strictEqual(normalizeUrl("https://openai.com/news/."), "https://openai.com/news");
  assert.strictEqual(normalizeUrl("https://x.com/a/status/1)"), "https://x.com/a/status/1");
});

// --- Tier 0 lane matching ---------------------------------------------------

test("lane A matches a first-party @Google post", () => {
  const entry = '**[@Google (2026-07-30) — Gemini Robotics 2](https://x.com/Google/status/2082861483055075450)** (1 min)';
  assert.ok(FIRST_PARTY_HANDLE.test(entry));
});

test("lane A matches every named competitor handle", () => {
  for (const h of ["OpenAI", "AnthropicAI", "Microsoft", "AWS", "MistralAI", "xai", "AIatMeta", "deepseek_ai", "Kimi_Moonshot"]) {
    assert.ok(FIRST_PARTY_HANDLE.test(`**[@${h} (2026-07-30) — x](https://x.com/${h}/status/1)**`), `${h} should match`);
  }
});

test("lane A does not match a third party merely discussing Google", () => {
  const entry = '**[@somepundit (2026-07-30) — Why Google is losing](https://x.com/somepundit/status/1)** (1 min)';
  assert.ok(!FIRST_PARTY_HANDLE.test(entry));
});

test("lane A matches a first-party domain even without a handle", () => {
  // This is how the breach that Edition #24 missed would surface once the lab
  // news watcher lands: no X handle, just an anthropic.com permalink.
  assert.ok(FIRST_PARTY_DOMAIN.test("see https://www.anthropic.com/news/disclosure"));
  assert.ok(FIRST_PARTY_DOMAIN.test("https://blog.google/technology/ai/thing/"));
  assert.ok(!FIRST_PARTY_DOMAIN.test("https://techcrunch.com/google-thing"));
});

test("Google lane matches product surface area, not the word Google alone", () => {
  assert.ok(GOOGLE_MENTION.test("running on TPU v5e"));
  assert.ok(GOOGLE_MENTION.test("moved to the Agent Platform"));
  assert.ok(GOOGLE_MENTION.test("Gemini 3.1 Flash"));
  assert.ok(!GOOGLE_MENTION.test("an ex-Googler wrote a memoir"));
});

test("competitor lane covers the agreed list", () => {
  for (const p of ["Claude Opus 5", "GPT-5.6", "Llama 4", "Mistral Large", "Grok 3", "DeepSeek V4", "Qwen3.7", "Kimi K3", "Azure OpenAI", "Bedrock"]) {
    assert.ok(COMPETITOR_MENTION.test(p), `${p} should match`);
  }
});

// --- entry splitting per KB format ------------------------------------------

test("splitEntries parses bookmark entries with handle, url and no grade", () => {
  const kb = {
    label: "Bookmarks",
    kind: "bookmarks",
    content:
      "# KB\n\n## Topic\n\n" +
      '**[@Google (2026-07-30) — Gemini Robotics 2](https://x.com/Google/status/208)** (1 min)\n> body text\n\n' +
      '**[@other (2026-07-29) — Something else](https://x.com/other/status/209)** (2 min)\n> more\n',
  };
  const entries = splitEntries(kb);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].url, "https://x.com/Google/status/208");
  assert.strictEqual(entries[0].grade, null, "bookmarks carry no grade until Step 3a");
  assert.ok(entries[0].header.includes("Gemini Robotics 2"));
});

test("splitEntries reads the GCP Relevance grade on podcast entries", () => {
  const kb = {
    label: "Podcasts",
    kind: "podcasts",
    content:
      "# KB\n\n## Table of Contents\n\nsome toc\n\n" +
      '## AI Daily Brief (2026-07-31) — "Hedge Fund Implosion"\n' +
      "https://www.youtube.com/watch?v=abc\n" +
      "- **Intent Signal:** OpenAI cutting prices\n" +
      "- **GCP Relevance:** HIGH — direct cloud buying signal\n",
  };
  const entries = splitEntries(kb);
  assert.strictEqual(entries.length, 1, "the Table of Contents heading must not count as an entry");
  assert.strictEqual(entries[0].grade, "HIGH");
});

// --- the two podcast grades ------------------------------------------------
// These answer different questions and disagree on about a third of episodes.
// Conflating them is what made five truthfully-graded episodes look fabricated
// in the Edition #24 post-mortem, so each is pinned independently here.

test("splitEntries keeps Editorial Signal and GCP Relevance apart", () => {
  const kb = {
    label: "Podcasts",
    kind: "podcasts",
    content:
      '## Grit (2026-07-27) — "Ex-Twitter CEO on Why AI Needs a New Internet"\n' +
      "https://www.youtube.com/watch?v=abc\n" +
      "**Duration:** 62 min | **Editorial Signal:** HIGH\n" +
      "- **GCP Relevance:** MEDIUM — indirect\n",
  };
  const [entry] = splitEntries(kb);
  assert.strictEqual(entry.editorialSignal, "HIGH", "editorial signal is the episode's news value");
  assert.strictEqual(entry.grade, "MEDIUM", "grade stays GCP Relevance — Tier 0 depends on it");
});

test("splitEntries still reads the pre-rename 'Signal Rating' label", () => {
  // KBs up to MAX_AGE_DAYS old predate the rename and are still in the window.
  const kb = {
    label: "Podcasts",
    kind: "podcasts",
    content:
      '## All-In (2026-07-29) — "The $1/Hour Robot"\n' +
      "https://www.youtube.com/watch?v=def\n" +
      "**Duration:** 90 min | **Signal Rating:** HIGH\n",
  };
  assert.strictEqual(splitEntries(kb)[0].editorialSignal, "HIGH");
});

test("splitEntries reports no editorial signal when the field is absent", () => {
  const kb = {
    label: "Bookmarks",
    kind: "bookmarks",
    content: "**[@sama (2026-07-30) — a post](https://x.com/sama/status/1)**\n",
  };
  assert.strictEqual(splitEntries(kb)[0].editorialSignal, null);
});

test("splitEntries handles the playlist's numbered-heading format", () => {
  const kb = {
    label: "Playlist",
    kind: "playlist",
    content: "# KB\n\n## AI Economy\n\n### #1 — Stanford MS&E435\nhttps://youtu.be/x\n\n### #2 — Another\nhttps://youtu.be/y\n",
  };
  assert.strictEqual(splitEntries(kb).length, 2);
});

test("parseArgs reads --date", () => {
  assert.strictEqual(parseArgs(["--date", "2026-08-03"]).date, "2026-08-03");
  assert.strictEqual(parseArgs([]).date, null);
});

// Report failures honestly. A summary that says "all passed" while a test
// failed is the same class of silent-success bug this pipeline keeps getting
// bitten by — see tasks/lessons.md on silent fallbacks.
// --- cited(): a story counts when ANY of its URLs reached the draft ---------
// Regression from Edition #25: matching only the header permalink reported the
// Black Hat talk, Cloudflare's Kitesurf post and WeatherNext as NOT CITED even
// though all three ran — the briefing cited each one's own article URL. A digest
// that overstates misses trains the reader to skip it.

test("cited matches a bookmark via its linked article, not just the permalink", () => {
  const entry = {
    url: "https://x.com/CloudflareDev/status/2085394318005846411",
    urls: [
      "https://x.com/CloudflareDev/status/2085394318005846411",
      "https://blog.cloudflare.com/kitesurf/",
    ],
  };
  const draft = new Set([normalizeUrl("https://blog.cloudflare.com/kitesurf/")]);
  assert.strictEqual(cited(entry, draft), true);
});

test("cited still reports a genuine miss", () => {
  const entry = {
    url: "https://x.com/bgurley/status/2085440000000000000",
    urls: [
      "https://x.com/bgurley/status/2085440000000000000",
      "https://p3institute.substack.com/p/from-open-source-software",
    ],
  };
  const draft = new Set([normalizeUrl("https://blog.cloudflare.com/kitesurf/")]);
  assert.strictEqual(cited(entry, draft), false);
});

test("cited falls back to url when urls is absent", () => {
  const entry = { url: "https://blog.google/weathernext/" };
  const draft = new Set([normalizeUrl("https://blog.google/weathernext/")]);
  assert.strictEqual(cited(entry, draft), true);
});

test("cited returns null with no draft to compare against", () => {
  assert.strictEqual(cited({ url: "https://x.com/a/status/1", urls: [] }, null), null);
});

test("splitEntries excludes t.co shorteners from an entry's urls", () => {
  // An unresolved shortener can never match a briefing URL, so counting it
  // would only ever produce noise.
  const kb = {
    kind: "bookmarks",
    label: "Bookmarks",
    content: [
      "**[@someone (2026-08-06) — A post](https://x.com/someone/status/123)** (1 min)",
      "",
      "Read this https://t.co/abc123 now",
      "",
      "*Linked: \"A Real Article\" — 7 min read* — https://example.com/article",
      "",
      "- **GCP Relevance:** HIGH — test entry.",
    ].join("\n"),
  };
  const [entry] = splitEntries(kb);
  assert.ok(!entry.urls.some((u) => u.includes("t.co")), "t.co should be filtered out");
  assert.ok(entry.urls.includes("https://example.com/article"), "article URL should be kept");
});

test("parseArgs reads --lineup for the pre-draft sweep", () => {
  const args = parseArgs(["--lineup", "drafts/2026-08-10-lineup.md"]);
  assert.strictEqual(args.lineup, "drafts/2026-08-10-lineup.md");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED, ${passed} passed.`);
} else {
  console.log(`\nAll ${passed} tests passed.`);
}

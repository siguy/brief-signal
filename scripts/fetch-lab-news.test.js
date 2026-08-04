#!/usr/bin/env node

/**
 * Tests for the lab news watcher.
 *
 * Run: node scripts/fetch-lab-news.test.js
 * (Plain Node assertions — no test framework dependency.)
 *
 * Fixture strings, never live fetches: a test that hits the network tests the
 * network. The live feeds are exercised by running the script itself.
 */

const assert = require("assert");
const {
  parseFeed,
  clean,
  isoDate,
  titleFromSlug,
  formatKnowledgeBase,
  EMPTY_MARKER,
} = require("./fetch-lab-news.js");

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

// --- clean ------------------------------------------------------------------

test("clean unwraps CDATA", () => {
  assert.strictEqual(clean("<![CDATA[Hello world]]>"), "Hello world");
});

test("clean strips entity-escaped HTML", () => {
  // Google Cloud's feed ships descriptions as escaped markup. Stripping tags
  // BEFORE decoding entities leaves `<div class="...">` sitting in the prose —
  // that shipped in the first cut of this script.
  const raw = '&lt;div class="x"&gt;&lt;p&gt;Real sentence here.&lt;/p&gt;&lt;/div&gt;';
  assert.strictEqual(clean(raw), "Real sentence here.");
});

test("clean strips real tags too", () => {
  assert.strictEqual(clean("<p>Real <b>sentence</b>.</p>"), "Real sentence .");
});

test("clean decodes ampersands last so &amp;lt; does not become a tag", () => {
  assert.ok(!clean("Tom &amp; Jerry").includes("&amp;"));
  assert.strictEqual(clean("Tom &amp; Jerry"), "Tom & Jerry");
});

test("clean truncates with an ellipsis at the requested length", () => {
  const out = clean("x".repeat(500));
  assert.ok(out.length <= 400, `expected <= 400, got ${out.length}`);
  assert.ok(out.endsWith("…"));
});

// --- isoDate ----------------------------------------------------------------

test("isoDate parses RFC822 pubDate and ISO lastmod alike", () => {
  assert.strictEqual(isoDate("Wed, 30 Jul 2026 14:00:00 GMT"), "2026-07-30");
  assert.strictEqual(isoDate("2026-07-30"), "2026-07-30");
});

test("isoDate returns null rather than an Invalid Date", () => {
  assert.strictEqual(isoDate("not a date"), null);
  assert.strictEqual(isoDate(null), null);
});

// --- titleFromSlug ----------------------------------------------------------

test("titleFromSlug makes a sitemap URL readable", () => {
  assert.strictEqual(
    titleFromSlug("https://www.anthropic.com/news/position-open-weights-models"),
    "Position open weights models"
  );
});

// --- parseFeed --------------------------------------------------------------

test("parseFeed reads an RSS item", () => {
  const xml = `<rss><channel>
    <item>
      <title>Introducing something</title>
      <link>https://openai.com/news/thing</link>
      <pubDate>Wed, 30 Jul 2026 14:00:00 GMT</pubDate>
      <description><![CDATA[A short summary.]]></description>
    </item>
  </channel></rss>`;
  const [item] = parseFeed(xml, { kind: "rss" });
  assert.strictEqual(item.title, "Introducing something");
  assert.strictEqual(item.url, "https://openai.com/news/thing");
  assert.strictEqual(item.date, "2026-07-30");
  assert.strictEqual(item.summary, "A short summary.");
});

test("parseFeed reads a sitemap and honours pathFilter", () => {
  // Anthropic has no RSS feed; its sitemap is the source. Only /news/ counts —
  // the same file lists careers pages, docs and marketing routes.
  const xml = `<urlset>
    <url><loc>https://www.anthropic.com/news/a-story</loc><lastmod>2026-07-30</lastmod></url>
    <url><loc>https://www.anthropic.com/careers</loc><lastmod>2026-07-30</lastmod></url>
  </urlset>`;
  const items = parseFeed(xml, { kind: "sitemap", pathFilter: "/news/" });
  assert.strictEqual(items.length, 1, "non-/news/ URLs must be filtered out");
  assert.strictEqual(items[0].url, "https://www.anthropic.com/news/a-story");
  assert.strictEqual(items[0].date, "2026-07-30");
});

test("parseFeed drops entries with no title or no link", () => {
  const xml = "<rss><channel><item><title>Orphan</title></item></channel></rss>";
  assert.strictEqual(parseFeed(xml, { kind: "rss" }).length, 0);
});

test("parseFeed returns [] for junk rather than throwing", () => {
  assert.deepStrictEqual(parseFeed("<html>not a feed</html>", { kind: "rss" }), []);
  assert.deepStrictEqual(parseFeed("", { kind: "sitemap" }), []);
});

// --- formatKnowledgeBase ----------------------------------------------------

test("formatKnowledgeBase emits headings signal-digest can parse", () => {
  // splitEntries falls through to a heading branch requiring exactly
  // `^## <something> (YYYY-MM-DD)`. Bulleted output would parse to zero
  // entries and read as a failed extraction.
  const md = formatKnowledgeBase(
    [{ lab: "Anthropic", title: "A story", url: "https://www.anthropic.com/news/a", date: "2026-07-30", summary: "s" }],
    4,
    "2026-08-03"
  );
  const headings = md.split("\n").filter((l) => /^## .+\(\d{4}-\d{2}-\d{2}\)/.test(l));
  assert.strictEqual(headings.length, 1, "entry heading must match splitEntries' pattern");
  assert.ok(md.includes("https://www.anthropic.com/news/a"), "permalink must survive");
});

test("formatKnowledgeBase marks a quiet week with the shared EMPTY marker", () => {
  // Byte-identical to extract-podcasts.js's EMPTY_MARKER, or the "ran and found
  // nothing" case becomes indistinguishable from "crashed".
  const md = formatKnowledgeBase([], 4, "2026-08-03");
  assert.ok(md.includes(EMPTY_MARKER), "a quiet week must still carry the EMPTY marker");
  assert.strictEqual(EMPTY_MARKER, "> **Status:** EMPTY — no new items this week.");
});

test("formatKnowledgeBase omits the EMPTY marker when there are items", () => {
  const md = formatKnowledgeBase(
    [{ lab: "OpenAI", title: "T", url: "https://openai.com/news/t", date: "2026-08-01", summary: "" }],
    4,
    "2026-08-03"
  );
  assert.ok(!md.includes(EMPTY_MARKER));
});

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED, ${passed} passed.`);
} else {
  console.log(`\nAll ${passed} tests passed.`);
}

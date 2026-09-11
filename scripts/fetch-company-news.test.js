#!/usr/bin/env node

/**
 * Tests for the tracked-company news watcher.
 *
 * Run: node scripts/fetch-company-news.test.js
 * (Plain Node assertions — no test framework dependency.)
 *
 * Fixture strings, never live fetches: a test that hits the network tests the
 * network. The live feeds are exercised by `npm run companies -- --verify`,
 * which is the step that proves a URL, not this file.
 */

const assert = require("assert");
const { discoverFeeds, feedJobs, formatKnowledgeBase } = require("./fetch-company-news.js");
const { splitEntries, EMPTY_MARKER_RE } = require("./signal-digest.js");
const { EMPTY_MARKER } = require("./fetch-lab-news.js");

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

const COMPANIES = [
  { name: "Adobe", industry: "Creative software", site: "https://news.adobe.com/", feeds: [{ label: "Newsroom", url: "https://news.adobe.com/rss.xml" }] },
  { name: "Kroger", industry: "Grocery retail", feeds: [{ label: "IR", url: "https://ir.kroger.com/rss.xml", kind: "rss" }, { label: "Off", url: "https://x", enabled: false }] },
];

const ITEM = {
  company: "Adobe",
  industry: "Creative software",
  label: "Newsroom",
  title: "Adobe ships Firefly agents on Google Cloud",
  url: "https://news.adobe.com/news/firefly-agents",
  date: "2026-09-09",
  summary: "The company said the agents run on Vertex.",
};

// --- feedJobs -----------------------------------------------------------------

test("feedJobs flattens companies to feeds and carries the company through", () => {
  const jobs = feedJobs(COMPANIES);
  assert.strictEqual(jobs.length, 2, "the disabled feed must be dropped");
  assert.deepStrictEqual(jobs.map((j) => j.company), ["Adobe", "Kroger"]);
  assert.strictEqual(jobs[0].industry, "Creative software");
});

test("feedJobs defaults label and kind so a minimal config still runs", () => {
  const [job] = feedJobs([{ name: "X", feeds: [{ url: "https://x/rss" }] }]);
  assert.strictEqual(job.label, "Newsroom");
  assert.strictEqual(job.kind, "rss");
});

// --- the KB the digest has to read --------------------------------------------

test("knowledge-base headings are readable by signal-digest's splitEntries", () => {
  // The coupling that matters: the digest splits heading-shaped KBs on
  // `## ... (YYYY-MM-DD)`. Get this wrong and the file parses to zero entries
  // and reports as "0 entries, ungraded" — indistinguishable from a crash.
  const md = formatKnowledgeBase({
    items: [ITEM, { ...ITEM, company: "Kroger", title: "Kroger picks a cloud", url: "https://ir.kroger.com/a" }],
    feedsRead: 2,
    feedsTotal: 2,
    fetched: 9,
    today: "2026-09-11",
    companies: COMPANIES,
    questions: [],
  });
  const entries = splitEntries({ kind: "companynews", label: "Company news", content: md });
  assert.strictEqual(entries.length, 2, "both items must parse as entries");
  assert.ok(entries[0].header.startsWith("Adobe — Adobe ships Firefly"), entries[0].header);
  assert.strictEqual(entries[0].url, "https://news.adobe.com/news/firefly-agents");
});

test("a quiet week carries the shared EMPTY marker and the digest's own regex sees it", () => {
  const md = formatKnowledgeBase({
    items: [],
    feedsRead: 2,
    feedsTotal: 2,
    fetched: 0,
    today: "2026-09-11",
    companies: COMPANIES,
    questions: [],
  });
  assert.ok(md.includes(EMPTY_MARKER), "must reuse the pipeline-wide EMPTY marker verbatim");
  assert.ok(EMPTY_MARKER_RE.test(md), "generate-briefing and the digest must both recognise it");
});

test("the header names the companies that published nothing", () => {
  // The silence is the product. A section that only lists hits can never tell
  // you Kroger has been absent for a month.
  const md = formatKnowledgeBase({
    items: [ITEM],
    feedsRead: 2,
    feedsTotal: 2,
    fetched: 7,
    today: "2026-09-11",
    companies: COMPANIES,
    questions: ["How are leaders deciding?"],
  });
  assert.ok(/\*\*No news this week:\*\* Kroger/.test(md), md.slice(0, 400));
  assert.ok(!/No news this week:.*Adobe/.test(md), "a company WITH news must not be listed as quiet");
  assert.ok(md.includes("1 kept of 7 fetched"), "the filter's cost must be visible");
  assert.ok(md.includes("How are leaders deciding?"), "standing questions belong in the KB header");
});

// --- feed discovery (the --verify helper) --------------------------------------

test("discoverFeeds finds RSS and Atom alternates and resolves relative hrefs", () => {
  const html = `<head>
    <link rel="alternate" type="application/rss+xml" href="/news/feed.xml" title="News">
    <link rel='alternate' type='application/atom+xml' href='https://cdn.example.com/atom.xml'>
  </head>`;
  assert.deepStrictEqual(discoverFeeds(html, "https://news.example.com/newsroom"), [
    "https://news.example.com/news/feed.xml",
    "https://cdn.example.com/atom.xml",
  ]);
});

test("discoverFeeds ignores hreflang alternates", () => {
  // Every large corporate site ships a dozen `rel=alternate hreflang=` tags.
  // Reporting them as candidate feeds would make --verify useless noise.
  const html = `<link rel="alternate" hreflang="es" href="https://example.com/es/">`;
  assert.deepStrictEqual(discoverFeeds(html, "https://example.com/"), []);
});

test("discoverFeeds de-duplicates", () => {
  const html = `<link rel="alternate" type="application/rss+xml" href="/f.xml">
                <link rel="alternate" type="application/rss+xml" href="/f.xml">`;
  assert.strictEqual(discoverFeeds(html, "https://e.com/").length, 1);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED, ${passed} passed.`);
} else {
  console.log(`\nAll ${passed} tests passed.`);
}

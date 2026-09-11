#!/usr/bin/env node

/**
 * Tests for the tracked-company watchlist.
 *
 * Run: node scripts/watchlist.test.js
 * (Plain Node assertions — no test framework dependency.)
 *
 * Most of these pin FALSE POSITIVES, because that is the failure that kills the
 * feature: a watchlist section full of "Palo Alto" the city, or "a long
 * workday", is a section the reader learns to skip — and then the week Kroger
 * actually shows up, nobody reads it.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadWatchlist, matchCompanies, matchesTopic, compileMatcher } = require("./watchlist.js");

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

const { companies, topicFilter } = loadWatchlist();
const names = (text) => matchCompanies(text, companies).map((c) => c.name);

// --- the real config loads ---------------------------------------------------

test("config/tracked-companies.json loads and every company compiles", () => {
  assert.ok(companies.length >= 11, `expected the full watchlist, got ${companies.length}`);
  for (const c of companies) {
    assert.ok(c.matcher instanceof RegExp, `${c.name} has no compiled matcher`);
    assert.ok(c.aliases.length > 0, `${c.name} has no aliases`);
  }
});

test("every configured company matches its own name", () => {
  for (const c of companies) {
    assert.ok(names(`Something happened at ${c.name} today.`).includes(c.name), `${c.name} misses itself`);
  }
});

// --- false positives, one test per trap ---------------------------------------

test("bare 'Palo Alto' does not match Palo Alto Networks", () => {
  // The city is in startup coverage every single week. This is why the alias
  // list says "Palo Alto Networks" and never "Palo Alto".
  assert.deepStrictEqual(names("The round was led by a Palo Alto firm on Sand Hill Road."), []);
  assert.deepStrictEqual(names("Palo Alto Networks shipped an agentic SOC."), ["Palo Alto Networks"]);
});

test("lowercase 'workday' is not Workday", () => {
  assert.deepStrictEqual(names("It was a long workday for the on-call engineer."), []);
  assert.deepStrictEqual(names("Workday added agents to its HR suite."), ["Workday"]);
});

test("'Citi' does not fire inside longer words", () => {
  assert.deepStrictEqual(names("Solicitation of citizens in the city."), []);
  assert.deepStrictEqual(names("Citi is rebuilding its data stack."), ["Citi"]);
});

test("an alias ending in punctuation still matches", () => {
  // `\bDisney\+\b` can never match — the boundary after "+" wants a word
  // character and the text has a space. The matcher uses lookarounds instead.
  assert.ok(names("Disney+ added 4M subscribers.").includes("Walt Disney"));
});

test("possessives and sentence punctuation still match", () => {
  assert.ok(names("Netflix's encoding team.").includes("Netflix"));
  assert.ok(names("…and then, Kroger.").includes("Kroger"));
});

test("a company is reported once even when several aliases hit", () => {
  const hits = names("ExxonMobil (Exxon Mobil, XOM) said…");
  assert.deepStrictEqual(hits.filter((n) => n === "ExxonMobil").length, 1);
});

// --- loader behaviour ---------------------------------------------------------

test("a disabled company is dropped", () => {
  const file = path.join(os.tmpdir(), `wl-disabled-${process.pid}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ companies: [{ name: "Gone", aliases: ["Gone"], enabled: false }, { name: "Here", aliases: ["Here"] }] })
  );
  const wl = loadWatchlist(file);
  assert.deepStrictEqual(wl.companies.map((c) => c.name), ["Here"]);
  fs.unlinkSync(file);
});

test("a broken config degrades to an empty watchlist instead of throwing", () => {
  // signal-digest.js is required by generate-briefing.js. A throw here would
  // take down Sunday's briefing over a trailing comma in a config file.
  const file = path.join(os.tmpdir(), `wl-broken-${process.pid}.json`);
  fs.writeFileSync(file, "{ not json,");
  const wl = loadWatchlist(file);
  assert.deepStrictEqual(wl.companies, []);
  fs.unlinkSync(file);

  const missing = loadWatchlist(path.join(os.tmpdir(), "wl-does-not-exist.json"));
  assert.deepStrictEqual(missing.companies, []);
});

test("a company with no aliases is skipped, not crashed on", () => {
  const file = path.join(os.tmpdir(), `wl-noalias-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify({ companies: [{ name: "Empty", aliases: [] }, { name: "Ok", aliases: ["Ok"] }] }));
  assert.deepStrictEqual(loadWatchlist(file).companies.map((c) => c.name), ["Ok"]);
  fs.unlinkSync(file);
});

test("regex metacharacters in an alias are escaped, not executed", () => {
  const m = compileMatcher({ name: "T", aliases: ["C++ (the language)"] });
  assert.ok(m.test("we ship C++ (the language) here"));
  assert.ok(!m.test("we ship CCC here"));
});

// --- topic filter -------------------------------------------------------------

test("the topic filter matches whole words only", () => {
  // "AI" as a substring appears in said, chair, Ukraine, plain… A substring
  // search would keep every newsroom item ever published.
  assert.strictEqual(matchesTopic("Ukraine chair said plain", topicFilter), false);
  assert.strictEqual(matchesTopic("Kroger opens a store in Ohio", topicFilter), false);
  assert.strictEqual(matchesTopic("Kroger picks Google Cloud for AI forecasting", topicFilter), true);
});

test("the topic filter is case-insensitive and reads the summary too", () => {
  assert.strictEqual(matchesTopic("a new agentic workflow", topicFilter), true);
  assert.strictEqual(matchesTopic("Quarterly results  the CTO cited inference costs", topicFilter), true);
});

test("a disabled topic filter keeps everything", () => {
  assert.strictEqual(matchesTopic("anything at all", { enabled: false, keywords: ["AI"] }), true);
  assert.strictEqual(matchesTopic("anything at all", { enabled: true, keywords: [] }), true);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED, ${passed} passed.`);
} else {
  console.log(`\nAll ${passed} tests passed.`);
}

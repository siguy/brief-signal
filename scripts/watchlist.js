#!/usr/bin/env node

/**
 * Brief Signal — Watchlist (tracked companies)
 *
 * One loader and one matcher for `config/tracked-companies.json`, shared by
 * every consumer so a company is added in exactly one place:
 *
 *   scripts/fetch-company-news.js  reads each company's own newsroom feed
 *   scripts/signal-digest.js       sweeps every KB for mentions of them
 *
 * Why a module rather than a const in the digest: the list is Simon's to edit
 * (same contract as config/podcasts.json — add an entry, no code change), and
 * two scripts need it. A second copy of the alias list is a second copy that
 * drifts.
 *
 * DEGRADES, NEVER THROWS. signal-digest.js is required by generate-briefing.js,
 * so a malformed config here would otherwise take down Sunday's briefing over a
 * trailing comma. A broken or missing file yields an empty watchlist and a
 * warning on stderr: the digest then prints "no watchlist configured" and every
 * other tier still runs.
 */

const fs = require("fs");
const path = require("path");

// WATCHLIST_CONFIG points the whole pipeline at a different list — a fixture in
// a test, or a second team's watchlist for a one-off run — without editing the
// file the Sunday cron reads.
const CONFIG_PATH =
  process.env.WATCHLIST_CONFIG || path.join(__dirname, "..", "config", "tracked-companies.json");

function warn(msg) {
  console.warn(`[watchlist] WARN: ${msg}`);
}

// Whole-word matching WITHOUT \b, because \b is defined against word characters
// and several aliases end in one that isn't: `\bDisney\+\b` can never match,
// since the boundary after "+" requires a word character next and the text has
// a space. Lookarounds state the real rule — "not glued to a letter or digit" —
// and hold for every alias shape, so "Citi" never fires inside "Citibank" and
// "Disney+" matches in "Disney+ subscribers".
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileMatcher(company) {
  // Longest alias first: alternation is first-match-wins, so an unsorted list
  // would report "Exxon" for "ExxonMobil" and lose the distinction in logs.
  const alts = [...company.aliases]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join("|");
  return new RegExp(`(?<![A-Za-z0-9_])(?:${alts})(?![A-Za-z0-9_])`, company.caseSensitive ? "" : "i");
}

// Returns { companies, topicFilter, standingQuestions }. `companies` carries
// only enabled entries, each with a compiled `matcher`, so callers never repeat
// the enabled check and never compile a regex in a loop.
function loadWatchlist(configPath = CONFIG_PATH) {
  const empty = { companies: [], topicFilter: { enabled: false, keywords: [] }, standingQuestions: [] };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (e) {
    warn(`could not read ${path.basename(configPath)} (${e.message}) — watchlist disabled.`);
    return empty;
  }

  const list = Array.isArray(raw.companies) ? raw.companies : [];
  const companies = list
    .filter((c) => c.enabled !== false)
    .map((c) => {
      if (!c.name || !Array.isArray(c.aliases) || c.aliases.length === 0) {
        warn(`skipping a company with no name or no aliases (${JSON.stringify(c).slice(0, 60)}…).`);
        return null;
      }
      try {
        return { ...c, feeds: c.feeds || [], matcher: compileMatcher(c) };
      } catch (e) {
        warn(`skipping ${c.name}: alias list does not compile (${e.message}).`);
        return null;
      }
    })
    .filter(Boolean);

  return {
    companies,
    topicFilter: raw.topicFilter || empty.topicFilter,
    standingQuestions: raw.standingQuestions || [],
  };
}

// Every tracked company named anywhere in `text`, in config order. Config order
// is load-bearing for output stability: the digest prints companies in this
// sequence every week, so a diff between two digests reflects the news, not a
// reshuffle.
function matchCompanies(text, companies) {
  if (!text) return [];
  return companies.filter((c) => c.matcher.test(text));
}

// A newsroom is mostly store openings and film slates. Keep an item only if the
// text names something this briefing is actually about. Keywords are matched
// case-insensitively and whole-word — "AI" must not fire on "said", "chair" or
// "Ukraine", which a bare substring search does on every third headline.
function matchesTopic(text, topicFilter) {
  if (!topicFilter || topicFilter.enabled === false) return true;
  const keywords = topicFilter.keywords || [];
  if (keywords.length === 0) return true;
  if (!text) return false;

  // Brand names that merely CONTAIN a keyword are removed before matching, not
  // used to reject the item. Found on the first live run: "Adobe announces new
  // packaging for Creative Cloud in Brazil" is a pricing update, and it reached
  // the knowledge base because "Creative Cloud" contains "cloud". Stripping the
  // phrase (rather than excluding any item that mentions it) keeps the case that
  // matters — "Creative Cloud moves to Google Cloud" still matches on the
  // SECOND cloud, which is the one that is actually news.
  const stripped = (topicFilter.stripPhrases || []).reduce(
    (acc, phrase) => acc.replace(new RegExp(escapeRe(phrase), "gi"), " "),
    text
  );

  return keywords.some((k) =>
    new RegExp(`(?<![A-Za-z0-9_])${escapeRe(k)}(?![A-Za-z0-9_])`, "i").test(stripped)
  );
}

module.exports = { loadWatchlist, matchCompanies, matchesTopic, compileMatcher, escapeRe, CONFIG_PATH };

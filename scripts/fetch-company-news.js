#!/usr/bin/env node

/**
 * Brief Signal — Tracked-company news watcher
 *
 * Reads the newsrooms of the companies in config/tracked-companies.json and
 * writes ~/skills/company-news-knowledge-base-YYYY-MM-DD.md.
 *
 * Why it exists: the team follows a standing list of large enterprises
 * (Alexandra's list, 2026-09-11) and wants two things — what these companies do
 * in cloud, compute and AI, and how their leaders are deciding in this era.
 * Bookmarks, playlist and podcasts answer the SECOND question well: founders and
 * VCs talk about how big buyers behave all week. They answer the first one
 * badly, because none of them reads a newsroom — a Kroger or Exxon AI move only
 * reaches the pipeline if someone on X happens to post about it. This closes
 * that half, the same way fetch-lab-news.js closed it for the labs.
 *
 * Deliberately shares the PARSING with fetch-lab-news.js (parseFeed, clean,
 * isoDate, titleFromSlug) — that is the fiddly, twice-debugged part, and a
 * second copy would re-earn the same bugs — while keeping its own fetch loop so
 * its logs say what actually ran. Same fault tolerance: a dead feed warns and is
 * skipped, the file is always written, and only a total wipeout exits non-zero.
 *
 * Run: node scripts/fetch-company-news.js
 *      node scripts/fetch-company-news.js --verify   (probe every feed, write nothing)
 */

const fs = require("fs");
const path = require("path");
const { parseFeed, clean, isoDate, EMPTY_MARKER } = require("./fetch-lab-news.js");
const { loadWatchlist, matchesTopic } = require("./watchlist.js");

const SKILLS_DIR = path.join(process.env.HOME, "skills");
// Matches fetch-lab-news.js and the podcast extractors, so LOOKBACK_DAYS=21
// widens every source at once for a catch-up run.
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS) || 7;
const FETCH_TIMEOUT_MS = 20000;

function log(msg) {
  console.log(`[company-news] ${new Date().toISOString().slice(11, 19)}  ${msg}`);
}

function warn(msg) {
  console.warn(`[company-news] ${new Date().toISOString().slice(11, 19)}  WARN: ${msg}`);
}

// Local date, matching fetch-lab-news.js and extract-podcasts.js. All three must
// agree: a UTC/local split once produced two KB files for a single week.
function todayDate() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

async function get(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; brief-signal/1.0)" },
      redirect: "follow",
    });
    return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : "" };
  } catch (e) {
    return { ok: false, status: 0, body: "", error: e.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFeed(feed) {
  const res = await get(feed.url);
  if (!res.ok) {
    warn(`${feed.company} ${feed.label}: ${res.error || `HTTP ${res.status}`} — ${feed.url}`);
    return null;
  }
  return parseFeed(res.body, feed);
}

// Only used by --verify, and only for feeds that failed. A wrong URL is the
// expected failure here (these were written without the ability to fetch them),
// so the useful thing is not "it 404s" but "here is what the site says its feed
// is". Every newsroom that has a feed advertises it in <head>.
const ALT_LINK = /<link\b[^>]*rel=["']?alternate["']?[^>]*>/gi;

function discoverFeeds(html, baseUrl) {
  const found = [];
  for (const tag of html.match(ALT_LINK) || []) {
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i);
    if (!href) continue;
    try {
      found.push(new URL(href[1], baseUrl).href);
    } catch {
      /* a relative href we cannot resolve is not worth failing over */
    }
  }
  return [...new Set(found)];
}

// Flattens the watchlist into one work list, so the fetch loop never nests and
// every item knows which company it belongs to.
function feedJobs(companies) {
  return companies.flatMap((c) =>
    (c.feeds || [])
      .filter((f) => f.enabled !== false && f.url)
      .map((f) => ({
        ...f,
        label: f.label || "Newsroom",
        kind: f.kind || "rss",
        company: c.name,
        industry: c.industry || "",
        site: c.site || "",
      }))
  );
}

// `## Company — Title (YYYY-MM-DD)` is required, not cosmetic: signal-digest.js
// splits heading-shaped KBs on exactly that pattern. Bullets would parse to zero
// entries and read as a failed extraction.
// `reachable` maps company name -> did at least one of its feeds answer. Without
// it a company whose feed 404s reads as "published nothing this week", which is
// the same silent-failure-looks-like-a-quiet-week trap EMPTY_MARKER exists to
// close. Silence and breakage get separate lines.
function formatKnowledgeBase({ items, feedsRead, feedsTotal, fetched, today, companies, questions, reachable }) {
  const seen = new Set(items.map((i) => i.company));
  const reached = reachable || new Map();
  const silent = companies.map((c) => c.name).filter((n) => !seen.has(n));
  const unreachable = silent.filter((n) => reached.get(n) === false);
  const quiet = silent.filter((n) => !unreachable.includes(n));

  let md = `# Company News Knowledge Base

> **Extracted:** ${today}
> **Watchlist:** ${companies.length} tracked companies
> **Feeds read:** ${feedsRead} of ${feedsTotal}
> **Items (last ${LOOKBACK_DAYS} days):** ${items.length} kept of ${fetched} fetched — the rest did not mention AI, cloud or compute
> **No news this week:** ${quiet.length ? quiet.join(", ") : "none — every tracked company published something"}
${unreachable.length ? `> **Feeds unreachable (NOT silence — the fetch failed):** ${unreachable.join(", ")}\n` : ""}${items.length === 0 ? EMPTY_MARKER + "\n" : ""}
> Announcements from tracked companies' own newsrooms. First-party by
> construction: every item is the company speaking about itself, which makes it
> reliable about WHAT happened and worthless about whether it matters. Take the
> fact, drop the adjectives.
`;

  if (questions.length) {
    md += ">\n> **What we are watching for:**\n";
    for (const q of questions) md += `> - ${q}\n`;
  }

  md += "\n---\n\n";

  for (const item of items) {
    md += `## ${item.company} — ${item.title} (${item.date})\n`;
    md += `**Source:** [${item.company} · ${item.label}](${item.url})\n`;
    md += `**Watchlist:** ${item.company}${item.industry ? ` — ${item.industry}` : ""}\n`;
    if (item.summary) md += `\n${item.summary}\n`;
    md += "\n";
  }
  return md;
}

async function verify(jobs, companies) {
  console.log(`\nProbing ${jobs.length} feed(s) across ${companies.length} tracked companies.\n`);
  const rows = [];
  let failed = 0;

  for (const job of jobs) {
    const res = await get(job.url);
    const entries = res.ok ? parseFeed(res.body, job) : [];
    const newest = entries.map((e) => e.date).filter(Boolean).sort().pop() || "—";
    const status = res.ok ? (entries.length ? "OK" : "EMPTY (200, but nothing parsed)") : res.error || `HTTP ${res.status}`;
    if (!res.ok || entries.length === 0) failed += 1;
    rows.push({ job, status, items: entries.length, newest, needsDiscovery: !res.ok || entries.length === 0 });
    console.log(
      `${res.ok && entries.length ? "✓" : "✗"} ${job.company} · ${job.label}\n` +
        `    ${job.url}\n    ${status} · ${entries.length} items · newest ${newest}`
    );
  }

  const broken = rows.filter((r) => r.needsDiscovery && r.job.site);
  if (broken.length) {
    console.log(`\n--- Feed discovery for ${broken.length} failing feed(s) ---`);
    for (const row of broken) {
      const page = await get(row.job.site);
      const found = page.ok ? discoverFeeds(page.body, row.job.site) : [];
      console.log(
        `\n${row.job.company} — ${row.job.site}\n` +
          (found.length
            ? found.map((u) => `    advertises: ${u}`).join("\n")
            : page.ok
              ? "    no <link rel=alternate> feed advertised — check the newsroom by hand"
              : `    could not read the site (${page.error || `HTTP ${page.status}`})`)
      );
    }
  }

  console.log(
    `\n${rows.length - failed}/${rows.length} feeds usable. ` +
      (failed ? "Fix the URLs in config/tracked-companies.json, then re-run --verify.\n" : "Watchlist is ready.\n")
  );
  process.exitCode = failed ? 1 : 0;
}

async function main() {
  const verifyOnly = process.argv.includes("--verify");
  const { companies, topicFilter, standingQuestions } = loadWatchlist();

  if (companies.length === 0) {
    warn("No tracked companies configured — nothing to fetch.");
    process.exitCode = 1;
    return;
  }

  const jobs = feedJobs(companies);
  if (jobs.length === 0) {
    warn("Tracked companies are configured but none has an enabled feed.");
    process.exitCode = 1;
    return;
  }

  if (verifyOnly) return verify(jobs, companies);

  const today = todayDate();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const items = [];
  const reachable = new Map(companies.map((c) => [c.name, false]));
  let feedsRead = 0;
  let fetched = 0;

  for (const job of jobs) {
    const entries = await fetchFeed(job);
    if (entries === null) continue;
    feedsRead += 1;
    reachable.set(job.company, true);
    // An undated entry is kept rather than dropped, matching fetch-lab-news.js:
    // an announcement we cannot date is still worth a line.
    const recent = entries.filter((e) => !e.date || e.date >= cutoffDate);
    fetched += recent.length;
    const onTopic = recent.filter((e) => matchesTopic(`${e.title} ${e.summary}`, topicFilter));
    log(
      `${job.company} · ${job.label}: ${onTopic.length} on-topic of ${recent.length} within ${LOOKBACK_DAYS} days ` +
        `(${entries.length} in feed)`
    );
    items.push(
      ...onTopic.map((e) => ({
        ...e,
        title: clean(e.title, 200),
        company: job.company,
        industry: job.industry,
        label: job.label,
        date: e.date || today,
      }))
    );
  }

  // Config order first, newest first within a company: a reader scans for one
  // company, and the order is stable week to week so two digests diff cleanly.
  const rank = new Map(companies.map((c, i) => [c.name, i]));
  items.sort(
    (a, b) => rank.get(a.company) - rank.get(b.company) || (b.date || "").localeCompare(a.date || "")
  );

  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const outPath = path.join(SKILLS_DIR, `company-news-knowledge-base-${today}.md`);
  fs.writeFileSync(
    outPath,
    formatKnowledgeBase({
      items,
      feedsRead,
      feedsTotal: jobs.length,
      fetched,
      today,
      companies,
      questions: standingQuestions,
      reachable,
    }),
    "utf-8"
  );

  log(`Wrote ${outPath} (${items.length} items from ${feedsRead}/${jobs.length} feeds)`);

  // A quiet week is normal. Every feed failing is not — that is a network or a
  // URL problem, and the caller should see it.
  if (feedsRead === 0) {
    warn("No feed could be read. Wrote an EMPTY knowledge base. Run `npm run companies -- --verify`.");
    process.exitCode = 1;
  } else if (feedsRead < jobs.length) {
    warn(`${jobs.length - feedsRead} feed(s) failed — run \`npm run companies -- --verify\` to see which.`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    warn(`Fatal: ${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = { discoverFeeds, feedJobs, formatKnowledgeBase, LOOKBACK_DAYS };

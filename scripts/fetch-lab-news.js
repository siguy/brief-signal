#!/usr/bin/env node

/**
 * Brief Signal — Lab news watcher
 *
 * Reads the frontier labs' own newsrooms and writes
 * ~/skills/labnews-knowledge-base-YYYY-MM-DD.md.
 *
 * Why it exists: Edition #24 missed the Anthropic security story because it had
 * ZERO hits across all three knowledge bases. Bookmarks, playlist and podcasts
 * are all downstream of someone reacting to news; none of them read the labs
 * directly. This is the only source gap that was ever verified by a real miss,
 * which is why it is the only feed set being added.
 *
 * No config file and no dependencies — four URLs in a const array, parsed with
 * regex. Both RSS and sitemaps are <tag>value</tag>, so one reader covers both.
 * Deliberately NOT modelled on extract-rss-podcasts.py: that file is ~700 lines
 * because it downloads audio and runs whisper, and shares nothing with an RSS
 * reader but the word "RSS".
 *
 * No summarisation. Headline, date, link and the feed's own description are the
 * whole value; anything more would be a hallucination surface for a story we
 * have not read.
 *
 * Run: node scripts/fetch-lab-news.js
 */

const fs = require("fs");
const path = require("path");

const SKILLS_DIR = path.join(process.env.HOME, "skills");
// Matches the podcast extractors so a catch-up run widens every source at once.
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS) || 7;
const FETCH_TIMEOUT_MS = 20000;

// Byte-identical to EMPTY_MARKER in scripts/extract-podcasts.js and
// EMPTY_MARKER_RE in generate-briefing.js / signal-digest.js. A source that ran
// and found nothing must be distinguishable from one that crashed.
const EMPTY_MARKER = "> **Status:** EMPTY — no new items this week.";

// Anthropic publishes no RSS feed — anthropic.com/rss.xml 404s (verified
// 2026-08-03), and /news is a 411KB Next.js page whose entries live in streamed
// flight payloads with no dates. Its sitemap carries every /news/ URL with a
// <lastmod>, in the same tag shape as RSS, so it reads through the same parser
// and does not break when their front end redeploys.
//
// Caveat worth knowing: <lastmod> is a MODIFICATION date. It is always >= the
// publication date, so a post published this week always falls inside the
// window (no false negatives); an old post that gets edited may reappear (a
// cheap false positive — one line with a link).
const FEEDS = [
  { name: "OpenAI", url: "https://openai.com/news/rss.xml", kind: "rss" },
  { name: "Google DeepMind", url: "https://blog.google/technology/google-deepmind/rss/", kind: "rss" },
  { name: "Google Cloud", url: "https://cloudblog.withgoogle.com/rss/", kind: "rss" },
  { name: "Anthropic", url: "https://www.anthropic.com/sitemap.xml", kind: "sitemap", pathFilter: "/news/" },
];

function log(msg) {
  console.log(`[lab-news] ${new Date().toISOString().slice(11, 19)}  ${msg}`);
}

function warn(msg) {
  console.warn(`[lab-news] ${new Date().toISOString().slice(11, 19)}  WARN: ${msg}`);
}

// Local date, matching extract-podcasts.js's getTodayDate(). Both must agree:
// a UTC/local split is what silently produced two KB files for one week once
// before (see feedback_podcast_kb_date_divergence).
function todayDate() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : null;
}

// Feeds mix CDATA, escaped entities and stray markup in titles and summaries.
//
// Order matters and is the reason this is a named function rather than a chain:
// Google Cloud's descriptions arrive as ENTITY-ESCAPED html inside CDATA, so
// stripping tags before decoding leaves `<div class="...">` sitting in the text
// as literal prose. Decode first, then strip, then strip once more to catch the
// double-encoding some feeds emit.
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function clean(raw, maxLen = 400) {
  if (!raw) return "";
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = decodeEntities(s);
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s).replace(/<[^>]+>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.length > maxLen ? `${s.slice(0, maxLen - 1).trimEnd()}…` : s;
}

function isoDate(raw) {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Sitemaps carry no titles, so derive a readable one from the slug. The link is
// right there in the entry, so this only has to be recognisable, not perfect.
function titleFromSlug(url) {
  const slug = url.replace(/\/+$/, "").split("/").pop() || url;
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function parseFeed(xml, feed) {
  const blocks =
    feed.kind === "sitemap"
      ? xml.match(/<url>[\s\S]*?<\/url>/gi) || []
      : xml.match(/<item>[\s\S]*?<\/item>/gi) || xml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];

  return blocks
    .map((block) => {
      if (feed.kind === "sitemap") {
        const url = clean(tag(block, "loc"));
        if (!url || (feed.pathFilter && !url.includes(feed.pathFilter))) return null;
        return { title: titleFromSlug(url), url, date: isoDate(tag(block, "lastmod")), summary: "" };
      }
      const url = clean(tag(block, "link")) || clean(tag(block, "guid"));
      const title = clean(tag(block, "title"), 200);
      if (!url || !title) return null;
      return {
        title,
        url,
        date: isoDate(tag(block, "pubDate") || tag(block, "published") || tag(block, "updated")),
        summary: clean(tag(block, "description") || tag(block, "summary")),
      };
    })
    .filter(Boolean);
}

async function fetchFeed(feed) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; brief-signal/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) {
      warn(`${feed.name}: HTTP ${res.status}`);
      return null;
    }
    return parseFeed(await res.text(), feed);
  } catch (e) {
    warn(`${feed.name}: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// `## Title (YYYY-MM-DD)` is required, not cosmetic: signal-digest.js's
// splitEntries falls through to a heading branch matching exactly this shape.
// Bulleted output would parse to zero entries and print as "0 entries,
// ungraded" — indistinguishable from a failed extraction, which is the very
// ambiguity EMPTY_MARKER exists to remove.
function formatKnowledgeBase(items, feedsRead, today) {
  let md = `# Lab News Knowledge Base

> **Extracted:** ${today}
> **Feeds read:** ${feedsRead} of ${FEEDS.length}
> **Items (last ${LOOKBACK_DAYS} days):** ${items.length}
${items.length === 0 ? EMPTY_MARKER + "\n" : ""}
> Announcements from the labs' own newsrooms. First-party by construction —
> every item here is the company speaking for itself, not coverage of it.

---

`;

  for (const item of items) {
    md += `## ${item.lab} — ${item.title} (${item.date})\n`;
    md += `**Source:** [${item.lab}](${item.url})\n`;
    if (item.summary) md += `\n${item.summary}\n`;
    md += "\n";
  }
  return md;
}

async function main() {
  const today = todayDate();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const items = [];
  let feedsRead = 0;

  for (const feed of FEEDS) {
    const entries = await fetchFeed(feed);
    if (entries === null) continue;
    feedsRead += 1;
    // An undated entry is kept rather than dropped: a lab announcement we
    // cannot date is still worth a line, and dropping it silently is the
    // failure mode this whole script exists to prevent.
    const recent = entries.filter((e) => !e.date || e.date >= cutoffDate);
    log(`${feed.name}: ${recent.length} of ${entries.length} entries within ${LOOKBACK_DAYS} days`);
    items.push(...recent.map((e) => ({ ...e, lab: feed.name })));
  }

  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const outPath = path.join(SKILLS_DIR, `labnews-knowledge-base-${today}.md`);
  fs.writeFileSync(outPath, formatKnowledgeBase(items, feedsRead, today), "utf-8");

  log(`Wrote ${outPath} (${items.length} items from ${feedsRead}/${FEEDS.length} feeds)`);

  // A quiet week is normal and must not fail. Every feed failing is not: that
  // is a network or parser problem, and the caller should see a non-zero exit.
  if (feedsRead === 0) {
    warn("No feed could be read. Wrote an EMPTY knowledge base.");
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((e) => {
    warn(`Fatal: ${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseFeed, clean, isoDate, titleFromSlug, formatKnowledgeBase, FEEDS, EMPTY_MARKER };

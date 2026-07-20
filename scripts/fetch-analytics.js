#!/usr/bin/env node
/*
 * fetch-analytics.js — Pull GoatCounter read-signal into the production process.
 *
 * What it does:
 *   Reads GoatCounter (pageviews + scroll-depth + audio-play events), aggregates
 *   per edition, and writes a plain-language "signal" the briefing generation can
 *   use: which editions get read, how far people scroll, and whether anyone plays
 *   the audio.
 *
 * Why total reads (not a first-week window): Simon's observation is that nobody
 *   revisits old editions — reads arrive in the first week and then stop. So an
 *   edition's total reads ≈ its first-week reads, and we skip fragile daily-window
 *   math. The newest edition (< 7 days old) is flagged as "still accumulating".
 *
 * This is READ-ONLY and advisory. It never modifies briefings and never blocks the
 * pipeline. It does NOT auto-inject into generate-briefing.js — it writes a signal
 * file for a human (or a future, deliberately-wired step) to act on.
 *
 * Usage:  node scripts/fetch-analytics.js        (or:  npm run analytics)
 * Env:    GOATCOUNTER_API_TOKEN, GOATCOUNTER_SITE  (from .env)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SITE = process.env.GOATCOUNTER_SITE || 'briefsignal';
const TOKEN = process.env.GOATCOUNTER_API_TOKEN;
const API = `https://${SITE}.goatcounter.com/api/v0`;

const BRIEFINGS_DIR = path.join(__dirname, '..', 'content', 'briefings');
const THEMES_FILE = path.join(__dirname, '..', 'content', 'themes.md');
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const SIGNAL_FILE = path.join(LOGS_DIR, 'analytics-signal.md');
const LOG_FILE = path.join(__dirname, '..', 'project.log');

const WINDOW_DAYS = 120; // ~17 weekly editions of history
const RECENT_EDITIONS = 8; // how many editions to report on
const MILESTONES = [25, 50, 75, 100];

function log(msg) {
  const line = `[${new Date().toISOString()}] [fetch-analytics] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {
    /* logging must never crash the script */
  }
}

async function api(endpoint) {
  const res = await fetch(`${API}${endpoint}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GoatCounter API ${endpoint} → HTTP ${res.status}`);
  return res.json();
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

// slug -> { edition, title, date } from briefing frontmatter
function loadEditions() {
  const editions = {};
  if (!fs.existsSync(BRIEFINGS_DIR)) return editions;
  for (const f of fs.readdirSync(BRIEFINGS_DIR)) {
    if (!f.endsWith('.md')) continue;
    const slug = f.replace(/\.md$/, '');
    const raw = fs.readFileSync(path.join(BRIEFINGS_DIR, f), 'utf-8');
    const fm = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const meta = {};
    for (const line of fm[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      meta[key] = val;
    }
    editions[slug] = {
      edition: meta.edition ? Number(meta.edition) : null,
      title: meta.title || slug,
      date: meta.date || slug,
    };
  }
  return editions;
}

// edition number -> [theme titles that led that edition], parsed from themes.md
function loadThemeLeads() {
  const map = {};
  if (!fs.existsSync(THEMES_FILE)) return map;
  let currentTheme = null;
  for (const line of fs.readFileSync(THEMES_FILE, 'utf-8').split('\n')) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      currentTheme = heading[1].trim();
      continue;
    }
    if (currentTheme && /led editions/i.test(line)) {
      for (const num of line.match(/#(\d+)/g) || []) {
        const n = Number(num.slice(1));
        (map[n] = map[n] || []).push(currentTheme);
      }
    }
  }
  return map;
}

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

(async () => {
  if (!TOKEN) {
    log('ERROR: GOATCOUNTER_API_TOKEN missing from .env — aborting.');
    process.exit(1);
  }

  const start = daysAgo(WINDOW_DAYS);
  const end = daysAgo(-1); // tomorrow — GoatCounter's end bound excludes the in-progress current day
  log(`Fetching GoatCounter stats for ${SITE} (${start} → ${end})`);

  let hits;
  try {
    const data = await api(`/stats/hits?start=${start}&end=${end}&limit=200`);
    hits = data.hits || [];
  } catch (err) {
    // Warn and exit non-fatally — a source failure must never break the pipeline.
    log(`WARNING: could not fetch GoatCounter stats (${err.message}). No signal written.`);
    process.exit(0);
  }
  log(`GoatCounter returned ${hits.length} paths`);

  const editions = loadEditions();
  const themeLeads = loadThemeLeads();

  // Aggregate per edition slug.
  const perEd = {};
  const ensure = (slug) =>
    (perEd[slug] = perEd[slug] || { reads: 0, scroll: { 25: 0, 50: 0, 75: 0, 100: 0 }, audio: 0 });

  for (const h of hits) {
    const p = h.path;
    if (h.event) {
      let m;
      if ((m = p.match(/^scroll-(\d+)-(\d{4}-\d{2}-\d{2})$/))) {
        const ed = ensure(m[2]);
        if (ed.scroll[+m[1]] !== undefined) ed.scroll[+m[1]] += h.count;
      } else if ((m = p.match(/^audio-play-(\d{4}-\d{2}-\d{2})$/))) {
        ensure(m[1]).audio += h.count;
      }
    } else {
      // Strip query strings (e.g. cache-busters) before matching the edition slug.
      const m = p.replace(/\?.*$/, '').match(/\/briefings\/(\d{4}-\d{2}-\d{2})\/?$/);
      if (m) ensure(m[1]).reads += h.count;
    }
  }

  // Build report rows for the most recent editions.
  const recentSlugs = Object.keys(editions).sort().reverse().slice(0, RECENT_EDITIONS);
  const today = ymd(new Date());
  const rows = recentSlugs.map((slug) => {
    const meta = editions[slug];
    const d = perEd[slug] || { reads: 0, scroll: { 25: 0, 50: 0, 75: 0, 100: 0 }, audio: 0 };
    const daysOld = Math.round((new Date(today) - new Date(slug)) / 86400000);
    return {
      slug,
      edition: meta.edition,
      title: meta.title,
      themes: themeLeads[meta.edition] || [],
      reads: d.reads,
      scroll: d.scroll,
      audio: d.audio,
      fresh: daysOld < 7,
    };
  });

  const totalReads = rows.reduce((s, r) => s + r.reads, 0);

  // ---- Build the signal ----
  const lines = [];
  lines.push(`# Brief Signal — analytics signal`);
  lines.push(`_Generated ${new Date().toISOString()} · window ${start} → ${end} · source: GoatCounter_`);
  lines.push('');

  if (totalReads === 0) {
    lines.push(
      `**Not enough data yet.** No reads recorded in the window. The site was just ` +
        `instrumented — check back after an edition has circulated for a few days.`
    );
  } else {
    // Reads ranking.
    const ranked = [...rows].filter((r) => r.reads > 0).sort((a, b) => b.reads - a.reads);
    const top = ranked
      .slice(0, 3)
      .map((r) => `#${r.edition} (${r.reads}${r.fresh ? ', still accumulating' : ''})`)
      .join(', ');
    lines.push(`**Most-read recent editions:** ${top || '—'}.`);

    const topThemes = ranked.slice(0, 3).flatMap((r) => r.themes);
    if (topThemes.length) {
      lines.push(`- Top reads led with these arcs: ${[...new Set(topThemes)].join('; ')}.`);
    }

    // Scroll funnel across recent editions (relative to the 25% baseline = "started reading").
    const s = MILESTONES.reduce((acc, mk) => ((acc[mk] = rows.reduce((x, r) => x + r.scroll[mk], 0)), acc), {});
    if (s[25] > 0) {
      lines.push(
        `- **Scroll depth:** of readers who start (25%), ${pct(s[50], s[25])}% reach halfway and ` +
          `${pct(s[100], s[25])}% reach the end.` +
          (pct(s[100], s[25]) < 50 ? ' Most bail before the finish → consider tightening the back half.' : '')
      );
    }

    // Audio.
    const totalAudio = rows.reduce((x, r) => x + r.audio, 0);
    lines.push(`- **Audio:** ${totalAudio} plays across recent editions (~${pct(totalAudio, totalReads)}% of reads).`);
  }

  lines.push('');
  lines.push(`## Per-edition detail`);
  lines.push('');
  lines.push(`| Edition | Reads | 25% | 50% | 75% | 100% | Audio |`);
  lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const r of rows) {
    lines.push(
      `| #${r.edition} ${r.slug}${r.fresh ? ' 🆕' : ''} | ${r.reads} | ${r.scroll[25]} | ` +
        `${r.scroll[50]} | ${r.scroll[75]} | ${r.scroll[100]} | ${r.audio} |`
    );
  }
  lines.push('');

  const out = lines.join('\n');
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(SIGNAL_FILE, out);
  log(`Wrote signal (${rows.length} editions, ${totalReads} total reads) → ${path.relative(process.cwd(), SIGNAL_FILE)}`);
  console.log('\n' + out);
})();

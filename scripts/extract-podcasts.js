#!/usr/bin/env node

/**
 * Brief Signal — Podcast Intelligence Extractor
 *
 * Reads config/podcasts.json, downloads recent episode subtitles from YouTube,
 * sends transcripts to Gemini for structured intelligence extraction, and
 * writes podcast knowledge base files.
 *
 * Requires: GOOGLE_API_KEY environment variable, yt-dlp installed, and python3 with
 * mlx_whisper for the caption fallback (scripts/transcribe-youtube-audio.py)
 */

const { GoogleGenAI } = require("@google/genai");
const { execSync, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config", "podcasts.json");
const SKILLS_DIR = path.join(process.env.HOME, "skills");
const RAW_DIR = path.join(process.env.HOME, "info-agg", "prompts");
const EXTRACTIONS_DIR = path.join(process.env.HOME, "info-agg", "extractions");
const L1_PROMPT_PATH = path.join(__dirname, "podcast-extraction-prompt.md");
const L2_PROMPT_PATH = path.join(__dirname, "podcast-deep-dive-prompt.md");
const MAX_DEEP_DIVES = 3;
// How many days back to scan for episodes. Default 7 (weekly run). Override with
// the LOOKBACK_DAYS env var for a multi-week catch-up (e.g. LOOKBACK_DAYS=21 after
// being away 3 weeks). generate-weekly.sh exports it so one setting covers the run.
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS) || 7;
const MIN_DURATION_SEC = 1200; // 20 minutes — filters out clips, shorts, promos, demos

// Input validation — prevent command injection via config or yt-dlp output
function validateHandle(handle) {
  if (!/^@[\w.-]+$/.test(handle)) {
    throw new Error(`Invalid channel handle: ${handle}`);
  }
  return handle;
}

function validateVideoId(id) {
  if (!/^[\w-]{11}$/.test(id)) {
    throw new Error(`Invalid video ID: ${id}`);
  }
  return id;
}

function stripCodeFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
}

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function warn(msg) {
  console.warn(`[${new Date().toISOString().slice(11, 19)}] WARN: ${msg}`);
}

function getDateAfter() {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS);
  return d.toISOString().split("T")[0].replace(/-/g, "");
}

function getTodayDate() {
  // Use the LOCAL date (not UTC) so this matches extract-rss-podcasts.py's
  // `datetime.now()` date. Both podcast stages must name their KB with the same
  // date — the RSS stage appends to the file this stage creates. If they diverge
  // (e.g. an after-5pm-PDT run where UTC has already crossed midnight), two
  // separate KB files are written and generate-briefing.js reads only the newest,
  // silently dropping one podcast source. See feedback_podcast_kb_date_divergence.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found: ${CONFIG_PATH}`);
  }
  const all = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  const enabled = all.filter((p) => p.enabled && p.source === "youtube");
  const skipped = all.filter((p) => !p.enabled || p.source !== "youtube");
  return { enabled, skipped };
}

function loadPreviousIds() {
  if (!fs.existsSync(RAW_DIR)) return new Set();
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.startsWith("podcasts-raw-") && f.endsWith(".json"))
    .sort()
    .reverse();
  const ids = new Set();
  // Check last 4 weeks of raw files
  for (const f of files.slice(0, 4)) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf-8"));
      for (const entry of data) {
        if (entry.video_id) ids.add(entry.video_id);
      }
    } catch {
      // Skip corrupt files
    }
  }
  return ids;
}

function getRecentUploads(channelHandle, dateAfter) {
  // YouTube auto-creates an uploads playlist. Channel handle -> uploads playlist.
  // Note: --dateafter doesn't work with --flat-playlist (upload_date is NA in flat mode).
  // Use --playlist-end 5 to cap results — enough to get 2-3 full episodes after duration filter.
  // Deduplication against previous runs handles the rest.
  const safeHandle = validateHandle(channelHandle);
  const url = `https://www.youtube.com/${safeHandle}/videos`;
  try {
    const output = execSync(
      `yt-dlp --flat-playlist --playlist-end 5 --print "%(id)s|||%(title)s|||%(channel)s|||%(duration)s|||%(upload_date)s|||%(url)s" "${url}"`,
      { encoding: "utf-8", timeout: 60000 }
    ).trim();
    if (!output) return [];
    return output.split("\n").map((line) => {
      const [id, title, channel, duration, uploadDate, videoUrl] =
        line.split("|||");
      return {
        video_id: id,
        title,
        channel,
        duration_sec: duration === "NA" ? null : parseFloat(duration),
        duration_min:
          duration === "NA" ? null : Math.ceil(parseFloat(duration) / 60),
        upload_date: uploadDate,
        url: videoUrl || `https://www.youtube.com/watch?v=${id}`,
      };
    }).filter((ep) => {
      // Skip clips, shorts, promos — only process full episodes (20+ min)
      if (ep.duration_sec !== null && ep.duration_sec < MIN_DURATION_SEC) {
        return false;
      }
      return true;
    });
  } catch (err) {
    warn(`Failed to get uploads for ${channelHandle}: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------
//
// Why "en-orig" and not "en": many podcast channels now have YouTube's
// auto-dubbed audio tracks (Ukrainian, Hindi, Spanish...). Each dub gets its own
// speech-recognition track, and yt-dlp lumps every "translate this into English"
// variant under the single key "en". Asking for "en" can hand us a
// machine-TRANSLATED track (URL has &tlang=en, e.g. Ukrainian dub -> English),
// and YouTube rate-limits translated captions hard (HTTP 429). "en-orig" is the
// original English speech-recognition track: one request, no translation, and
// it downloaded fine for the exact videos that 429'd on "en" (2026-10-19).
// We never fall back to plain auto "en" — a translated track is both throttled
// and a worse transcript (English audio -> dub -> back to English).
function captionAttempts(outPath) {
  return [
    { label: "auto en-orig", args: ["--write-auto-subs", "--sub-langs", "en-orig"], file: `${outPath}.en-orig.vtt` },
    { label: "manual en", args: ["--write-subs", "--sub-langs", "en"], file: `${outPath}.en.vtt` },
  ];
}

// yt-dlp prints a full traceback on failure; the useful part is the last ERROR line.
function lastYtDlpError(stderr) {
  const lines = (stderr || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const errors = lines.filter((l) => l.startsWith("ERROR"));
  if (errors.length) return errors[errors.length - 1];
  return lines.length ? lines[lines.length - 1] : "no error output";
}

// Runs yt-dlp without a shell (args array), and keeps stderr instead of throwing it away.
function runYtDlp(args, timeout) {
  return new Promise((resolve) => {
    execFile("yt-dlp", args, { encoding: "utf-8", timeout, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || "", stderr: stderr || (err ? err.message : "") });
    });
  });
}

// Try each caption track in order. Whatever we get is saved as <id>.en.vtt, the
// one name the rest of the pipeline (and the whisper fallback) reads and writes.
async function downloadCaptions(videoId, { dir = EXTRACTIONS_DIR, run = runYtDlp } = {}) {
  const safeId = validateVideoId(videoId);
  const outPath = path.join(dir, safeId);
  const vttFile = `${outPath}.en.vtt`;
  if (fs.existsSync(vttFile)) return { vttPath: vttFile, source: "cache", errors: [] };
  const url = `https://www.youtube.com/watch?v=${safeId}`;
  const errors = [];
  for (const attempt of captionAttempts(outPath)) {
    // Must NOT use --print here: it disables file writes in yt-dlp
    const { ok, stderr } = await run(
      ["--skip-download", ...attempt.args, "--sub-format", "vtt", "-o", outPath, url],
      60000
    );
    if (fs.existsSync(attempt.file)) {
      if (attempt.file !== vttFile) fs.renameSync(attempt.file, vttFile);
      return { vttPath: vttFile, source: attempt.label, errors };
    }
    errors.push(`${attempt.label}: ${ok ? "no such track" : lastYtDlpError(stderr)}`);
  }
  return { vttPath: null, source: null, errors };
}

async function fetchUploadDate(videoId, { dir = EXTRACTIONS_DIR, run = runYtDlp } = {}) {
  const safeId = validateVideoId(videoId);
  const dateFile = path.join(dir, `${safeId}.date`);
  if (fs.existsSync(dateFile)) return fs.readFileSync(dateFile, "utf-8").trim() || null;
  // --print is safe here because this call writes no files
  const { ok, stdout, stderr } = await run(
    ["--skip-download", "--print", "%(upload_date)s", `https://www.youtube.com/watch?v=${safeId}`],
    30000
  );
  const date = (stdout || "").trim().split("\n")[0];
  if (!date || date === "NA") {
    if (!ok) warn(`Upload date lookup failed for ${safeId}: ${lastYtDlpError(stderr)}`);
    return null;
  }
  try { fs.writeFileSync(dateFile, date, "utf-8"); } catch {}
  return date;
}

// Date first, then captions — and only for episodes inside the lookback window
// (dateAfter, YYYYMMDD). Every caption request we skip is one fewer chance to
// get rate-limited. An unknown date still gets captions (main() keeps it, warned).
async function downloadAllSubtitles(episodes, concurrency = 4, { dateAfter = null, ...opts } = {}) {
  const subtitles = new Map(); // video_id -> vttPath
  const dates = new Map();     // video_id -> YYYYMMDD
  for (let i = 0; i < episodes.length; i += concurrency) {
    const batch = episodes.slice(i, i + concurrency);
    await Promise.all(batch.map(async ({ podcast, episode }) => {
      const uploadDate = await fetchUploadDate(episode.video_id, opts);
      if (uploadDate) dates.set(episode.video_id, uploadDate);
      if (dateAfter && uploadDate && uploadDate < dateAfter) {
        subtitles.set(episode.video_id, null); // too old — main() skips it anyway
        return;
      }
      const { vttPath, errors } = await downloadCaptions(episode.video_id, opts);
      subtitles.set(episode.video_id, vttPath);
      if (!vttPath) {
        // Loud: say exactly what yt-dlp said, not just "no subtitles"
        warn(`Caption download failed for ${podcast.name} — "${episode.title}" (${episode.video_id}): ${errors.join(" | ")}`);
      }
    }));
  }
  return { subtitles, dates };
}

// ---------------------------------------------------------------------------
// Whisper fallback: when captions fail, transcribe the audio locally
// ---------------------------------------------------------------------------

const WHISPER_HELPER = path.join(__dirname, "transcribe-youtube-audio.py");
const WHISPER_TIMEOUT_MS = 40 * 60 * 1000; // one long episode, download + transcribe
// Max episodes to whisper per run (~3-4 min each). 0 turns the fallback off.
const WHISPER_FALLBACK_MAX = process.env.WHISPER_FALLBACK_MAX !== undefined
  ? Number(process.env.WHISPER_FALLBACK_MAX)
  : 25;

function runWhisperHelper(videoId, vttFile) {
  return new Promise((resolve) => {
    execFile("python3", [WHISPER_HELPER, videoId, vttFile],
      { encoding: "utf-8", timeout: WHISPER_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: stdout || "", stderr: stderr || (err ? err.message : "") }));
  });
}

async function transcribeWithWhisper(videoId, { dir = EXTRACTIONS_DIR, run = runWhisperHelper } = {}) {
  const safeId = validateVideoId(videoId);
  const vttFile = path.join(dir, `${safeId}.en.vtt`);
  const { ok, stdout, stderr } = await run(safeId, vttFile);
  for (const line of stdout.split("\n").filter(Boolean)) log(line.replace(/^\[[\d:]+\] /, ""));
  if (ok && fs.existsSync(vttFile)) return vttFile;
  warn(`Whisper fallback failed for ${safeId}: ${lastYtDlpError(stderr)}`);
  return null;
}

// How much of this week's in-window YouTube podcast audio we actually got text for.
// Below 80% from captions, something upstream is broken and should be looked at.
const COVERAGE_WARN_THRESHOLD = 0.8;

function coverageReport({ inWindow, captions, whisper }) {
  const lines = [];
  if (inWindow === 0) return { lines: ["Transcript coverage: no in-window episodes"], warn: false };
  const pct = (n) => `${Math.round((n / inWindow) * 100)}%`;
  const missing = inWindow - captions - whisper;
  lines.push(`Transcript coverage: ${captions + whisper}/${inWindow} in-window episodes (${pct(captions + whisper)}) — captions ${captions}, whisper fallback ${whisper}, missing ${missing}`);
  const captionRate = captions / inWindow;
  const totalRate = (captions + whisper) / inWindow;
  const warnNeeded = captionRate < COVERAGE_WARN_THRESHOLD || totalRate < COVERAGE_WARN_THRESHOLD;
  if (captionRate < COVERAGE_WARN_THRESHOLD) {
    lines.push(`CAPTION SUCCESS RATE LOW: ${captions}/${inWindow} (${pct(captions)}), below ${COVERAGE_WARN_THRESHOLD * 100}%. Check the "Caption download failed" lines above for yt-dlp's actual error.`);
  }
  if (totalRate < COVERAGE_WARN_THRESHOLD) {
    lines.push(`${missing} in-window episode(s) have NO transcript and will be missing from this week's briefing.`);
  }
  return { lines, warn: warnNeeded };
}

function parseVtt(vttPath) {
  try {
    const content = fs.readFileSync(vttPath, "utf-8");
    const seen = new Set();
    const lines = [];
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || line === "WEBVTT" || line.startsWith("Kind:") || line.startsWith("Language:")) continue;
      if (/^\d{2}:\d{2}/.test(line) || /^\d+$/.test(line)) continue;
      const clean = line.replace(/<[^>]+>/g, "");
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        lines.push(clean);
      }
    }
    return lines.join(" ");
  } catch {
    return null;
  }
}

async function extractIntelligence(ai, systemPrompt, podcast, episode, transcript) {
  const userMessage = `Podcast: ${podcast.name}
Episode: ${episode.title}
URL: ${episode.url}
Duration: ${episode.duration_min || "unknown"} minutes
Date: ${episode.upload_date || "unknown"}

## Full Transcript

${transcript}`;

  const response = await ai.models.generateContent({
    model: "gemini-3.7-flash",
    contents: userMessage,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "HIGH" },
    },
  });

  try {
    return JSON.parse(stripCodeFences(response.text));
  } catch {
    warn(`Failed to parse Gemini response as JSON for ${episode.title}`);
    warn(`Response preview: ${(response.text || "").slice(0, 200)}`);
    return null;
  }
}

async function deepDive(ai, deepDivePrompt, level1Data, transcript) {
  const userMessage = `## Level 1 Extraction (already completed)

${JSON.stringify(level1Data, null, 2)}

## Full Transcript

${transcript}`;

  const response = await ai.models.generateContent({
    model: "gemini-3.7-flash",
    contents: userMessage,
    config: {
      systemInstruction: deepDivePrompt,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "HIGH" },
    },
  });

  try {
    return JSON.parse(stripCodeFences(response.text));
  } catch {
    warn(`Failed to parse deep dive JSON for ${level1Data.episode_title}`);
    warn(`Response preview: ${(response.text || "").slice(0, 200)}`);
    return null;
  }
}

// A source with legitimately nothing new is NOT a failed source. The weekly
// freshness guard (check_kb_fresh in generate-weekly.sh) proves an extractor
// ran by checking the KB file's mtime — so an extractor that exits early
// without writing is indistinguishable from one that crashed, and blocks the
// whole run. See EMPTY_MARKER's use: we always write the file, and say so.
const EMPTY_MARKER = "> **Status:** EMPTY — no new items this week.";

// TWO GRADES, DELIBERATELY. They answer different questions and disagree on
// roughly a third of episodes (2026-08-02 KB: 20/18/6 vs 19/5/20):
//
//   **Editorial Signal:**  does this episode matter as news? Drives the KB sort
//                          order, the summary tables, and which episodes earn a
//                          Level-2 deep dive. This is the one Stage 4a's lineup
//                          disposition audits — "every HIGH episode accounted
//                          for" means HIGH here.
//   **GCP Relevance:**     can a Google Cloud seller act on it? Read by
//                          signal-digest.js for its Tier 0 coverage sweep.
//
// It used to be called "Signal Rating", which collided with the prompt's
// "HIGH-signal disposition" instruction: an auditor read GCP Relevance, the
// model read Signal Rating, and five episodes looked fabricated when both were
// in fact reporting truthfully from different columns. Never name either of
// these just "signal" or just "rating" again — the ambiguity is the bug.
function formatKnowledgeBase(extractions, deepDives, today) {
  let md = `# Podcast Intelligence Knowledge Base

> **Extracted:** ${today}
> **Episodes processed:** ${extractions.length}
> **HIGH editorial-signal episodes:** ${extractions.filter((e) => e.signal_rating === "HIGH").length}
> **Deep dives:** ${Object.keys(deepDives).length}
${extractions.length === 0 ? EMPTY_MARKER + "\n" : ""}
---

`;
  return md + formatKbEntries(extractions, deepDives);
}

function formatKbEntries(extractions, deepDives) {
  let md = "";
  // Sort by editorial signal: HIGH first, then MEDIUM, then LOW
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sorted = [...extractions].sort(
    (a, b) => (order[a.signal_rating] || 2) - (order[b.signal_rating] || 2)
  );

  for (const ep of sorted) {
    md += `## ${ep.podcast_name}${ep.episode_number ? ` ${ep.episode_number}` : ""} (${ep.date || "unknown"}) — "${ep.episode_title}"
**Source:** [${ep.podcast_name} (YouTube)](${ep.url})
**Duration:** ${ep.duration_min || "?"} min | **Editorial Signal:** ${ep.signal_rating}

### Notable Quotes
`;
    if (ep.notable_quotes && ep.notable_quotes.length > 0) {
      for (const q of ep.notable_quotes) {
        md += `- "${q.quote}" — ${q.speaker} (${q.timestamp})\n`;
      }
    } else {
      md += `- No notable quotes extracted\n`;
    }

    md += `\n### Signal Analysis\n`;
    // Consensus
    if (ep.consensus_signals && ep.consensus_signals.length > 0) {
      for (const c of ep.consensus_signals) {
        md += `- **Consensus:** ${c.signal}\n`;
      }
    }
    // Debate
    if (ep.debate_points && ep.debate_points.length > 0) {
      for (const d of ep.debate_points) {
        md += `- **Debate:** ${d.topic}`;
        if (d.positions) {
          for (const p of d.positions) {
            md += `\n  - ${p.speaker}: ${p.position}`;
          }
        }
        md += `\n`;
      }
    }
    // Intent
    if (ep.intent_signals && ep.intent_signals.length > 0) {
      for (const i of ep.intent_signals) {
        md += `- **Intent Signal:** ${i.signal}\n`;
      }
    }
    // GCP
    if (ep.gcp_intelligence) {
      const gcp = ep.gcp_intelligence;
      // Gemini sometimes returns objects instead of strings in arrays — stringify safely
      const str = (v) => (typeof v === "string" ? v : JSON.stringify(v));
      md += `- **GCP Relevance:** ${gcp.relevance} — ${gcp.relevance_reason}\n`;
      if (gcp.migration_signals?.length) {
        for (const m of gcp.migration_signals)
          md += `  - Migration: ${str(m)}\n`;
      }
      if (gcp.pain_points?.length) {
        for (const p of gcp.pain_points)
          md += `  - Pain point: ${str(p)}\n`;
      }
      if (gcp.competitive_mentions?.length) {
        md += `  - Competitive: ${gcp.competitive_mentions.map(str).join(", ")}\n`;
      }
      if (gcp.budget_data?.length) {
        for (const b of gcp.budget_data)
          md += `  - Budget: ${str(b)}\n`;
      }
      if (gcp.undecided_moments?.length) {
        for (const u of gcp.undecided_moments)
          md += `  - Open decision: ${str(u)}\n`;
      }
    }

    // Deep dive section (if available)
    const dd = deepDives[ep.url];
    if (dd) {
      md += `\n### Deep Dive\n\n**Timestamped Segments:**\n`;
      for (const seg of dd.timestamped_segments || []) {
        if (seg.signal_level === "LOW") {
          md += `- ${seg.start}-${seg.end} — ${seg.title} (low signal, skip)\n`;
        } else {
          md += `- ${seg.start}-${seg.end} — **${seg.title}**\n`;
          if (seg.expanded) {
            if (seg.expanded.key_quotes) {
              for (const q of seg.expanded.key_quotes) {
                md += `  - ${q.speaker}: "${q.quote}" (${q.timestamp})\n`;
              }
            }
            if (seg.expanded.sales_relevance) {
              md += `  - Takeaway: ${seg.expanded.sales_relevance}\n`;
            }
          }
        }
      }
      if (dd.companies_products_mentioned?.length) {
        md += `\n**Companies/Products Mentioned:** ${dd.companies_products_mentioned.map((c) => c.name).join(", ")}\n`;
      }
      if (dd.key_numbers?.length) {
        md += `**Key Numbers:**\n`;
        for (const n of dd.key_numbers) {
          md += `- "${n.figure}" — ${n.context} (${n.speaker}, ${n.timestamp})\n`;
        }
      }
    }

    md += `\n---\n\n`;
  }

  return md;
}

function formatOrganizedTable(extractions, today) {
  let md = `# Podcasts — Organized by Editorial Signal

> **Extracted:** ${today}
> **Total episodes:** ${extractions.length}

---

## HIGH Editorial Signal

| # | Podcast | Episode | Duration | GCP Relevance | Link |
|---|---------|---------|----------|---------------|------|
`;
  let n = 1;
  for (const ep of extractions.filter((e) => e.signal_rating === "HIGH")) {
    md += `| ${n++} | ${ep.podcast_name} | **${ep.episode_title}** | ${ep.duration_min || "?"}min | ${ep.gcp_intelligence?.relevance || "?"} | [Watch](${ep.url}) |\n`;
  }

  md += `\n## MEDIUM Editorial Signal\n\n| # | Podcast | Episode | Duration | GCP Relevance | Link |\n|---|---------|---------|----------|---------------|------|\n`;
  for (const ep of extractions.filter((e) => e.signal_rating === "MEDIUM")) {
    md += `| ${n++} | ${ep.podcast_name} | **${ep.episode_title}** | ${ep.duration_min || "?"}min | ${ep.gcp_intelligence?.relevance || "?"} | [Watch](${ep.url}) |\n`;
  }

  md += `\n## LOW Editorial Signal\n\n| # | Podcast | Episode | Duration | Link |\n|---|---------|---------|----------|------|\n`;
  for (const ep of extractions.filter((e) => e.signal_rating === "LOW")) {
    md += `| ${n++} | ${ep.podcast_name} | **${ep.episode_title}** | ${ep.duration_min || "?"}min | [Watch](${ep.url}) |\n`;
  }

  return md;
}

// MERGE, NEVER OVERWRITE. The three dated output files are shared: Stage 3b (RSS)
// appends to the same raw JSON and KB, and a same-day re-run writes the same
// names. On 2026-10-25 a manual run at 20:05 extracted the week's episodes; the
// 21:00 cron run then saw them in the raw file as "previously extracted", found
// nothing else in window, and overwrote all three files with an empty set.
// Edition #36 shipped with zero YouTube podcasts and nothing in the PR said so.
// So: raw entries are merged by video_id (a re-extraction replaces its old
// entry), the KB and organized table are appended to, and a run with nothing
// new only touches the files so the freshness guard still sees it.
function writeOutputs({ extractions, deepDives, today, rawDir = RAW_DIR, skillsDir = SKILLS_DIR }) {
  // 1. Raw JSON
  const rawPath = path.join(rawDir, `podcasts-raw-${today}.json`);
  let existing = [];
  if (fs.existsSync(rawPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      warn(`Existing ${rawPath} is not valid JSON; it will be replaced.`);
    }
  }
  const newIds = new Set(extractions.map((e) => e.video_id).filter(Boolean));
  const kept = existing.filter((e) => !e.video_id || !newIds.has(e.video_id));
  const added = extractions.map((e) => ({
    source: "podcast",
    video_id: e.video_id,
    podcast_name: e.podcast_name,
    episode_title: e.episode_title,
    episode_number: e.episode_number,
    date: e.date,
    url: e.url,
    duration_min: e.duration_min,
    signal_rating: e.signal_rating,
    notable_quotes: e.notable_quotes,
    consensus_signals: e.consensus_signals,
    debate_points: e.debate_points,
    intent_signals: e.intent_signals,
    gcp_intelligence: e.gcp_intelligence,
    companies_mentioned: e.companies_mentioned,
    topics: e.topics,
    deep_dive: deepDives[e.url] || null,
    extracted_at: new Date().toISOString(),
  }));
  const combined = [...kept, ...added].map((e, i) => ({ ...e, id: String(i + 1) }));
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(rawPath, JSON.stringify(combined, null, 2), "utf-8");

  // 2. Knowledge base, 3. organized tables: append when the file already exists
  fs.mkdirSync(skillsDir, { recursive: true });
  const kbPath = path.join(skillsDir, `podcasts-knowledge-base-${today}.md`);
  const orgPath = path.join(skillsDir, `podcasts-organized-${today}.md`);
  const now = new Date();
  if (!fs.existsSync(kbPath)) {
    fs.writeFileSync(kbPath, formatKnowledgeBase(extractions, deepDives, today), "utf-8");
  } else if (extractions.length === 0) {
    fs.utimesSync(kbPath, now, now);
  } else {
    // The file has real entries now, so a leftover EMPTY marker would be a lie
    const kb = fs.readFileSync(kbPath, "utf-8").replace(EMPTY_MARKER + "\n", "");
    fs.writeFileSync(kbPath, kb + formatKbEntries(extractions, deepDives), "utf-8");
  }
  if (!fs.existsSync(orgPath)) {
    fs.writeFileSync(orgPath, formatOrganizedTable(extractions, today), "utf-8");
  } else if (extractions.length === 0) {
    fs.utimesSync(orgPath, now, now);
  } else {
    const org = fs.readFileSync(orgPath, "utf-8").trimEnd();
    fs.writeFileSync(orgPath, `${org}\n\n${formatOrganizedTable(extractions, today)}`, "utf-8");
  }

  return { rawPath, kbPath, orgPath, rawCount: combined.length };
}

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GOOGLE_API_KEY not set.");
    process.exit(1);
  }

  const today = getTodayDate();
  const dateAfter = getDateAfter();
  log(`=== Podcast Intelligence Extraction ===`);
  log(`Date: ${today}, looking back to: ${dateAfter}`);

  // Ensure directories exist
  fs.mkdirSync(EXTRACTIONS_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  // Load config
  const { enabled, skipped } = loadConfig();
  log(`Enabled channels: ${enabled.length}`);
  for (const s of skipped) {
    log(`Skipped ${s.name} — ${s.note || (s.source === "rss" ? "processed by extract-rss-podcasts.py" : "disabled")}`);
  }

  // Load prompts
  const l1Prompt = fs.readFileSync(L1_PROMPT_PATH, "utf-8");
  const l2Prompt = fs.readFileSync(L2_PROMPT_PATH, "utf-8");

  // Load previously extracted video IDs
  const previousIds = loadPreviousIds();
  log(`Previously extracted video IDs: ${previousIds.size}`);

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey });

  // Collect all new episodes across all channels
  const allEpisodes = [];
  for (const podcast of enabled) {
    log(`Scanning ${podcast.name} (${podcast.channelHandle})...`);
    const episodes = getRecentUploads(podcast.channelHandle, dateAfter);
    const newEpisodes = episodes.filter((e) => !previousIds.has(e.video_id));
    log(`  Found ${episodes.length} recent, ${newEpisodes.length} new`);
    for (const ep of newEpisodes) {
      allEpisodes.push({ podcast, episode: ep });
    }
  }

  log(`Total new episodes to process: ${allEpisodes.length}`);

  if (allEpisodes.length === 0) {
    // Still write the KB. A quiet week is a successful run with nothing in it,
    // and the freshness guard can only tell the two apart if the file exists
    // and is fresh. Writing nothing here is what blocked the 2026-08-02 run.
    const emptyKb = path.join(SKILLS_DIR, `podcasts-knowledge-base-${today}.md`);
    if (fs.existsSync(emptyKb)) {
      // The RSS stage shares this file and may have written entries already —
      // never clobber them; touch it so freshness still sees this run.
      const now = new Date();
      fs.utimesSync(emptyKb, now, now);
      log(`No new YouTube episodes. Existing KB left intact: ${emptyKb}`);
    } else {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
      fs.writeFileSync(emptyKb, formatKnowledgeBase([], {}, today), "utf-8");
      log(`No new YouTube episodes. Wrote empty KB: ${emptyKb}`);
    }
    process.exit(0);
  }

  // Download subtitles in parallel (4 at a time) + fetch upload dates
  log(`Fetching upload dates + captions for ${allEpisodes.length} episodes (4 concurrent)...`);
  const { subtitles: subtitlePaths, dates: uploadDates } = await downloadAllSubtitles(allEpisodes, 4, { dateAfter });

  // Apply real upload dates to episodes
  for (const { episode } of allEpisodes) {
    const rawDate = uploadDates.get(episode.video_id);
    if (rawDate) {
      // Convert YYYYMMDD to YYYY-MM-DD
      episode.upload_date = rawDate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
    }
  }

  // Recency filter. The flat-playlist scan has no dates, so this is the first
  // point we know the real upload date. Without it, any of a channel's last 5
  // uploads not seen in the last 4 raw files slips in — a month-old episode
  // reads as "new". An unknown date is kept (the date fetch can fail) but warned.
  const cutoff = dateAfter.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  const inWindow = [];
  for (const item of allEpisodes) {
    const { podcast, episode } = item;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(episode.upload_date || "")) {
      warn(`No upload date for ${podcast.name} — "${episode.title}". Keeping it; verify recency by hand.`);
    } else if (episode.upload_date < cutoff) {
      log(`  Too old (${episode.upload_date} < ${cutoff}): ${podcast.name} — "${episode.title}". Skipping.`);
      continue;
    }
    inWindow.push(item);
  }
  const captionCount = inWindow.filter(({ episode }) => subtitlePaths.get(episode.video_id)).length;
  log(`Captions downloaded: ${captionCount}/${inWindow.length} in-window episodes`);

  // Whisper fallback for in-window episodes YouTube wouldn't give captions for.
  // One at a time: mlx-whisper saturates the GPU, and Stage 3b (RSS) may be
  // transcribing at the same moment.
  let whisperCount = 0;
  const missing = inWindow.filter(({ episode }) => !subtitlePaths.get(episode.video_id));
  if (missing.length > 0 && WHISPER_FALLBACK_MAX > 0) {
    const toTranscribe = missing.slice(0, WHISPER_FALLBACK_MAX);
    if (missing.length > toTranscribe.length) {
      warn(`${missing.length} episodes need whisper but WHISPER_FALLBACK_MAX=${WHISPER_FALLBACK_MAX}; ${missing.length - toTranscribe.length} will be skipped.`);
    }
    log(`Whisper fallback: transcribing ${toTranscribe.length} episode(s) from audio (~3-4 min each)...`);
    for (const { podcast, episode } of toTranscribe) {
      log(`  Whisper: ${podcast.name} — "${episode.title}" (${episode.video_id})`);
      const vttPath = await transcribeWithWhisper(episode.video_id);
      if (vttPath) {
        subtitlePaths.set(episode.video_id, vttPath);
        whisperCount++;
      }
    }
  } else if (missing.length > 0) {
    warn(`Whisper fallback disabled (WHISPER_FALLBACK_MAX=0); ${missing.length} episode(s) stay without transcripts.`);
  }

  const coverage = coverageReport({ inWindow: inWindow.length, captions: captionCount, whisper: whisperCount });
  for (const line of coverage.lines) (coverage.warn ? warn : log)(line);

  // Parse all VTT files and prepare episodes for extraction
  const prepared = []; // { podcast, episode, transcript }
  const transcripts = {}; // url -> transcript (for deep dive reuse)
  for (const { podcast, episode } of inWindow) {
    const vttPath = subtitlePaths.get(episode.video_id);
    if (!vttPath) {
      warn(`No transcript for ${podcast.name} — "${episode.title}" (${episode.video_id}): captions and whisper both failed. Skipping.`);
      continue;
    }
    const transcript = parseVtt(vttPath);
    if (!transcript || transcript.length < 100) {
      warn(`Transcript too short for ${podcast.name} — "${episode.title}". Skipping.`);
      continue;
    }
    transcripts[episode.url] = transcript;
    prepared.push({ podcast, episode, transcript });
  }
  log(`Episodes with valid transcripts: ${prepared.length}`);

  // Extract intelligence in parallel batches (3 concurrent Gemini calls)
  const GEMINI_CONCURRENCY = 3;
  const extractions = [];

  async function processEpisode({ podcast, episode, transcript }) {
    log(`Processing: ${podcast.name} — "${episode.title}"`);
    let extraction;
    try {
      extraction = await extractIntelligence(ai, l1Prompt, podcast, episode, transcript);
    } catch (err) {
      warn(`Extraction failed for ${episode.title}: ${err.message}`);
    }
    if (extraction) {
      extraction.video_id = episode.video_id;
      extraction.podcast_name = extraction.podcast_name || podcast.name;
      extraction.url = extraction.url || episode.url;
      extraction.duration_min = extraction.duration_min || episode.duration_min;
      if (episode.upload_date && episode.upload_date !== "NA") {
        extraction.date = episode.upload_date;
      }
      extractions.push(extraction);
      log(`  Signal: ${extraction.signal_rating} | Quotes: ${extraction.notable_quotes?.length || 0}`);
    }
  }

  for (let i = 0; i < prepared.length; i += GEMINI_CONCURRENCY) {
    const batch = prepared.slice(i, i + GEMINI_CONCURRENCY);
    await Promise.all(batch.map(processEpisode));
  }

  // Deep dives for HIGH episodes (max MAX_DEEP_DIVES) — run in parallel
  const highEpisodes = extractions
    .filter((e) => e.signal_rating === "HIGH")
    .slice(0, MAX_DEEP_DIVES);
  const deepDives = {};
  log(`Running ${highEpisodes.length} deep dives in parallel...`);
  await Promise.all(highEpisodes.map(async (ep) => {
    log(`Deep dive: ${ep.podcast_name} — "${ep.episode_title}"`);
    const transcript = transcripts[ep.url];
    if (!transcript) return;
    let dd;
    try {
      dd = await deepDive(ai, l2Prompt, ep, transcript);
    } catch (err) {
      warn(`Deep dive failed for ${ep.episode_title}: ${err.message}`);
    }
    if (dd) {
      deepDives[ep.url] = dd;
      log(`  Segments: ${dd.timestamped_segments?.length || 0}`);
    }
  }));

  const { rawPath, kbPath, orgPath } = writeOutputs({ extractions, deepDives, today });
  log(`Raw JSON: ${rawPath}`);
  log(`Knowledge base: ${kbPath}`);
  log(`Organized tables: ${orgPath}`);

  // Summary
  log(`\n=== Extraction Complete ===`);
  log(`Episodes processed: ${extractions.length}`);
  log(`HIGH signal: ${extractions.filter((e) => e.signal_rating === "HIGH").length}`);
  log(`MEDIUM signal: ${extractions.filter((e) => e.signal_rating === "MEDIUM").length}`);
  log(`LOW signal: ${extractions.filter((e) => e.signal_rating === "LOW").length}`);
  log(`Deep dives: ${Object.keys(deepDives).length}`);
  for (const line of coverage.lines) (coverage.warn ? warn : log)(line);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  });
}

module.exports = {
  captionAttempts,
  lastYtDlpError,
  downloadCaptions,
  fetchUploadDate,
  downloadAllSubtitles,
  transcribeWithWhisper,
  coverageReport,
  parseVtt,
  writeOutputs,
};

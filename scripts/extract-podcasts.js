#!/usr/bin/env node

/**
 * Brief Signal — Podcast Intelligence Extractor
 *
 * Reads config/podcasts.json, downloads recent episode subtitles from YouTube,
 * sends transcripts to Gemini for structured intelligence extraction, and
 * writes podcast knowledge base files.
 *
 * Requires: GOOGLE_API_KEY environment variable, yt-dlp installed
 */

const { GoogleGenAI } = require("@google/genai");
const { execSync, exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config", "podcasts.json");
const SKILLS_DIR = path.join(process.env.HOME, "skills");
const RAW_DIR = path.join(process.env.HOME, "info-agg", "prompts");
const EXTRACTIONS_DIR = path.join(process.env.HOME, "info-agg", "extractions");
const L1_PROMPT_PATH = path.join(__dirname, "podcast-extraction-prompt.md");
const L2_PROMPT_PATH = path.join(__dirname, "podcast-deep-dive-prompt.md");
const MAX_DEEP_DIVES = 3;
const LOOKBACK_DAYS = 7;
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
  return new Date().toISOString().split("T")[0];
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

function downloadSubtitles(videoId) {
  const safeId = validateVideoId(videoId);
  const outPath = path.join(EXTRACTIONS_DIR, safeId);
  const vttFile = `${outPath}.en.vtt`;
  if (fs.existsSync(vttFile)) return vttFile;
  try {
    execSync(
      `yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o "${outPath}" "https://www.youtube.com/watch?v=${safeId}"`,
      { encoding: "utf-8", timeout: 60000 }
    );
    return fs.existsSync(vttFile) ? vttFile : null;
  } catch {
    return null;
  }
}

function downloadSubtitleAsync(videoId) {
  return new Promise((resolve) => {
    const safeId = validateVideoId(videoId);
    const outPath = path.join(EXTRACTIONS_DIR, safeId);
    const vttFile = `${outPath}.en.vtt`;
    if (fs.existsSync(vttFile)) return resolve(vttFile);
    exec(
      `yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o "${outPath}" "https://www.youtube.com/watch?v=${safeId}"`,
      { encoding: "utf-8", timeout: 60000 },
      () => resolve(fs.existsSync(vttFile) ? vttFile : null)
    );
  });
}

async function downloadAllSubtitles(episodes, concurrency = 4) {
  const results = new Map();
  for (let i = 0; i < episodes.length; i += concurrency) {
    const batch = episodes.slice(i, i + concurrency);
    const promises = batch.map(async ({ episode }) => {
      const vttPath = await downloadSubtitleAsync(episode.video_id);
      results.set(episode.video_id, vttPath);
    });
    await Promise.all(promises);
  }
  return results;
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
    model: "gemini-2.5-flash",
    contents: userMessage,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
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
    model: "gemini-2.5-flash",
    contents: userMessage,
    config: {
      systemInstruction: deepDivePrompt,
      responseMimeType: "application/json",
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

function formatKnowledgeBase(extractions, deepDives, today) {
  let md = `# Podcast Intelligence Knowledge Base

> **Extracted:** ${today}
> **Episodes processed:** ${extractions.length}
> **HIGH signal episodes:** ${extractions.filter((e) => e.signal_rating === "HIGH").length}
> **Deep dives:** ${Object.keys(deepDives).length}

---

`;

  // Sort by signal rating: HIGH first, then MEDIUM, then LOW
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sorted = [...extractions].sort(
    (a, b) => (order[a.signal_rating] || 2) - (order[b.signal_rating] || 2)
  );

  for (const ep of sorted) {
    md += `## ${ep.podcast_name}${ep.episode_number ? ` ${ep.episode_number}` : ""} (${ep.date || "unknown"}) — "${ep.episode_title}"
**Source:** [${ep.podcast_name} (YouTube)](${ep.url})
**Duration:** ${ep.duration_min || "?"} min | **Signal Rating:** ${ep.signal_rating}

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
  let md = `# Podcasts — Organized by Signal Rating

> **Extracted:** ${today}
> **Total episodes:** ${extractions.length}

---

## HIGH Signal

| # | Podcast | Episode | Duration | GCP Relevance | Link |
|---|---------|---------|----------|---------------|------|
`;
  let n = 1;
  for (const ep of extractions.filter((e) => e.signal_rating === "HIGH")) {
    md += `| ${n++} | ${ep.podcast_name} | **${ep.episode_title}** | ${ep.duration_min || "?"}min | ${ep.gcp_intelligence?.relevance || "?"} | [Watch](${ep.url}) |\n`;
  }

  md += `\n## MEDIUM Signal\n\n| # | Podcast | Episode | Duration | GCP Relevance | Link |\n|---|---------|---------|----------|---------------|------|\n`;
  for (const ep of extractions.filter((e) => e.signal_rating === "MEDIUM")) {
    md += `| ${n++} | ${ep.podcast_name} | **${ep.episode_title}** | ${ep.duration_min || "?"}min | ${ep.gcp_intelligence?.relevance || "?"} | [Watch](${ep.url}) |\n`;
  }

  md += `\n## LOW Signal\n\n| # | Podcast | Episode | Duration | Link |\n|---|---------|---------|----------|------|\n`;
  for (const ep of extractions.filter((e) => e.signal_rating === "LOW")) {
    md += `| ${n++} | ${ep.podcast_name} | **${ep.episode_title}** | ${ep.duration_min || "?"}min | [Watch](${ep.url}) |\n`;
  }

  return md;
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
    log(`Skipped ${s.name} — ${s.note || (s.source === "rss" ? "RSS pipeline not yet supported" : "disabled")}`);
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
    log("No new episodes found. Exiting.");
    process.exit(0);
  }

  // Batch download all subtitles in parallel (4 at a time)
  log(`Downloading subtitles for ${allEpisodes.length} episodes (4 concurrent)...`);
  const subtitlePaths = await downloadAllSubtitles(allEpisodes);
  const downloaded = [...subtitlePaths.values()].filter(Boolean).length;
  log(`Subtitles downloaded: ${downloaded}/${allEpisodes.length}`);

  // Process each episode (Gemini calls are sequential to respect rate limits)
  const extractions = [];
  const transcripts = {}; // url -> transcript (for deep dive reuse)
  for (const { podcast, episode } of allEpisodes) {
    log(`Processing: ${podcast.name} — "${episode.title}"`);

    // Get cached subtitle path
    const vttPath = subtitlePaths.get(episode.video_id);
    if (!vttPath) {
      warn(`  No subtitles available for ${episode.video_id}. Skipping.`);
      continue;
    }

    // Parse VTT
    const transcript = parseVtt(vttPath);
    if (!transcript || transcript.length < 100) {
      warn(`  Transcript too short for ${episode.video_id}. Skipping.`);
      continue;
    }
    transcripts[episode.url] = transcript;

    // Extract intelligence
    let extraction;
    try {
      extraction = await extractIntelligence(
        ai,
        l1Prompt,
        podcast,
        episode,
        transcript
      );
    } catch (err) {
      warn(`Extraction failed for ${episode.title}: ${err.message}`);
    }
    if (extraction) {
      // Ensure required fields are present
      extraction.video_id = episode.video_id;
      extraction.podcast_name = extraction.podcast_name || podcast.name;
      extraction.url = extraction.url || episode.url;
      extraction.duration_min = extraction.duration_min || episode.duration_min;
      extractions.push(extraction);
      log(`  Signal: ${extraction.signal_rating} | Quotes: ${extraction.notable_quotes?.length || 0}`);
    }

    // Rate limit between Gemini calls
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Deep dives for HIGH episodes (max MAX_DEEP_DIVES)
  const highEpisodes = extractions
    .filter((e) => e.signal_rating === "HIGH")
    .slice(0, MAX_DEEP_DIVES);
  const deepDives = {};
  for (const ep of highEpisodes) {
    log(`Deep dive: ${ep.podcast_name} — "${ep.episode_title}"`);
    const transcript = transcripts[ep.url];
    if (!transcript) continue;
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
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Write output files
  // 1. Raw JSON
  const rawPath = path.join(RAW_DIR, `podcasts-raw-${today}.json`);
  fs.writeFileSync(
    rawPath,
    JSON.stringify(
      extractions.map((e, i) => ({
        id: String(i + 1),
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
      })),
      null,
      2
    ),
    "utf-8"
  );
  log(`Raw JSON: ${rawPath}`);

  // 2. Knowledge base markdown
  const kbPath = path.join(SKILLS_DIR, `podcasts-knowledge-base-${today}.md`);
  fs.writeFileSync(kbPath, formatKnowledgeBase(extractions, deepDives, today), "utf-8");
  log(`Knowledge base: ${kbPath}`);

  // 3. Organized tables
  const orgPath = path.join(SKILLS_DIR, `podcasts-organized-${today}.md`);
  fs.writeFileSync(orgPath, formatOrganizedTable(extractions, today), "utf-8");
  log(`Organized tables: ${orgPath}`);

  // Summary
  log(`\n=== Extraction Complete ===`);
  log(`Episodes processed: ${extractions.length}`);
  log(`HIGH signal: ${extractions.filter((e) => e.signal_rating === "HIGH").length}`);
  log(`MEDIUM signal: ${extractions.filter((e) => e.signal_rating === "MEDIUM").length}`);
  log(`LOW signal: ${extractions.filter((e) => e.signal_rating === "LOW").length}`);
  log(`Deep dives: ${Object.keys(deepDives).length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});

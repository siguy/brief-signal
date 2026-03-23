# Podcast Sources Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add podcasts as a third source type for Brief Signal, extracting structured intelligence from YouTube-hosted podcast episodes and integrating it into the weekly briefing pipeline.

**Architecture:** A new `/extract-podcasts` Claude Code skill reads a JSON config of podcast channels, uses `yt-dlp` to grab recent episode subtitles from YouTube, sends transcripts to Gemini for structured intelligence extraction (quotes, consensus, debate, intent signals, GCP relevance), and writes a knowledge base file that `generate-briefing.js` consumes alongside bookmarks and playlists. All three extractions become independent cron jobs.

**Tech Stack:** Node.js (extraction script), `yt-dlp` (subtitle download), Gemini 2.5 Flash (extraction + deep dive), Claude Code cron (scheduling)

**Design doc:** `docs/plans/2026-03-23-podcast-sources-design.md`

---

### Task 1: Create Podcast Config File

**Files:**
- Create: `config/podcasts.json`

**Step 1: Create config directory**

```bash
mkdir -p config
```

**Step 2: Create `config/podcasts.json`**

Write the full podcast registry. YouTube channels get `"enabled": true`. RSS-only podcasts get `"enabled": false` with a note.

```json
[
  {
    "name": "All-In",
    "source": "youtube",
    "channelHandle": "@TheAllinPod",
    "category": "VC/Market",
    "enabled": true
  },
  {
    "name": "No Priors",
    "source": "youtube",
    "channelHandle": "@NoPriorsPodcast",
    "category": "AI/Builder",
    "enabled": true
  },
  {
    "name": "Hard Fork",
    "source": "youtube",
    "channelHandle": "@hardfork",
    "category": "News/Tech",
    "enabled": true
  },
  {
    "name": "Pivot",
    "source": "youtube",
    "channelHandle": "@PivotPodcastOfficial",
    "category": "News/Tech",
    "enabled": true
  },
  {
    "name": "DOAC (Diary of a CEO)",
    "source": "youtube",
    "channelHandle": "@TheDiaryOfACEO",
    "category": "Founder/Interview",
    "enabled": true
  },
  {
    "name": "My First Million",
    "source": "youtube",
    "channelHandle": "@MyFirstMillionPod",
    "category": "Founder/Builder",
    "enabled": true
  },
  {
    "name": "a16z Podcast",
    "source": "youtube",
    "channelHandle": "@a16z",
    "category": "VC/Builder",
    "enabled": true
  },
  {
    "name": "Gradient Dissent",
    "source": "youtube",
    "channelHandle": "@Aboralove",
    "category": "AI/Builder",
    "enabled": true
  },
  {
    "name": "Grit (Kleiner Perkins)",
    "source": "youtube",
    "channelHandle": "@KleinerPerkins",
    "category": "VC/Founder",
    "enabled": true
  },
  {
    "name": "AI & I (Dan Shipper)",
    "source": "youtube",
    "channelHandle": "@danshipper",
    "category": "AI/Builder",
    "enabled": true
  },
  {
    "name": "Latent Space",
    "source": "youtube",
    "channelHandle": "@LatentSpaceTV",
    "category": "AI/Builder",
    "enabled": true
  },
  {
    "name": "Lightcone (YC)",
    "source": "youtube",
    "channelHandle": "@ycombinator",
    "category": "Startup/Builder",
    "enabled": true
  },
  {
    "name": "The Cognitive Revolution",
    "source": "youtube",
    "channelHandle": "@CognitiveRevolutionPodcast",
    "category": "AI/Builder",
    "enabled": true
  },
  {
    "name": "Lenny's Podcast",
    "source": "youtube",
    "channelHandle": "@LennysPodcast",
    "category": "Product/Growth",
    "enabled": true
  },
  {
    "name": "20VC",
    "source": "youtube",
    "channelHandle": "@20aborVC",
    "category": "VC/Funding",
    "enabled": true
  },
  {
    "name": "Acquired",
    "source": "rss",
    "rssUrl": "https://feeds.acquired.fm/acquired",
    "category": "Deep Dive",
    "enabled": false,
    "note": "Has website transcripts on acquired.fm — scrape instead of transcribe"
  },
  {
    "name": "AI Daily Brief",
    "source": "rss",
    "rssUrl": null,
    "category": "AI/News",
    "enabled": false,
    "note": "RSS pipeline not yet built — needs mlx-whisper transcription"
  },
  {
    "name": "10/10 GTM",
    "source": "rss",
    "rssUrl": null,
    "category": "GTM",
    "enabled": false,
    "note": "RSS pipeline not yet built — needs mlx-whisper transcription"
  },
  {
    "name": "BG2 Pod",
    "source": "rss",
    "rssUrl": null,
    "category": "VC/Market",
    "enabled": false,
    "note": "May have YouTube — verify before building RSS path"
  },
  {
    "name": "Rethinking with Adam Grant",
    "source": "rss",
    "rssUrl": null,
    "category": "Leadership",
    "enabled": false,
    "note": "RSS pipeline not yet built — needs mlx-whisper transcription"
  },
  {
    "name": "Stratechery",
    "source": "rss",
    "rssUrl": null,
    "category": "Strategy",
    "enabled": false,
    "note": "Paywalled — requires Stratechery Plus subscription for RSS access"
  }
]
```

**Step 3: Verify channel handles**

Before committing, verify that each YouTube channel handle resolves correctly. For each enabled podcast, run:

```bash
yt-dlp --flat-playlist --playlist-items 1 --print "%(channel)s" "https://www.youtube.com/@ChannelHandle/videos"
```

If a handle doesn't resolve, search YouTube for the correct handle and update the config.

**Step 4: Commit**

```bash
git add config/podcasts.json
git commit -m "feat: add podcast registry config"
```

---

### Task 2: Write the Podcast Extraction Prompt

**Files:**
- Create: `scripts/podcast-extraction-prompt.md`

**Step 1: Write the Level 1 extraction prompt**

This prompt goes to Gemini with a podcast transcript. It extracts structured intelligence, not generic summaries. Save to `scripts/podcast-extraction-prompt.md`:

```markdown
# Podcast Intelligence Extraction Prompt

You are extracting structured intelligence from a podcast episode transcript for a weekly briefing that serves Google Cloud startup sales reps. These reps sell cloud infrastructure to AI-native founders. They need to walk into meetings knowing how founders and VCs are actually thinking — not just what happened, but what's assumed, what's debated, and where buying decisions are forming.

## Input

You will receive:
- Podcast name and episode title
- Episode URL and duration
- Full transcript (auto-generated subtitles — may have minor errors)

## Output Format

Return a JSON object with this exact structure:

{
  "podcast_name": "All-In",
  "episode_title": "The Agent Infrastructure Shakeout",
  "episode_number": "E213",
  "date": "2026-03-21",
  "url": "https://youtube.com/watch?v=xxx",
  "duration_min": 62,
  "signal_rating": "HIGH",
  "signal_rating_reason": "Direct discussion of cloud infrastructure buying decisions with specific migration data",
  "notable_quotes": [
    {
      "speaker": "Chamath Palihapitiya",
      "quote": "Every Series A deck I see now has an agent strategy slide, but nobody knows what infra to run them on",
      "timestamp": "12:34",
      "context": "Discussing pattern across recent portfolio company pitches"
    }
  ],
  "consensus_signals": [
    {
      "signal": "Founders are building agents but treating infrastructure as an afterthought",
      "evidence": "All four hosts agreed without pushback; multiple portfolio company examples cited",
      "type": "group_consensus"
    }
  ],
  "debate_points": [
    {
      "topic": "Self-host models vs. managed APIs for agent workloads",
      "positions": [
        {"speaker": "David Sacks", "position": "Self-host for model flexibility and avoiding vendor lock-in"},
        {"speaker": "Chamath Palihapitiya", "position": "Managed APIs win because eng teams are too small to run infra"}
      ],
      "resolution": "Unresolved — genuine split in the market",
      "timestamp_range": "8:00-24:00"
    }
  ],
  "intent_signals": [
    {
      "signal": "Multiple portfolio companies evaluating GPU cloud providers for fine-tuning",
      "who": "Chamath's portfolio companies",
      "action": "evaluating",
      "specificity": "high"
    }
  ],
  "gcp_intelligence": {
    "relevance": "HIGH",
    "relevance_reason": "Infrastructure selection for agent workloads is an active, undecided purchase decision",
    "migration_signals": ["3 portfolio companies moved from AWS to GCP in Q1 for TPU access"],
    "pain_points": ["Compute costs for agent workloads 10x what people budget"],
    "buying_criteria": ["Hardware access (TPUs)", "Committed use discount pricing"],
    "competitive_mentions": ["AWS Bedrock", "Azure OpenAI", "GCP Vertex AI compared favorably for TPU access"],
    "budget_data": ["$2M+ annual compute spend typical for Series B AI company"],
    "undecided_moments": ["Nobody knows what infra to run agents on — active evaluation underway"]
  },
  "companies_mentioned": ["GCP", "AWS", "Azure", "LangChain", "CrewAI"],
  "topics": ["Agent Infrastructure", "Cloud Provider Selection"]
}

## Signal Rating Criteria

- **HIGH:** Direct discussion of cloud infrastructure decisions, migration patterns, specific spend data, or buying criteria. Active purchase decisions being discussed. Max 3 per weekly run get deep dives.
- **MEDIUM:** General AI/tech trends relevant to founder conversations. Useful context but no direct infrastructure buying signal.
- **LOW:** Tangentially relevant (leadership, general business, entertainment). Still extract quotes and signals — the briefing generator will decide what to use.

## Extraction Rules

1. **Quotes must be near-verbatim.** Auto-generated subtitles have errors — clean up obvious transcription mistakes but preserve the speaker's actual words. Include timestamp.
2. **Attribute everything.** Every quote, position, and claim needs a speaker name. For interview shows, distinguish host vs. guest.
3. **Consensus vs. debate.** If all participants agree, it's consensus. If they disagree, it's debate. If only one person speaks (interview), frame consensus as "guest perspective" and debate as "where host challenges guest."
4. **GCP intelligence is the priority lens.** Everything else is useful, but the GCP section is what makes this briefing different from a generic podcast summary. Be aggressive about flagging competitive mentions, migration patterns, and infrastructure decisions.
5. **Intent signals need specificity.** "AI is growing" is not an intent signal. "We moved our inference stack off proprietary APIs" is. Look for verbs: building, buying, evaluating, migrating, hiring, cutting.
6. **Don't fabricate.** If a category has no relevant content for this episode, return an empty array. A LOW-signal episode might have just 1-2 quotes and empty GCP intelligence — that's fine.
7. **Episode number.** Extract from title or transcript if available. If not, use null.
```

**Step 2: Write the Level 2 deep dive prompt**

Save to `scripts/podcast-deep-dive-prompt.md`:

```markdown
# Podcast Deep Dive Extraction Prompt

You are performing a detailed deep dive on a HIGH-signal podcast episode. You've already done Level 1 extraction. Now go deeper into every segment with MEDIUM or HIGH relevance.

## Input

You will receive:
- The Level 1 extraction JSON (for context on what was already found)
- The full transcript

## Output Format

Return a JSON object:

{
  "timestamped_segments": [
    {
      "start": "0:00",
      "end": "8:00",
      "title": "Weekly news recap",
      "signal_level": "LOW",
      "summary": "Brief recap of week's headlines",
      "expanded": null
    },
    {
      "start": "8:00",
      "end": "24:00",
      "title": "Agent infrastructure debate",
      "signal_level": "HIGH",
      "summary": "Core debate on self-host vs. managed for agent workloads",
      "expanded": {
        "key_quotes": [
          {"speaker": "Sacks", "quote": "Self-hosting gives you model flexibility, vendor lock-in is the real risk", "timestamp": "11:22"},
          {"speaker": "Chamath", "quote": "Managed APIs win because eng teams are too small to run infra", "timestamp": "15:45"}
        ],
        "speaker_positions": [
          {"speaker": "Sacks", "position": "Self-host for control and flexibility"},
          {"speaker": "Chamath", "position": "Managed services for speed and team efficiency"}
        ],
        "sales_relevance": "Founders are genuinely split — this is an active buying decision, not settled. GCP can position managed + TPU access as best of both worlds."
      }
    }
  ],
  "companies_products_mentioned": [
    {"name": "GCP Vertex AI", "context": "Compared favorably for TPU access", "timestamp": "18:30"},
    {"name": "AWS Bedrock", "context": "Mentioned as incumbent being evaluated against", "timestamp": "12:15"}
  ],
  "key_numbers": [
    {"figure": "$2M+ annual compute spend", "context": "Typical for Series B AI company", "speaker": "Friedberg", "timestamp": "29:15"}
  ]
}

## Rules

1. Create a segment for every distinct topic discussed. Aim for 5-10 segments per hour-long episode.
2. Every segment gets a one-line summary. Segments rated MEDIUM or HIGH get the `expanded` block with quotes, positions, and sales relevance.
3. LOW segments get `"expanded": null` — just title and summary.
4. `sales_relevance` should be specific and actionable: what does a GCP rep do with this information?
5. `companies_products_mentioned` is a comprehensive list — include anything a sales rep might want to search for before a meeting.
6. `key_numbers` captures every specific figure: dollar amounts, percentages, user counts, growth rates, headcounts.
```

**Step 3: Commit**

```bash
git add scripts/podcast-extraction-prompt.md scripts/podcast-deep-dive-prompt.md
git commit -m "feat: add podcast extraction and deep dive prompts"
```

---

### Task 3: Build the Extraction Script

**Files:**
- Create: `scripts/extract-podcasts.js`

This is the core script that the `/extract-podcasts` skill will call. It's a Node.js script (matching the existing `generate-briefing.js` pattern).

**Step 1: Write the extraction script**

Create `scripts/extract-podcasts.js`. The script needs to:

1. Read `config/podcasts.json`
2. Filter to enabled YouTube podcasts
3. For each channel, use `yt-dlp` to list recent uploads (last 7 days)
4. Deduplicate against previous `podcasts-raw-*.json`
5. Download subtitles for new episodes
6. Parse VTT to clean text (reuse the Python VTT parser from extract-playlist)
7. Send transcript to Gemini with the extraction prompt
8. Collect HIGH-rated episodes for deep dive (max 3)
9. Run deep dive pass on HIGH episodes
10. Write output files: raw JSON, knowledge base markdown, organized tables

```javascript
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
const { execSync } = require("child_process");
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
  const url = `https://www.youtube.com/${channelHandle}/videos`;
  try {
    const output = execSync(
      `yt-dlp --flat-playlist --dateafter ${dateAfter} --print "%(id)s|||%(title)s|||%(channel)s|||%(duration)s|||%(upload_date)s|||%(url)s" "${url}"`,
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
        duration_sec: duration === "NA" ? null : parseInt(duration, 10),
        duration_min:
          duration === "NA" ? null : Math.ceil(parseInt(duration, 10) / 60),
        upload_date: uploadDate,
        url: videoUrl || `https://www.youtube.com/watch?v=${id}`,
      };
    });
  } catch (err) {
    warn(`Failed to get uploads for ${channelHandle}: ${err.message}`);
    return [];
  }
}

function downloadSubtitles(videoId) {
  const outPath = path.join(EXTRACTIONS_DIR, videoId);
  const vttFile = `${outPath}.en.vtt`;
  // Check if already downloaded
  if (fs.existsSync(vttFile)) return vttFile;
  try {
    execSync(
      `yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o "${outPath}" "https://www.youtube.com/watch?v=${videoId}"`,
      { encoding: "utf-8", timeout: 60000 }
    );
    return fs.existsSync(vttFile) ? vttFile : null;
  } catch {
    return null;
  }
}

function parseVtt(vttPath) {
  try {
    const output = execSync(
      `python3 -c "
import re, sys
with open(sys.argv[1]) as f:
    content = f.read()
lines = []
seen = set()
for line in content.split('\\n'):
    line = line.strip()
    if not line or line == 'WEBVTT' or line.startswith('Kind:') or line.startswith('Language:'):
        continue
    if re.match(r'^\\d{2}:\\d{2}', line) or re.match(r'^\\d+$', line):
        continue
    clean = re.sub(r'<[^>]+>', '', line)
    if clean and clean not in seen:
        seen.add(clean)
        lines.append(clean)
print(' '.join(lines))
" "${vttPath}"`,
      { encoding: "utf-8", timeout: 30000 }
    );
    return output.trim();
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
    return JSON.parse(response.text);
  } catch {
    warn(`Failed to parse Gemini response as JSON for ${episode.title}`);
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
    return JSON.parse(response.text);
  } catch {
    warn(`Failed to parse deep dive JSON for ${level1Data.episode_title}`);
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
      md += `- **GCP Relevance:** ${gcp.relevance} — ${gcp.relevance_reason}\n`;
      if (gcp.migration_signals?.length) {
        for (const m of gcp.migration_signals)
          md += `  - Migration: ${m}\n`;
      }
      if (gcp.pain_points?.length) {
        for (const p of gcp.pain_points)
          md += `  - Pain point: ${p}\n`;
      }
      if (gcp.competitive_mentions?.length) {
        md += `  - Competitive: ${gcp.competitive_mentions.join(", ")}\n`;
      }
      if (gcp.budget_data?.length) {
        for (const b of gcp.budget_data)
          md += `  - Budget: ${b}\n`;
      }
      if (gcp.undecided_moments?.length) {
        for (const u of gcp.undecided_moments)
          md += `  - Open decision: ${u}\n`;
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
    // Rate limit between channels
    await new Promise((r) => setTimeout(r, 1000));
  }

  log(`Total new episodes to process: ${allEpisodes.length}`);

  if (allEpisodes.length === 0) {
    log("No new episodes found. Exiting.");
    process.exit(0);
  }

  // Process each episode
  const extractions = [];
  const transcripts = {}; // url -> transcript (for deep dive reuse)
  for (const { podcast, episode } of allEpisodes) {
    log(`Processing: ${podcast.name} — "${episode.title}"`);

    // Download subtitles
    const vttPath = downloadSubtitles(episode.video_id);
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
    const extraction = await extractIntelligence(
      ai,
      l1Prompt,
      podcast,
      episode,
      transcript
    );
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
    await new Promise((r) => setTimeout(r, 2000));
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
    const dd = await deepDive(ai, l2Prompt, ep, transcript);
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
```

**Step 2: Test the script with a single podcast**

Temporarily edit `config/podcasts.json` to enable only one podcast (e.g., All-In). Run:

```bash
node scripts/extract-podcasts.js
```

Verify:
- It finds recent episodes from the channel
- Subtitles download correctly
- Gemini returns valid JSON with the expected structure
- Output files are created in the right locations

**Step 3: Test with all enabled podcasts**

Re-enable all podcasts in config. Run again. Check:
- All channels are scanned
- Deduplication works (previously extracted episodes are skipped)
- HIGH episodes get deep dives
- RSS entries are logged as skipped

**Step 4: Commit**

```bash
git add scripts/extract-podcasts.js
git commit -m "feat: add podcast intelligence extraction script"
```

---

### Task 4: Create the `/extract-podcasts` Skill

**Files:**
- Create: `~/.claude/skills/extract-podcasts/SKILL.md`

**Step 1: Write the skill file**

```markdown
---
name: extract-podcasts
description: Extract intelligence from podcast episodes on YouTube into the knowledge base
---

# Extract Podcasts

Extract structured intelligence from recent podcast episodes (last 7 days) on YouTube. Produces quotes with attribution, consensus/debate signals, founder/VC intent signals, and GCP competitive intelligence.

## Usage

```
/extract-podcasts
```

No arguments needed — reads podcast list from `~/brief-signal/config/podcasts.json`.

## What It Does

1. Reads podcast registry from `config/podcasts.json`
2. Scans each enabled YouTube channel for episodes from the last 7 days
3. Downloads auto-generated subtitles via `yt-dlp`
4. Sends transcripts to Gemini for structured intelligence extraction
5. HIGH-rated episodes (max 3) get automatic deep dives with timestamped segment analysis
6. Skips RSS-only podcasts with a log message

## How to Run

```bash
cd ~/brief-signal && node scripts/extract-podcasts.js
```

## Output Files

- **Knowledge base:** `~/skills/podcasts-knowledge-base-YYYY-MM-DD.md`
- **Raw data:** `~/info-agg/prompts/podcasts-raw-YYYY-MM-DD.json`
- **Quick reference:** `~/skills/podcasts-organized-YYYY-MM-DD.md`

## Managing Podcasts

Edit `~/brief-signal/config/podcasts.json` to add/remove/enable/disable podcasts. No code changes needed.

## Dependencies

- `yt-dlp` (brew install yt-dlp)
- `GOOGLE_API_KEY` environment variable
- Python 3 (for VTT parsing)
```

**Step 2: Commit**

```bash
git add ~/.claude/skills/extract-podcasts/SKILL.md
git commit -m "feat: add /extract-podcasts skill"
```

---

### Task 5: Integrate Podcasts into Briefing Generation

**Files:**
- Modify: `scripts/generate-briefing.js:21-51` (findKnowledgeBaseFiles function)
- Modify: `scripts/briefing-prompt.md` (add podcast source guidance)

**Step 1: Update `findKnowledgeBaseFiles()` in `generate-briefing.js`**

Add `podcasts-knowledge-base-` to the filter at line 25-26:

```javascript
// Current:
const match =
  f.startsWith("bookmarks-knowledge-base-") ||
  f.startsWith("playlist-knowledge-base-");

// Change to:
const match =
  f.startsWith("bookmarks-knowledge-base-") ||
  f.startsWith("playlist-knowledge-base-") ||
  f.startsWith("podcasts-knowledge-base-");
```

Add a third file lookup at lines 40-46:

```javascript
// Current:
const bookmarks = files.find((f) =>
  f.startsWith("bookmarks-knowledge-base-")
);
const playlist = files.find((f) =>
  f.startsWith("playlist-knowledge-base-")
);

const selected = [];
if (bookmarks) selected.push(bookmarks);
if (playlist) selected.push(playlist);

// Change to:
const bookmarks = files.find((f) =>
  f.startsWith("bookmarks-knowledge-base-")
);
const playlist = files.find((f) =>
  f.startsWith("playlist-knowledge-base-")
);
const podcasts = files.find((f) =>
  f.startsWith("podcasts-knowledge-base-")
);

const selected = [];
if (bookmarks) selected.push(bookmarks);
if (playlist) selected.push(playlist);
if (podcasts) selected.push(podcasts);
```

Update the sources footer line in the briefing prompt (line 144):

```markdown
// Current:
*Sources: {n} bookmarks, {n} videos from the AI content library. [Archive](/archive)*

// Change to:
*Sources: {n} bookmarks, {n} videos, {n} podcast episodes from the AI content library. [Archive](/archive)*
```

**Step 2: Update `scripts/briefing-prompt.md`**

Add a new section after "Content Curation" (after line 47) — "Podcast Source Guidance":

```markdown
## Podcast Source Guidance

Podcast sources provide opinion, analysis, and predictions — not news. Handle them differently from bookmarks and videos:

**Attribution:** Attribute takes to speakers, not podcasts. Say "Chamath noted on All-In that..." not "All-In reported that..." Podcasts don't report — people on podcasts share perspectives.

**Link format:** `[Speaker on Podcast Name (Nmin, timestamp)](youtube-url)` — e.g., `[Chamath on All-In (62min, 12:34)](https://youtube.com/watch?v=xxx)`

**Weaving in signal:** Podcast insights should enrich existing sections, not stand alone. A VC quote about infrastructure spending goes in Big Picture. A founder's tool stack revelation goes in Builder's Corner. A specific company move goes in Founder Watch.

**Consensus/debate patterns:** When multiple podcast hosts or guests independently make the same point, that's high-value signal. Call it out: "Three separate VCs flagged concerns about agent infrastructure costs this week." Disagreements are equally valuable — they show where the market is undecided.

**Deep dive references:** For HIGH-signal episodes with deep dives, you can reference the full episode with a "go deeper" link: "For the full debate on agent infrastructure, [listen to All-In E213 (62min)](url)."

**What NOT to do with podcast signal:**
- Don't treat opinions as news ("VCs say X" is opinion, not fact)
- Don't over-index on one person's take — balance with other sources
- Don't quote lengthy dialogue — pick the sharpest one-liner
- Don't use podcast signal in Quick Hits (those should be short, factual items)
```

**Step 3: Verify the changes work**

Run `node scripts/generate-briefing.js` and confirm it:
- Finds the podcasts knowledge base file (if one exists)
- Includes it in the sources count
- Doesn't crash if no podcast file exists

**Step 4: Commit**

```bash
git add scripts/generate-briefing.js scripts/briefing-prompt.md
git commit -m "feat: integrate podcast knowledge base into briefing generation"
```

---

### Task 6: Set Up Cron Jobs

**Files:**
- Modify: `scripts/generate-weekly.sh` (simplify to briefing-only)
- Create: 3 Claude Code cron jobs

**Step 1: Set up the podcast extraction cron job**

Using Claude Code cron:

```bash
claude cron create \
  --name "extract-podcasts" \
  --schedule "0 19 * * 0" \
  --command "/extract-podcasts" \
  --working-directory ~/brief-signal
```

This runs every Sunday at 7:00 PM.

**Step 2: Set up the bookmark extraction cron job**

```bash
claude cron create \
  --name "extract-bookmarks" \
  --schedule "0 19 * * 0" \
  --command "/extract-bookmarks" \
  --working-directory ~/info-agg
```

**Step 3: Set up the playlist extraction cron job**

```bash
claude cron create \
  --name "extract-playlist" \
  --schedule "0 19 * * 0" \
  --command "/extract-playlist https://www.youtube.com/playlist?list=PL1FeClOi-gXpoHHLPfOgeGltGMNWY9Wjk" \
  --working-directory ~/info-agg
```

**Step 4: Update `generate-weekly.sh`**

Simplify the script: remove Stages 1 and 2 (bookmarks and playlist extraction are now cron jobs). Keep Stage 3 (briefing generation) and Stage 4 (PR creation). Update the PR body to reference all three source types.

Update the PR body template to include podcasts:

```bash
### Pipeline stages
- **Bookmarks:** Extracted via cron (check ~/skills/ for latest)
- **Playlist:** Extracted via cron (check ~/skills/ for latest)
- **Podcasts:** Extracted via cron (check ~/skills/ for latest)
- **Briefing:** Generated successfully
```

**Step 5: Verify cron jobs are registered**

```bash
claude cron list
```

Confirm all three extraction jobs and the briefing generation are scheduled correctly.

**Step 6: Commit**

```bash
git add scripts/generate-weekly.sh
git commit -m "refactor: simplify generate-weekly.sh, extractions now run as cron jobs"
```

---

### Task 7: Update Documentation

**Files:**
- Modify: `GEMINI.md` or project documentation
- Modify: `FOR_SIMON.md` (if it exists)

**Step 1: Update project documentation**

Add a "Podcast Pipeline" section covering:
- How podcasts are configured (`config/podcasts.json`)
- How extraction works (`/extract-podcasts` → `scripts/extract-podcasts.js`)
- The two-level extraction (Level 1 for all, Level 2 deep dive for HIGH)
- How podcast signal flows into the briefing
- How to add/remove podcasts (edit config, no code changes)
- Cron schedule (Sunday 7 PM extractions, 9 PM briefing)

**Step 2: Update FOR_SIMON.md**

Add an explanation of the podcast pipeline in plain language:
- What it does and why it's different from bookmarks/playlists
- How the GCP intelligence extraction works
- What HIGH/MEDIUM/LOW signal ratings mean
- How deep dives work and when they trigger

**Step 3: Commit**

```bash
git add -A
git commit -m "docs: add podcast pipeline documentation"
```

---

### Task 8: End-to-End Test

**Step 1: Clean test run**

Delete any previous podcast output files (if they exist from testing):

```bash
rm -f ~/skills/podcasts-knowledge-base-*.md
rm -f ~/skills/podcasts-organized-*.md
rm -f ~/info-agg/prompts/podcasts-raw-*.json
```

**Step 2: Run the full extraction**

```bash
cd ~/brief-signal && node scripts/extract-podcasts.js
```

Verify:
- [ ] Script completes without errors
- [ ] `~/skills/podcasts-knowledge-base-YYYY-MM-DD.md` exists and has structured entries
- [ ] `~/info-agg/prompts/podcasts-raw-YYYY-MM-DD.json` exists and is valid JSON
- [ ] `~/skills/podcasts-organized-YYYY-MM-DD.md` exists with signal rating tables
- [ ] At least some episodes have notable quotes with timestamps
- [ ] HIGH episodes have deep dive sections
- [ ] RSS podcasts are logged as skipped

**Step 3: Run briefing generation**

```bash
cd ~/brief-signal && node scripts/generate-briefing.js
```

Verify:
- [ ] Script finds the podcast knowledge base file
- [ ] Generated briefing includes podcast-sourced insights
- [ ] Podcast quotes are attributed to speakers (not "All-In reported...")
- [ ] Sources footer includes podcast episode count

**Step 4: Review quality**

Read the generated briefing and check:
- [ ] Podcast signal is woven into existing sections (not isolated)
- [ ] GCP relevance assessments make sense
- [ ] No duplicate content between podcast and bookmark/playlist sources

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: podcast sources pipeline complete — end-to-end verified"
```

---

## Summary

| Task | What | Est. Time |
|------|------|-----------|
| 1 | Create `config/podcasts.json` + verify handles | 15 min |
| 2 | Write extraction + deep dive prompts | 10 min |
| 3 | Build `scripts/extract-podcasts.js` | 30 min |
| 4 | Create `/extract-podcasts` skill | 5 min |
| 5 | Integrate into `generate-briefing.js` + prompt | 15 min |
| 6 | Set up cron jobs, simplify `generate-weekly.sh` | 15 min |
| 7 | Update documentation | 10 min |
| 8 | End-to-end test | 20 min |

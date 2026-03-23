# FOR SIMON: How Brief Signal Works (and What You Built)

Hey Simon. This is your learning document for Brief Signal -- the thing that keeps Google Cloud sales reps from walking into founder meetings sounding clueless. Let's walk through it.

---

## What This Project Does and Why

Brief Signal is a weekly 5-minute AI market briefing. Your audience is Google Cloud startup sales reps -- people who sell cloud infrastructure to AI-native founders. The problem: founders live in a world of podcasts, Twitter threads, and YouTube deep dives. Sales reps don't have time to follow all of that. So you built a pipeline that reads what founders read, watches what they watch, listens to what they listen to, and distills it into one briefing every Monday morning.

Three sources feed the briefing:
1. **X bookmarks** -- tweets, threads, articles you've saved that founders are talking about
2. **YouTube playlist** -- short-form AI videos from your curated playlist
3. **Podcasts** -- the newest and most interesting source (more on this below)

Think of it like a kitchen. The three extractors are prep cooks chopping ingredients (raw signal). The briefing generator is the head chef combining everything into a dish (the final briefing). The website is the plate it's served on.

---

## The Podcast Pipeline: How It Works

The podcast extractor (`scripts/extract-podcasts.js`) is the most sophisticated piece of the system. Here's the flow, step by step.

### Step 1: Read the Menu

The script reads `config/podcasts.json` -- a registry of 21 podcasts. Each entry says what the podcast is called, where it lives (YouTube channel or RSS feed), and whether it's enabled. Right now, 16 YouTube-hosted podcasts are enabled. The 5 RSS-only ones (Acquired, AI Daily Brief, etc.) are registered but disabled -- placeholders for when you build the RSS pipeline.

### Step 2: Check What's New

For each enabled podcast, the script calls `yt-dlp` (a command-line tool that talks to YouTube) to grab the 10 most recent uploads from that channel. Then it cross-references against a deduplication list -- the last 4 weeks of raw extraction files. If an episode was already processed last week, it skips it.

This is like checking your fridge before going to the grocery store. No point buying milk if you already have milk.

### Step 3: Grab the Transcript

For each new episode, `yt-dlp` downloads the auto-generated English subtitles (VTT format). The script then parses the VTT file into clean plaintext -- stripping timestamps, HTML tags, and duplicate lines. YouTube's auto-captions repeat lines across overlapping time windows, so the deduplication step here is important.

If an episode has no subtitles (rare for English content, but it happens), the script logs a warning and moves on. It never crashes on a single episode failure.

### Step 4: Level 1 Extraction (Every Episode)

This is where the AI magic happens. The transcript gets sent to **Gemini 2.5 Flash** with a carefully crafted system prompt (`scripts/podcast-extraction-prompt.md`). Gemini returns a structured JSON object containing:

- **Notable quotes** -- verbatim, with speaker names and timestamps
- **Consensus signals** -- things hosts/guests treat as obvious ("everyone agrees agents are the next platform shift")
- **Debate points** -- where smart people disagree, with each speaker's position
- **Intent signals** -- what founders say they're building, buying, or evaluating
- **GCP intelligence** -- the secret sauce (see next section)
- **Signal rating** -- HIGH, MEDIUM, or LOW

The prompt is opinionated on purpose. It tells Gemini: "Precision matters more than volume. Empty arrays are fine for low-signal episodes." A sparse extraction of a boring episode is far more valuable than a padded one that wastes a sales rep's time.

### Step 5: Level 2 Deep Dive (HIGH Episodes Only)

Episodes rated HIGH get a second Gemini pass using a different prompt (`scripts/podcast-deep-dive-prompt.md`). Maximum 3 per week -- this keeps costs and processing time reasonable.

The deep dive adds:
- **Timestamped segment map** -- the episode broken into 5-10 topic blocks, each summarized. LOW segments (intros, ads, banter) get a one-liner. MEDIUM and HIGH segments get expanded with key quotes, speaker positions, and a specific sales relevance takeaway.
- **Companies/products mentioned** -- every named entity, so a rep meeting with Company X tomorrow can search for it
- **Key numbers** -- dollar figures, growth rates, user counts with timestamps

Think of Level 1 as reading the back cover of a book. Level 2 is reading the highlighted passages with margin notes.

### Step 6: Write the Output

Three files get written:
1. **Raw JSON** (`~/info-agg/prompts/podcasts-raw-YYYY-MM-DD.json`) -- the structured data, used for deduplication next week
2. **Knowledge base** (`~/skills/podcasts-knowledge-base-YYYY-MM-DD.md`) -- a formatted markdown file that the briefing generator reads
3. **Organized tables** (`~/skills/podcasts-organized-YYYY-MM-DD.md`) -- a quick-reference view sorted by signal rating

---

## GCP Intelligence: The Secret Sauce

The `gcp_intelligence` object in every extraction is the most valuable part for the sales team. The extraction prompt specifically hunts for six categories:

| Category | What It Catches | Why Sales Cares |
|----------|----------------|-----------------|
| **Migration signals** | "We moved from AWS to..." | Active deal opportunity |
| **Pain points** | "Cloud costs are killing us" | Opening for a pricing conversation |
| **Buying criteria** | "We chose based on GPU availability" | Tells reps what to lead with |
| **Competitive mentions** | "AWS Bedrock vs. Vertex AI" | Know the landscape before the meeting |
| **Budget data** | "$2M/year on compute" | Sizes the deal |
| **Undecided moments** | "We're still evaluating..." | Highest value -- these are open deals |

The prompt rates GCP relevance independently from overall signal rating. An episode can be HIGH signal overall (great founder insights about hiring) but LOW GCP relevance (nothing about infrastructure). This distinction matters because the briefing uses both ratings differently.

---

## How to Manage Podcasts

This is the easy part. To add a new podcast:

1. Open `config/podcasts.json`
2. Add an entry like this:
```json
{
  "name": "New Podcast Name",
  "source": "youtube",
  "channelHandle": "@ChannelHandle",
  "category": "AI/Builder",
  "enabled": true
}
```
3. That's it. No code changes. The next Sunday run picks it up automatically.

To disable a podcast, set `"enabled": false`. To add an audio-only podcast as a placeholder for later, use `"source": "rss"` and set `"enabled": false` with a note explaining why.

The `category` field is for your own organization -- it shows up in the output tables but doesn't affect extraction logic.

---

## How It Fits Into the Weekly Automation

Every Sunday evening, `scripts/generate-weekly.sh` orchestrates the full pipeline:

```
Sunday 7:00 PM (parallel):
  [X bookmarks]  ──┐
  [YouTube playlist] ──┼──→  All three run simultaneously
  [Podcasts]      ──┘         Each writes a knowledge base file

Sunday 9:00 PM (sequential):
  [Briefing generator] ──→ Reads all 3 knowledge base files
                        ──→ Gemini generates the briefing
                        ──→ Creates a PR on GitHub

Monday morning:
  [You] ──→ Review PR, edit in GitHub web UI, merge
  [GitHub Actions] ──→ Builds site, deploys to Pages
```

The three extractions are fully independent. If bookmarks fail (Twitter is down, cookies expired), podcasts and playlists still run. The briefing generator gracefully handles missing sources -- if no podcast knowledge base file exists within 14 days, it just generates from the other two sources.

This fault tolerance is a professional engineering pattern worth internalizing: **never let one failure take down the whole system**. Each stage logs its own warnings, and the pipeline keeps moving.

---

## The Technologies and Why

| Tool | What It Does | Why This One |
|------|-------------|--------------|
| **yt-dlp** | Downloads video metadata and subtitles from YouTube | Free, open source, actively maintained. The standard tool for YouTube data extraction. |
| **Gemini 2.5 Flash** | Reads transcripts and extracts structured intelligence | Fast, cheap, good at following detailed JSON schemas. The Flash model handles long transcripts (1-hour podcast = ~15K words) within its context window without issue. |
| **Node.js** | Runs the extraction and briefing scripts | Matches the rest of the project (build.js, audio pipeline). Keeps the stack consistent. |
| **VTT parsing (pure JS)** | Converts YouTube subtitle files to clean text | No external dependency needed. The format is simple enough that a 15-line parser handles it. |

Why not Python for the extraction script? Consistency. The rest of Brief Signal is Node.js. Mixing languages in a small project creates friction -- different dependency management, different runtime requirements, harder to debug. Python enters the picture later when you build the RSS/whisper pipeline (mlx-whisper is Python-only).

---

## Potential Pitfalls

**Rate limits.** The script adds deliberate delays between API calls (1 second between channels, 2 seconds between Gemini calls). If you add many more podcasts, you might hit YouTube's rate limits or Gemini's quota. The current 16 channels with ~2 second gaps work fine.

**Channels without subtitles.** Some YouTube uploads (especially live streams or very new content) won't have auto-generated captions yet. The script skips these with a warning. If a podcast consistently lacks subtitles, it's a sign they might be better served by the RSS/whisper pipeline.

**The flat-playlist dateafter bug.** This is documented in the code and worth understanding. `yt-dlp`'s `--dateafter` flag doesn't work with `--flat-playlist` because flat mode doesn't fetch upload dates (they show as "NA"). The workaround: cap results to 10 per channel with `--playlist-end 10` and rely on deduplication against previous runs. No podcast publishes more than 10 episodes per week, so this is safe.

**Gemini JSON parsing failures.** Sometimes Gemini wraps its JSON response in markdown code fences (`` ```json ... ``` ``). The `stripCodeFences` function handles this, but occasionally the response is malformed in other ways. The script logs a warning and skips that episode rather than crashing.

**Context window limits.** Very long podcast episodes (2+ hours) might push the transcript beyond Gemini Flash's effective context window. The transcript still gets sent, but extraction quality may degrade for the later portions. If you notice this, consider truncating transcripts or switching to Gemini Pro for those episodes.

---

## The Most Important Concept

**Structured extraction beats summarization.** The whole podcast pipeline is built around getting Gemini to return structured JSON, not prose summaries. This is a deliberate design choice. Structured data can be sorted, filtered, searched, and recombined. A prose summary is a dead end -- you can read it, but you can't do anything else with it. The briefing generator can look at the `gcp_intelligence.relevance` field across 30 episodes and surface only the ones that matter. It can cross-reference `companies_mentioned` against a sales rep's account list. None of that works with freeform text.

This pattern -- **extract structured data first, generate prose later** -- shows up everywhere in good engineering. Keep it in mind for future projects.

---

## What to Build Next

**RSS/whisper pipeline for audio-only podcasts.** The design is already written (see `docs/plans/2026-03-23-podcast-sources-design.md`, "Follow-Up" section). The approach:

1. Use `mlx-whisper` (free, runs locally on Apple Silicon) to transcribe audio from RSS feeds
2. Scrape Acquired.fm's website transcripts directly (they publish speaker-labeled transcripts -- higher quality than any transcription tool)
3. Let Gemini infer speaker names from unlabeled transcripts (hosts introduce themselves, reference each other by name)
4. Feed everything into the same extraction prompt

This unlocks 5 more podcasts (Acquired, AI Daily Brief, 10/10 GTM, Rethinking with Adam Grant, and potentially Stratechery) without paying for any transcription API. The design decision to avoid paid services like Deepgram ($6-10/mo) or Podscan ($100/mo) was deliberate -- the free/local approach is good enough for 3-5 podcasts, and you can always upgrade later if quality is insufficient.

Build this when you notice you're consistently missing signal from audio-only sources. If the YouTube-only coverage feels complete, there's no rush.

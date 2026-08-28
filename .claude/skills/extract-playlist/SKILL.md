---
name: extract-playlist
description: Extract all videos from a YouTube playlist into the knowledge base
---

# Extract YouTube Playlist

Extract all videos from a YouTube playlist, summarize each, and save to the knowledge base in the same format as X bookmarks extraction.

## Arguments

The user provides a YouTube playlist URL as the argument:
```
/extract-playlist https://www.youtube.com/playlist?list=PLxxxxxx
```

## Context

Output files follow the same conventions as `/extract-bookmarks`:
- **Knowledge base:** `/Users/simonbrief/skills/playlist-knowledge-base-YYYY-MM-DD.md` (organized by topic with summaries)
- **Quick reference:** `/Users/simonbrief/skills/playlist-organized-YYYY-MM-DD.md` (tables with links)
- **Raw data:** `/Users/simonbrief/info-agg/prompts/playlist-raw-YYYY-MM-DD.json`
- **Sources index:** `/Users/simonbrief/info-agg/SOURCES.md`

**IMPORTANT:** All skill/knowledge base markdown files go to `/Users/simonbrief/skills/` (the global skills folder). Raw JSON data goes to `/Users/simonbrief/info-agg/prompts/`. Never write knowledge base files to `~/info-agg/skills/`.

## Topic Assignment (dynamic)

Topics are NOT a fixed list. They grow organically with the content.
Uses the same system as `/extract-bookmarks` — both skills share one evolving topic set.

**Step A: Load existing topics.**
Read the most recent `/Users/simonbrief/skills/bookmarks-knowledge-base-*.md` AND `/Users/simonbrief/skills/playlist-knowledge-base-*.md`
and collect every `## Topic Name` heading. These are your starting palette — reuse them when content fits.

**Step B: Assign topics to each video.**
For each video, pick the best existing topic OR create a new one. Use these rules:

- **Reuse first.** If an existing topic fits well, use it. Don't create near-duplicates
  (e.g., don't create "AI Coding Tools" if "Claude Code & AI Dev Tools" already exists).
- **Create when needed.** If a video clearly doesn't fit any existing topic, create a
  new descriptive topic. Name it at the same level of specificity as existing topics
  (e.g., "Health & Fitness", "Open Source Projects", "Data Engineering").
- **Anchor categories.** If nothing specific fits, fall back to one of these broad anchors:
  - AI & Development
  - Business & Strategy
  - Creative & Design
  - Learning & Growth
  - Tools & Productivity
  - Industry & Trends
- **Misc is a last resort.** Aim for <5% of content in Misc. If Misc is growing, that's a
  signal to create a new topic instead.
- **One or two topics per video.** Most get one. Use two only when genuinely dual-topic.

## Workflow

### Step 1: Get playlist metadata

Run yt-dlp to list all videos in the playlist:
```bash
yt-dlp --flat-playlist --print "%(id)s|||%(title)s|||%(channel)s|||%(duration)s|||%(url)s" "PLAYLIST_URL"
```

Parse the output — each line is one video with fields separated by `|||`.
Duration is in seconds. Convert to HH:MM:SS for display.

If `--flat-playlist` returns `NA` for duration, that's normal — duration will be fetched per-video in Step 3.

### Step 2: Filter by upload date (CRITICAL — do not skip)

The playlist is a curated reading list that accumulates over time. Many videos in it are months or years old. The weekly briefing needs *this week's* signal, not the long tail of the playlist.

**For each video ID from Step 1, fetch the upload date:**
```bash
yt-dlp --print "%(id)s|||%(upload_date)s|||%(title)s" "https://www.youtube.com/watch?v=VIDEO_ID"
```

(Note: `dateafter` and `--match-filters "upload_date >= ..."` silently fail in some yt-dlp builds — see `feedback_ytdlp_flat_playlist.md`. Always filter in code, not via yt-dlp flags.)

**Filter rule:** Keep only videos with `upload_date` within the last **14 days**. Drop anything older, regardless of whether it's in the existing KB. The strict cutoff is 7 days, but allow 14 days as a buffer for video uploads that lagged the actual event/announcement.

**Sanity check before proceeding:** Print the count of videos surviving the filter. If it's zero, that's a normal quiet week — skip ahead to **Step 3b** and write the empty KB file. (This instruction previously said "stop — don't generate an empty KB", which is what blocked the 2026-08-02 pipeline run: no file meant the freshness guard could not tell a quiet week from a crash.) If it's suspiciously high (>30), something's wrong with the date parsing.

### Step 3: Check what already exists

Read the most recent `/Users/simonbrief/info-agg/prompts/playlist-raw-*.json` file (if any) and collect all video IDs that have already been extracted. Skip duplicates — only process NEW videos (from the date-filtered set in Step 2).

Also read the most recent `/Users/simonbrief/skills/playlist-knowledge-base-*.md` to understand what topics have been covered.

### Step 3b: If there are no new items — STILL WRITE THE FILE

**This is not optional, and it is the single most common way this stage breaks
the whole pipeline.**

A week with nothing new is a *successful* run that found nothing. But the weekly
pipeline's freshness guard (`check_kb_fresh` in `scripts/generate-weekly.sh`)
can only prove this stage ran by checking that today's knowledge-base file
exists and its mtime is newer than the pipeline start. If you exit early without
writing, "quiet week" is indistinguishable from "crashed", and the guard aborts
the entire briefing run.

That is exactly what happened on 2026-08-02: a dry playlist blocked the run, it
fell back to a hand-driven Stage 4 with 2 sources instead of 3, and the edition
missed its biggest stories.

So when there are zero new items, write the dated knowledge-base file anyway,
containing only the header plus this exact line:

```
> **Status:** EMPTY — no new items this week.
```

The marker is byte-for-byte identical across every extractor; `generate-briefing.js`
and `signal-digest.js` both key off it to report "ran, nothing new" instead of
treating the source as broken, and to keep it out of the briefing's *Sources:*
footer. Do not reword it. Never delete or overwrite a file another stage wrote
this run — if it already exists, leave it and move on.

### Step 4: Download subtitles for new videos

For each new video, download auto-generated English subtitles:
```bash
yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt \
  -o "/Users/simonbrief/info-agg/extractions/%(id)s" "VIDEO_URL"
```

This saves VTT files to `extractions/<video-id>.en.vtt`.

If a video has no auto-generated subtitles, note it and continue — summarize from title/description only.

Also get per-video metadata if duration was missing:
```bash
yt-dlp --skip-download --print "%(duration)s|||%(upload_date)s|||%(description).500s" "VIDEO_URL"
```

### Step 5: Parse VTT to clean text

For each VTT file, use Python to strip timestamps and deduplicate overlapping lines:

```bash
python3 -c "
import re, sys
with open(sys.argv[1]) as f:
    content = f.read()
# Remove WEBVTT header, timestamps, positioning
lines = []
seen = set()
for line in content.split('\n'):
    line = line.strip()
    if not line or line == 'WEBVTT' or line.startswith('Kind:') or line.startswith('Language:'):
        continue
    if re.match(r'^\d{2}:\d{2}', line) or re.match(r'^\d+$', line):
        continue
    # Remove HTML tags
    clean = re.sub(r'<[^>]+>', '', line)
    if clean and clean not in seen:
        seen.add(clean)
        lines.append(clean)
print(' '.join(lines))
" "extractions/VIDEO_ID.en.vtt"
```

Store the clean transcript text for summarization.

### Step 6: Summarize each video

For each video with a transcript, generate:
- **3-5 key takeaways** (specific, actionable)
- **Topic categorization** (1-2 topics using the dynamic topic system above)
- **Action items** (tools to try, strategies to implement, content ideas)
- **Type classification:** Tutorial, Talk, Interview, Demo, Discussion, etc.

For videos without transcripts, summarize from title and description only — note as "metadata only."

### Step 6b: Signal Rating (REQUIRED on every video)

Every entry MUST carry a relevance grade in exactly this shape — the same one
the podcast and bookmark extractors write, so one parser reads all sources:

```
- **GCP Relevance:** HIGH — Discusses evaluating cloud providers for inference cost.
```

Grade for **a Google Cloud sales rep preparing for founder meetings**, judging
each video on its own without ranking it against the rest of the batch.

- **HIGH** — Cloud infrastructure decisions, migration patterns, spend/pricing
  data, buying criteria, model routing or eval decisions. **Any first-party
  content from Google or a named competitor** (Google/GoogleCloud/DeepMind, AWS,
  Microsoft/Azure, OpenAI, Anthropic, Meta, Mistral, xAI, DeepSeek, Qwen,
  Moonshot) — an official channel's own announcement is never LOW.
- **MEDIUM** — General AI/tech signal a rep could reference: launches, funding,
  market shifts, builder patterns. Real, but not tied to a cloud decision.
- **LOW** — Tangential to cloud and AI building. Still write the full entry —
  LOW means "don't surface it," never "drop it."

### Step 7: Save output files

#### 6a: Raw JSON (`/Users/simonbrief/info-agg/prompts/playlist-raw-YYYY-MM-DD.json`)

Array of objects, one per video:
```json
{
  "id": "1",
  "source": "youtube",
  "video_id": "dQw4w9WgXcQ",
  "author": "Channel Name",
  "title": "Video Title",
  "date": "2026-02-20",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "duration": "12:34",
  "duration_min": 13,
  "text": "First 300 chars of transcript...",
  "full_transcript": "Full cleaned transcript or null",
  "has_external_link": false,
  "external_url": null,
  "extracted_at": "2026-02-24T12:00:00Z",
  "topics": ["Claude Code & AI Dev Tools", "Learning Resources"]
}
```

Notes:
- `id` is sequential (string), starting from "1"
- `source` is always `"youtube"`
- `video_id` is the YouTube video ID (for deduplication)
- `text` is first 300 chars of transcript (or title if no transcript)
- `full_transcript` is the full cleaned transcript text, or `null` if unavailable
- `duration_min` is duration in minutes, rounded up (integer). Used by `/generate-briefing` for time labels.
- Use `null` for missing fields, never empty strings

#### 6b: Knowledge base markdown (`/Users/simonbrief/skills/playlist-knowledge-base-YYYY-MM-DD.md`)

Format — match the bookmarks knowledge base style:

```markdown
# YouTube Playlist Knowledge Base

> **Source:** [Playlist Name](playlist-url)
> **Extracted:** YYYY-MM-DD
> **Total videos:** N (M without transcripts)

---

## Table of Contents
1. [Topic 1](#topic-1)
2. [Topic 2](#topic-2)
...

---

## Topic 1

### #1 — Video Title
**Channel:** Channel Name | **Duration:** 12:34 | **Date:** Feb 20
**Link:** [Watch](https://www.youtube.com/watch?v=...)
**Type:** Tutorial

Summary paragraph with key insights.

**Key Takeaways:**
- Takeaway 1
- Takeaway 2
- Takeaway 3

- **GCP Relevance:** HIGH|MEDIUM|LOW — one-sentence reason

---

## Action Items

- [ ] Tool/technique to try
- [ ] Strategy to implement
```

#### 6c: Quick reference table (`/Users/simonbrief/skills/playlist-organized-YYYY-MM-DD.md`)

```markdown
# YouTube Playlist — Organized by Topic

> **Source:** [Playlist Name](playlist-url)
> **Extracted:** YYYY-MM-DD
> **Total videos:** N

---

## Topic Name

| # | Channel | Title | Duration | Link |
|---|---------|-------|----------|------|
| 1 | Channel Name | **Video Title** — Brief description | 12:34 | [Watch](url) |
```

### Step 8: Update SOURCES.md

Add or update the "YouTube Playlists" section in SOURCES.md:

```markdown
## YouTube Playlists

| Skill File | Playlist | Videos | Topics |
|------------|----------|--------|--------|
| `playlist-knowledge-base-YYYY-MM-DD.md` | [Playlist Name](url) | N videos | Topic1, Topic2, ... |

**Raw data:** `/Users/simonbrief/info-agg/prompts/playlist-raw-YYYY-MM-DD.json`
```

Update the Extraction Stats table to include playlist videos count.

## Output Format

After extraction, report:
```
## Playlist Extraction Complete
- Playlist: [Name] (N videos)
- New videos extracted: X
- Already in knowledge base: Y
- Videos without transcripts: Z
- Topics covered: [list]

### Videos Extracted:
1. [Channel] — [Title] (Duration) -> [Topic]
2. ...

### Action Items:
- [ ] Try [tool/technique]
- [ ] Implement [strategy]
```

## Important Notes

- `yt-dlp` must be installed (`brew install yt-dlp` if missing)
- Python 3 is required for VTT parsing
- Auto-generated subtitles are not always available (music videos, short clips)
- Some videos may be private/deleted — skip and note them
- `--flat-playlist` is fast (no downloads), use it for the initial scan
- Always create NEW output files with current date (don't overwrite previous extractions)
- Rate limiting: add a 1-second delay between yt-dlp calls to avoid throttling
- If playlist is very large (50+ videos), process in batches of 10 and report progress

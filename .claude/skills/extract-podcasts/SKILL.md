---
name: extract-podcasts
description: Extract intelligence from podcast episodes on YouTube into the knowledge base
---

# Extract Podcasts

When this skill is invoked, run the podcast extraction pipeline.

## Step 1: Run the extraction script

```bash
cd ~/brief-signal && node scripts/extract-podcasts.js
```

This script:
1. Reads `config/podcasts.json` (16 YouTube channels + 5 disabled RSS placeholders)
2. Scans each enabled channel for recent uploads (most recent 10)
3. Filters out clips/shorts/promos (skips anything under 20 minutes)
4. Deduplicates against previous extractions (last 4 weeks of `podcasts-raw-*.json` files)
5. Downloads auto-generated subtitles via `yt-dlp`
6. Sends each transcript to Gemini 2.5 Flash for structured intelligence extraction (quotes with speaker attribution, consensus/debate signals, founder/VC intent signals, GCP competitive intelligence)
7. Rates each episode HIGH/MEDIUM/LOW based on GCP sales relevance
8. Runs a second deep dive pass on up to 3 HIGH-rated episodes (timestamped segments with per-segment sales relevance)
9. Writes three output files

Requires: `GOOGLE_API_KEY` env var and `yt-dlp` installed.

Expected runtime: ~2-3 minutes per episode. 16 channels × 1-3 new episodes each = ~30-90 minutes total.

## Step 2: Verify output

Check that these files were created:
- `~/skills/podcasts-knowledge-base-YYYY-MM-DD.md` — the main knowledge base (used by briefing generator)
- `~/info-agg/prompts/podcasts-raw-YYYY-MM-DD.json` — raw structured JSON (used for deduplication)
- `~/skills/podcasts-organized-YYYY-MM-DD.md` — summary tables by signal rating

Report the episode count, signal rating breakdown, and number of deep dives to the user.

## Step 3: Handle errors

- If a single channel fails: the script logs a warning and continues. Report which channels failed.
- If Gemini returns a 503: the script catches it and skips that episode. Note it in the report.
- If no new episodes are found: this is normal if it ran recently. The dedup is working.

## Managing Podcasts

To add/remove/disable podcasts, edit `~/brief-signal/config/podcasts.json`. Each YouTube entry needs a verified `@handle`. No code changes needed.

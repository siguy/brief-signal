# RSS/Whisper Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add RSS podcast support to Brief Signal so audio-only podcasts (Acquired, AI Daily Brief, 10/10 GTM, Adam Grant) get extracted alongside YouTube podcasts, using mlx-whisper for local transcription and Acquired.fm scraping for Acquired's speaker-labeled transcripts.

**Architecture:** A Python script (`scripts/extract-rss-podcasts.py`) reads `config/podcasts.json`, processes enabled RSS entries through two code paths: (1) Acquired.fm transcript scraping, (2) RSS feed → MP3 download → mlx-whisper transcription. Both paths send transcripts to Gemini via the existing extraction prompt, then merge output into the same knowledge base files the JS pipeline writes.

**Tech Stack:** Python 3, mlx-whisper (Apple Silicon), feedparser, requests, @google/genai (via google-genai Python SDK), existing Gemini prompts

**Design doc:** `docs/plans/2026-03-23-podcast-sources-design.md` (Follow-Up: RSS/Whisper section)

---

### Task 1: Install Dependencies and Update Config

**Files:**
- Modify: `config/podcasts.json` (add RSS URLs, enable podcasts)

**Step 1: Install Python dependencies**

```bash
pip3 install mlx-whisper feedparser google-genai requests beautifulsoup4
```

- `mlx-whisper`: Local transcription on Apple Silicon (downloads `large-v3-turbo` model on first run, ~3 GB)
- `feedparser`: RSS feed parsing
- `google-genai`: Gemini API (same SDK the JS pipeline uses, Python version)
- `requests` + `beautifulsoup4`: HTTP + HTML parsing for Acquired.fm scraping

**Step 2: Update `config/podcasts.json` with RSS URLs**

Update the RSS entries to have real feed URLs and enable them (except Stratechery):

```json
{
  "name": "Acquired",
  "source": "rss",
  "rssUrl": "https://feeds.transistor.fm/acquired",
  "transcriptUrl": "https://www.acquired.fm/episodes/",
  "category": "Deep Dive",
  "enabled": true,
  "note": "Scrape transcript from acquired.fm — speaker-labeled, highest quality"
},
{
  "name": "AI Daily Brief",
  "source": "rss",
  "rssUrl": "https://anchor.fm/s/f7cac464/podcast/rss",
  "category": "AI/News",
  "enabled": true
},
{
  "name": "10/10 GTM",
  "source": "rss",
  "rssUrl": "https://anchor.fm/s/751173b0/podcast/rss",
  "category": "GTM",
  "enabled": true
},
{
  "name": "Rethinking with Adam Grant",
  "source": "rss",
  "rssUrl": "https://feeds.acast.com/public/shows/675858676d1777b3683ec351",
  "category": "Leadership",
  "enabled": true
}
```

Keep Stratechery as `"enabled": false` — paywalled, not worth the complexity.

**Step 3: Verify RSS feeds are accessible**

```bash
python3 -c "
import feedparser
feeds = {
    'Acquired': 'https://feeds.transistor.fm/acquired',
    'AI Daily Brief': 'https://anchor.fm/s/f7cac464/podcast/rss',
    '10/10 GTM': 'https://anchor.fm/s/751173b0/podcast/rss',
    'Adam Grant': 'https://feeds.acast.com/public/shows/675858676d1777b3683ec351',
}
for name, url in feeds.items():
    feed = feedparser.parse(url)
    if feed.entries:
        ep = feed.entries[0]
        print(f'{name}: OK — latest: {ep.title[:60]}')
    else:
        print(f'{name}: FAILED — no entries')
"
```

Expected: All 4 feeds return recent episodes.

**Step 4: Commit**

```bash
git add config/podcasts.json
git commit -m "feat: add RSS feed URLs and enable audio-only podcasts"
```

---

### Task 2: Write the Acquired.fm Transcript Scraper

**Files:**
- Create: `scripts/extract-rss-podcasts.py` (start with Acquired scraping only)

**Step 1: Write the Acquired scraper function**

The scraper:
1. Fetches the RSS feed to get recent episode URLs
2. For each episode URL, fetches the page HTML
3. Parses `div.rich-text-block-6.w-richtext p` elements to extract speaker-labeled transcript
4. Speaker format in HTML: `SpeakerName: dialogue text` (plain text in `<p>` tags)

```python
def scrape_acquired_transcript(episode_url):
    """Scrape speaker-labeled transcript from acquired.fm episode page."""
    resp = requests.get(episode_url, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # Transcript lives in div.rich-text-block-6.w-richtext
    container = soup.select_one("div.rich-text-block-6.w-richtext")
    if not container:
        return None

    paragraphs = [p.get_text(strip=True) for p in container.find_all("p") if p.get_text(strip=True)]
    return "\n\n".join(paragraphs)
```

**Step 2: Test the scraper against a real Acquired episode**

```bash
python3 -c "
import requests
from bs4 import BeautifulSoup
resp = requests.get('https://www.acquired.fm/episodes/costco', timeout=30)
soup = BeautifulSoup(resp.text, 'html.parser')
container = soup.select_one('div.rich-text-block-6.w-richtext')
if container:
    paras = [p.get_text(strip=True) for p in container.find_all('p') if p.get_text(strip=True)]
    print(f'Paragraphs: {len(paras)}')
    for p in paras[:5]:
        print(f'  {p[:120]}')
else:
    print('Transcript container not found — check selector')
"
```

Expected: Multiple paragraphs with `Ben:` and `David:` speaker labels.

**Step 3: Write the RSS feed reader**

```python
def get_recent_rss_episodes(rss_url, lookback_days=7):
    """Fetch episodes published in the last N days from an RSS feed."""
    feed = feedparser.parse(rss_url)
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    episodes = []
    for entry in feed.entries:
        pub_date = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc) if entry.get("published_parsed") else None
        if pub_date and pub_date < cutoff:
            continue
        # Find MP3 enclosure URL
        audio_url = None
        for link in entry.get("enclosures", []) + entry.get("links", []):
            if link.get("type", "").startswith("audio/") or link.get("href", "").endswith(".mp3"):
                audio_url = link.get("href")
                break
        episodes.append({
            "title": entry.get("title", "Untitled"),
            "url": entry.get("link", ""),
            "audio_url": audio_url,
            "pub_date": pub_date.strftime("%Y-%m-%d") if pub_date else None,
            "duration_sec": parse_duration(entry.get("itunes_duration")),
        })
    return episodes
```

**Step 4: Commit**

```bash
git add scripts/extract-rss-podcasts.py
git commit -m "feat: add Acquired.fm transcript scraper and RSS feed reader"
```

---

### Task 3: Add mlx-whisper Transcription Path

**Files:**
- Modify: `scripts/extract-rss-podcasts.py`

**Step 1: Write the MP3 download function**

```python
def download_mp3(audio_url, output_path):
    """Download MP3 file from RSS enclosure URL."""
    resp = requests.get(audio_url, stream=True, timeout=300)
    resp.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    return output_path
```

**Step 2: Write the mlx-whisper transcription function**

```python
def transcribe_with_whisper(mp3_path):
    """Transcribe audio using mlx-whisper (local, Apple Silicon optimized)."""
    import mlx_whisper
    result = mlx_whisper.transcribe(
        str(mp3_path),
        path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
    )
    return result["text"]
```

Note: First run downloads the ~3 GB model. Subsequent runs use cache. Transcription takes ~6-10 min per 1-hour episode on M2/M3.

**Step 3: Test transcription with a short podcast clip**

Download a short test episode and verify transcription works:

```bash
python3 -c "
import mlx_whisper
# This will download the model on first run (~3 GB)
result = mlx_whisper.transcribe(
    'test_audio.mp3',  # use a short file for testing
    path_or_hf_repo='mlx-community/whisper-large-v3-turbo',
)
print(f'Transcribed {len(result[\"text\"])} chars')
print(result['text'][:500])
"
```

**Step 4: Commit**

```bash
git add scripts/extract-rss-podcasts.py
git commit -m "feat: add mlx-whisper transcription for RSS podcasts"
```

---

### Task 4: Integrate Gemini Extraction and Write Output Files

**Files:**
- Modify: `scripts/extract-rss-podcasts.py`

**Step 1: Add Gemini extraction**

Reuse the existing `scripts/podcast-extraction-prompt.md` (L1) and `scripts/podcast-deep-dive-prompt.md` (L2) prompts. Add a speaker inference instruction for whisper-transcribed episodes (no speaker labels).

```python
def get_extraction_prompt(has_speaker_labels):
    """Load L1 prompt, adding speaker inference instruction if needed."""
    prompt = Path(PROMPT_PATH).read_text()
    if not has_speaker_labels:
        prompt += "\n\nIMPORTANT: The transcript has no speaker labels. Infer speakers from context — podcast hosts typically introduce themselves and guests. Label uncertain attributions as [unconfirmed]."
    return prompt
```

**Step 2: Wire up the main processing loop**

The main function should:
1. Read `config/podcasts.json`, filter to `enabled: true` and `source: "rss"`
2. For each RSS podcast:
   a. If podcast is Acquired: scrape transcript from acquired.fm
   b. Else: fetch RSS → download MP3 → transcribe with mlx-whisper
3. Send transcript to Gemini with L1 prompt
4. For HIGH-rated episodes (max 3): run L2 deep dive
5. Deduplicate against existing `podcasts-raw-*.json` (by episode URL)
6. Merge output into existing knowledge base files (append, don't overwrite)

**Step 3: Handle output file merging**

The JS pipeline writes:
- `~/skills/podcasts-knowledge-base-YYYY-MM-DD.md`
- `~/info-agg/prompts/podcasts-raw-YYYY-MM-DD.json`
- `~/skills/podcasts-organized-YYYY-MM-DD.md`

If these files already exist (JS pipeline ran first), the Python script should:
- Append new entries to the knowledge base markdown
- Merge new entries into the raw JSON array
- Append rows to the organized tables

If they don't exist (Python ran first or standalone), create them.

**Step 4: Commit**

```bash
git add scripts/extract-rss-podcasts.py
git commit -m "feat: integrate Gemini extraction and knowledge base output for RSS podcasts"
```

---

### Task 5: Update Pipeline Integration

**Files:**
- Modify: `scripts/generate-weekly.sh` (add RSS extraction stage)
- Modify: `scripts/extract-podcasts.js` (update skip message)

**Step 1: Add RSS extraction to `generate-weekly.sh`**

Add a Stage 3b that runs the RSS pipeline in parallel with the YouTube pipeline:

```bash
# Stage 3a: Extract podcasts from YouTube (background) — existing
(
  log "Stage 3a: Extracting YouTube podcasts..."
  cd "$BRIEF_SIGNAL_DIR"
  if node scripts/extract-podcasts.js >> "$LOG_FILE" 2>&1; then
    log "Stage 3a complete: YouTube podcasts extracted."
  else
    log "WARN: Stage 3a failed (YouTube podcast extraction). Continuing..."
  fi
) &
PID_PODCASTS_YT=$!

# Stage 3b: Extract podcasts from RSS (background) — NEW
(
  log "Stage 3b: Extracting RSS podcasts..."
  cd "$BRIEF_SIGNAL_DIR"
  if python3 scripts/extract-rss-podcasts.py >> "$LOG_FILE" 2>&1; then
    log "Stage 3b complete: RSS podcasts extracted."
  else
    log "WARN: Stage 3b failed (RSS podcast extraction). Continuing..."
  fi
) &
PID_PODCASTS_RSS=$!
```

Wait for both:
```bash
wait $PID_PODCASTS_YT || true
wait $PID_PODCASTS_RSS || true
```

**Step 2: Update JS script skip message**

In `extract-podcasts.js`, update the skip message for RSS podcasts to reference the Python pipeline:

```javascript
log(`Skipped ${s.name} — ${s.note || (s.source === "rss" ? "processed by extract-rss-podcasts.py" : "disabled")}`);
```

**Step 3: Commit**

```bash
git add scripts/generate-weekly.sh scripts/extract-podcasts.js
git commit -m "feat: add RSS podcast extraction to weekly pipeline"
```

---

### Task 6: End-to-End Test

**Step 1: Run the RSS pipeline standalone**

```bash
cd ~/brief-signal && python3 scripts/extract-rss-podcasts.py
```

Verify:
- [ ] Reads config, finds 4 enabled RSS podcasts (Acquired + 3 whisper)
- [ ] Acquired: scrapes transcript from acquired.fm, gets speaker labels
- [ ] Other RSS: fetches feed, downloads MP3, transcribes with mlx-whisper
- [ ] Gemini extraction produces valid JSON for each episode
- [ ] Output files are written (or merged if they already exist)
- [ ] Deduplication skips previously extracted episodes on re-run
- [ ] Skips Stratechery (disabled)

**Step 2: Verify knowledge base quality**

Read the generated knowledge base file. Check:
- Acquired entries have proper `Ben:` / `David:` speaker labels
- Whisper-transcribed entries have Gemini-inferred speaker labels (or `[unconfirmed]`)
- Signal ratings, quotes, and GCP intelligence sections are populated

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: RSS/whisper podcast pipeline — end-to-end verified"
```

---

## Summary

| Task | What | Est. Time |
|------|------|-----------|
| 1 | Install deps, update config with RSS URLs | 10 min |
| 2 | Acquired.fm scraper + RSS feed reader | 20 min |
| 3 | mlx-whisper transcription path | 15 min |
| 4 | Gemini extraction + output file merging | 25 min |
| 5 | Pipeline integration (generate-weekly.sh) | 10 min |
| 6 | End-to-end test | 20 min |

**Total estimated time:** ~100 min (most of it is transcription runtime)

**Note:** First run of mlx-whisper downloads a ~3 GB model. Budget an extra 5-10 min for that. Subsequent runs use the cached model.

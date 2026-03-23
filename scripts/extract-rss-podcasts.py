#!/usr/bin/env python3
"""
Brief Signal — RSS Podcast Intelligence Extractor

Extracts intelligence from audio-only podcasts via RSS feeds.
Two code paths:
  1. Acquired.fm — scrape speaker-labeled transcripts from their website
  2. All other RSS podcasts — download MP3, transcribe with mlx-whisper, send to Gemini

Output merges into the same knowledge base files the YouTube podcast pipeline writes.

Requires: GOOGLE_API_KEY environment variable, feedparser, requests, mlx_whisper
"""

import json
import os
import re
import shutil
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser
import requests

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
CONFIG_PATH = PROJECT_DIR / "config" / "podcasts.json"
L1_PROMPT_PATH = SCRIPT_DIR / "podcast-extraction-prompt.md"
L2_PROMPT_PATH = SCRIPT_DIR / "podcast-deep-dive-prompt.md"
SKILLS_DIR = Path.home() / "skills"
RAW_DIR = Path.home() / "info-agg" / "prompts"
TMP_DIR = Path("/tmp/brief-signal-rss")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_DEEP_DIVES = 3
LOOKBACK_DAYS = 7
MIN_DURATION_SEC = 1200  # 20 minutes
GEMINI_DELAY_SEC = 2

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[rss-podcasts] {ts}  {msg}", flush=True)


def warn(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[rss-podcasts] {ts}  WARN: {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_config() -> list[dict]:
    """Load podcasts.json, return only enabled RSS entries."""
    with open(CONFIG_PATH) as f:
        all_podcasts = json.load(f)
    return [p for p in all_podcasts if p.get("enabled") and p.get("source") == "rss"]


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def load_previous_episode_urls() -> set[str]:
    """Load episode URLs from the last 4 weeks of raw JSON files."""
    urls: set[str] = set()
    if not RAW_DIR.exists():
        return urls
    raw_files = sorted(
        [f for f in RAW_DIR.iterdir() if f.name.startswith("podcasts-raw-") and f.suffix == ".json"],
        reverse=True,
    )
    for f in raw_files[:4]:
        try:
            data = json.loads(f.read_text())
            for entry in data:
                if entry.get("episode_url"):
                    urls.add(entry["episode_url"])
                # Also check url field (YouTube pipeline uses url)
                if entry.get("url"):
                    urls.add(entry["url"])
        except Exception:
            pass
    return urls


# ---------------------------------------------------------------------------
# RSS Feed Reader
# ---------------------------------------------------------------------------

def parse_duration(raw: str | None) -> int | None:
    """Parse itunes_duration into seconds. Returns None if unparseable."""
    if not raw:
        return None
    raw = raw.strip()
    # Pure seconds
    if raw.isdigit():
        return int(raw)
    # HH:MM:SS or MM:SS
    parts = raw.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        pass
    return None


def get_mp3_url(entry) -> str | None:
    """Extract the MP3 URL from an RSS feed entry's enclosures or links."""
    for link in getattr(entry, "enclosures", []) or entry.get("links", []):
        href = link.get("href", "")
        link_type = link.get("type", "")
        if link_type.startswith("audio/") or href.lower().endswith(".mp3"):
            return href
    return None


def fetch_recent_episodes(podcast: dict) -> list[dict]:
    """Fetch episodes from the last LOOKBACK_DAYS days from an RSS feed."""
    rss_url = podcast.get("rssUrl")
    if not rss_url:
        warn(f"No rssUrl for {podcast['name']}")
        return []

    feed = feedparser.parse(rss_url)
    if feed.bozo and not feed.entries:
        warn(f"Failed to parse RSS feed for {podcast['name']}: {feed.bozo_exception}")
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    episodes = []

    for entry in feed.entries:
        # Parse published date
        pub = entry.get("published_parsed")
        if not pub:
            continue
        pub_dt = datetime(*pub[:6], tzinfo=timezone.utc)
        if pub_dt < cutoff:
            continue

        # Duration filter
        duration_sec = parse_duration(entry.get("itunes_duration"))
        if duration_sec is not None and duration_sec < MIN_DURATION_SEC:
            continue

        # Get audio URL
        mp3_url = get_mp3_url(entry)
        episode_url = entry.get("link", "")

        episodes.append({
            "title": entry.get("title", "Unknown"),
            "episode_url": episode_url,
            "mp3_url": mp3_url,
            "date": pub_dt.strftime("%Y-%m-%d"),
            "duration_sec": duration_sec,
            "duration_min": (duration_sec + 59) // 60 if duration_sec else None,
        })

    return episodes


# ---------------------------------------------------------------------------
# Acquired.fm Transcript Scraper
# ---------------------------------------------------------------------------

def scrape_acquired_transcript(episode_url: str) -> str | None:
    """Scrape speaker-labeled transcript from acquired.fm episode page."""
    try:
        resp = requests.get(episode_url, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        warn(f"Failed to fetch Acquired page {episode_url}: {e}")
        return None

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(resp.text, "html.parser")
    block = soup.select_one("div.rich-text-block-6.w-richtext")
    if not block:
        warn(f"Transcript block not found on {episode_url}")
        return None

    paragraphs = [p.get_text(strip=True) for p in block.find_all("p") if p.get_text(strip=True)]
    if not paragraphs:
        warn(f"No transcript paragraphs found on {episode_url}")
        return None

    return "\n\n".join(paragraphs)


# ---------------------------------------------------------------------------
# mlx-whisper Transcription
# ---------------------------------------------------------------------------

def transcribe_mp3(mp3_url: str, podcast_name: str, episode_title: str) -> str | None:
    """Download MP3 and transcribe with mlx-whisper. Returns transcript text."""
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    # Sanitize filename
    safe_name = re.sub(r'[^\w\-]', '_', f"{podcast_name}_{episode_title}")[:80]
    mp3_path = TMP_DIR / f"{safe_name}.mp3"

    # Download MP3
    log(f"  Downloading MP3 ({podcast_name})...")
    try:
        resp = requests.get(mp3_url, timeout=300, stream=True, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) BriefSignal/1.0",
        })
        resp.raise_for_status()
        with open(mp3_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        size_mb = mp3_path.stat().st_size / (1024 * 1024)
        log(f"  Downloaded: {size_mb:.1f} MB")
    except Exception as e:
        warn(f"Failed to download MP3 for {episode_title}: {e}")
        _cleanup_mp3(mp3_path)
        return None

    # Transcribe
    log(f"  Transcribing with mlx-whisper...")
    start = time.time()
    try:
        import mlx_whisper
        result = mlx_whisper.transcribe(
            str(mp3_path),
            path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
        )
        elapsed = time.time() - start
        log(f"  Transcription complete in {elapsed:.0f}s")
        return result.get("text", "")
    except Exception as e:
        warn(f"mlx-whisper failed for {episode_title}: {e}")
        traceback.print_exc(file=sys.stderr)
        return None
    finally:
        _cleanup_mp3(mp3_path)


def _cleanup_mp3(mp3_path: Path) -> None:
    try:
        if mp3_path.exists():
            mp3_path.unlink()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Gemini Extraction
# ---------------------------------------------------------------------------

def strip_code_fences(text: str) -> str:
    """Remove markdown code fences from Gemini response."""
    text = re.sub(r"^```(?:json)?\s*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```\s*$", "", text)
    return text


def extract_intelligence(client, system_prompt: str, podcast: dict, episode: dict, transcript: str, has_speaker_labels: bool) -> dict | None:
    """L1 extraction via Gemini."""
    prompt = system_prompt
    if not has_speaker_labels:
        prompt += "\n\nIMPORTANT: The transcript has no speaker labels. Infer speakers from context — podcast hosts typically introduce themselves and guests. Label uncertain attributions as [unconfirmed]."

    user_message = f"""Podcast: {podcast['name']}
Episode: {episode['title']}
URL: {episode['episode_url']}
Duration: {episode.get('duration_min') or 'unknown'} minutes
Date: {episode.get('date', 'unknown')}

## Full Transcript

{transcript}"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_message,
            config={"system_instruction": prompt, "response_mime_type": "application/json"},
        )
        return json.loads(strip_code_fences(response.text))
    except json.JSONDecodeError:
        warn(f"Failed to parse Gemini JSON for {episode['title']}")
        warn(f"Response preview: {(response.text or '')[:200]}")
        return None
    except Exception as e:
        warn(f"Gemini extraction failed for {episode['title']}: {e}")
        return None


def deep_dive(client, deep_dive_prompt: str, level1_data: dict, transcript: str) -> dict | None:
    """L2 deep dive extraction for HIGH-rated episodes."""
    user_message = f"""## Level 1 Extraction (already completed)

{json.dumps(level1_data, indent=2)}

## Full Transcript

{transcript}"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_message,
            config={"system_instruction": deep_dive_prompt, "response_mime_type": "application/json"},
        )
        return json.loads(strip_code_fences(response.text))
    except json.JSONDecodeError:
        warn(f"Failed to parse deep dive JSON for {level1_data.get('episode_title')}")
        warn(f"Response preview: {(response.text or '')[:200]}")
        return None
    except Exception as e:
        warn(f"Deep dive failed for {level1_data.get('episode_title')}: {e}")
        return None


# ---------------------------------------------------------------------------
# Output Formatting — matches JS pipeline exactly
# ---------------------------------------------------------------------------

def _str(v) -> str:
    """Safely stringify a value (handles objects Gemini sometimes returns)."""
    return v if isinstance(v, str) else json.dumps(v)


def format_knowledge_base_entries(extractions: list[dict], deep_dives: dict[str, dict]) -> str:
    """Format extraction entries as knowledge base markdown. Matches JS formatKnowledgeBase body."""
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    sorted_eps = sorted(extractions, key=lambda e: order.get(e.get("signal_rating", "LOW"), 2))

    md = ""
    for ep in sorted_eps:
        ep_num = f" {ep['episode_number']}" if ep.get("episode_number") else ""
        md += f'## {ep["podcast_name"]}{ep_num} ({ep.get("date", "unknown")}) — "{ep["episode_title"]}"\n'
        md += f'**Source:** [{ep["podcast_name"]} (RSS)]({ep.get("episode_url") or ep.get("url", "")})\n'
        md += f'**Duration:** {ep.get("duration_min") or "?"} min | **Signal Rating:** {ep.get("signal_rating", "?")}\n\n'

        # Notable Quotes
        md += "### Notable Quotes\n"
        quotes = ep.get("notable_quotes") or []
        if quotes:
            for q in quotes:
                md += f'- "{q["quote"]}" — {q["speaker"]} ({q.get("timestamp", "?")})\n'
        else:
            md += "- No notable quotes extracted\n"

        # Signal Analysis
        md += "\n### Signal Analysis\n"
        for c in ep.get("consensus_signals") or []:
            md += f'- **Consensus:** {c["signal"]}\n'
        for d in ep.get("debate_points") or []:
            md += f'- **Debate:** {d["topic"]}'
            for p in d.get("positions") or []:
                md += f'\n  - {p["speaker"]}: {p["position"]}'
            md += "\n"
        for i in ep.get("intent_signals") or []:
            md += f'- **Intent Signal:** {i["signal"]}\n'

        gcp = ep.get("gcp_intelligence")
        if gcp:
            md += f'- **GCP Relevance:** {gcp.get("relevance", "?")} — {gcp.get("relevance_reason", "")}\n'
            for m in gcp.get("migration_signals") or []:
                md += f"  - Migration: {_str(m)}\n"
            for p in gcp.get("pain_points") or []:
                md += f"  - Pain point: {_str(p)}\n"
            comp = gcp.get("competitive_mentions") or []
            if comp:
                md += f'  - Competitive: {", ".join(_str(c) for c in comp)}\n'
            for b in gcp.get("budget_data") or []:
                md += f"  - Budget: {_str(b)}\n"
            for u in gcp.get("undecided_moments") or []:
                md += f"  - Open decision: {_str(u)}\n"

        # Deep dive
        ep_url = ep.get("episode_url") or ep.get("url", "")
        dd = deep_dives.get(ep_url)
        if dd:
            md += "\n### Deep Dive\n\n**Timestamped Segments:**\n"
            for seg in dd.get("timestamped_segments") or []:
                if seg.get("signal_level") == "LOW":
                    md += f'- {seg["start"]}-{seg["end"]} — {seg["title"]} (low signal, skip)\n'
                else:
                    md += f'- {seg["start"]}-{seg["end"]} — **{seg["title"]}**\n'
                    exp = seg.get("expanded")
                    if exp:
                        for q in exp.get("key_quotes") or []:
                            md += f'  - {q["speaker"]}: "{q["quote"]}" ({q.get("timestamp", "?")})\n'
                        if exp.get("sales_relevance"):
                            md += f'  - Takeaway: {exp["sales_relevance"]}\n'
            cpm = dd.get("companies_products_mentioned") or []
            if cpm:
                md += f'\n**Companies/Products Mentioned:** {", ".join(c["name"] for c in cpm)}\n'
            kn = dd.get("key_numbers") or []
            if kn:
                md += "**Key Numbers:**\n"
                for n in kn:
                    md += f'- "{n["figure"]}" — {n["context"]} ({n["speaker"]}, {n.get("timestamp", "?")})\n'

        md += "\n---\n\n"

    return md


def format_knowledge_base_header(total: int, high: int, deep_dive_count: int, today: str) -> str:
    """Format the knowledge base file header."""
    return f"""# Podcast Intelligence Knowledge Base

> **Extracted:** {today}
> **Episodes processed:** {total}
> **HIGH signal episodes:** {high}
> **Deep dives:** {deep_dive_count}

---

"""


def format_organized_table_entries(extractions: list[dict]) -> str:
    """Format table rows for the organized table. Uses [Listen] instead of [Watch] for RSS."""
    md = ""
    n = 1
    for ep in [e for e in extractions if e.get("signal_rating") == "HIGH"]:
        url = ep.get("episode_url") or ep.get("url", "")
        md += f'| {n} | {ep["podcast_name"]} | **{ep["episode_title"]}** | {ep.get("duration_min") or "?"}min | {(ep.get("gcp_intelligence") or {}).get("relevance", "?")} | [Listen]({url}) |\n'
        n += 1
    # MEDIUM
    for ep in [e for e in extractions if e.get("signal_rating") == "MEDIUM"]:
        url = ep.get("episode_url") or ep.get("url", "")
        md += f'| {n} | {ep["podcast_name"]} | **{ep["episode_title"]}** | {ep.get("duration_min") or "?"}min | {(ep.get("gcp_intelligence") or {}).get("relevance", "?")} | [Listen]({url}) |\n'
        n += 1
    # LOW
    for ep in [e for e in extractions if e.get("signal_rating") == "LOW"]:
        url = ep.get("episode_url") or ep.get("url", "")
        md += f'| {n} | {ep["podcast_name"]} | **{ep["episode_title"]}** | {ep.get("duration_min") or "?"}min | [Listen]({url}) |\n'
        n += 1
    return md


def format_organized_table_header(total: int, today: str) -> str:
    """Format the organized table file header."""
    return f"""# Podcasts — Organized by Signal Rating

> **Extracted:** {today}
> **Total episodes:** {total}

---

## HIGH Signal

| # | Podcast | Episode | Duration | GCP Relevance | Link |
|---|---------|---------|----------|---------------|------|
"""


# ---------------------------------------------------------------------------
# Output Merging
# ---------------------------------------------------------------------------

def merge_raw_json(new_entries: list[dict], today: str) -> None:
    """Write or append to podcasts-raw-YYYY-MM-DD.json."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = RAW_DIR / f"podcasts-raw-{today}.json"

    existing = []
    if raw_path.exists():
        try:
            existing = json.loads(raw_path.read_text())
        except Exception:
            pass

    # Assign IDs continuing from existing
    start_id = len(existing) + 1
    for i, entry in enumerate(new_entries):
        entry["id"] = str(start_id + i)

    combined = existing + new_entries
    raw_path.write_text(json.dumps(combined, indent=2), encoding="utf-8")
    log(f"Raw JSON: {raw_path} ({len(new_entries)} new, {len(combined)} total)")


def merge_knowledge_base(entries_md: str, extractions: list[dict], deep_dives: dict, today: str) -> None:
    """Write or append to podcasts-knowledge-base-YYYY-MM-DD.md."""
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    kb_path = SKILLS_DIR / f"podcasts-knowledge-base-{today}.md"

    if kb_path.exists():
        # Append new entries after existing content
        existing = kb_path.read_text()
        kb_path.write_text(existing + entries_md, encoding="utf-8")
        log(f"Knowledge base: appended to {kb_path}")
    else:
        high_count = sum(1 for e in extractions if e.get("signal_rating") == "HIGH")
        header = format_knowledge_base_header(len(extractions), high_count, len(deep_dives), today)
        kb_path.write_text(header + entries_md, encoding="utf-8")
        log(f"Knowledge base: created {kb_path}")


def merge_organized_table(table_rows: str, extractions: list[dict], today: str) -> None:
    """Write or append to podcasts-organized-YYYY-MM-DD.md."""
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    org_path = SKILLS_DIR / f"podcasts-organized-{today}.md"

    if org_path.exists():
        # Append rows to existing table
        existing = org_path.read_text()
        kb_path_content = existing.rstrip() + "\n" + table_rows
        org_path.write_text(kb_path_content, encoding="utf-8")
        log(f"Organized table: appended to {org_path}")
    else:
        header = format_organized_table_header(len(extractions), today)
        org_path.write_text(header + table_rows, encoding="utf-8")
        log(f"Organized table: created {org_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_API_KEY not set.", file=sys.stderr)
        sys.exit(1)

    today = datetime.now().strftime("%Y-%m-%d")
    log("=== RSS Podcast Intelligence Extraction ===")
    log(f"Date: {today}, looking back {LOOKBACK_DAYS} days")

    # Load config
    podcasts = load_config()
    log(f"Enabled RSS podcasts: {len(podcasts)}")
    if not podcasts:
        log("No enabled RSS podcasts found. Exiting.")
        return

    # Load prompts
    l1_prompt = L1_PROMPT_PATH.read_text()
    l2_prompt = L2_PROMPT_PATH.read_text()

    # Load previous episode URLs for dedup
    previous_urls = load_previous_episode_urls()
    log(f"Previously extracted episode URLs: {len(previous_urls)}")

    # Initialize Gemini client
    from google import genai
    client = genai.Client(api_key=api_key)

    # Collect episodes from all RSS feeds
    all_episodes: list[tuple[dict, dict]] = []  # (podcast_config, episode)
    for podcast in podcasts:
        log(f"Scanning {podcast['name']}...")
        episodes = fetch_recent_episodes(podcast)
        new_episodes = [ep for ep in episodes if ep["episode_url"] not in previous_urls]
        log(f"  Found {len(episodes)} recent, {len(new_episodes)} new")
        for ep in new_episodes:
            all_episodes.append((podcast, ep))

    log(f"Total new episodes to process: {len(all_episodes)}")
    if not all_episodes:
        log("No new episodes found. Exiting.")
        return

    # Process each episode
    extractions: list[dict] = []
    transcripts: dict[str, str] = {}  # episode_url -> transcript

    for podcast, episode in all_episodes:
        try:
            log(f"Processing: {podcast['name']} — \"{episode['title']}\"")

            # Get transcript
            transcript: str | None = None
            has_speaker_labels = False

            if podcast.get("transcriptUrl"):
                # Acquired.fm path: scrape transcript from website
                log(f"  Scraping transcript from {episode['episode_url']}...")
                transcript = scrape_acquired_transcript(episode["episode_url"])
                has_speaker_labels = True
            else:
                # Generic RSS: download MP3 + mlx-whisper
                if not episode.get("mp3_url"):
                    warn(f"  No MP3 URL found for {episode['title']}. Skipping.")
                    continue
                transcript = transcribe_mp3(episode["mp3_url"], podcast["name"], episode["title"])
                has_speaker_labels = False

            if not transcript or len(transcript) < 100:
                warn(f"  Transcript too short or missing for {episode['title']}. Skipping.")
                continue

            transcripts[episode["episode_url"]] = transcript

            # L1 extraction via Gemini
            extraction = extract_intelligence(client, l1_prompt, podcast, episode, transcript, has_speaker_labels)
            if extraction:
                # Ensure required fields from our metadata
                extraction["episode_url"] = episode["episode_url"]
                extraction["podcast_name"] = extraction.get("podcast_name") or podcast["name"]
                extraction["url"] = extraction.get("url") or episode["episode_url"]
                extraction["duration_min"] = extraction.get("duration_min") or episode.get("duration_min")
                extraction["date"] = extraction.get("date") or episode.get("date")
                extractions.append(extraction)
                log(f"  Signal: {extraction.get('signal_rating')} | Quotes: {len(extraction.get('notable_quotes') or [])}")
            else:
                warn(f"  Extraction returned no result for {episode['title']}")

            # Rate limit
            time.sleep(GEMINI_DELAY_SEC)
        except Exception as e:
            warn(f"Failed to process {podcast['name']} — {episode.get('title', '?')}: {e}")
            continue

    if not extractions:
        log("No extractions produced. Exiting.")
        return

    # Deep dives for HIGH episodes (max MAX_DEEP_DIVES)
    high_episodes = [e for e in extractions if e.get("signal_rating") == "HIGH"][:MAX_DEEP_DIVES]
    deep_dives: dict[str, dict] = {}
    for ep in high_episodes:
        ep_url = ep.get("episode_url") or ep.get("url", "")
        log(f"Deep dive: {ep['podcast_name']} — \"{ep.get('episode_title', '')}\"")
        transcript = transcripts.get(ep_url)
        if not transcript:
            continue
        dd = deep_dive(client, l2_prompt, ep, transcript)
        if dd:
            deep_dives[ep_url] = dd
            log(f"  Segments: {len(dd.get('timestamped_segments') or [])}")
        time.sleep(GEMINI_DELAY_SEC)

    # Build raw JSON entries
    raw_entries = []
    for ep in extractions:
        ep_url = ep.get("episode_url") or ep.get("url", "")
        raw_entries.append({
            "id": "0",  # Will be reassigned in merge_raw_json
            "source": "podcast-rss",
            "video_id": None,
            "episode_url": ep_url,
            "podcast_name": ep.get("podcast_name"),
            "episode_title": ep.get("episode_title"),
            "episode_number": ep.get("episode_number"),
            "date": ep.get("date"),
            "url": ep_url,
            "duration_min": ep.get("duration_min"),
            "signal_rating": ep.get("signal_rating"),
            "notable_quotes": ep.get("notable_quotes"),
            "consensus_signals": ep.get("consensus_signals"),
            "debate_points": ep.get("debate_points"),
            "intent_signals": ep.get("intent_signals"),
            "gcp_intelligence": ep.get("gcp_intelligence"),
            "companies_mentioned": ep.get("companies_mentioned"),
            "topics": ep.get("topics"),
            "deep_dive": deep_dives.get(ep_url),
            "extracted_at": datetime.now(timezone.utc).isoformat(),
        })

    # Write output files (merge with existing if YouTube pipeline already ran)
    entries_md = format_knowledge_base_entries(extractions, deep_dives)
    table_rows = format_organized_table_entries(extractions)

    merge_raw_json(raw_entries, today)
    merge_knowledge_base(entries_md, extractions, deep_dives, today)
    merge_organized_table(table_rows, extractions, today)

    # Cleanup temp directory
    if TMP_DIR.exists():
        shutil.rmtree(TMP_DIR, ignore_errors=True)

    # Summary
    log("")
    log("=== RSS Extraction Complete ===")
    log(f"Episodes processed: {len(extractions)}")
    log(f"HIGH signal: {sum(1 for e in extractions if e.get('signal_rating') == 'HIGH')}")
    log(f"MEDIUM signal: {sum(1 for e in extractions if e.get('signal_rating') == 'MEDIUM')}")
    log(f"LOW signal: {sum(1 for e in extractions if e.get('signal_rating') == 'LOW')}")
    log(f"Deep dives: {len(deep_dives)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[rss-podcasts] Fatal error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""
Enrich bookmark raw JSON with the content of LINKED external articles.

Problem this solves:
    fetch-bookmarks.py captures the full text of each X post (including
    long-form note tweets), but when a bookmark *links out* to an article
    (a Google Cloud blog post, a Dario Amodei essay, a Tomasz Tunguz piece,
    a YouTube talk, etc.), only the URL is stored — never the article body.
    The downstream briefing generator therefore never "reads" those linked
    articles, even though they're often the most substantive bookmarks.

What it does:
    For each entry with `external_links`, fetch the first non-self link and
    store the readable article text inline so the KB builder and the briefing
    generator can actually use it:
      - external_title          (page <title> / og:title)
      - external_content        (readable body text, capped)
      - external_read_time_min  (words / 238, or video duration for YouTube)
      - external_fetch_status   ("ok" | "paywalled" | "error" | "skipped")

    YouTube links get their duration via yt-dlp instead of body text.
    Failures (paywalls, 403s, timeouts) are logged and skipped — never fatal,
    per project convention (a single source failing must not stop the run).

    Idempotent: entries that already have a non-empty external_fetch_status
    are left alone, so re-runs only fetch what's missing.

Usage:
    python3 scripts/enrich-bookmarks.py [YYYY-MM-DD]
    (defaults to the most recent bookmarks-raw-*.json)
"""

import glob
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

OUTPUT_DIR = Path.home() / "info-agg" / "prompts"
CONTENT_CAP = 4000          # max chars of article body to store
REQUEST_TIMEOUT = 20        # seconds
WORDS_PER_MIN = 238
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
YOUTUBE_HOSTS = ("youtube.com", "youtu.be", "www.youtube.com", "m.youtube.com")
# Phrases that signal a paywall / login wall rather than real content
PAYWALL_MARKERS = (
    "subscribe to continue", "create a free account", "sign in to read",
    "this content is for subscribers", "metered paywall",
)


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[enrich-bookmarks] {ts}  {msg}", flush=True)


# ---------------------------------------------------------------------------
# Article fetching
# ---------------------------------------------------------------------------

def is_youtube(url: str) -> bool:
    return any(host in url.lower() for host in YOUTUBE_HOSTS)


def youtube_duration_min(url: str) -> int | None:
    """Return YouTube video duration in minutes (rounded up) via yt-dlp."""
    try:
        out = subprocess.run(
            ["yt-dlp", "--skip-download", "--no-warnings",
             "--print", "%(duration)s", url],
            capture_output=True, text=True, timeout=60,
        )
        secs = out.stdout.strip().splitlines()[0] if out.stdout.strip() else ""
        if secs.isdigit():
            return max(1, -(-int(secs) // 60))  # ceil division
    except (subprocess.SubprocessError, OSError, ValueError):
        pass
    return None


def extract_readable_text(html: str) -> tuple[str, str]:
    """Return (title, readable_body_text) from raw HTML."""
    soup = BeautifulSoup(html, "html.parser")

    # Title: prefer og:title, fall back to <title>
    title = ""
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        title = og["content"].strip()
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()

    # Strip non-content nodes
    for tag in soup(["script", "style", "nav", "header", "footer",
                     "aside", "form", "noscript", "svg"]):
        tag.decompose()

    # Prefer the main article container if present
    container = (
        soup.find("article")
        or soup.find("main")
        or soup.find("div", attrs={"role": "main"})
        or soup.body
        or soup
    )

    # Join paragraph-ish blocks for cleaner text than get_text() on the whole page
    blocks = container.find_all(["p", "li", "h1", "h2", "h3", "blockquote"])
    if blocks:
        text = "\n".join(b.get_text(" ", strip=True) for b in blocks)
    else:
        text = container.get_text(" ", strip=True)

    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text).strip()
    return title, text


def fetch_article(url: str) -> dict:
    """Fetch a single external article. Returns enrichment fields."""
    if is_youtube(url):
        dur = youtube_duration_min(url)
        return {
            "external_title": "",
            "external_content": "",
            "external_read_time_min": dur,
            "external_fetch_status": "ok" if dur else "error",
        }

    try:
        resp = requests.get(
            url, timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
        )
    except requests.RequestException as e:
        log(f"  WARN: request failed ({type(e).__name__}) for {url[:70]}")
        return {"external_title": "", "external_content": "",
                "external_read_time_min": None, "external_fetch_status": "error"}

    if resp.status_code in (401, 402, 403):
        log(f"  WARN: {resp.status_code} (auth/paywall) for {url[:70]}")
        return {"external_title": "", "external_content": "",
                "external_read_time_min": None, "external_fetch_status": "paywalled"}
    if resp.status_code != 200 or "text/html" not in resp.headers.get("content-type", ""):
        log(f"  WARN: status {resp.status_code} / non-html for {url[:70]}")
        return {"external_title": "", "external_content": "",
                "external_read_time_min": None, "external_fetch_status": "error"}

    title, text = extract_readable_text(resp.text)

    low = text.lower()
    if len(text) < 200 and any(m in low for m in PAYWALL_MARKERS):
        log(f"  WARN: paywall-walled content for {url[:70]}")
        return {"external_title": title, "external_content": "",
                "external_read_time_min": None, "external_fetch_status": "paywalled"}

    words = len(text.split())
    read_min = max(1, -(-words // WORDS_PER_MIN)) if words else None
    return {
        "external_title": title,
        "external_content": text[:CONTENT_CAP],
        "external_read_time_min": read_min,
        "external_fetch_status": "ok",
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def resolve_input_path(argv: list[str]) -> Path:
    if len(argv) > 1:
        p = OUTPUT_DIR / f"bookmarks-raw-{argv[1]}.json"
        if not p.exists():
            log(f"ERROR: {p} not found.")
            sys.exit(1)
        return p
    matches = sorted(glob.glob(str(OUTPUT_DIR / "bookmarks-raw-*.json")))
    if not matches:
        log("ERROR: no bookmarks-raw-*.json files found.")
        sys.exit(1)
    return Path(matches[-1])


def main() -> None:
    path = resolve_input_path(sys.argv)
    log(f"Enriching: {path.name}")

    data = json.loads(path.read_text(encoding="utf-8"))
    items = data if isinstance(data, list) else list(data.values())

    targets = [
        it for it in items
        if it.get("external_links") and not it.get("external_fetch_status")
    ]
    log(f"Entries: {len(items)} total | {len(targets)} with unfetched external links")

    stats = {"ok": 0, "paywalled": 0, "error": 0}
    for i, it in enumerate(targets, 1):
        url = it["external_links"][0]
        log(f"[{i}/{len(targets)}] {url[:80]}")
        result = fetch_article(url)
        it.update(result)
        stats[result["external_fetch_status"]] = \
            stats.get(result["external_fetch_status"], 0) + 1

    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    log("=== Enrichment complete ===")
    log(f"Fetched OK: {stats.get('ok', 0)} | "
        f"Paywalled: {stats.get('paywalled', 0)} | "
        f"Errors: {stats.get('error', 0)}")
    log(f"Updated: {path}")


if __name__ == "__main__":
    main()

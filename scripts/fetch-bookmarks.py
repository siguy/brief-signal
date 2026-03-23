#!/usr/bin/env python3
"""
Fetch X bookmarks via twikit GraphQL API.

Replaces browser-based bookmark scrolling. Outputs raw JSON in the same
format consumed by the downstream extract-bookmarks skill pipeline.

Output: ~/info-agg/prompts/bookmarks-raw-YYYY-MM-DD.json

Usage:
    python3 scripts/fetch-bookmarks.py
"""

import asyncio
import glob
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from twikit import Client
from twikit.errors import TooManyRequests, Unauthorized
from twikit.media import AnimatedGif, Photo, Video


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = Path.home() / "info-agg" / "prompts"
TODAY = datetime.now().strftime("%Y-%m-%d")
OUTPUT_FILE = OUTPUT_DIR / f"bookmarks-raw-{TODAY}.json"
DEDUP_WEEKS = 4
PAGE_DELAY = 0.5          # seconds between pagination requests
MAX_BACKOFF = 300          # max seconds to wait on rate-limit (5 min)
BOOKMARKS_PER_PAGE = 20

# Domains to filter out of external_links
SELF_DOMAINS = {"t.co", "x.com", "twitter.com", "www.twitter.com", "www.x.com"}


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[fetch-bookmarks] {ts}  {msg}", flush=True)


def log_error(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[fetch-bookmarks] {ts}  ERROR: {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Deduplication — load keys from previous weeks' JSON files
# ---------------------------------------------------------------------------

def load_existing_keys() -> set[str]:
    """Load URL-path keys from the last DEDUP_WEEKS weeks of raw JSON files."""
    cutoff = datetime.now() - timedelta(weeks=DEDUP_WEEKS)
    keys: set[str] = set()

    pattern = str(OUTPUT_DIR / "bookmarks-raw-*.json")
    for filepath in sorted(glob.glob(pattern)):
        # Extract date from filename
        fname = os.path.basename(filepath)
        try:
            date_str = fname.replace("bookmarks-raw-", "").replace(".json", "")
            file_date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue

        if file_date < cutoff:
            continue

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            count = 0
            if isinstance(data, dict):
                if "bookmarks" in data and isinstance(data["bookmarks"], list):
                    # Old format: {extraction_date, bookmarks: [{url, ...}]}
                    for entry in data["bookmarks"]:
                        url = entry.get("url", "")
                        if url:
                            # Extract path from full URL
                            path = "/" + "/".join(url.rstrip("/").split("/")[-3:])
                            keys.add(path)
                            count += 1
                else:
                    # Current format: {"/handle/status/id": {...}}
                    for k in data.keys():
                        if k.startswith("/"):
                            keys.add(k)
                            count += 1
            elif isinstance(data, list):
                # Array format: [{url, ...}]
                for entry in data:
                    url = entry.get("url", "")
                    if url:
                        path = "/" + "/".join(url.rstrip("/").split("/")[-3:])
                        keys.add(path)
                        count += 1

            log(f"  Loaded {count} keys from {fname}")
        except (json.JSONDecodeError, OSError) as e:
            log(f"  Warning: could not read {fname}: {e}")

    return keys


# ---------------------------------------------------------------------------
# Tweet → output format
# ---------------------------------------------------------------------------

def extract_external_links(tweet) -> list[str]:
    """Extract expanded URLs, filtering out Twitter/X self-links."""
    links = []
    raw_urls = tweet.urls or []
    for url_entity in raw_urls:
        expanded = url_entity.get("expanded_url", "")
        if not expanded:
            continue
        # Filter out self-referential links
        domain = urlparse(expanded).netloc.lower()
        if domain not in SELF_DOMAINS:
            links.append(expanded)
    return links


def has_media_type(tweet, media_type: str) -> bool:
    """Check if tweet has media of given type (photo or video)."""
    if not tweet.media:
        return False
    for m in tweet.media:
        if media_type == "photo" and isinstance(m, Photo):
            return True
        if media_type == "video" and isinstance(m, (Video, AnimatedGif)):
            return True
    return False


def tweet_to_record(tweet) -> dict:
    """Convert a twikit Tweet to the downstream JSON format."""
    text = tweet.full_text or tweet.text or ""
    external_links = extract_external_links(tweet)

    # Date: twikit provides created_at_datetime as a datetime object
    if tweet.created_at_datetime:
        dt = tweet.created_at_datetime
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        date_str = dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    else:
        date_str = tweet.created_at or ""

    # View count: string, empty if unavailable
    view_count = ""
    if tweet.view_count is not None:
        view_count = str(tweet.view_count)

    return {
        "handle": tweet.user.screen_name if tweet.user else "",
        "name": tweet.user.name if tweet.user else "",
        "date": date_str,
        "text": text,
        "url": f"https://x.com/{tweet.user.screen_name}/status/{tweet.id}" if tweet.user else "",
        "has_image": has_media_type(tweet, "photo"),
        "has_video": has_media_type(tweet, "video"),
        "external_links": external_links,
        "card_link": external_links[0] if external_links else "",
        "is_article": len(text) > 280,
        "views": view_count,
    }


def tweet_key(tweet) -> str:
    """Generate the URL-path key for a tweet, matching existing format."""
    if tweet.user:
        return f"/{tweet.user.screen_name}/status/{tweet.id}"
    return f"/unknown/status/{tweet.id}"


# ---------------------------------------------------------------------------
# Main fetch logic
# ---------------------------------------------------------------------------

async def fetch_all_bookmarks() -> dict:
    """Fetch all bookmarks, deduplicate, return as keyed dict."""

    # Load environment
    load_dotenv(PROJECT_DIR / ".env")
    ct0 = os.getenv("X_CT0", "").strip()
    auth_token = os.getenv("X_AUTH_TOKEN", "").strip()

    if not ct0 or not auth_token:
        log_error(
            "Missing X_CT0 or X_AUTH_TOKEN in .env file.\n"
            "To get these cookies:\n"
            "  1. Open x.com in Chrome\n"
            "  2. DevTools → Application → Cookies → https://x.com\n"
            "  3. Copy 'ct0' and 'auth_token' values into .env"
        )
        sys.exit(1)

    # Load existing keys for deduplication
    log("Loading existing bookmarks for deduplication...")
    existing_keys = load_existing_keys()
    log(f"Found {len(existing_keys)} existing bookmark keys from last {DEDUP_WEEKS} weeks")

    # Initialize twikit client with cookie auth
    client = Client(language="en-US")
    client.set_cookies({
        "ct0": ct0,
        "auth_token": auth_token,
    })

    # Fetch bookmarks with pagination
    bookmarks: dict = {}
    dupes = 0
    page = 0

    log("Starting bookmark fetch...")

    try:
        result = await client.get_bookmarks(count=BOOKMARKS_PER_PAGE)
    except Unauthorized:
        log_error(
            "Unauthorized — cookies are expired or invalid.\n"
            "Refresh X_CT0 and X_AUTH_TOKEN in .env from Chrome DevTools."
        )
        sys.exit(1)
    except Exception as e:
        log_error(f"Failed to fetch first page: {e}")
        sys.exit(1)

    while True:
        page += 1
        page_new = 0

        for tweet in result:
            key = tweet_key(tweet)
            if key in existing_keys or key in bookmarks:
                dupes += 1
                continue
            bookmarks[key] = tweet_to_record(tweet)
            page_new += 1

        log(f"  Page {page}: {len(result)} tweets, {page_new} new, {dupes} dupes total")

        # Check if there are more pages
        if not result or len(result) == 0:
            log("No more bookmarks to fetch.")
            break

        # Rate-limit delay between pages
        await asyncio.sleep(PAGE_DELAY)

        # Fetch next page with backoff on rate limits
        try:
            result = await result.next()
        except TooManyRequests as e:
            now = int(datetime.now(timezone.utc).timestamp())
            rate_limit_reset = getattr(e, "rate_limit_reset", None)
            wait = (rate_limit_reset - now + 5) if rate_limit_reset else 60
            if wait > MAX_BACKOFF:
                log(f"Rate limited for {wait}s (exceeds max {MAX_BACKOFF}s). Stopping.")
                break
            wait = max(5, min(wait, MAX_BACKOFF))
            log(f"Rate limited. Waiting {wait}s before retry...")
            await asyncio.sleep(wait)
            try:
                result = await result.next()
            except Exception as e2:
                log_error(f"Failed after rate-limit retry: {e2}")
                break
        except Exception as e:
            # result.next() raises generic errors when no more pages
            err_str = str(e).lower()
            if "no more" in err_str or "nonetype" in err_str:
                log("Reached end of bookmarks.")
                break
            log_error(f"Pagination error: {e}")
            break

    return bookmarks


async def main():
    log(f"=== Bookmark Fetch Started ===")
    log(f"Output: {OUTPUT_FILE}")

    bookmarks = await fetch_all_bookmarks()

    if not bookmarks:
        log("No new bookmarks found. Nothing to write.")
        return

    # Write output
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # If file already exists, merge (new bookmarks take priority)
    if OUTPUT_FILE.exists():
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                existing = json.load(f)
            log(f"Merging with {len(existing)} existing entries in today's file")
            existing.update(bookmarks)
            bookmarks = existing
        except (json.JSONDecodeError, OSError):
            pass

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(bookmarks, f, indent=2, ensure_ascii=False)

    log(f"=== Done ===")
    log(f"  New bookmarks: {len(bookmarks)}")
    log(f"  Written to: {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())

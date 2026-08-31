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
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

# Third-party imports live inside the functions that use them, NOT at module
# scope. scripts/fetch-bookmarks.test.py imports this file to exercise two pure
# helpers (load_existing_keys, should_stop_early) that need nothing but the
# stdlib — and `npm test` gates the GitHub Pages deploy. With twikit imported at
# module scope the import raised ModuleNotFoundError on the CI runner, which has
# no twikit, so `npm test` exited 1 and the site stopped deploying entirely
# (three consecutive failed deploys, 2026-08-24 to 2026-08-30; the live site sat
# on Edition #27 while later merges silently never shipped).
#
# Installing twikit in CI would fix the symptom, but the tests genuinely do not
# need it: paying a network install on every deploy to satisfy an import nothing
# under test calls is the wrong trade. A real run imports these on the first line
# of fetch_all_bookmarks(), so a missing dependency still fails immediately and
# loudly — just not at import time.


def _patch_twikit():
    """Apply the twikit 2.3.3 ON_DEMAND_FILE_REGEX fix, then return its module.

    twikit 2.3.3's regex broke around 2026-03-18 when X changed their JS bundle
    format. Remove when twikit releases a fix.
    See: https://github.com/d60/twikit/issues/408

    Idempotent: re-applying the same patch is harmless, so callers need not
    track whether it has already run.
    """
    _tx_mod = __import__(
        'twikit.x_client_transaction.transaction', fromlist=['ClientTransaction'])
    _tx_mod.ON_DEMAND_FILE_REGEX = re.compile(
        r""",(\d+):["']ondemand\.s["']""", flags=(re.VERBOSE | re.MULTILINE))
    _tx_mod.ON_DEMAND_HASH_PATTERN = r',{}:"([0-9a-f]+)"'

    async def _patched_get_indices(self, home_page_response, session, headers):
        key_byte_indices = []
        response = self.validate_response(home_page_response) or self.home_page_response
        on_demand_file_index = _tx_mod.ON_DEMAND_FILE_REGEX.search(str(response)).group(1)
        regex = re.compile(_tx_mod.ON_DEMAND_HASH_PATTERN.format(on_demand_file_index))
        filename = regex.search(str(response)).group(1)
        on_demand_file_url = f"https://abs.twimg.com/responsive-web/client-web/ondemand.s.{filename}a.js"
        on_demand_file_response = await session.request(method="GET", url=on_demand_file_url, headers=headers)
        key_byte_indices_match = _tx_mod.INDICES_REGEX.finditer(str(on_demand_file_response.text))
        for item in key_byte_indices_match:
            key_byte_indices.append(item.group(2))
        if not key_byte_indices:
            raise Exception("Couldn't get KEY_BYTE indices")
        key_byte_indices = list(map(int, key_byte_indices))
        return key_byte_indices[0], key_byte_indices[1:]

    _tx_mod.ClientTransaction.get_indices = _patched_get_indices
    return _tx_mod


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = Path.home() / "info-agg" / "prompts"
TODAY = datetime.now().strftime("%Y-%m-%d")
OUTPUT_FILE = OUTPUT_DIR / f"bookmarks-raw-{TODAY}.json"
# Stop paging after this many CONSECUTIVE pages that contained nothing new.
# X returns bookmarks newest-bookmarked first, so once we have seen this many
# all-duplicate pages in a row, everything below is older and already captured.
# 3 pages = 60 tweets of margin before we call it.
#
# There is deliberately no date window on deduplication (there used to be a
# 4-week one). A bookmark's key is only "seen" if it appears in a prior raw
# file, and those files go back further than any window we would pick — so a
# window does not bound work, it just makes old bookmarks look new. On
# 2026-08-23 that returned the entire 2,472-entry archive back to 2021 as
# "new". Bounding the work is what STOP_AFTER_DUPE_PAGES is for.
STOP_AFTER_DUPE_PAGES = 3
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
    """Load URL-path keys from EVERY raw JSON file we have ever written.

    Deliberately unfiltered — by date and by filename shape. Both filters used
    to exist here and both caused the same bug from opposite directions:

    - A 4-week date cutoff meant a bookmark last written more than 4 weeks ago
      was not "seen", so it was re-fetched as new.
    - Requiring the filename to parse as `bookmarks-raw-YYYY-MM-DD.json` threw
      away every variant we write by hand during recovery — including
      `bookmarks-raw-<date>.full-with-dupes.json`, the file whose entire job is
      to preserve an over-fetch. The dedup pass could not see the safety net,
      so the next run over-fetched the same entries again.

    Reading every match is cheap: a few thousand short strings.
    """
    keys: set[str] = set()

    pattern = str(OUTPUT_DIR / "bookmarks-raw-*.json")
    for filepath in sorted(glob.glob(pattern)):
        fname = os.path.basename(filepath)
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


def should_stop_early(page_new: int, consecutive_dupe_pages: int) -> tuple[bool, int]:
    """Decide whether to stop paginating, given the page we just processed.

    Returns (stop, new_consecutive_count). Any page with at least one new
    bookmark resets the counter — we only stop on an unbroken run, so a single
    all-duplicate page in the middle of fresh material does not end the fetch.
    """
    if page_new > 0:
        return False, 0
    consecutive_dupe_pages += 1
    return consecutive_dupe_pages >= STOP_AFTER_DUPE_PAGES, consecutive_dupe_pages


# ---------------------------------------------------------------------------
# Tweet → output format
# ---------------------------------------------------------------------------

# An X Article lives on x.com but is long-form content, not a self-link:
#   https://x.com/i/article/<id>   or   https://x.com/<handle>/article/<id>
X_ARTICLE_PATH = re.compile(r"^/(?:i|[A-Za-z0-9_]+)/article/\d+", re.IGNORECASE)


def is_x_article_url(url: str) -> bool:
    """True for an X Article permalink."""
    parts = urlparse(url or "")
    if parts.netloc.lower() not in SELF_DOMAINS:
        return False
    return bool(X_ARTICLE_PATH.match(parts.path or ""))


def extract_external_links(tweet) -> list[str]:
    """Extract expanded URLs, filtering out Twitter/X self-links.

    X ARTICLES ARE NOT SELF-LINKS. They live on x.com, so the domain filter
    used to discard them — and a bookmark whose entire body is a t.co pointing
    at an article therefore captured NOTHING: empty external_links, empty
    card_link, nothing for enrich-bookmarks.py to fetch, and a knowledge-base
    entry reading as a bare link with no caption (graded LOW on 2026-08-30,
    which is how a 25,000-word semiconductor analysis was nearly missed).
    """
    links = []
    raw_urls = tweet.urls or []
    for url_entity in raw_urls:
        expanded = url_entity.get("expanded_url", "")
        if not expanded:
            continue
        domain = urlparse(expanded).netloc.lower()
        if domain not in SELF_DOMAINS or is_x_article_url(expanded):
            links.append(expanded)
    return links


def has_media_type(tweet, media_type: str) -> bool:
    """Check if tweet has media of given type (photo or video)."""
    from twikit.media import AnimatedGif, Photo, Video

    if not tweet.media:
        return False
    for m in tweet.media:
        if media_type == "photo" and isinstance(m, Photo):
            return True
        if media_type == "video" and isinstance(m, (Video, AnimatedGif)):
            return True
    return False


def extract_x_article(tweet) -> dict:
    """Extract an X Article (the long-form article product) from the raw
    GraphQL payload, if this tweet carries one.

    twikit 2.3.3 doesn't parse articles — full_text only holds the short
    preview — but the raw payload is kept on tweet._data. The body lives in
    article.article_results.result.content_state as rich-text blocks; joining
    the blocks' text yields the full plaintext. Everything here is defensive
    (.get chains, broad except): X reshapes this payload without notice, and
    a failed article extraction must never break the bookmark fetch — worst
    case we keep the preview text exactly as before.
    Returns {"title": str, "body": str} with empty strings when absent.
    """
    try:
        raw = getattr(tweet, "_data", None) or {}
        result = (
            raw.get("article", {})
            .get("article_results", {})
            .get("result", {})
        )
        if not result:
            return {"title": "", "body": ""}
        title = result.get("title", "") or ""
        preview = result.get("preview_text", "") or ""
        body = blocks_to_text(result.get("content_state"))
        return {"title": title, "body": body, "preview": preview}
    except Exception as e:  # noqa: BLE001 — never let article parsing kill the fetch
        log(f"  WARN: X-article extraction failed for a tweet, keeping preview text: {e}")
        return {"title": "", "body": "", "preview": ""}


def _walk_for_content_state(node):
    """Depth-first search for the article's content_state node."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "content_state":
                return value
            found = _walk_for_content_state(value)
            if found is not None:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _walk_for_content_state(value)
            if found is not None:
                return found
    return None


def blocks_to_text(content_state) -> str:
    """Join an article's rich-text blocks into plaintext."""
    blocks = (content_state or {}).get("blocks") or []
    return "\n\n".join(b.get("text", "") for b in blocks if b.get("text")).strip()


async def fetch_x_article_body(client, tweet_id: str) -> str:
    """Fetch the FULL body of an X Article.

    The bookmarks feed carries only article metadata — title, preview_text,
    cover_media, ids — and no `content_state`, so extract_x_article() below can
    recover a title but never a body. The TweetDetail-family endpoint requests
    `withArticleRichContentState`, which does return it: 135 blocks / ~25,800
    characters for the article that exposed this gap.

    One extra request per article bookmark, and articles are rare (roughly one
    a week). Never fatal: on any failure we keep the preview text, which is
    exactly the behaviour before this function existed.
    """
    try:
        out = await client.gql.tweet_result_by_rest_id(str(tweet_id))
        data = None
        if isinstance(out, tuple):
            for part in out:
                if isinstance(part, dict):
                    data = part
            if data is None:
                for part in out:
                    if hasattr(part, "json"):
                        data = part.json()
        elif isinstance(out, dict):
            data = out
        else:
            data = out.json()
        return blocks_to_text(_walk_for_content_state(data))
    except Exception as e:  # noqa: BLE001 — an article fetch must never kill the run
        log(f"  WARN: could not fetch X-article body for {tweet_id}: {e}")
        return ""


def tweet_to_record(tweet) -> dict:
    """Convert a twikit Tweet to the downstream JSON format."""
    text = tweet.full_text or tweet.text or ""
    external_links = extract_external_links(tweet)

    # X Articles: the raw payload carries the full article body that
    # full_text only previews. Prefer it whenever it's longer.
    article = extract_x_article(tweet)
    if article["body"] and len(article["body"]) > len(text):
        header = f"[X Article] {article['title']}\n\n" if article["title"] else "[X Article]\n\n"
        text = header + article["body"]
    elif article["title"]:
        # Bookmarks-feed payload: title and preview only. Use them now so the
        # entry is never a bare link, and mark it so the caller can fetch the
        # full body in a second pass.
        preview = article.get("preview", "")
        text = f"[X Article] {article['title']}".strip() + (f"\n\n{preview}" if preview else "")
        needs_article_body = True
    else:
        needs_article_body = False
    if article["body"]:
        needs_article_body = False

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
        "is_x_article": bool(article["title"]),
        "needs_article_body": needs_article_body,
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
    # Imported here rather than at module scope so this file stays importable
    # without twikit installed — see the note at the top. A real run still fails
    # immediately and loudly if the dependency is missing.
    from dotenv import load_dotenv
    from twikit import Client
    from twikit.errors import TooManyRequests, Unauthorized

    _patch_twikit()

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
    log(f"Found {len(existing_keys)} existing bookmark keys across all prior raw files")

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
    consecutive_dupe_pages = 0

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

        # Stop once we have paged into material we already have. Without this
        # the fetch walks the ENTIRE bookmark list every single run (177 pages
        # on 2026-08-23) purely to rediscover that it is all duplicates.
        stop, consecutive_dupe_pages = should_stop_early(page_new, consecutive_dupe_pages)
        if stop:
            log(
                f"Reached {consecutive_dupe_pages} consecutive pages with nothing new "
                f"— stopping ({len(bookmarks)} new, {dupes} dupes seen)."
            )
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

    # ---------------------------------------------------------------------
    # Second pass: fill in X Article bodies.
    #
    # The bookmarks feed returns article METADATA only (title, preview_text,
    # cover_media, ids) — no content_state, so the first pass can name an
    # article but not read it. One extra authenticated request per article
    # recovers the full text. Articles are rare (about one a week), so this
    # costs a request or two, and every failure degrades to the preview.
    # ---------------------------------------------------------------------
    pending = [(k, v) for k, v in bookmarks.items() if v.get("needs_article_body")]
    if pending:
        log(f"Fetching {len(pending)} X-article {'body' if len(pending) == 1 else 'bodies'}...")
        for key, record in pending:
            tweet_id = key.rsplit("/", 1)[-1]
            body = await fetch_x_article_body(client, tweet_id)
            if body and len(body) > len(record["text"]):
                title = record["text"].split("\n", 1)[0].replace("[X Article]", "").strip()
                header = f"[X Article] {title}\n\n" if title else "[X Article]\n\n"
                record["text"] = header + body
                record["is_article"] = True
                log(f"    {record['handle']}: {len(body)} chars")
            else:
                log(f"    {record['handle']}: body unavailable, keeping preview")
            record.pop("needs_article_body", None)
    for record in bookmarks.values():
        record.pop("needs_article_body", None)

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

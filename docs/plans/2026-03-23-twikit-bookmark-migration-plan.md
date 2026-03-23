# Twikit Bookmark Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 15-30 minute browser-based bookmark extraction with a ~30 second Python script using twikit's GraphQL API, enabling fully headless cron job execution.

**Architecture:** A Python script uses twikit to call X's internal GraphQL API with cookie auth, fetches all bookmarks with pagination, transforms them to the existing raw JSON format, then the existing Claude Code `/extract-bookmarks` skill handles summarization and knowledge base generation. Chrome CDP serves as fallback if twikit breaks.

**Tech Stack:** Python 3, twikit (async), existing Node.js knowledge base pipeline

**Design doc:** `docs/plans/2026-03-23-podcast-sources-design.md` (Follow-Up section)

---

### Task 1: Install twikit and Verify Auth

**Files:**
- Modify: `.env` (add cookie values)

**Step 1: Install twikit**

```bash
pip install twikit
```

**Step 2: Extract cookies from Chrome**

1. Open Chrome, go to `x.com`, ensure you're logged in
2. Open DevTools (Cmd+Option+I) → Application tab → Cookies → `https://x.com`
3. Copy `ct0` value (hex string, CSRF token)
4. Copy `auth_token` value (hex string, session token)

**Step 3: Add cookies to `.env`**

```bash
# Add to ~/brief-signal/.env (or ~/info-agg/.env depending on where extraction runs)
X_CT0=your_ct0_value_here
X_AUTH_TOKEN=your_auth_token_value_here
```

**Step 4: Verify auth works**

Create a quick test script and run it:

```python
import asyncio
from twikit import Client

async def test():
    client = Client('en-US')
    client.set_cookies({
        'ct0': 'YOUR_CT0_HERE',
        'auth_token': 'YOUR_AUTH_TOKEN_HERE'
    })
    uid = await client.user_id()
    print(f"Authenticated as user {uid}")

    # Fetch first page of bookmarks
    bookmarks = await client.get_bookmarks(count=5)
    for tweet in bookmarks:
        print(f"@{tweet.user.screen_name}: {tweet.full_text[:80]}...")

asyncio.run(test())
```

Run: `python3 test_twikit.py`

Expected: Prints your user ID and first 5 bookmarks. If `Unauthorized` error, re-extract cookies.

**Step 5: Delete test script, commit .env update to .gitignore**

Verify `.env` is in `.gitignore`. Delete test script.

```bash
git add .gitignore
git commit -m "chore: ensure .env is gitignored for twikit cookies"
```

---

### Task 2: Write the Twikit Bookmark Fetcher Script

**Files:**
- Create: `scripts/fetch-bookmarks.py`

**Step 1: Write the fetcher script**

This script replaces Steps 2-4 of the current `/extract-bookmarks` skill (browser open → scroll → collect URLs → filter new). It outputs the same raw JSON format the existing pipeline expects.

```python
#!/usr/bin/env python3
"""
Brief Signal — Twikit Bookmark Fetcher

Fetches X bookmarks using twikit's GraphQL API (replaces browser scrolling).
Outputs raw JSON matching the existing bookmarks-raw-YYYY-MM-DD.json format.

Requires: X_CT0 and X_AUTH_TOKEN in .env or environment
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    from twikit import Client
    from twikit.errors import TooManyRequests, Unauthorized
except ImportError:
    print("ERROR: twikit not installed. Run: pip install twikit")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional — env vars can be set directly

RAW_DIR = Path.home() / "info-agg" / "prompts"
LOG_PREFIX = "[fetch-bookmarks]"


def log(msg):
    print(f"{LOG_PREFIX} {datetime.now().strftime('%H:%M:%S')} {msg}")


def warn(msg):
    print(f"{LOG_PREFIX} {datetime.now().strftime('%H:%M:%S')} WARN: {msg}", file=sys.stderr)


def load_previous_ids():
    """Load video IDs from recent raw JSON files to skip already-extracted bookmarks."""
    ids = set()
    raw_files = sorted(RAW_DIR.glob("bookmarks-raw-*.json"), reverse=True)
    for f in raw_files[:4]:  # Check last 4 weeks
        try:
            data = json.loads(f.read_text())
            for entry in data:
                if entry.get("url"):
                    ids.add(entry["url"])
                # Also check by tweet ID pattern
                tweet_id = entry.get("tweet_id") or entry.get("id")
                if tweet_id:
                    ids.add(str(tweet_id))
        except (json.JSONDecodeError, KeyError):
            continue
    return ids


def tweet_to_raw(tweet, index):
    """Convert a twikit Tweet object to the existing raw JSON format."""
    # Build tweet URL
    url = f"https://x.com/{tweet.user.screen_name}/status/{tweet.id}"

    # Extract external links
    external_urls = []
    if tweet.urls:
        for url_entity in tweet.urls:
            expanded = url_entity.get("expanded_url", "")
            # Skip t.co self-links and x.com links
            if expanded and "t.co" not in expanded and "x.com" not in expanded and "twitter.com" not in expanded:
                external_urls.append(expanded)

    has_external = len(external_urls) > 0
    external_url = external_urls[0] if has_external else None

    # Estimate read time from text length
    text = tweet.full_text or tweet.text or ""
    word_count = len(text.split())
    read_time_min = max(1, -(-word_count // 238))  # Ceiling division

    # Parse date
    date_str = None
    if tweet.created_at_datetime:
        date_str = tweet.created_at_datetime.strftime("%Y-%m-%d")
    elif tweet.created_at:
        try:
            dt = datetime.strptime(tweet.created_at, "%a %b %d %H:%M:%S %z %Y")
            date_str = dt.strftime("%Y-%m-%d")
        except ValueError:
            date_str = None

    return {
        "id": str(index),
        "tweet_id": tweet.id,
        "source": "x",
        "author": tweet.user.name,
        "handle": tweet.user.screen_name,
        "title": text[:100] + ("..." if len(text) > 100 else ""),
        "date": date_str,
        "url": url,
        "text": text[:300],
        "full_text": text,
        "read_time_min": read_time_min,
        "has_external_link": has_external,
        "external_url": external_url,
        "external_read_time_min": None,  # Populated later by knowledge base generator
        "has_card": tweet.has_card,
        "card_title": tweet.thumbnail_title,
        "card_image": tweet.thumbnail_url,
        "likes": tweet.favorite_count,
        "retweets": tweet.retweet_count,
        "replies": tweet.reply_count,
        "views": tweet.view_count,
        "topics": [],  # Populated later by knowledge base generator
        "extracted_at": datetime.now(timezone.utc).isoformat(),
    }


async def fetch_all_bookmarks():
    ct0 = os.environ.get("X_CT0")
    auth_token = os.environ.get("X_AUTH_TOKEN")

    if not ct0 or not auth_token:
        print("ERROR: X_CT0 and X_AUTH_TOKEN must be set in environment or .env")
        sys.exit(1)

    client = Client("en-US")
    client.set_cookies({"ct0": ct0, "auth_token": auth_token})

    # Verify auth
    try:
        uid = await client.user_id()
        log(f"Authenticated as user {uid}")
    except Unauthorized:
        print("ERROR: Cookies expired. Re-extract ct0 and auth_token from Chrome.")
        print("  Chrome → x.com → DevTools → Application → Cookies → https://x.com")
        sys.exit(1)

    # Load previous IDs for deduplication
    previous_ids = load_previous_ids()
    log(f"Previously extracted entries: {len(previous_ids)}")

    # Fetch all bookmarks
    all_tweets = []
    log("Fetching bookmarks...")
    start = time.time()

    bookmarks = await client.get_bookmarks(count=20)
    all_tweets.extend(bookmarks)
    log(f"  Page 1: {len(bookmarks)} bookmarks (total: {len(all_tweets)})")

    page = 2
    while len(bookmarks) > 0:
        try:
            bookmarks = await bookmarks.next()
            if len(bookmarks) == 0:
                break
            all_tweets.extend(bookmarks)
            log(f"  Page {page}: {len(bookmarks)} bookmarks (total: {len(all_tweets)})")
            page += 1
            await asyncio.sleep(0.5)  # Gentle rate limiting
        except TooManyRequests as e:
            wait = max(5, e.rate_limit_reset - int(time.time()) + 5)
            warn(f"Rate limited, waiting {wait}s")
            await asyncio.sleep(wait)
            continue

    elapsed = time.time() - start
    log(f"Fetched {len(all_tweets)} total bookmarks in {elapsed:.1f}s")

    # Filter to new bookmarks only
    new_tweets = []
    for tweet in all_tweets:
        url = f"https://x.com/{tweet.user.screen_name}/status/{tweet.id}"
        if url not in previous_ids and tweet.id not in previous_ids:
            new_tweets.append(tweet)

    log(f"New bookmarks (not previously extracted): {len(new_tweets)}")

    if len(new_tweets) == 0:
        log("No new bookmarks to extract. Done.")
        return

    # Convert to raw JSON format
    raw_entries = [tweet_to_raw(t, i + 1) for i, t in enumerate(new_tweets)]

    # Write raw JSON
    today = datetime.now().strftime("%Y-%m-%d")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    output_path = RAW_DIR / f"bookmarks-raw-{today}.json"
    output_path.write_text(json.dumps(raw_entries, indent=2, ensure_ascii=False))

    log(f"Saved {len(raw_entries)} entries to {output_path}")
    log(f"=== Done ===")

    # Print summary for pipeline
    print(f"\n## Bookmark Fetch Complete")
    print(f"- Total bookmarks on X: {len(all_tweets)}")
    print(f"- New (not previously extracted): {len(new_tweets)}")
    print(f"- Output: {output_path}")
    print(f"- Time: {elapsed:.1f}s")


if __name__ == "__main__":
    asyncio.run(fetch_all_bookmarks())
```

**Step 2: Test the script**

```bash
cd ~/brief-signal && python3 scripts/fetch-bookmarks.py
```

Verify:
- Authenticates successfully
- Fetches all bookmarks (should take ~10-30 seconds)
- Filters out previously extracted bookmarks
- Writes `bookmarks-raw-YYYY-MM-DD.json` with the expected format
- Each entry has: author, handle, full_text, url, date, external links

**Step 3: Compare output format with existing raw JSON**

Read the most recent existing `bookmarks-raw-*.json` and compare field names with the twikit output. Ensure the knowledge base generator can consume both formats.

**Step 4: Commit**

```bash
git add scripts/fetch-bookmarks.py
git commit -m "feat: add twikit bookmark fetcher (replaces browser scrolling)"
```

---

### Task 3: Update the Extract-Bookmarks Skill

**Files:**
- Modify: `~/.claude/skills/extract-bookmarks/SKILL.md`

**Step 1: Update the skill to use twikit as primary path**

Replace Steps 2-4 (browser open, scroll, collect URLs, filter) with a single step that runs the twikit fetcher. Keep the browser-based approach documented as a fallback.

The new workflow becomes:

1. **Step 1:** Check what exists (same as before)
2. **Step 2 (NEW):** Run twikit fetcher → `python3 ~/brief-signal/scripts/fetch-bookmarks.py`
3. **Step 3:** If twikit fails (cookies expired), fall back to browser-based extraction (old Steps 2-4)
4. **Step 4:** Extract full text for external links (same as current Step 5)
5. **Step 5:** Categorize and summarize (same as current Step 6)
6. **Step 6:** Write knowledge base files (same as current Step 7)
7. **Step 7:** Generate action items (same as current Step 8)

Key changes to the skill file:
- Add a "Primary: Twikit" section at Step 2 with the command to run
- Move the browser-based collection to a "Fallback: Browser Automation" section
- Add a note about cookie expiry detection and refresh instructions
- Update the "Important Notes" section to mention twikit

**Step 2: Commit**

```bash
git add ~/.claude/skills/extract-bookmarks/SKILL.md
git commit -m "feat: update extract-bookmarks skill to use twikit as primary"
```

---

### Task 4: Update Cron Job for Bookmarks

**Files:**
- Cron job configuration

**Step 1: Verify the bookmark extraction cron job works with twikit**

The cron job from the podcast plan already schedules `/extract-bookmarks` at Sunday 7 PM. The skill update in Task 3 means it will automatically use twikit first.

Test the full flow:
```bash
# Simulate what the cron job does
cd ~/info-agg && claude -p --dangerously-skip-permissions "Run /extract-bookmarks"
```

Verify:
- [ ] twikit fetcher runs first (~30 seconds)
- [ ] Raw JSON is created
- [ ] Knowledge base generation completes
- [ ] Total time is significantly less than 15-30 minutes

**Step 2: Add cookie expiry alerting**

The script already exits with a clear error when cookies expire. For the cron job, ensure this error is captured in the log so Simon sees it Monday morning.

Check that `generate-weekly.sh` logs capture the error:
```bash
# The script already logs WARN on failure — verify the cron job captures stderr
```

**Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "feat: verify twikit integration with cron job pipeline"
```

---

### Task 5: Add Cookie Refresh Documentation

**Files:**
- Create: `docs/cookie-refresh.md` or add section to existing docs

**Step 1: Document the cookie refresh process**

When cookies expire (every few months), Simon needs to:

1. Open Chrome → x.com (must be logged in)
2. DevTools (Cmd+Option+I) → Application → Cookies → `https://x.com`
3. Copy `ct0` and `auth_token` values
4. Update `.env` file:
   ```
   X_CT0=new_value_here
   X_AUTH_TOKEN=new_value_here
   ```
5. Test: `python3 ~/brief-signal/scripts/fetch-bookmarks.py`

**Step 2: Add detection to the script output**

The script already prints a clear error on `Unauthorized`. Add a note in the weekly pipeline PR template that says "If bookmarks are missing, cookies may have expired — see docs/cookie-refresh.md".

**Step 3: Commit**

```bash
git add -A
git commit -m "docs: add cookie refresh instructions for twikit"
```

---

### Task 6: End-to-End Test and Cleanup

**Step 1: Full pipeline test**

Run the complete bookmark extraction with twikit:
```bash
cd ~/info-agg && claude -p --dangerously-skip-permissions "Run /extract-bookmarks"
```

Verify:
- [ ] twikit fetches bookmarks in <1 minute
- [ ] Deduplication works (previously extracted bookmarks are skipped)
- [ ] Raw JSON format matches what generate-briefing.js expects
- [ ] Knowledge base markdown is generated correctly
- [ ] External link extraction still works (Step 5 of skill)
- [ ] Topic categorization still works (Step 6 of skill)

**Step 2: Compare output quality**

Compare a twikit-generated knowledge base with a recent browser-generated one:
- Are all the same fields populated?
- Is full_text complete (not truncated)?
- Are external links detected correctly?
- Are dates parsed correctly?

**Step 3: Time comparison**

Log the total extraction time. Expected:
- twikit fetch: ~30 seconds
- External link extraction: ~5-10 minutes (same as before — still visits each URL)
- Summarization: ~5 minutes (same as before)
- **Total: ~10-15 minutes (down from 25-40 minutes)**

The browser scrolling was the bottleneck. External link fetching still takes time but is more reliable.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: twikit bookmark migration complete — end-to-end verified"
```

---

## Summary

| Task | What | Est. Time |
|------|------|-----------|
| 1 | Install twikit, extract cookies, verify auth | 10 min |
| 2 | Write `scripts/fetch-bookmarks.py` | 20 min |
| 3 | Update `/extract-bookmarks` skill (twikit primary, browser fallback) | 10 min |
| 4 | Verify cron job works with twikit | 10 min |
| 5 | Cookie refresh documentation | 5 min |
| 6 | End-to-end test and cleanup | 15 min |

---
name: extract-bookmarks
description: Extract X/Twitter bookmarks into the knowledge base (weekly workflow)
---

# Extract X Bookmarks

Weekly workflow to extract new bookmarks from X/Twitter into the knowledge base.

## Context

The user maintains a knowledge base of X bookmarks at:
- **Knowledge base:** `/Users/simonbrief/skills/bookmarks-knowledge-base-YYYY-MM-DD.md` (organized by topic with summaries)
- **Quick reference:** `/Users/simonbrief/skills/bookmarks-organized-YYYY-MM-DD.md` (tables with links)
- **Raw data:** `/Users/simonbrief/info-agg/prompts/bookmarks-raw-YYYY-MM-DD.json`
- **Sources index:** `/Users/simonbrief/info-agg/SOURCES.md`

**IMPORTANT:** All skill/knowledge base markdown files go to `/Users/simonbrief/skills/` (the global skills folder). Raw JSON data goes to `/Users/simonbrief/info-agg/prompts/`. Never write knowledge base files to `~/info-agg/skills/`.

## Workflow

### Step 1: Check what exists
Read the most recent knowledge base file to understand what's already been extracted. Check dates to know what's new.

### Step 2: Fetch bookmarks via twikit (PRIMARY)

Run the twikit-based fetcher script:

```bash
python3 ~/brief-signal/scripts/fetch-bookmarks.py
```

This script:
- Authenticates using cookies from `~/brief-signal/.env` (`X_CT0` and `X_AUTH_TOKEN`)
- Fetches all bookmarks from the X API
- Deduplicates against existing raw JSON files
- Writes new entries to `bookmarks-raw-YYYY-MM-DD.json`
- Takes ~30 seconds to complete

If successful, skip Step 3, **run the enrichment step below**, then proceed to Step 4.

> **Cookie expiry:** If you see an `Unauthorized` error, the saved cookies need refreshing — see `docs/cookie-refresh.md` for instructions.

#### Step 2.5: Enrich linked articles (REQUIRED after twikit fetch)

`fetch-bookmarks.py` captures the full text of each X post, but when a bookmark
*links out* to an article (blog post, essay, YouTube talk), only the URL is
stored. Run the enrichment script to fetch the actual article bodies so they can
be read into the knowledge base and briefing:

```bash
python3 ~/brief-signal/scripts/enrich-bookmarks.py
```

This reads the latest `bookmarks-raw-*.json` and, for every entry with
`external_links`, adds `external_title`, `external_content` (readable body text),
`external_read_time_min`, and `external_fetch_status`. It is idempotent (only
fetches what's missing), public-web only (no auth), and never fatal — paywalled
or failing links are skipped with a warning. Hard paywalls (Economist, Time,
etc.) being skipped is expected.

### Step 3: Browser-based extraction (FALLBACK)

**Only use this if Step 2 (twikit) fails** — e.g., cookies expired and can't be refreshed immediately, or the API has changed.

#### 3a: Open bookmarks in browser
1. Call `tabs_context_mcp` to get current browser state
2. Create a new tab with `tabs_create_mcp`
3. Navigate to `https://x.com/i/bookmarks`
4. Wait for page to load

#### 3b: Collect bookmark URLs
Use JavaScript auto-scroll collection pattern to gather all bookmark URLs:
```javascript
(async () => {
  const collected = {};
  let lastCount = 0, stableRounds = 0;
  for (let i = 0; i < 40; i++) {
    document.querySelectorAll('article').forEach(article => {
      const links = article.querySelectorAll('a[href*="/status/"]');
      const timeEl = article.querySelector('time');
      const handle = article.querySelector('div[data-testid="User-Name"] a')?.href?.split('/').pop();
      const name = article.querySelector('div[data-testid="User-Name"] span')?.textContent;
      const text = article.querySelector('div[data-testid="tweetText"]')?.textContent || '';
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href?.match(/\/status\/\d+$/) && !collected[href]) {
          collected[href] = { handle, name, date: timeEl?.dateTime, text: text.substring(0, 300), url: 'https://x.com' + href };
        }
      });
    });
    window.scrollBy(0, 800);
    await new Promise(r => setTimeout(r, 600));
    const count = Object.keys(collected).length;
    if (count === lastCount) { stableRounds++; if (stableRounds >= 4) break; }
    else { stableRounds = 0; lastCount = count; }
  }
  sessionStorage.setItem('bookmarkTweets', JSON.stringify(collected));
  return Object.keys(collected).length + ' tweets collected';
})()
```

#### 3c: Filter new bookmarks
Compare collected URLs against existing knowledge base to identify only NEW bookmarks since last extraction.

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

### Step 4: Read time and content (twikit path — no browser needed)

When the twikit path (Steps 2 + 2.5) ran, the raw JSON already contains
everything you need — do NOT re-navigate in a browser:
- **Tweet text** is in the `text` field, captured in FULL (including long-form
  note tweets). Use it verbatim — see the truncation rule in Step 5.
- **External article content** is in `external_content` / `external_title` /
  `external_read_time_min` / `external_fetch_status`, populated by Step 2.5.
- For tweet read time, count words in `text` ÷ 238, round up, min 1.

Only fall back to the browser navigation below if you used the Step 3 browser
fallback (i.e. twikit was unavailable):
1. Navigate to tweet URL, wait 3s, `get_page_text` for full content.
2. If the tweet links out, navigate to the external URL and extract the article
   (or `yt-dlp --skip-download --print "%(duration)s"` for YouTube duration).
   Paywalled/failed → `external_read_time_min: null`.

### Step 5: Categorize and summarize

> **NEVER truncate.** The raw JSON `text` is the FULL post. Do not cut it to
> ~280/300 chars or append an ellipsis — the briefing generator reads these
> entries and needs the complete thought. Reproduce the full `text`.
>
> **ALWAYS include the permalink.** Every KB entry MUST carry the tweet's full
> URL (`https://x.com` + the raw-JSON key, e.g.
> `https://x.com/handle/status/1234567890`) on its header line:
> `**[@handle (YYYY-MM-DD) — Title](https://x.com/handle/status/…)** (N min)`.
> The briefing generator can only cite URLs that appear in the KB — when the
> permalink is missing it has fabricated placeholder links like
> `https://x.com/handle/status/...` (shipped broken in Edition #23's draft,
> 2026-07-26). The raw JSON keys ARE the permalinks; carry them through.
>
> **Surface linked-article content.** For any entry with
> `external_fetch_status: "ok"`, the bookmark's real value is usually the linked
> article, not the tweet. In that entry, include:
> - the `external_title` and `external_read_time_min` (e.g. *Linked: "Policy on
>   the AI Exponential" — 25 min read*), and
> - a 2–3 sentence summary of `external_content` capturing the article's actual
>   argument/claims (not just the tweet's framing).
> This is what lets the briefing cite what the source *says*, not just that it
> exists.

#### Signal Rating (REQUIRED on every entry)

Every entry MUST end with a relevance grade, on its own line, in exactly this
shape — the same one `scripts/extract-podcasts.js` writes, so one parser reads
all sources:

```
- **GCP Relevance:** HIGH — Google's own announcement of a new Gemini robotics model line.
```

Grade for **a Google Cloud sales rep preparing for founder meetings** — not for
general interest. Judge each bookmark on its own, with only that bookmark in
front of you. Do not try to rank it against the rest of the week.

- **HIGH** — Cloud infrastructure decisions, migration patterns, spend or pricing
  data, buying criteria, model routing/eval decisions. **Any first-party
  announcement from Google or a named competitor** (see below). Anything a rep
  would be embarrassed to hear about first from a founder.
- **MEDIUM** — General AI/tech signal a rep could reference in a meeting:
  funding rounds, product launches by third parties, market shifts, builder
  patterns. Real but not tied to a cloud decision.
- **LOW** — Tangential to cloud and AI building: politics, culture, sport,
  personal-interest posts, generic threads. Still extract the entry in full —
  LOW means "don't surface it," never "drop it."

**First-party rule — this one is not a judgment call.** If the entry comes from
Google's or a named competitor's own account or domain, it is **never LOW**, and
a product/model/pricing announcement from one of them is **HIGH**. Rationale: a
Google product announcement once lost a Quick Hit slot to a third-party story
because nothing marked it as first-party (Edition #24, Gemini Robotics 2). The
briefing exists to keep reps ahead of their customers on exactly this.

Named accounts and domains:
- **Google** — `@Google`, `@GoogleAI`, `@GoogleCloud`, `@GoogleDeepMind`,
  `@googledevs`; `blog.google`, `cloud.google.com`, `ai.google`, `deepmind.google`
- **Hyperscaler rivals** — `@AWS`/`@awscloud`, `@Microsoft`/`@Azure`;
  `aws.amazon.com`, `azure.microsoft.com`
- **Frontier labs** — `@OpenAI`, `@AnthropicAI`, `@AIatMeta`, `@MistralAI`,
  `@xai`; `openai.com`, `anthropic.com`, `ai.meta.com`, `mistral.ai`, `x.ai`
- **Chinese open-weight labs** — `@deepseek_ai`, `@Alibaba_Qwen`,
  `@Kimi_Moonshot`; `deepseek.com`, `qwen.ai`, `moonshot.ai`

> **Grading is additive.** It appends one line per entry. It must never shorten,
> summarize away, or drop an entry — the no-truncation and permalink rules above
> still apply in full. A LOW grade changes nothing about how the entry is stored.

> **No weekly HIGH cap.** Unlike the podcast extractor, do not limit HIGH to N
> per run. Bookmarks are single posts, not 90-minute episodes; capping would
> silently drop first-party announcements in a busy week.

#### Topic Assignment (dynamic)

Topics are NOT a fixed list. They grow organically with the content.

**Step 5a: Load existing topics.**
Read the most recent `/Users/simonbrief/skills/bookmarks-knowledge-base-*.md` and collect every `## Topic Name`
heading. These are your starting palette — reuse them when content fits.

**Step 5b: Assign topics to each new bookmark.**
For each bookmark, pick the best existing topic OR create a new one. Use these rules:

- **Reuse first.** If an existing topic fits well, use it. Don't create near-duplicates
  (e.g., don't create "AI Coding Tools" if "Claude Code & AI Dev Tools" already exists).
- **Create when needed.** If a bookmark clearly doesn't fit any existing topic, create a
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
- **One or two topics per bookmark.** Most get one. Use two only when genuinely dual-topic.

### Step 6: Update knowledge base files
1. **Append** new entries to the existing knowledge base markdown (don't overwrite)
2. Update the raw JSON with new entries
3. Update SOURCES.md extraction stats
4. Report what was added

### Step 7: Generate action items
For each new bookmark, extract:
- **Tools to try** (software, APIs, frameworks mentioned)
- **Strategies to implement** (workflows, techniques, frameworks)
- **Content ideas** (topics to write about, inspired by bookmarks)

Append these to a `## This Week's Action Items` section in the knowledge base.

## Output Format

After extraction, report:
```
## Bookmark Extraction Complete
- New bookmarks found: X
- Already in knowledge base: Y
- Topics covered: [list]
- Signal: A HIGH / B MEDIUM / C LOW  (must sum to X — an ungraded entry is a bug)
- First-party items (Google or named competitor): N — list them, none may be LOW

### New Entries Added:
1. [Author] — [Title/Summary] → [Topic] → [GRADE]
2. ...

### Action Items Extracted:
- [ ] Try [tool/technique]
- [ ] Implement [strategy]
- [ ] Write about [topic]
```

## Important Notes
- **Primary method:** twikit (`fetch-bookmarks.py`) — fast, reliable, handles dedup automatically.
- **Fallback method:** Browser automation — use only when twikit is unavailable.
- X uses virtual scrolling — only ~6 articles in DOM at once. Must scroll to collect all (browser fallback only).
- X Articles (long-form) require navigating to individual tweet URL for full text extraction.
- Some tweets get deleted between sessions — note these as unavailable.
- sessionStorage persists data within same origin between JS executions (browser fallback only).
- Always create a NEW knowledge base file with current date (don't overwrite previous ones).

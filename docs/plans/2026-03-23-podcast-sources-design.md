# Design: Podcast Sources for Brief Signal

**Date:** 2026-03-23
**Status:** Approved
**Author:** Simon + Claude

---

## Problem

Brief Signal currently draws from two source types: X bookmarks (tweets, threads, linked articles) and a YouTube playlist (short-form videos). These sources capture **what is happening** — launches, tools, announcements. But they miss **how people are thinking** about what's happening: the opinions, predictions, debates, and assumed truths circulating among founders and VCs. Podcasts are where that thinking lives.

Google Cloud startup sales reps need to walk into founder meetings knowing not just "agents are hot" but "founders assume they'll use open-source models for agents but are frustrated by orchestration tooling." That level of context comes from long-form conversation, not tweets.

---

## Approach

**YouTube-first with RSS placeholders (Approach C).** Most target podcasts post full episodes on YouTube. Reuse the existing `yt-dlp` subtitle extraction infrastructure. Audio-only podcasts get captured in config with RSS URLs but are not processed until the RSS pipeline is built.

### What was considered and rejected

- **YouTube-only (Approach A):** Too limited — loses track of audio-only podcasts entirely.
- **YouTube + RSS from day 1 (Approach B):** Over-builds for v1 — only 2 podcasts need RSS, and they're not the highest-signal sources.

---

## V1 Design

### 1. Podcast Registry — `config/podcasts.json`

A JSON config file listing every podcast. Adding or removing a podcast means editing this file, no code changes.

```json
[
  {
    "name": "All-In",
    "source": "youtube",
    "channelHandle": "@alaboroflove",
    "category": "VC/Market",
    "enabled": true
  },
  {
    "name": "No Priors",
    "source": "youtube",
    "channelHandle": "@NoPriorsPodcast",
    "category": "AI/Builder",
    "enabled": true
  },
  {
    "name": "AI Daily Brief",
    "source": "rss",
    "rssUrl": "https://feeds.example.com/aidailybrief",
    "category": "AI/News",
    "enabled": false,
    "note": "RSS pipeline not yet built"
  }
]
```

**Fields:**
- `name`: Display name of the podcast
- `source`: `"youtube"` or `"rss"` — determines extraction path
- `channelHandle`: YouTube channel handle (for constructing uploads playlist URL)
- `rssUrl`: RSS feed URL (for future audio pipeline)
- `category`: Grouping for organization (VC/Market, AI/Builder, Deep Dive, GTM, etc.)
- `enabled`: `false` for RSS entries until that pipeline is built
- `note`: Optional explanation for disabled entries

**Initial podcast list (YouTube-enabled):**

| Podcast | Channel Handle | Category |
|---------|---------------|----------|
| All-In | @alaboroflove | VC/Market |
| No Priors | @NoPriorsPodcast | AI/Builder |
| Hard Fork | @hardfaborklive | News/Tech |
| Pivot | @pivotpodcastofficial | News/Tech |
| DOAC (Diary of a CEO) | @TheDiaryOfACEO | Founder/Interview |
| My First Million | @MyFirstMillionPod | Founder/Builder |
| a16z Podcast | @a16z | VC/Builder |
| Gradient Dissent | @Aboralove | AI/Builder |
| Grit (Kleiner Perkins) | @KleinerPerkins | VC/Founder |
| AI & I (Dan Shipper) | @danshipper | AI/Builder |
| Latent Space | @LatentSpaceTV | AI/Builder |
| Lightcone (YC) | @ycombinator | Startup/Builder |
| The Cognitive Revolution | @CognitiveRevolutionPodcast | AI/Builder |
| Lenny's Podcast | @LennysPodcast | Product/Growth |
| 20VC | @20aborVC | VC/Funding |

**RSS placeholders (disabled):**

| Podcast | Category | Note |
|---------|----------|------|
| Acquired | Deep Dive | Has website transcripts — could scrape |
| AI Daily Brief | AI/News | Needs RSS + whisper |
| 10/10 GTM | GTM | Needs RSS + whisper |
| BG2 Pod | VC/Market | May have YouTube — verify |
| Rethinking with Adam Grant | Leadership | Needs RSS + whisper |
| Stratechery | Strategy | Paywalled — requires subscription |

### 2. Extraction Pipeline — `/extract-podcasts` Skill

A new Claude Code skill that runs independently of existing extractions.

**Pipeline steps:**

1. Read `config/podcasts.json`, filter to `enabled: true` and `source: "youtube"`
2. For each channel, run `yt-dlp --dateafter <7 days ago> --flat-playlist` on the channel's uploads playlist to get recent episode URLs
3. Deduplicate against previous extractions (check `podcasts-raw-*.json`)
4. For each new episode:
   a. Download auto-generated subtitles via `yt-dlp --write-auto-sub --skip-download`
   b. Send transcript to Gemini with the **podcast extraction prompt** (see below)
   c. Receive structured extraction
5. For episodes rated HIGH (max 3 per run):
   a. Run a **second Gemini pass** with the deep dive prompt
   b. Produce expanded timestamped segment analysis
6. Skip RSS entries with log: `"Skipped [name] — RSS pipeline not yet supported"`
7. Write output files:
   - `~/skills/podcasts-knowledge-base-YYYY-MM-DD.md`
   - `~/info-agg/prompts/podcasts-raw-YYYY-MM-DD.json`
   - `~/skills/podcasts-organized-YYYY-MM-DD.md`

**Estimated runtime:** ~2-3 minutes per channel (subtitle download + Gemini call). 15 channels = ~30-45 minutes. Deep dives add ~2 minutes each.

### 3. Podcast Extraction Prompt

The extraction prompt is tuned differently from the generic playlist prompt. It focuses on **intelligence extraction for sales teams**, not general summarization.

**Level 1 extraction (every episode) pulls out:**

- **Notable quotes** — with speaker attribution and timestamp. Verbatim where possible.
- **Consensus signals** — things hosts/guests treat as obvious or assumed. For interview shows, this captures the guest's worldview.
- **Debate points** — where smart people disagree, especially about infrastructure, tooling, or go-to-market. For interviews, where the host challenges the guest.
- **Founder/VC intent signals** — what people say they're building, buying, evaluating, or betting on.
- **GCP competitive intelligence** — specifically watches for:
  - Migration signals (who's moving between cloud providers and why)
  - Pain points (what's frustrating founders about current infrastructure)
  - Buying criteria (price, hardware access, specific services, support quality)
  - Competitive mentions (direct comparisons between cloud providers)
  - Budget/spend data (actual numbers on compute costs)
  - Undecided moments ("we're evaluating", "we haven't figured out" = open deals)
- **Signal rating** — HIGH / MEDIUM / LOW based on relevance to GCP startup sales

**Level 2 deep dive (HIGH episodes only, max 3/week) adds:**

- **Timestamped topic map** — every segment summarized in one line, with MEDIUM+ segments expanded:
  - Key quotes with full context
  - Speaker positions and reasoning
  - Takeaway for sales relevance
- **Companies/products mentioned** — named entities relevant to cloud/AI
- **Key numbers** — dollar figures, growth rates, user counts, with timestamps

### 4. Knowledge Base Format

Single file: `podcasts-knowledge-base-YYYY-MM-DD.md`

**Standard entry (MEDIUM/LOW):**

```markdown
## Hard Fork E312 (2026-03-20) — "Who Actually Needs an AI Agent?"
**Source:** [Hard Fork (YouTube)](https://youtube.com/watch?v=xxx)
**Duration:** 45 min | **Signal Rating:** MEDIUM

### Notable Quotes
- "Every startup is pitching agents but the customers I talk to just want better search" — Casey Newton (8:22)

### Signal Analysis
- **Consensus:** Agent hype has outpaced actual enterprise demand
- **Debate:** Whether agents need dedicated infrastructure or run fine on existing cloud
- **Intent Signal:** Enterprise buyers are skeptical — want proof-of-value before budget
- **GCP Relevance:** MEDIUM — opportunity to position managed agent tooling as lower-risk entry point
```

**HIGH entry with deep dive:**

```markdown
## All-In E213 (2026-03-21) — "The Agent Infrastructure Shakeout"
**Source:** [All-In Podcast (YouTube)](https://youtube.com/watch?v=xxx)
**Duration:** 62 min | **Signal Rating:** HIGH

### Notable Quotes
- "Every Series A deck I see now has an agent strategy slide, but nobody knows what infra to run them on" — Chamath Palihapitiya (12:34)
- "The compute costs for agent workloads are 10x what people budget for" — David Friedberg (28:15)

### Signal Analysis
- **Consensus:** Founders are building agents but treating infrastructure as an afterthought
- **Debate:** Self-host models vs. managed APIs — Sacks argues self-host for control, Chamath argues managed for speed
- **Intent Signal:** Multiple portfolio companies evaluating GPU cloud providers for fine-tuning workloads
- **GCP Relevance:** HIGH — infrastructure selection for agent workloads is an active, undecided purchase decision

### Deep Dive

**Timestamped Segments:**
- 0:00-8:00 — Weekly news recap (low signal, skip)
- 8:00-24:00 — **Agent infrastructure debate**
  - Sacks: self-hosting gives model flexibility, vendor lock-in is the real risk
  - Chamath: managed APIs win because eng teams are too small to run infra
  - Takeaway: founders are split — this is an active buying decision, not settled
- 24:00-38:00 — **Compute cost economics**
  - Friedberg: "Series B AI companies spending $2M+/yr on compute, most don't budget for it" (29:15)
  - Discussion of reserved instances vs. spot pricing vs. committed use discounts
  - GCP relevance: committed use discount positioning opportunity
- 38:00-52:00 — **Portfolio company patterns**
  - 3 of Chamath's portfolio companies moved from AWS to GCP in Q1 for TPU access
  - Pattern: companies start on AWS, hit a scaling wall, evaluate alternatives
  - Sacks pushes back: "that's an anecdote, not a trend" (45:22)
- 52:00-62:00 — Listener questions (low signal, skip)

**Companies/Products Mentioned:** GCP Vertex AI, AWS Bedrock, Azure OpenAI, LangChain, CrewAI, TPU v5e
**Key Numbers:** "$2M+ annual compute spend typical for Series B AI company" (29:15)
```

### 5. Briefing Integration

**Changes to `generate-briefing.js`:**
- Add third file lookup: find most recent `podcasts-knowledge-base-*.md` within 14 days
- Pass contents to Gemini alongside bookmarks and playlists knowledge bases
- If no podcast file found, generate from existing sources (graceful degradation)

**Changes to `scripts/briefing-prompt.md`:**
- Add podcast source guidance:
  - Attribute takes to speakers, not podcasts: "Chamath noted on All-In that..." not "All-In reported that..."
  - Source link format: `[Speaker on Podcast Name (Nmin, timestamp)](url)`
  - HIGH-rated deep dives can be referenced as "go deeper" links
  - Podcast signal is opinion/analysis — weave it in as context, don't report it as news
  - Consensus/debate patterns across multiple podcasts are especially valuable ("Three VCs flagged concerns about X this week")
- No new briefing section for v1 — podcast signal enriches existing sections (Founder Watch, Big Picture, Builder's Corner, etc.)

### 6. Automation & Scheduling

**All extractions become independent Claude Code cron jobs:**

| Time | Cron Job | Output |
|------|----------|--------|
| Sunday 7:00 PM | `/extract-podcasts` | `podcasts-knowledge-base-YYYY-MM-DD.md` |
| Sunday 7:00 PM | `/extract-bookmarks` | `bookmarks-knowledge-base-YYYY-MM-DD.md` |
| Sunday 7:00 PM | `/extract-playlist` | `playlist-knowledge-base-YYYY-MM-DD.md` |
| Sunday 9:00 PM | Briefing generation | Reads all 3 knowledge base files, generates briefing, opens PR |

- All three extractions run in parallel at 7 PM (they're independent)
- 2-hour buffer before briefing generation at 9 PM
- If any extraction fails, the others still produce their files
- Replaces the sequential stages in `generate-weekly.sh`
- Each cron job logs to `project.log`
- `generate-weekly.sh` gets simplified to just briefing generation + PR creation

**Documentation updates:**
- Update project `CLAUDE.md` / `GEMINI.md` with podcast pipeline documentation
- Update `scripts/briefing-prompt.md` with podcast attribution guidance
- Update `FOR_SIMON.md` explaining how podcast extraction works
- Update `generate-weekly.sh` comments

**Error handling:**
- If a single channel fails (unavailable video, missing subtitles): log warning, continue to next channel
- If entire podcast extraction fails: briefing generates from bookmarks + playlists (no podcast file found = skip gracefully)
- If deep dive fails for a HIGH episode: log warning, keep the Level 1 extraction

---

## Follow-Up: RSS/Whisper Pipeline for Audio-Only Podcasts

**Purpose:** Extend `/extract-podcasts` to handle podcasts that don't post on YouTube.

**Approach decision (2026-03-23):** Go with free/local options only. No paid services.
- **mlx-whisper** for transcription (free, local, Apple Silicon optimized)
- **Acquired.fm scraping** for Acquired specifically (free, has speaker-labeled transcripts)
- **Gemini for speaker inference** — mlx-whisper produces unlabeled transcripts (no speaker diarization). Rather than bolting on pyannote (complex setup, still only gives generic "Speaker 0/1" labels), pass the raw transcript to the Gemini extraction prompt with an instruction to infer speakers from context. Podcast hosts introduce themselves, have distinct speaking patterns, and reference each other by name. Add to extraction prompt: "The transcript has no speaker labels. Infer speakers from context — podcast hosts typically introduce themselves and guests. Label uncertain attributions as [unconfirmed]."

**Rejected alternatives:**
- **Deepgram API** ($6-10/mo) — best speaker diarization but ongoing cost. Revisit if Gemini speaker inference proves insufficient.
- **Podscan.fm** ($100/mo) — overkill for 3-5 podcasts. Better suited for cross-episode research/discovery, not weekly extraction.
- **Apple Podcasts transcripts** — lowest quality (75-85% accuracy), no speaker labels, relies on reverse-engineered private API that breaks between OS versions.

**Design:**

1. Config entries with `"source": "rss"` get processed through a separate code path
2. For each enabled RSS podcast:
   a. Fetch RSS feed, find episodes published in last 7 days
   b. Download MP3 from RSS enclosure URL
   c. Transcribe locally using `mlx-whisper` with `large-v3-turbo` model (~6-10 min per episode)
   d. Send transcript to same Gemini extraction prompt as YouTube path (prompt includes speaker inference instruction)
3. **Special case — Acquired:** Scrape transcript from acquired.fm instead of transcribing. These include real speaker names (Ben:, David:, Guest:) — higher quality than any transcription approach.
4. Output merges into the same `podcasts-knowledge-base-YYYY-MM-DD.md` file

**Dependencies:**
- `pip install mlx-whisper` (one-time, optimized for Apple Silicon)
- RSS feed URLs for each podcast (captured in config already)

**Performance:**
- ~6-10 minutes transcription per 1-hour episode on M2/M3, faster on M4
- For 2-3 audio-only podcasts: ~20-30 minutes additional processing
- Acquired scraping: near-instant

**Special cases:**
- **Acquired:** Scrape website transcripts (free, speaker-labeled, highest quality option)
- **Stratechery:** Paywalled RSS. Requires Stratechery Plus subscription credentials. May not be worth the complexity.

**When to build:** After v1 is running and you've assessed whether the YouTube-only coverage is sufficient. If you're consistently missing signal from Acquired or AI Daily Brief, build this next.

---

## Follow-Up: Migrate Bookmark Extraction to `twikit`

**Purpose:** Replace the current 15-30 minute browser automation workflow with a ~30 second Python script.

**Design:**

1. Install `twikit` via pip
2. Extract `ct0` and `auth_token` cookies from Chrome (one-time, cookies last weeks/months)
3. Store cookies in `.env`
4. Python script calls `client.get_bookmarks()` → returns full tweet data as JSON
5. Transform output to match existing `bookmarks-raw-YYYY-MM-DD.json` format
6. Feed into existing knowledge base generation pipeline

**Advantages over current approach:**
- 30 seconds vs. 15-30 minutes
- Fully headless — no browser needed
- No virtual scrolling fragility
- No 800 bookmark limit (uses same internal API as web app)
- Perfect for cron job execution

**Fallback:** Chrome CDP with network request interception. Navigate to bookmarks page via CDP, scroll, capture X's GraphQL responses directly instead of scraping DOM. Faster and more reliable than current DOM scraping, but still requires Chrome to be running.

**Risk:** `twikit` uses X's internal GraphQL API which could change. The library is actively maintained (2000+ GitHub stars) and tracks API changes. If it breaks, fall back to Chrome CDP while waiting for a twikit update.

**When to build:** Can be built independently of the podcast work. High-value improvement — dramatically simplifies the Sunday cron job and eliminates the browser dependency for bookmark extraction.

---

## Podcast Landscape Reference

Full research saved at `tasks/podcast-landscape-research.md`. Key highlights:

**YouTube-available (full episodes):** No Priors, Hard Fork, Pivot, DOAC, a16z, Gradient Dissent, My First Million, All-In, Grit, Latent Space, Lightcone (YC), Lenny's Podcast, 20VC, Cognitive Revolution, AI & I (Dan Shipper)

**Audio-only / limited YouTube:** Acquired (has website transcripts), AI Daily Brief, 10/10 GTM, Rethinking with Adam Grant

**Paywalled:** Stratechery (requires Stratechery Plus subscription)

**Not found:** "The Hard Pivot" — no podcast by this name exists. May be a different name or not yet launched.

**Recommended additions (from research):**
- Latent Space (Swyx & Alessio) — the AI engineer podcast, extremely high signal for builder patterns
- Lightcone (Y Combinator) — earliest window into what AI startups are building
- The Cognitive Revolution (Nathan Labenz) — AI builder analysis
- Lenny's Podcast — product/growth frameworks founders follow
- 20VC (Harry Stebbings) — VC funding signals
- Unsupervised Learning (Redpoint Ventures) — AI investment thesis
- Practical AI (Changelog) — MLOps and AI infrastructure

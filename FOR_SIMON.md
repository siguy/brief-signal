# FOR SIMON: How Brief Signal Works (and What You Built)

Hey Simon. This is your learning document for Brief Signal -- the thing that keeps Google Cloud sales reps from walking into founder meetings sounding clueless. Let's walk through it.

---

## What This Project Does and Why

Brief Signal is a weekly 5-minute AI market briefing. Your audience is Google Cloud startup sales reps -- people who sell cloud infrastructure to AI-native founders. The problem: founders live in a world of podcasts, Twitter threads, and YouTube deep dives. Sales reps don't have time to follow all of that. So you built a pipeline that reads what founders read, watches what they watch, listens to what they listen to, and distills it into one briefing every Monday morning.

Three sources feed the briefing:
1. **X bookmarks** -- tweets, threads, articles you've saved that founders are talking about
2. **YouTube playlist** -- short-form AI videos from your curated playlist
3. **Podcasts** -- the newest and most interesting source (more on this below)

Think of it like a kitchen. The three extractors are prep cooks chopping ingredients (raw signal). The briefing generator is the head chef combining everything into a dish (the final briefing). The website is the plate it's served on.

---

## The Podcast Pipeline: How It Works

The podcast extractor (`scripts/extract-podcasts.js`) is the most sophisticated piece of the system. Here's the flow, step by step.

### Step 1: Read the Menu

The script reads `config/podcasts.json` -- a registry of 21 podcasts. Each entry says what the podcast is called, where it lives (YouTube channel or RSS feed), and whether it's enabled. Right now, 16 YouTube-hosted podcasts are enabled. The 5 RSS-only ones (Acquired, AI Daily Brief, etc.) are registered but disabled -- placeholders for when you build the RSS pipeline.

### Step 2: Check What's New

For each enabled podcast, the script calls `yt-dlp` (a command-line tool that talks to YouTube) to grab the 10 most recent uploads from that channel. Then it cross-references against a deduplication list -- the last 4 weeks of raw extraction files. If an episode was already processed last week, it skips it.

This is like checking your fridge before going to the grocery store. No point buying milk if you already have milk.

### Step 3: Grab the Transcript

For each new episode, `yt-dlp` downloads the auto-generated English subtitles (VTT format). The script then parses the VTT file into clean plaintext -- stripping timestamps, HTML tags, and duplicate lines. YouTube's auto-captions repeat lines across overlapping time windows, so the deduplication step here is important.

If an episode has no subtitles (rare for English content, but it happens), the script logs a warning and moves on. It never crashes on a single episode failure.

### Step 4: Level 1 Extraction (Every Episode)

This is where the AI magic happens. The transcript gets sent to **Gemini 2.5 Flash** with a carefully crafted system prompt (`scripts/podcast-extraction-prompt.md`). Gemini returns a structured JSON object containing:

- **Notable quotes** -- verbatim, with speaker names and timestamps
- **Consensus signals** -- things hosts/guests treat as obvious ("everyone agrees agents are the next platform shift")
- **Debate points** -- where smart people disagree, with each speaker's position
- **Intent signals** -- what founders say they're building, buying, or evaluating
- **GCP intelligence** -- the secret sauce (see next section)
- **Signal rating** -- HIGH, MEDIUM, or LOW

The prompt is opinionated on purpose. It tells Gemini: "Precision matters more than volume. Empty arrays are fine for low-signal episodes." A sparse extraction of a boring episode is far more valuable than a padded one that wastes a sales rep's time.

### Step 5: Level 2 Deep Dive (HIGH Episodes Only)

Episodes rated HIGH get a second Gemini pass using a different prompt (`scripts/podcast-deep-dive-prompt.md`). Maximum 3 per week -- this keeps costs and processing time reasonable.

The deep dive adds:
- **Timestamped segment map** -- the episode broken into 5-10 topic blocks, each summarized. LOW segments (intros, ads, banter) get a one-liner. MEDIUM and HIGH segments get expanded with key quotes, speaker positions, and a specific sales relevance takeaway.
- **Companies/products mentioned** -- every named entity, so a rep meeting with Company X tomorrow can search for it
- **Key numbers** -- dollar figures, growth rates, user counts with timestamps

Think of Level 1 as reading the back cover of a book. Level 2 is reading the highlighted passages with margin notes.

### Step 6: Write the Output

Three files get written:
1. **Raw JSON** (`~/info-agg/prompts/podcasts-raw-YYYY-MM-DD.json`) -- the structured data, used for deduplication next week
2. **Knowledge base** (`~/skills/podcasts-knowledge-base-YYYY-MM-DD.md`) -- a formatted markdown file that the briefing generator reads
3. **Organized tables** (`~/skills/podcasts-organized-YYYY-MM-DD.md`) -- a quick-reference view sorted by signal rating

---

## GCP Intelligence: The Secret Sauce

The `gcp_intelligence` object in every extraction is the most valuable part for the sales team. The extraction prompt specifically hunts for six categories:

| Category | What It Catches | Why Sales Cares |
|----------|----------------|-----------------|
| **Migration signals** | "We moved from AWS to..." | Active deal opportunity |
| **Pain points** | "Cloud costs are killing us" | Opening for a pricing conversation |
| **Buying criteria** | "We chose based on GPU availability" | Tells reps what to lead with |
| **Competitive mentions** | "AWS Bedrock vs. Vertex AI" | Know the landscape before the meeting |
| **Budget data** | "$2M/year on compute" | Sizes the deal |
| **Undecided moments** | "We're still evaluating..." | Highest value -- these are open deals |

The prompt rates GCP relevance independently from overall signal rating. An episode can be HIGH signal overall (great founder insights about hiring) but LOW GCP relevance (nothing about infrastructure). This distinction matters because the briefing uses both ratings differently.

---

## How to Manage Podcasts

This is the easy part. To add a new podcast:

1. Open `config/podcasts.json`
2. Add an entry like this:
```json
{
  "name": "New Podcast Name",
  "source": "youtube",
  "channelHandle": "@ChannelHandle",
  "category": "AI/Builder",
  "enabled": true
}
```
3. That's it. No code changes. The next Sunday run picks it up automatically.

To disable a podcast, set `"enabled": false`. To add an audio-only podcast as a placeholder for later, use `"source": "rss"` and set `"enabled": false` with a note explaining why.

The `category` field is for your own organization -- it shows up in the output tables but doesn't affect extraction logic.

---

## How It Fits Into the Weekly Automation

Every Sunday evening, `scripts/generate-weekly.sh` orchestrates the full pipeline:

```
Sunday 7:00 PM (parallel):
  [X bookmarks]  ──┐
  [YouTube playlist] ──┼──→  All three run simultaneously
  [Podcasts]      ──┘         Each writes a knowledge base file

Sunday 9:00 PM (sequential):
  [Briefing generator] ──→ Reads all 3 knowledge base files
                        ──→ Gemini generates the briefing
                        ──→ Creates a PR on GitHub

Monday morning:
  [You] ──→ Review PR, edit in GitHub web UI, merge
  [GitHub Actions] ──→ Builds site, deploys to Pages
```

The three extractions are fully independent. If bookmarks fail (Twitter is down, cookies expired), podcasts and playlists still run. The briefing generator gracefully handles missing sources -- if no podcast knowledge base file exists within 14 days, it just generates from the other two sources.

This fault tolerance is a professional engineering pattern worth internalizing: **never let one failure take down the whole system**. Each stage logs its own warnings, and the pipeline keeps moving.

---

## The Technologies and Why

| Tool | What It Does | Why This One |
|------|-------------|--------------|
| **yt-dlp** | Downloads video metadata and subtitles from YouTube | Free, open source, actively maintained. The standard tool for YouTube data extraction. |
| **Gemini 2.5 Flash** | Reads transcripts and extracts structured intelligence | Fast, cheap, good at following detailed JSON schemas. The Flash model handles long transcripts (1-hour podcast = ~15K words) within its context window without issue. |
| **Node.js** | Runs the extraction and briefing scripts | Matches the rest of the project (build.js, audio pipeline). Keeps the stack consistent. |
| **VTT parsing (pure JS)** | Converts YouTube subtitle files to clean text | No external dependency needed. The format is simple enough that a 15-line parser handles it. |

Why not Python for the extraction script? Consistency. The rest of Brief Signal is Node.js. Mixing languages in a small project creates friction -- different dependency management, different runtime requirements, harder to debug. Python enters the picture later when you build the RSS/whisper pipeline (mlx-whisper is Python-only).

---

## Potential Pitfalls

**Rate limits.** The script adds deliberate delays between API calls (1 second between channels, 2 seconds between Gemini calls). If you add many more podcasts, you might hit YouTube's rate limits or Gemini's quota. The current 16 channels with ~2 second gaps work fine.

**Channels without subtitles.** Some YouTube uploads (especially live streams or very new content) won't have auto-generated captions yet. The script skips these with a warning. If a podcast consistently lacks subtitles, it's a sign they might be better served by the RSS/whisper pipeline.

**The flat-playlist dateafter bug.** This is documented in the code and worth understanding. `yt-dlp`'s `--dateafter` flag doesn't work with `--flat-playlist` because flat mode doesn't fetch upload dates (they show as "NA"). The workaround: cap results to 10 per channel with `--playlist-end 10` and rely on deduplication against previous runs. No podcast publishes more than 10 episodes per week, so this is safe.

**Gemini JSON parsing failures.** Sometimes Gemini wraps its JSON response in markdown code fences (`` ```json ... ``` ``). The `stripCodeFences` function handles this, but occasionally the response is malformed in other ways. The script logs a warning and skips that episode rather than crashing.

**Context window limits.** Very long podcast episodes (2+ hours) might push the transcript beyond Gemini Flash's effective context window. The transcript still gets sent, but extraction quality may degrade for the later portions. If you notice this, consider truncating transcripts or switching to Gemini Pro for those episodes.

---

## The Most Important Concept

**Structured extraction beats summarization.** The whole podcast pipeline is built around getting Gemini to return structured JSON, not prose summaries. This is a deliberate design choice. Structured data can be sorted, filtered, searched, and recombined. A prose summary is a dead end -- you can read it, but you can't do anything else with it. The briefing generator can look at the `gcp_intelligence.relevance` field across 30 episodes and surface only the ones that matter. It can cross-reference `companies_mentioned` against a sales rep's account list. None of that works with freeform text.

This pattern -- **extract structured data first, generate prose later** -- shows up everywhere in good engineering. Keep it in mind for future projects.

---

## The Twikit Bookmark Migration

While building the podcast pipeline, we also replaced how bookmarks are fetched from X/Twitter. The old approach opened Chrome, scrolled through your bookmarks page for 15-30 minutes, and scraped the DOM. It was fragile, slow, and couldn't run headless in a cron job.

The new approach uses **twikit**, a Python library that calls X's internal GraphQL API directly — the same API the X web app uses. With two cookies from your browser (`ct0` and `auth_token`), it fetches all your bookmarks in about 30 seconds. No browser needed.

**The monkey patch:** When we built this, twikit was broken. X changed their JavaScript bundle format on March 18 2026, and twikit's regex for finding the transaction signing code stopped matching. The fix is a monkey patch at the top of `fetch-bookmarks.py` — it replaces the broken regex before twikit loads. The patch is clearly marked with comments and a link to the GitHub issue ([d60/twikit#408](https://github.com/d60/twikit/issues/408)). Remove it when twikit releases an update.

**Cookie expiry:** The cookies last weeks to months, then expire without warning. When they do, the script prints a clear error. See `docs/cookie-refresh.md` for the 5-minute fix (copy two values from Chrome DevTools into `.env`).

**The fallback:** The old browser-based scrolling is still documented in the `/extract-bookmarks` skill as Step 3. If twikit breaks and you can't wait for a fix, the browser method still works.

---

## The Head Chef: How the Briefing Gets Written — and How We Taught It Taste

_(Added 2026-07-20.)_

Everything above is prep cooks chopping ingredients. This section is about the head chef — `scripts/generate-briefing.js` — the thing that takes three knowledge-base files and writes the actual briefing. Its recipe book is `scripts/briefing-prompt.md`, a long system prompt that tells Gemini what a good briefing looks like.

Here's the problem we discovered. Every week, you'd get the auto-generated draft and send it back to the kitchen with the *same* corrections: cut the "Builder's Corner" section you never like, tighten the sales angles, shorten "Our Play," demote a story you didn't care about. We were fixing the same things by hand, edition after edition. That's a smell. When you correct the same mistake every time, the fix doesn't belong in your head — it belongs in the recipe book.

So we did a big rewrite. Three ideas matter:

**1. The Lead-Story Doctrine.** The single biggest failure was picking the wrong lead story. The generator was letting the *loudest pile of bookmarks* win — so in Edition #22 it led with a so-so open-model release and completely missed **Kimi K3**, the first open model to beat *every* proprietary model on a benchmark, which was sitting right there in a podcast deep dive. You caught it; the machine hadn't. The fix is a doctrine with a memorable rule:

> **A lead = a fresh EVENT × (a developing theme OR a genuinely new thread) × a real seller play.**

Three things packed in there. First, a lead must be a datable *event* ("Kimi K3 beat proprietary models on Tuesday"), never a vague *theme* ("the supply-constrained economy") — themes are section headings, events are stories. Looking back at all 22 editions, every weak lead was a theme dressed up as a story. Second, "gravity" is now *countable* — how many different sources and shows independently talk about it — so a story three podcasts orbit beats a loud single tweet. Third, the generator now scans *all three* knowledge bases for model releases *first*, before anything else, so a Kimi-class release can never get buried again.

**2. The lineup pass (plan before you cook).** Instead of writing the whole briefing in one shot, the generator now does a planning step first: it produces a short "lineup" — here are my 2-3 lead stories, here's the event and gravity count for each, here's what I considered and *cut and why*. That lineup lands in the PR so you can sanity-check the *selection* in 60 seconds before reading a single polished paragraph. It's the difference between a chef showing you the menu before cooking versus plating a five-course meal you didn't order.

**3. A critic that has read the whole pantry.** There was already an automated "critique" step that scored each draft. Trouble was, it was half-noise — it kept flagging things your own rules *require*, and it could only see the finished briefing, so it could never say "hey, you skipped the biggest story." We rewired it: we killed the false alarms, and we now feed it a compact index of *everything that was available* to cover. So it can now ask the one question that actually matters — *"which notable stories did the briefing skip, and is any of them bigger than what you included?"* That's the structural catch that would have flagged the Kimi miss automatically.

The payoff: better *first* drafts, so your Monday review is about taste and nuance, not repair.

---

## The Theme Registry: Giving the Briefing a Memory

_(Added 2026-07-20.)_

Here's a subtle but important idea. The AI market isn't 22 unrelated weeks — it's a handful of long-running *stories* that keep developing: compute scarcity, open weights closing the frontier, "who owns the model," the SaaS-to-agents flip. We call these **themes**, and they're the briefing's real superpower. Anyone can read 50 disconnected sources; what a sales rep *can't* easily get is "here's how the open-weights story went from DeepSeek six months ago to Kimi beating proprietary today, and what it means for your next meeting." That through-line is the moat.

So we gave the briefing a memory: `content/themes.md`, a small registry of the ~8 recurring arcs, each with a one-line "where it stands now." Picture a spreadsheet — themes are the columns, weeks are the rows, and each edition's lead is simply whichever cell lit up brightest that week. Not every column fires every week; a quiet theme just sits out and resurfaces when it moves again.

The design lesson worth keeping: **don't cap it with an arbitrary number.** My first draft said "max 8 themes," and you rightly called it arbitrary. The right discipline isn't a count — it's a *high bar to get in* (a real structural force that's recurred) plus *retirement* of arcs that go quiet. Do that, and the count regulates itself. A hard number would have forced you to arbitrarily merge two genuinely different stories just to stay under budget. Good constraints describe the *quality* you want, not a magic number.

**Update, same day: the machinery is now built and shipped.** A registry file nobody reads is just a nice document — the actual point was to make the generator *use* it. Now, at the same Stage 4a "plan the lineup before you write" step, the model gets the whole registry as context, tags each Big Picture story with the arc it advances (or flags it as a genuinely new thread), and proposes an update: "here's how Compute Scarcity moved this week," plus any new-theme births or quiet-arc retirements. Crucially, it only *proposes* — the model never touches `content/themes.md` directly. It writes a draft to `content/briefings/drafts/{date}-themes-proposed.md`, and you promote it by hand when you're happy with it, the same way you already review the lineup and the draft briefing itself. The registry *informs* which story leads; it never *gates* one out — a strong new thread can still lead even if it fits no existing arc.

I validated this the way you'd want a real feature validated, not just by reading the code: I built an isolated copy of the whole pipeline in `/tmp` — same scripts, same registry, same knowledge-base files you'd use for a real Monday — and ran it against a real Gemini call, without any risk to the actual site (it writes into its own throwaway `content/briefings/`, never yours). That single real run caught two bugs that no amount of hand-written test strings would have found:

1. The model's own registry-update text ends in a closing code fence (` ``` `), and a pre-existing cleanup function in the generator — one that strips Gemini's occasional habit of wrapping its whole answer in a stray ```markdown fence — was silently eating that closing fence too, because both patterns look the same to a regex anchored "at the very end of the string." The fix: teach the cleanup step to recognize *our* fence and leave it alone.
2. The model read the instruction "reproduce every existing theme" a little too literally and quietly dropped a non-theme "Notes" section at the bottom of the registry file. The fix was just clearer instructions: reproduce the *whole file*, not just the theme entries.

Neither bug would have shown up in a code review or a hand-typed test case — they only appear when the actual model produces actual text and you actually look at what landed on disk. That's the case for occasionally running the real thing in a sandbox before trusting a pipeline change, even when the code "looks right."

---

## War Stories: The Manual Run That Hit Every Landmine (Edition #22)

_(Added 2026-07-20.)_

The best way to understand a system is to watch it break. Edition #22 was a manual run that tripped nearly every wire we'd ever documented — and it's a great tour of how real debugging works: see the symptom, find the root cause, fix it, and write a rule so it never bites again.

- **The silent 401.** The Sunday cron never fired because the Claude CLI login token had expired days earlier. The extraction stages that shell out to `claude -p` just quietly returned errors and kept going. *Lesson already on file, and it held:* run the extractions inside an authenticated session instead. (Durable fix for you: `/login` before Sundays.)

- **The dedup trap that hides 100 bookmarks.** A half-finished earlier run had *fetched* a week of bookmarks into a raw file but never built them into a knowledge base. When I re-fetched, the dedup logic saw those as "already seen" and reported a suspiciously thin week — the exact trap that once buried the Alex Karp story. This time we caught it: combined the stranded raw file with the fresh fetch and rescued 63 bookmarks that would otherwise have vanished.

- **The broken podcast file.** A podcast KB on disk *claimed* to be current but was full of stale 2025 episodes — a previous run's recency filter had failed. The tell was reading the actual episode dates instead of trusting the filename. We threw it out and did a clean 14-day re-pull.

- **The triplication loop.** The generator produced the entire briefing *three times over* in one response — a known failure mode of the model where it loops instead of stopping. The first copy was complete and good, so the fix was to truncate to it. (A follow-up task is now hardening the generator to catch this automatically.)

- **"GEAP" became "Jeep."** This one's my favorite — and it has the best lesson. The text-to-speech step read the acronym GEAP as the car brand — "run it all on Jeep." I caught it in the proofread. But the *deeper* fix came from asking why it kept happening: the audio prompt was **explicitly telling** the model to write GEAP as "Jeep" ("how it's pronounced internally"). The bug wasn't the model misbehaving — it was doing exactly what we told it. So we retired the acronym entirely; it's "Agent Platform" now. The lesson: when a bug keeps coming back, the fix usually isn't "catch it again" — it's finding *why the system produces it* and removing that.

None of these individually is dramatic. The point is the *pattern*: every one had a documented lesson or became one, and the system got a little more bulletproof each time. That's compounding engineering — the codebase remembers its scars.

---

## Watching What Gets Read: The Analytics Layer

_(Added 2026-07-20.)_

For 22 editions we flew blind — we wrote briefings and never knew if anyone read them. Now we can see. Here's how it works and, more usefully, how to *think* about it.

**The tool: GoatCounter.** You asked for the simplest thing that lives inside Claude Code, and this is it. GoatCounter is a tiny (~3KB) privacy-first analytics service. Think of it as a turnstile at the door of each briefing: it clicks once every time someone walks in. No cookies (so no annoying "we use cookies" banner, and no GDPR headache), and it has an API so I can read the numbers back from the terminal instead of you squinting at a dashboard.

**How the tracking gets onto the page — and the one clever bit.** Every page is stamped out from a single mold, `template.html`. I added a placeholder, `{{analytics}}`, to its `<head>`, and `build.js` fills that placeholder in **only when it's building the real, deployed site** (it checks `BASE_PATH`, the flag that's set on GitHub but not on your laptop). Why bother? Because otherwise *your own* previewing while writing would show up as "reads" and pollute the data. It's the analytics equivalent of a chef not counting their own taste-tests as customers served.

**Beyond "did they open it" — "how much did they read?"** A raw turnstile only tells you someone came in. But your briefing is one long page, so the real question is *how far down they got.* I added a little scroll-tracker: as a reader passes 25%, 50%, 75%, and 100% of the page, it quietly sends an event. Same for hitting play on the audio. Now you can see the *shape* of attention — if everyone bails at the halfway mark, the back half is too long or the front is front-loaded. That's a direct, actionable signal for how you write the next one.

**Closing the loop: `npm run analytics`.** This is the part that matters for making the briefings *better*, not just measuring them. The script (`scripts/fetch-analytics.js`) pulls the numbers, groups them by edition, cross-references each edition's *theme* (from `content/themes.md`), and writes a plain-English summary to `logs/analytics-signal.md` — e.g. "most-read editions led with Sovereignty and Open Weights; most readers drop past 50% → tighten the back half." That's data you can feed into story selection. (I deliberately did *not* wire this straight into the generator's prompt — messing with what the AI sees when it picks stories is a delicacy-sensitive change, and you should sign off on it consciously, not have it slipped in.)

**Two gotchas I hit — and why they're worth knowing.** When I tested it live, nothing recorded at first. Two culprits, both instructive:
1. *Background tabs lie.* Browsers deliberately throttle hidden tabs — GoatCounter won't count a pageview for a tab you can't see, and the scroll-tracker's timing loop (`requestAnimationFrame`) is frozen. Both fire perfectly for a *real* reader with the tab in front of them; my automated test just had to bring the tab to the foreground. Lesson: when a thing "doesn't work" in a test harness, ask whether the *test* is the unusual condition, not the code.
2. *Off-by-one on dates.* GoatCounter's "end date" doesn't include today (the day's still in progress), so my first pull found zero. Fixed by asking for data through *tomorrow*. Classic boundary bug — the kind that's invisible until real data sits right on the edge.

**The honest limits (so you don't over-trust it).** Your audience is niche, so numbers will be small — treat a 2–3× gap between editions as signal and ignore small wiggles; one influential person sharing a link can swing a whole week. And scroll depth is a *proxy* for reading, not proof. Pair the quantitative reads with the qualitative Google feedback form you already have, and you've got a real feedback loop. What we explicitly did *not* build: traffic-source/SEO tooling, a custom domain, and per-paragraph heatmaps — all deferred on purpose to keep this simple.

---

## What to Build Next

**RSS/whisper pipeline for audio-only podcasts — ✅ BUILT (2026-07-20).** This was the "what to build next" from March, and it shipped. `scripts/extract-rss-podcasts.py` now transcribes audio-only shows (AI Daily Brief, Acquired, etc.) locally with `mlx-whisper` and appends them into the same podcast knowledge base — no paid transcription API. Edition #22 pulled 15 RSS episodes this way. The original design (kept below for the record):

1. Use `mlx-whisper` (free, runs locally on Apple Silicon) to transcribe audio from RSS feeds
2. Scrape Acquired.fm's website transcripts directly (they publish speaker-labeled transcripts -- higher quality than any transcription tool)
3. Let Gemini infer speaker names from unlabeled transcripts (hosts introduce themselves, reference each other by name)
4. Feed everything into the same extraction prompt

This unlocks 5 more podcasts (Acquired, AI Daily Brief, 10/10 GTM, Rethinking with Adam Grant, and potentially Stratechery) without paying for any transcription API. The design decision to avoid paid services like Deepgram ($6-10/mo) or Podscan ($100/mo) was deliberate -- the free/local approach is good enough for 3-5 podcasts, and you can always upgrade later if quality is insufficient.

Build this when you notice you're consistently missing signal from audio-only sources. If the YouTube-only coverage feels complete, there's no rush.

### Next up (as of 2026-07-20)

- **Theme-registry machinery — ✅ BUILT (2026-07-20).** The generator now reads `content/themes.md` at the Stage 4a lineup step, tags each lead to the arc it advances, and proposes slow, approval-gated updates each edition to `content/briefings/drafts/{date}-themes-proposed.md`. See "The Theme Registry" section above for the full story, including two real bugs a live test run caught.
- **Repetition-loop guard — ✅ BUILT.** `truncateRepetition()` in `generate-briefing.js` now catches the Edition #22 triplication bug automatically and truncates to the first complete copy, with tests in `scripts/generate-briefing.test.js`.
- **Web analytics — ✅ BUILT (2026-07-20).** GoatCounter is live: pageviews + scroll-depth + audio-play events on the deployed site, plus `npm run analytics` to pull a per-edition read-signal. See "Watching What Gets Read" above. Next optional step (your call): wire the signal into the generator's story selection, and/or add scroll-depth heatmaps or traffic-source tracking.
- **Maybe Vercel.** Worth considering not for analytics alone but for **PR preview deployments** — every briefing PR would get a live rendered URL, so Monday review happens on the real page instead of raw markdown. ~1-2 hours, low risk. On hold.

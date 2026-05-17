# Brief Signal — Podcast List Review Prompt

This file is the source of truth for the criteria used when reviewing `config/podcasts.json`. Both manual review sessions and the scheduled bimonthly remote agent should read this before proposing additions or disables.

## Context

Brief Signal is a weekly briefing for **Google Cloud Startups Field Sales reps** — people who sell cloud infrastructure to AI-native founders. Each Sunday a pipeline extracts insights from podcasts in `config/podcasts.json`, then Gemini drafts a briefing. The list is the foundation of the briefing's quality.

## When to review

- **Scheduled:** Every 60 days (1st of every other month at 9am ET) via a remote agent — see `https://claude.ai/code/routines`.
- **Manual triggers:** Anytime Simon notices a podcast missing from the briefing that he expected to see, anytime a configured podcast goes dark for 4+ weeks, or anytime a major new podcast launches in the AI/founder space.

## Review checklist

A full review covers **two passes** — additions and audit — in this order.

### Pass 1 — Audit existing entries

For each entry in `config/podcasts.json`:

1. **Activity check (YouTube):** Spot-check the latest video on the channel. If it's >90 days old, mark the entry as "going dark" — propose `enabled: false` with a note.
2. **Activity check (RSS):** Curl the feed and check the latest `<pubDate>`. Same 90-day threshold.
3. **Briefing surface check:** Grep recent briefings (`content/briefings/*.md` for the last 12 weeks) for the podcast name or characteristic episode URL. If the podcast has been *configured but not cited* for 12+ weeks of briefings, it's low-signal — propose disable.
4. **Noise check:** For entries with `note` warnings about channel noise (OpenAI, Stripe, DeepMind, Sequoia), spot-check the recent KB files at the same path to see if the duration filter held. If the briefings have been citing non-podcast content from those channels, the entry is producing noise, not signal — propose disable or escalate to Simon.

### Pass 2 — Propose additions

Find 3-8 candidate podcasts to ADD. For each, report:

1. **Name** + host(s)
2. **YouTube channel handle** (e.g., `@channelname`) AND/OR **RSS feed URL** if known. We can extract from either; YouTube is preferred when reliable because subtitles are auto-generated.
3. **Category** (using or extending the existing taxonomy in `config/podcasts.json`)
4. **Why it's high-signal for THIS audience** — what unique angle does it bring that the current list misses? Be specific. "More AI content" is not an answer.
5. **Publishing cadence** (weekly, biweekly, ad-hoc) — and roughly what episode length to expect. The current pipeline filters out anything under 20 minutes.

### Coverage gaps to probe specifically (refresh as the landscape changes)

- Frontier-research interviewers
- Top-tier VC AI shows (Lightspeed, NEA, GV, Founders Fund, IVP, Index, Bessemer, Greylock — check which have launched podcasts)
- Engineering / dev-tools / MLOps
- AI policy / safety / governance
- First-party lab content (Anthropic? OpenAI updates? Cohere? Mistral?)
- Operator-founders with strong technical angles
- Enterprise AI sales / GTM perspective
- Asia / international AI ecosystems (China, India, EU, Israel)
- New podcasts from named ex-operators / researchers (Dwarkesh-style)

### Filtering criteria (apply rigorously)

**Reject** candidates that:
- Are predominantly under 20 min per episode (the pipeline drops these)
- Haven't published in the last 90 days (dead show)
- Are pure interview-clip shorts compilations
- Are paywalled with no free RSS option (note them but mark as disabled, like Stratechery)
- Are already on the list (re-check!)
- Cover crypto/Web3 with only incidental AI content
- Are general business/leadership without a specific tech operator angle (the Adam Grant slot is enough)

**Prefer** candidates that:
- Have a host with a real network (gets access to founders/researchers who don't appear elsewhere)
- Frequently surface specific company moves, infrastructure decisions, or tool choices (the briefing thrives on "named names")
- Have a recent track record of breaking or framing a story before mainstream coverage
- Are listened to by *founders themselves*, not just by industry observers

## Output format

Open a single PR titled `chore(podcasts): bimonthly review YYYY-MM-DD` containing:

1. **`config/podcasts.json` edits** — proposed additions appended; proposed disables flipped to `"enabled": false` with an updated `note` field explaining why.
2. **PR description** — a markdown table summarizing audit findings (which entries flagged + reason) and a markdown table for additions (with rationale and verification status).

## Verification before commit

For every YouTube candidate: run `yt-dlp --flat-playlist --playlist-end 1 --print "%(channel)s|%(title).50s" "https://www.youtube.com/@HANDLE/videos"` to confirm the channel exists and is active. Reject candidates that error or return nothing.

For every RSS candidate: `curl -s -L URL | grep -c "enclosure"` to confirm audio enclosures exist.

Note any verification failures in the PR description rather than silently dropping the candidate — Simon may have alternate ingestion paths in mind.

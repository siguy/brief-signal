---
status: pending
priority: p2
issue_id: "001"
tags: [podcasts, extraction, data-integrity, llm-output]
dependencies: []
---

# extract-podcasts.js prefers the LLM's episode URL over the real one

## Problem Statement

Every podcast citation in the weekly briefing can ship as a broken link, because
the podcast extractor prefers a URL invented by Gemini over the verified URL it
already has in hand.

Caught live in Edition #25 (PR #111): the Valar Atomics Quick Hit linked to
`https://www.youtube.com/watch?v=5Xvbq_zvO4` — a 10-character YouTube ID. Real
IDs are 11 characters. The link 404s. The briefing generator was faithful; it
copied what the knowledge base gave it.

This matters beyond one link: podcast citations are the spine of the Big Picture
section, and a dead link in a sales briefing costs credibility with the exact
audience the product serves.

## Findings

- Root cause is [`scripts/extract-podcasts.js:590`](../scripts/extract-podcasts.js#L590):
  ```js
  extraction.url = extraction.url || episode.url;
  ```
  `extraction` is the Gemini L1 output. `episode` is the yt-dlp result. The `||`
  means **the model's URL wins whenever it emits one**, and the trustworthy value
  is used only as a fallback. Gemini transcribed the ID and dropped a character.

- The adjacent lines already do this correctly — they overwrite model output with
  ground truth unconditionally:
  - `:588` `extraction.video_id = episode.video_id;`
  - `:592-594` overwrites `extraction.date` with `episode.upload_date`

  So the raw JSON for this episode contains a **correct** `video_id`
  (`5Xvbq_zvOQ4`) sitting right next to the **broken** `url`. The right answer was
  already in the record.

- `https://www.youtube.com/watch?v=5Xvbq_zvOQ4` verified with yt-dlp: resolves to
  "How Nuclear Will Unlock Energy Abundance with Valar Atomics Founder Isaiah
  Taylor", uploaded 20260702.

- **Same bug shape one line down** at `:591`:
  `extraction.duration_min = extraction.duration_min || episode.duration_min;`
  A model-invented runtime would print a wrong "(62 min watch)" label with nothing
  to catch it. `:589` `podcast_name` has the same shape but is low-consequence.

- No check anywhere catches this. `scripts/lint-briefing.js` validates URL
  *presence* and image magic bytes, not YouTube ID shape or link liveness.

- This is the same disease as the repair-pass URL fabrication documented in
  `tasks/lessons.md` (2026-07-26): **an LLM asked for a URL will produce a
  plausible one.** The standing rule from that incident — never let model output
  supply a URL when ground truth exists — was never applied to this file.

## Proposed Solutions

**Option A — derive the URL from `video_id`, never accept the model's (recommended)**
```js
extraction.url = `https://www.youtube.com/watch?v=${episode.video_id}`;
```
- Pros: one line; makes the URL unfabricatable; consistent with how `video_id` and
  `date` are already handled.
- Cons: assumes every episode is YouTube. RSS episodes flow through
  `extract-rss-podcasts.py`, so verify that path separately before assuming.
- Effort: minutes. Risk: low.

**Option B — flip the precedence**
```js
extraction.url = episode.url || extraction.url;
```
- Pros: smallest possible diff; keeps a fallback for entries with no `episode.url`.
- Cons: still lets a model URL through when `episode.url` is empty — the exact
  case where nothing else can catch it.
- Effort: minutes. Risk: low, but leaves the hole open.

**Option C — A, plus a deterministic lint rule**
Add a YouTube-ID shape check to `scripts/lint-briefing.js` (`[a-zA-Z0-9_-]{11}`)
as a HARD failure.
- Pros: defence in depth; catches malformed IDs from any future source, not just
  this one. Pairs with the "make failure visible" principle in `tasks/lessons.md`.
- Cons: slightly more work; shape-valid-but-wrong IDs still pass.
- Effort: ~30 min. Risk: low.

**Recommend A + C.** A fixes the cause, C catches the class.

## Recommended Action

_To be filled during triage._

## Acceptance Criteria

- [ ] `extraction.url` is derived from ground truth, never from Gemini output
- [ ] `extraction.duration_min` likewise prefers `episode.duration_min` over model output
- [ ] Confirm whether `scripts/extract-rss-podcasts.py` has the same precedence bug
- [ ] Re-run the extractor on a channel and assert every emitted `url` contains its
      record's own `video_id`
- [ ] `lint-briefing.js` HARD-fails on any YouTube URL whose ID is not 11 chars
- [ ] Backfill check: scan existing `~/skills/podcasts-knowledge-base-*.md` for
      malformed IDs — other published editions may already carry dead links

## Technical Details

- `scripts/extract-podcasts.js:588-594` — the precedence block
- `scripts/lint-briefing.js` — where the shape check belongs
- `scripts/extract-rss-podcasts.py` — check for the same pattern
- `~/info-agg/prompts/podcasts-raw-*.json` — records carry both the good
  `video_id` and the bad `url`, so historical damage is measurable

## Resources

- PR #111 (Edition #25) — https://github.com/siguy/brief-signal/pull/111
  Fixed the symptom in the briefing; this todo is the real fix.
- `tasks/lessons.md`, 2026-07-26 repair-loop entry — the prior URL-fabrication
  lesson this bug re-runs

## Work Log

**2026-08-09** — Found during the weekly pipeline run. The broken link surfaced
while hand-verifying every URL in the Edition #25 draft; neither lint nor the LLM
critique flagged it. Traced from the rendered briefing back through the knowledge
base to the raw JSON, where the correct `video_id` sat beside the wrong `url` —
which pinned the cause to the `||` precedence at `:590`. Corrected that one link
in PR #111 and left the extractor untouched pending this todo.

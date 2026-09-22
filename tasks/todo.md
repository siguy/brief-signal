# Weekly pipeline run — Edition for 2026-09-21 (manual, run Tue 2026-09-22)

## Context
Sunday 2026-09-20 cron run failed: Stages 1 (bookmarks) and 2 (playlist) both
died with `API Error: Connection closed mid-response` from `claude -p`; the run
was then terminated before the freshness gate. Podcast KB for 2026-09-20 exists
(20 episodes, 1 HIGH) but no briefing, branch, or PR was produced.
`claude -p` re-verified working 2026-09-22 — the failure was transient, not auth.

## Plan
- [x] Re-run `scripts/generate-weekly.sh` with `MONDAY_DATE=2026-09-21`
- [x] Stage 1/1b: X bookmarks + linked-article enrichment
- [x] Stage 2: YouTube playlist (14-day window)
- [x] Stage 3a/3b/3c: YouTube podcasts, RSS podcasts, lab news
- [x] Freshness gate: all three KBs written after pipeline start
- [x] Stage 4: lineup + draft (Gemini), images, critique, lint, one repair pass
- [x] Stage 5: commit, push `briefing/2026-09-21`, open PR
- [x] Verify PR body has themes, braid ledger, critique, signal digest
- [x] Report to Simon for editorial review

## Review
Ran clean end to end in ~22 min (07:28–07:50). All three stages that failed
Sunday succeeded: 181 new bookmarks, 35 podcast episodes (4 HIGH, 3 deep dives),
8 RSS episodes. Freshness gate passed on all four KBs; playbook 58 days old.

Edition #31 — "Frontier Pacing, The 1/20th Replication Wedge, and The KV Cache
Memory Wall", 1,734 words. PR #152 on `briefing/2026-09-21`.

Post-run fixes (commit 413a504): the one-shot repair left Our Play at 214/200,
trimmed to 200; fixed the Agent Platform first-mention naming rule the linter
does not cover. Lint now clean.

Open for editorial review (critique hard failures, not auto-fixed):
- "1/20th" appears 7x and "71%" 4x — violates the no-repeated-stats rule
- Big Picture Story 3 has no "Your angle" block despite Our Play motion #3
  anchoring to it

Standing issue: the YouTube playlist source is dormant — 0 new videos in 14
days, newest upload 2026-07-13. Stage 2 wrote a fresh empty KB so the gate
passed, but the edition braided from 2 sources, not 3.

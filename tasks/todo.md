# Weekly pipeline run — Edition for 2026-09-21 (manual, run Tue 2026-09-22)

## Context
Sunday 2026-09-20 cron run failed: Stages 1 (bookmarks) and 2 (playlist) both
died with `API Error: Connection closed mid-response` from `claude -p`; the run
was then terminated before the freshness gate. Podcast KB for 2026-09-20 exists
(20 episodes, 1 HIGH) but no briefing, branch, or PR was produced.
`claude -p` re-verified working 2026-09-22 — the failure was transient, not auth.

## Plan
- [ ] Re-run `scripts/generate-weekly.sh` with `MONDAY_DATE=2026-09-21`
- [ ] Stage 1/1b: X bookmarks + linked-article enrichment
- [ ] Stage 2: YouTube playlist (14-day window)
- [ ] Stage 3a/3b/3c: YouTube podcasts, RSS podcasts, lab news
- [ ] Freshness gate: all three KBs written after pipeline start
- [ ] Stage 4: lineup + draft (Gemini), images, critique, lint, one repair pass
- [ ] Stage 5: commit, push `briefing/2026-09-21`, open PR
- [ ] Verify PR body has themes, braid ledger, critique, signal digest
- [ ] Report to Simon for editorial review

## Review
_(filled in when the run completes)_

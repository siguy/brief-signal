# Briefing generation v2 — streamline selection, better first drafts

Goal: migrate 3 editions of Simon's accumulated corrections UPSTREAM into the generator,
so first drafts are focused and match what he actually ships. Branch: `feat/briefing-prompt-v2`.

## Root causes (from the #20-#22 diffs)
1. Template mandates Builder's Corner + Founder Watch + ≤3 Quick Hits; Simon cuts/demotes them every edition.
2. No lead-story doctrine → loudest-by-volume KB cluster wins; the sharper story (Kimi K3, in a podcast deep dive) got missed.
3. Critique is ~50% noise (3 false-positive GCP-angle flags, 1 unsatisfiable rule, 1 URL-dedup bug) and never asks "is there a bigger story you skipped?"
4. Word target says 800-1000; briefings actually land 1,700-2,200.

## Plan
- [x] 1. briefing-prompt.md — template surgery: TLDR → Big Picture (exactly 3, arc-ordered) → Quick Hits (3-6, absorbs founder/builder one-liners, podcast sources OK) → Our Play. Remove Builder's Corner + Founder Watch as standing sections.
- [x] 2. briefing-prompt.md — Lead-Story Doctrine in Content Curation: model-release scan first; merge same-thesis items + name the tension; seller-relevance at selection. Worked example = Alex Karp / Palantir (#21 lead).
- [x] 3. briefing-prompt.md — word budgets (~1,700-1,800 total, ~300/story, angle ≤90 words); fix Tone/Writing word target.
- [x] 4. briefing-prompt.md — Our Play = 1 framing sentence + exactly 3 bold named motions (play → product surface → seller move).
- [x] 5. briefing-prompt.md — Quality Checklist: carve out the REQUIRED "Where the GCP opportunity is" angle line (kills the recurring false positive); drop "fresh GCP sources" rule; fix URL-dedup wording to "same exact URL"; add word-budget + section-shape + quick-hit-count checks.
- [x] 6. critique-briefing.js — add a KB-index coverage check (feed compact KB headings + signal ratings; ask "top 5 KB stories NOT covered — is any bigger?"). The Kimi-catcher.
- [x] 7. generate-briefing.js — Stage 4a story-lineup (async): generate a lineup file (candidates, proposed merges, what's cut + why), commit alongside draft; Stage 4b drafts FROM the lineup. No gating.
- [x] 8. Verify: JS syntax; dry-run critique on shipped #22 to confirm noise is gone + coverage check works. Open PR.

## Notes
- Also uncommitted on main working tree: LOOKBACK_DAYS env-override in extract-podcasts.js + extract-rss-podcasts.py (separate concern).

---

# Living Theme Registry — wiring (follow-up to #63/#64)

`content/themes.md` is seeded (#64) but nothing reads or advances it. Wire it into the
Stage 4a lineup pass. Full plan: `~/.claude/plans/theme-registry-wiring.md` (reviewed by
3 parallel agents; sentinel→fence-block + dedup cuts already folded in).

- [x] 1. `generate-briefing.js`: `readThemeRegistry()` + inject into Stage 4a context only
- [x] 2. Extend `lineupTask`: per-candidate theme tag (or NEW THREAD) + proposed registry
      update summary + full proposed `themes.md` in a `themes-proposed` fenced block
- [x] 3. `extractProposedThemes(lineupText)` → write `drafts/{date}-themes-proposed.md`
      only (no separate diff file); never touch canonical `content/themes.md`
- [x] 4. `briefing-prompt.md`: short Living Theme Registry note (informs, never gates)
- [x] 5. `generate-weekly.sh`: PR body reads the update summary from the lineup file
- [x] 6. Add new fns to existing `module.exports`; inline verification (no new test file)
- [x] 7. Dry-run validation without touching a shipped briefing
- [ ] 8. Flag to Simon, open PR, hold merge (pipeline code)

## Review
- Caught a real bug during validation: `stripCodeFences`'s trailing-fence regex is
  anchored to end-of-string, and since the new `themes-proposed` fence is the LAST
  thing in the Stage 4a lineup response, running `stripCodeFences` before extraction
  would have silently eaten the closing fence and broken extraction on every real run.
  Fixed by extracting from the raw response before `stripCodeFences` runs. Verified
  with a side-by-side repro (see conversation) — confirmed the bug exists in the wrong
  order and is absent in the shipped order.
- Diff stat matches the plan exactly (4 files, no unplanned files touched):
  `scripts/generate-briefing.js`, `scripts/briefing-prompt.md`, `scripts/generate-weekly.sh`.
- All dry-run checks passed with no API key / network: registry read, `lineupTask`
  content, extraction happy-path + 3 negative cases (missing fence, unclosed fence,
  no-heading truncation heuristic), and the `generate-weekly.sh` awk extraction
  against a sample lineup file.

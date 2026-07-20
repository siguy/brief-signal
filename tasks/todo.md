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

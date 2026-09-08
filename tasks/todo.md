# Editorial Length Makeover — 2026-09-07

## Problem
Editions grew 855w (March) → 2,890w (#28). PR #136 (#29) = 2,356w while its
subtitle claims "~5 min read" (really ~10). Story prose is fine (220-266w vs a
250-300 budget); the bloat is in accessory layers, led by Our Play at 432w
against a ~150w budget.

## Root causes
1. Our Play's budget was arithmetically impossible (9 substantive clauses in
   150 words = 16 words/clause), so the model ignored it — and learned the
   word counts are decorative.
2. Length was the ONLY numbered rule with no machine check. Every checked rule
   held; the unchecked one drifted. build.js never computed read time, so the
   "~5 min read" label never contradicted the drift.

## Target (approved by Simon)
Total target ~1,500, HARD ceiling 1,650. Seller's Edge protected at ~300 (the
compounding differentiator). Cuts come from angle blocks and Our Play.

Budgets: TLDR ≤140 · story ≤220 · angle ≤150 · Quick Hits ≤5 bullets/160
· Seller's Edge ≤310 · Our Play ≤240 · ≤3 stories · TOTAL ≤1650

## Tasks
- [ ] 1. Rewrite budgets in scripts/briefing-prompt.md (make Our Play achievable)
- [ ] 2. Add checkLength to scripts/lint-briefing.js (hard fails → repair pass)
- [ ] 3. Add tests to scripts/lint-briefing.test.js
- [ ] 4. Compute read time from word count in build.js (stop trusting subtitle)
- [ ] 5. Run npm test
- [ ] 6. Regenerate PR #136 against the 2026-09-06 KBs; verify it lands under 1,650

## Review
(filled in at completion)

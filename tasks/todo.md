# Editorial hardening — approved by Simon 2026-07-26

Four workstreams approved via Q&A (session 2026-07-26). Order: A (Monday deadline) → B → C → D.

## A. Edition #23 fixes (branch: briefing/2026-07-27) — URGENT, review is Monday
- [x] Fix 2 broken Quick Hit URLs (KB had no permalinks; real URLs recovered from raw JSON):
  - gregisenberg → https://x.com/gregisenberg/status/2081088155793465783
  - KanikaBK → https://x.com/KanikaBK/status/2080578327786746242
- [x] Decenter OpenAI in the Value Maxing story (BP3) so OpenAI isn't the headline
  subject of 2 of 3 Big Picture stories (open critique hard failure). Lead with the
  industry economics shift; OpenAI's GPT-5.6 guidance becomes evidence, not protagonist.
- [x] Fix Our Play bullet 2: currently recommends hosting Kimmy K3 while the story above
  reports Treasury sanction threats against it. Reframe as model optionality/portability
  = de-risking sanctions exposure; open-weight example → Gemma.
- [x] Add Seller's Edge section to #23 (new teach — all 3 founding frameworks used in
  editions 6/08, 6/15, 6/22). This week's teach: agentic AI cost is engineered
  (caching/routing/harness design), not just priced.
- [x] Re-run critique to verify; commit + push to PR #73.

## B. Restore Seller's Edge into the process (new branch, separate PR)
- [x] Write Seller's Edge spec into scripts/briefing-prompt.md (template section,
  voice guide, quality checklist item). Source: memory project_sellers_edge_section.md.
  Spec was never in the rebuilt prompt — silently lost in the v2 rebuild (PR #63).
- [x] Update memory file: restoration done + all 3 founding frameworks now used.

## C. Deterministic linter + repair loop (new branch, separate PR)
- [x] scripts/lint-briefing.js — mechanical checks, no LLM:
  - no `...`/malformed URLs
  - TLDR bullets all start with a bold hook
  - every "Your angle" block has a "Where the GCP opportunity is" line
  - no same-source-URL anchoring two Big Picture stories
- [x] Repair loop in the pipeline: on critique/linter hard failure, ONE targeted
  Gemini revision pass with the failures as input, then re-verify, then PR.
- [x] Root-cause fix: bookmarks KB build must include the tweet permalink per entry
  (raw JSON has them as keys; the KB drops them → Gemini fabricated `...` URLs).

## D. GCP playbook — two layers
- [x] content/gcp-playbook.md (public-safe): differentiators GCP can honestly claim,
  Agent Platform component glossary, approved framings. Feeds Stage 4 like themes.md.
- [x] Internal deeper layer: gitignored local file (repo is public) — flag backup
  tradeoff to Simon.
- [x] Restructure Our Play format in prompt: Signal → Why GCP wins → The move.

## Review notes (session 2026-07-26, all merged)

- ALL DONE and merged: PRs #73 (Edition #23), #74 (Seller's Edge spec), #75
  (linter + repair loop), #76 (GCP playbook v2, research-verified), #77
  (HIGH-signal disposition), #78 (playbook staleness check), #79 (within-story
  citation clarification).
- Also shipped beyond the original plan: 6-agent research sweep verifying the
  playbook (official/execs/community/analysts/competitive/pricing-tuning);
  /refresh-gcp-playbook skill + 90-day staleness warning as the standing
  refresh process; HIGH-episode Quick Hit swaps in #23 (Open Code, Lin Qiao,
  Dark Factory); grounding price corrected to $14/1K + 5K free (community's
  $35 figure was legacy).
- Key lesson captured in tasks/lessons.md: LLM repair passes fabricate URLs —
  deterministic fabrication guard required; live-test LLM code in a sandbox.
- Follow-ups for Simon: verify playbook claims flagged VERIFY-BEFORE-USE
  (internal file); fill internal playbook TODOs + keep Drive master copy;
  Monday: npm run audio:pr for Edition #23 audio.

---

# ARCHIVE — Briefing generation v2 (shipped, PR #63/#68)

Goal: migrate 3 editions of Simon's accumulated corrections UPSTREAM into the generator.
All items complete and merged; details preserved in git history of this file and in
PR #63 / #68 descriptions. Key outcomes:
- Template surgery (TLDR → Big Picture ×3 → Quick Hits → Our Play); Lead-Story Doctrine;
  word budgets; Our Play = 3 named motions; critique coverage check (the Kimi-catcher);
  Stage 4a lineup pass.
- Living Theme Registry wired into Stage 4a (PR #68, squash-merged as 4ac8f76) after
  3 rounds of fixes incl. two real fence-stripping bugs found via live dry-run.
- Item 8 of registry wiring ("flag to Simon, open PR, hold merge") — done, merged.

# Backlog (not started)

- (empty — analytics report shipped as PR #67)

# Gemini model upgrade → gemini-3.7-flash

**Status:** DONE — branch `claude/gemini-3-7-flash-upgrade-8c3dc1`, 2026-08-29
**One sentence:** Move every text-generation call in the pipeline from
`gemini-2.5-flash` to `gemini-3.7-flash`.

## Done

- [x] Verify the model ID against the live API before editing anything —
      `gemini-3.7-flash` is GA on the project key (version `3.7-flash-08-2026`,
      no `-preview` suffix). Guessing `gemini-3-7-flash` from the model-card slug
      would have shipped a 404 into the Sunday cron.
- [x] Diff model metadata vs. the outgoing model — identical 1M input / 65K output
      limits and `supportedGenerationMethods`. No context regression for the
      podcast extractor, which sends whole hour-long transcripts in one call.
- [x] Smoke-test both call shapes the pipeline uses (plain + `systemInstruction`;
      JSON mode via `responseMimeType`). Both return parseable output.
- [x] Swap 8 call sites + 1 log string across 6 files. Simon chose the plain string
      swap over a `GEMINI_MODEL` env-override constant — smallest diff.
- [x] `npm test` — 14 + 18 + bookmark suites pass, exit 0.
- [x] Live end-to-end run of `critique-briefing.js` against Edition #24 — valid
      JSON, correct report structure, found a real hard failure on its own.
- [x] Docs: CHANGELOG entry under Unreleased/Changed; FOR_SIMON.md model names
      updated + new section "Swapping the Engine Mid-Flight (2026-08-29)".

## Deliberately not changed

- `scripts/generate-audio.js` — `gemini-2.5-pro-tts` is the Cloud Text-to-Speech
  surface (`@google-cloud/text-to-speech`), a different API with no 3.7
  equivalent; the Fenrir voice is tuned to it.
- `tasks/lessons.md`, `CHANGELOG.md` history, `docs/plans/`, published editions —
  historical records of what ran at the time. The line-261 lesson (no
  `maxOutputTokens` cap, because thinking tokens share the budget) still holds:
  3.7 Flash cannot disable thinking either.
- `scripts/generate-briefing.test.js:213` comment — accurately records a failure
  observed against 2.5-flash.

## Watch on the next unattended run (Sunday 2026-08-30)

- Stage 4b word count / `grep -c '^## TLDR'` = 1 — the repetition loop guard
  (`truncateRepetition`) was written against 2.5-flash behaviour.
- Podcast extractor JSON parse rate across a full 60-80 episode batch. Only two
  calls were live-tested; the batch is where shape drift would show.
- Cost: thinking burn is unchanged (425 → 436 tokens on an identical prompt) but
  the rate card is higher, and doubles 1 Jan 2027.

**Rollback:** revert the model string in the 6 files (one-line change each).

---

# Editorial gate — surface the lineup BEFORE the edition is written

**Status:** BUILT — approved by Simon 2026-08-09; gate defaults OFF per his call
**Branch (proposed):** `feat/editorial-gate-before-draft`
**One sentence:** Move Simon's editorial judgement from after the draft to before it,
and make the Stage 4a output readable when it arrives.

## Why

The gate in `docs/editorial-process.md` is real but late. Stage 4a plans the lineup
and Stage 4b immediately expands it into prose — no pause. Simon reviews on Monday
with the edition already written, and corrects by editing the lineup and running
`npm run redraft`. He sees the selection, but only after the thing is made.

Two failures observed on Edition #25 (PR #111):
1. **No pre-draft stop.** `--from-lineup` runs Stage 4b only; nothing runs Stage 4a
   and halts.
2. **The output is unreadable on arrival.** `generate-weekly.sh` orders the PR body
   `SIGNAL_SECTION` → `CRITIQUE_SECTION` → `THEME_SECTION`, so ~270 lines of ratings
   table land first and the theme registry diff lands at line 329. Simon's words:
   *"I just see the ratings."* The themes↔stories mapping (`advances:` per story)
   only exists inside the committed lineup file and is never inlined.

Editorial cost this week: seven HIGH stories absent from the edition, including
Gurley's "Google should embrace open models" — the strategic prescription for the
lead story. They converge on one unbuilt thread (open weights as Google's answer)
that a pre-draft review would likely have caught.

## Steps

### 1. `--lineup-only` mode in `scripts/generate-briefing.js`
- [x] Add `--lineup-only`: run Stage 4a, write `drafts/{date}-lineup.md` and
      `drafts/{date}-themes-proposed.md`, then exit 0 without calling Stage 4b
- [x] Mirrors the existing `--from-lineup` arg parsing (`:54-63`); the two compose
      into a full stop/resume loop
- [x] `npm run lineup` script entry

### 2. Make the digest work before a draft exists
- [x] `scripts/signal-digest.js` currently diffs KB items against a written briefing.
      Add a no-briefing mode: report all graded items with no cited/uncited column
- [x] When a lineup exists but no draft, match against the lineup's `braids in:` URLs
      so the gate answers "what did 4a leave on the floor?"

### 3. Fix the digest's false positives
- [x] Match a bookmark as cited when the briefing cites **its linked article**, not
      only its permalink. Edition #25 flagged Eric Wallace, Cloudflare Kitesurf and
      WeatherNext as NOT CITED though all three ran — the citation used the
      `blog.google` / `blog.cloudflare.com` / YouTube URL
- [x] Bookmarks carry `external_links` in the raw JSON; match on those too
- [x] Overcounting trains the reader to ignore the section — the reason it reads as
      noise today

### 4. Reorder and compress the PR body (`scripts/generate-weekly.sh`)
- [x] New order: **lineup summary → theme registry → critique → signal digest**
- [x] Wrap the digest in `<details><summary>` so it stops burying everything
- [x] Inline a compact lineup summary: each Big Picture story with its `advances:`
      themes and gravity, so "which story drives this registry change?" is answerable
      without opening a file
- [x] Keep the full lineup file committed and linked

### 5. Wire the gate into the Sunday run
- [x] Decide the default (see Open questions) and implement in `generate-weekly.sh`
- [x] Update `docs/editorial-process.md` + `docs/diagrams/editorial-gate.mmd` — the
      diagram currently shows review only after `pr`

## Decisions (resolved 2026-08-09)

1. **Sunday does not stop by default.** `LINEUP_GATE=1` opts in. The reordered PR
   body and the digest fix improve every unattended run immediately; the hard stop
   is used on weeks there is time for it. Simon's call.
2. **Themes ↔ stories mapping and the full proposed registry go at the TOP** of the
   PR body — Simon's explicit instruction. Registry is inside a `<details>`.
3. **Same branch, not a separate PR.** `npm run redraft` writes the draft onto the
   lineup branch, so the lineup PR becomes the edition PR.

## Acceptance criteria

- [x] `npm run lineup` produces lineup + themes-proposed and writes no briefing
- [x] `npm run redraft -- <lineup>` still expands an edited lineup (unchanged behaviour)
- [x] PR body leads with lineup + themes; digest is collapsed
- [x] Digest reports zero false "NOT CITED" for Edition #25's three known cases
- [x] `docs/editorial-process.md` and the mermaid diagram match the built behaviour

## Out of scope

- `todos/001-*` — the `extract-podcasts.js` URL bug. Separate, already filed.
- The podcast recency leak (Valar Atomics 2026-07-02, BG2 2026-03-15, ChinaTalk
  2026-06-30 all cleared a 7-day window). Needs its own todo.

---

# Archive — Editorial hardening (approved 2026-07-26, all merged)


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

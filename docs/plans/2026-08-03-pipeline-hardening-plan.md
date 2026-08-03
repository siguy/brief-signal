# Brief Signal — Pipeline Hardening Plan (v2)

**Overall Progress:** `~25%` — Step 2a, Step 2c Tier 0, and Step 3a built and verified 2026-08-03.

## Shipped this session

- **Step 2a — `npm run redraft`** (`--from-lineup`). Verified: targets Edition **#24 not #25** (the edition-counter bug is fixed as a side effect), excludes the edition being rewritten from its own context, preserves the replaced draft to `drafts/{date}-pre-redraft-N.md`. Published file untouched in testing. *Live Gemini round-trip still unproven — ran with a dummy key to avoid regenerating a shipped edition.*
- **Step 2c Tier 0 — `npm run signal`** (`scripts/signal-digest.js`, ~200 lines, no deps, no LLM). On Edition #24 it surfaces **3 first-party announcements, all uncited**: @Google Gemini Robotics 2, and both @AnthropicAI open-weights items (= missed story #6 in the appendix).
- **Step 3a — grading rubrics** in `~/.claude/skills/extract-bookmarks/SKILL.md` and `extract-playlist/SKILL.md`. **Live-verified** via `claude -p`: @Google Gemini Robotics 2 → HIGH, both @AnthropicAI → HIGH, @jaltucher Kimi analysis → MEDIUM, politics → LOW.
- **Test wiring** — `npm test` now runs all three suites (46 tests). `lint-briefing.test.js` had never run.

Two bugs found and fixed while testing: `normalizeUrl` stripped query strings (collapsing every YouTube link to one key, so a single cited video marked them all cited), and the digest test summary printed "all passed" while a test failed. **`scripts/generate-briefing.test.js` still has that second flaw** — exit code is correct, the message lies.

Measured caveat on Tier 0 lane B: grading trims it from 8 entries to ~6, not to 3. Two "noise" entries grade MEDIUM and stay (a Demis Hassabis quote, a TPU-vs-GPU thread) — defensible, but lane B stays chattier than lane A.

**Supersedes:** the v1 draft reviewed 2026-08-03. See "What changed from v1" for the delta.

---

## TLDR

Edition #24 shipped, but Simon had to supply the OpenAI GPT-5.6 price cuts and the Anthropic breach by hand. Three failures happened **in sequence**, and v1 of this plan mis-ordered them:

1. **The automated run never reached Stage 4.** `scripts/logs/generate-2026-08-02.log:415-420` — the freshness guard hard-failed on a stale playlist KB and exited. Everything after ran under a hand-typed `=== MANUAL STAGE 4 ===` banner with 2 sources instead of 3.
2. **Selection then failed on material it did have.** `~/skills/podcasts-knowledge-base-2026-08-02.md:1761` carries `Intent Signal: OpenAI cutting prices for smaller GPT 5.6 models (Luna by 80%, Terra by 20%)` on a `GCP Relevance: HIGH` episode. It was loaded. It wasn't used.
3. **The mechanism meant to catch #2 fabricated its own audit.** This is the finding that reframes the plan — see below.

**The HIGH-disposition audit is confabulated.** `scripts/generate-briefing.js:181` already requires the lineup to dispose of every HIGH episode ("Silence is not a disposition"). It ran. It produced a 26-line table. The table is not true:

| Episode | Lineup claims | KB actually says |
|---|---|---|
| All-In "Chip Stocks Crash…" | `MEDIUM` | **LOW** |
| Hard Fork "An Ex-Googler's Memoir" | `MEDIUM` | **LOW** |
| a16z "Fei-Fei Li…" | `MEDIUM` | **LOW** |
| No Priors "Netic…" | `MEDIUM` | **LOW** |
| Pivot "Paramount Merger" | `MEDIUM` | **LOW** |

The KB contains 19 HIGH / 5 MEDIUM / 20 LOW. The lineup lists ~35 episodes with confidently-stated ratings, most invented. **The model performs the ritual of accounting for every HIGH episode, then selects whatever it was going to select anyway.**

That is why v1's Step 1 was wrong. It proposed *more required self-reporting* (enumerate each HIGH episode's Intent Signal and Competitive blocks) from a narrator already proven to fabricate. Asking an unreliable narrator for a longer statement does not make it reliable.

> **Correction for the record.** v1 said "the root cause is a SELECTION failure, not a source failure" and instructed "do not re-invert this ordering." The log contradicts that: the freshness guard is the *trigger*. Selection is real and still needs fixing, but it is the second link in the chain, not the first. This note replaces v1's boxed correction.

---

## What changed from v1

| v1 | v2 | Why |
|---|---|---|
| Selection is root cause, freshness is Step 4 | Freshness is the trigger (Step 1), selection is Step 3 | `generate-2026-08-02.log:415` — the auto run died before Stage 4 |
| Step 1: force HIGH disposition in the lineup | **Cut.** Already at `generate-briefing.js:181`; it complied and lied | Verified against the committed lineup |
| Step 1: enumerate Intent Signal + Competitive per HIGH episode | **Replaced** by injected ratings + deterministic digest | Enforcement beats instruction — v1 stated this principle then violated it |
| Step 2: `config/news-sources.json` + `extract-news.js` + new stage + ~15 sources | **~40-line `fetch-lab-news.js`, 4 feeds, no config, no new stage** | Closes the one verified gap; the rest was a news aggregator inside a briefing generator |
| Step 2: scrape `theinformation.com/briefings` | **Cut outright** | Paywalled publication. "Headlines render unpaywalled" is not a license |
| Step 2: pricing-diff watcher (3 more scrapers) | **Cut** | The price cut was already in the podcast KB at line 1761 |
| Step 4: `{status, count}` protocol across 4 extractors | **One line: always write the KB file on success, even when empty** | Two "extractors" are `claude -p` skills outside this repo |
| Step 6 bullet 3: add YouTube thumbnail fallback | **Cut.** Already at `fetch-og.js:219` | Verified |
| Step 6: fix `createPlaceholder` | **Relocated** to `downloadImage` (`fetch-og.js:141-142`) | That function writes response bytes with no content-type or magic-byte check — the actual defect |
| Step 3 rewrite `briefing-prompt.md:227-235` | **`:227-242`** | The worked example runs to 237, counterexample to 240, and the rationale at 242 must be preserved |
| Step 5: cite critique "flip-flopping" | **Re-cited** — see Step 6 | The flip-flop isn't in the logs; three better violations are |
| — | **New Step 0: version draft artifacts** | `generate-briefing.js:361` overwrote the failing lineup; the evidence for this plan no longer exists |
| — | **New Step 3a: grade bookmarks + playlist** | Only podcasts carry `GCP Relevance`. A first-party @Google post entered Stage 4a ungraded and was cut — that reads as misjudgment but is missing data |
| — | **New Step 2: approval gate** (`npm run redraft` + steering file + signal digest) | Answers "editorial oversight." `generate-briefing.js:388` already calls it the *"Approved Story Lineup"* — the gate is named in the code but never stopped at |
| Step 7: decide playlist, probably delete | **Keep it** (Simon, 2026-08-03) — quiet weeks are expected, not broken | Low volume, occasionally high signal. Makes Step 1 the load-bearing fix |
| — | **New: wire `lint-briefing.test.js` into `npm test`** | 12 passing tests referenced nowhere |

---

## Are we actually fixing signal judging?

**Partly — and honestly, mostly by routing around it rather than repairing it.** That is the correct call, and here is the reasoning.

There are two places signal gets judged, and they are not equally trustworthy:

**Extraction-time judging (trustworthy — but it only exists for one source).** `scripts/extract-podcasts.js` rates one episode at a time, with only that episode in context, and writes `- **GCP Relevance:** HIGH — <reason>` into the KB. Small context, single task, verifiable output. These ratings are **fine**. The Edition #24 price cut was correctly flagged HIGH at this stage.

**But two of the three sources are ungraded**, and it's the wrong two:

```
podcasts-knowledge-base-2026-08-02.md   44 grades  (19 HIGH / 5 MEDIUM / 20 LOW)
bookmarks-knowledge-base-2026-08-02.md   0 grades  (99 entries)
playlist-knowledge-base-2026-07-26.md    0 grades
```

Bookmarks is where Google and competitor news breaks fastest — 27 Google/Gemini/DeepMind/TPU mentions in this week's file, none carrying a grade. The consequence is concrete. Gemini Robotics 2 — a **first-party @Google announcement** — sits at bookmarks KB line 820 with a title, a permalink, and a summary, and no signal grade at all. It entered Stage 4a with no more standing than a Mamdani post, competed on narrative interest, and was cut with the reason: *"A Google product announcement, but the Samsara QH provides stronger market signal on physical AI adoption."*

For an audience of Google Cloud sellers that ranking is backwards, and nothing in the pipeline was positioned to say so, because nothing had graded it. **Grading gaps look like editorial misjudgment but are actually missing data.** Step 3 closes this.

**Selection-time judging (not trustworthy).** Stage 4a receives 435 lines of system prompt, ~45 lines of lineup task, the theme registry, previous-edition context, and ~136k tokens of KB — then is asked to both *recall* every rating and *decide* every disposition. It fails the recall half, which is why LOW episodes appear as MEDIUM. Everything downstream of a fabricated recall is unreliable, including the disposition.

So the fix is not "judge better." It is **take the recall away from the model.** Three changes, in increasing order of leverage:

1. **Inject the ratings; don't ask for them.** Build the disposition table deterministically from the KB in JavaScript — every episode, its true rating, its Intent Signal lines — and hand it to Stage 4a as *input*. The model fills in one column: where each item landed. It cannot relabel LOW as MEDIUM because it never generates the label. *(Step 3)*
2. **Verify dispositions deterministically.** Every HIGH row must have a non-empty disposition, and any HIGH episode whose Intent Signal figures (`80%`, `$100B`, company names) appear nowhere in the draft gets surfaced. A number is falsifiable; a paragraph is not. `grep` cannot be argued with and does not claim the signal was "absorbed." *(Step 2)*
3. **Delete the self-report once #1 and #2 land.** The `**HIGH-signal disposition:**` block at `generate-briefing.js:181` currently generates ~35 lines of fabricated audit per edition — costing output tokens and, worse, manufacturing false confidence in a PR artifact. Once the table is injected and checked, that block is redundant. *(Step 8)*

**What this does not fix:** whether Stage 4a's *editorial taste* is good — whether it picks the right lead from a correctly-labeled set. Nothing here makes it a better editor. What it does is make its choices **visible and falsifiable**, so your Monday review catches a bad pick in fifteen seconds instead of an hour. Given you already caught this miss by hand, that is the higher-value investment.

---

## Editorial oversight: a gate, not a report

**The problem is not that you can't see what happened. It's that you can't change it without rewriting prose.**

`scripts/generate-briefing.js:388` passes the lineup into Stage 4b under the literal heading `## Approved Story Lineup`. The comment at `:147` says the saved lineup file *"lets the reviewer check 'is this the right...'"*. **The architecture already names an approval gate — it just never stops there.** `lineup` is an in-memory variable handed from 4a to 4b inside one function call, so the editorial decision is made and executed while you're asleep. You only ever see the executed result.

That is the whole problem. The lineup *is* the editorial decision — what leads, what's a Big Picture, what's a Quick Hit, what merges, what's cut. The draft is just prose execution of it. Right now, correcting a bad decision means rewriting 2,000 words by hand, which is exactly what you did for Edition #24.

Three parts, in order of how much control they give you.

### Part 1 — Make re-drafting a one-command operation *(the actual oversight)*

Stage 4b already accepts a lineup as text. It just can't read one from disk.

- Add `--from-lineup <file>` so Stage 4b can run standalone against an existing lineup, skipping 4a entirely
- Expose it as `npm run redraft`

**The happy path does not change.** Sunday 9pm still runs end-to-end and opens a PR with a finished draft. If the lineup is right, you merge as today and this costs you nothing.

When it's wrong, your Monday looks like this instead:

```
1. Read the lineup (one page of bullets, not 2,000 words of prose)
2. Fix it — delete a story, promote the price cuts to lead, paste in one you know matters
3. npm run redraft
4. Fresh prose from your decision, ~60 seconds
```

That's editing **decisions** instead of **output**. It's the difference between an hour of rewriting and three minutes of bullet-editing — and it means a bad selection is cheap to correct, so you'll actually correct it instead of patching prose around it.

### Part 2 — A steering file *(proactive input, before anything runs)*

You read X and listen to podcasts all week. Right now that knowledge has **no path into the pipeline** except after the fact, on Monday.

- `content/editorial-steer.md` — drop notes into it any time during the week
- Stage 4a reads it as high-priority input, above the KB
- Clear it after each edition (or date-stamp entries and read the last 7 days)

Example content: *"Cover the OpenAI price cuts if they show up." · "Don't lead with security again — #23 did." · "Anthropic breach matters more than it'll look in the KB."*

This is the only mechanism here that shapes an edition *before* it's generated. Cheap to build — one `fs.readFileSync` and one block in the Stage 4a system instruction.

### Part 3 — `scripts/signal-digest.js` *(the input that makes Part 1 usable)*

You can't approve a lineup well without seeing what it chose **from**. The KB parses cleanly — `## Show (date) — "Title"`, `- **GCP Relevance:** HIGH`, `- **Intent Signal:**`, `  - Competitive:` — so ~60 lines with no dependencies and no LLM produces three tiers:

The KB is cleanly structured for this — `## Show (date) — "Title"`, `- **GCP Relevance:** HIGH — reason`, `- **Intent Signal:** ...`, `  - Competitive: ...`. A ~60-line script with no dependencies produces three tiers:

**Tier 1 — What is high signal this week** *(from KB alone; available before Stage 4 runs)*
```
19 HIGH · 5 MEDIUM · 20 LOW across 44 episodes

HIGH — AI Daily Brief (2026-07-31) "What a $30B Hedge Fund Implosion Really Means"
  ↳ OpenAI cutting prices for smaller GPT 5.6 models (Luna by 80%, Terra by 20%)
  ↳ Google's first cash-flow-negative quarter as CapEx overtook profits
  ↳ Competitive: OpenAI, Microsoft, Amazon
```

**Tier 2 — What we included, and at what depth** *(after the draft exists)*
```
LEAD    Autonomous Defense…            412 words   [AI Daily Brief, Latent Space]
BIG-2   Interconnect Bottlenecks…      338 words   [ThursdAI]
QUICK   Kimi K3 ships…                  74 words   [ThursdAI]
```
Word count per story is the "level of detail" signal — it shows at a glance that a story got 412 words of treatment while another got 74.

**Tier 3 — What we dropped, and whether that was deliberate**
```
⚠ HIGH episode with no figure in the draft:
   AI Daily Brief (2026-07-31) — "80%", "20%" appear nowhere in the edition
⚠ Model-release scan: GPT-5.6 Luna/Terra price cut — not present
Cut list (model-stated): Zohran Mamdani · Israel-Gaza · Twenty CRM …
```

### Where you see it

**Run it yourself, anytime:** `npm run signal`. After extraction, before generation, mid-week — it reads the KBs and tells you what came in without generating anything.

**Inlined at the top of the PR body**, above the draft. Today the PR body carries the critique and theme diff but *not* the lineup — you have to go open a file. Putting Tiers 1-3 first means you judge **selection before you read prose**, which is the order the failure actually happens in.

**Alongside the lineup**, so the approve-or-redraft decision has the evidence next to it.

**One line replaces the PR checklist item:** *"Anything important missing? Compare Tier 1 Intent Signals against the draft. If the lineup is wrong, fix it and `npm run redraft`."* The current checklist asks you to verify what the linter already verifies, and never asks the question that failed.

### How the three fit together

| | When | What it gives you |
|---|---|---|
| Steering file | Any time during the week | Shape the edition **before** it's generated |
| Signal digest | Sunday after extraction, or in the PR | See what was available and what got dropped |
| `npm run redraft` | Monday, only when needed | **Change the decision** and regenerate cheaply |

Digest without redraft is a report you can't act on. Redraft without the digest is editing blind. The steering file is the only one that works ahead of the run.

### Deliberately not doing

- **Forcing a stop between 4a and 4b every week.** A mandatory two-PR flow doubles the review burden even on weeks the pipeline gets it right. `--from-lineup` gives you the same control as an opt-in, paid for only when you use it.
- **Putting the digest inside `lint-briefing.js`.** `run_lint()` in `generate-weekly.sh:270-283` treats any non-2 exit as `LINT_STATUS="error"` and **continues with no lint at all**. Adding a KB read to the linter means a missing KB file silently disables every rule — including `[cross-edition-lead]`, shipped last week for exactly this class of failure. The digest lives in the PR body, where failure is visible and harmless.

---

## Critical Decisions

- **Enforcement beats instruction — applied, not just stated.** v1 declared this principle and then proposed three more prompt instructions. v2 converts every selection fix into either injected data or a `grep`.
- **The KB's extraction-time ratings are ground truth.** Stage 4a may not relabel them.
- **Legibility over correctness.** The human gate exists, works, and caught this failure. Invest in showing you what the pipeline saw, not in making the pipeline infallible.
- **Freshness ≠ non-empty**, and the fix belongs in the producer (always write the file), not the guard.
- **Every new moving part is something that can break at 9pm Sunday with nobody watching.** `MEMORY.md` documents five silent-failure modes on this cron, and all five are *coordination* failures between stages. Net moving parts must go **down**.
- **Sources earn their way in one at a time**, by demonstrated misses — not twelve at once on a hunch.
- **Scope discipline** — no new features. Two items in v1 were purchases or lookups, not tasks (see Deferred).

---

## Context — already shipped (do not redo)

- Edition #24 published (PR #92); audio published (PR #94, script proofread).
- `[cross-edition-lead]` lint rule (PR #95), threshold `0.15`, zero false positives across 22 editions.
- Repair routing guard — `repair-briefing.js` skips `[cross-edition-lead]` alongside `[images]`.
- Memory updated: `feedback_angle_structure_for_sales.md` rewritten; `feedback_concede_when_competitor_wins.md` added.

### Already implemented — v1 proposed building these
- HIGH-signal disposition requirement → `scripts/generate-briefing.js:181`
- Model-release coverage self-check → `scripts/generate-briefing.js:179`
- HIGH episodes get presumptive Quick Hit claim → `scripts/briefing-prompt.md:101`
- YouTube thumbnail fallback → `fetch-og.js:216-224`, `youtubeThumbUrls()` at `:236`

---

## Tasks

### 🟥 Step 0 — Stop destroying the evidence (blocks all verification)

`scripts/generate-briefing.js:361` writes `${targetDate}-lineup.md`, a fixed path. Stage 4a ran twice against `2026-08-03` (log lines 426 and 735) and **the committed lineup is the second run** — it leads with the price cuts and its gravity line reads `1 distinct KB (Supplemental)` / "was explicitly directed as the lead." The lineup that actually failed is gone.

- [ ] Version draft artifacts: `{date}-lineup-r{n}.md` and `{date}-v{n}-stage4.md`, never overwrite
- [ ] Pin the true baseline fixture now: `git show ade2f96:content/briefings/drafts/2026-08-03-lineup.md > tests/fixtures/2026-08-03-lineup-baseline.md` — its lead was the Edition #23 repeat
- [ ] Note in the plan and in the fixture header **why** it's pinned; you will forget in three weeks
- [ ] Don't let a re-run silently advance the edition counter (`getNextEdition()`, `generate-briefing.js:73`) — the committed lineup says #25 while the merged PR says #24
- [x] Wire `scripts/lint-briefing.test.js` into `package.json:17`'s `test` script — 12 passing tests currently run nowhere

### 🟥 Step 1 — Fix the freshness guard (the actual trigger)

- [ ] In each in-repo extractor (`scripts/extract-podcasts.js`, `scripts/extract-rss-podcasts.py`): **on success, always write the KB file — even with zero new entries** — with an explicit `No new items this week.` line
- [ ] Same one-line change in the two out-of-repo `claude -p` skills (`~/.claude/skills/extract-bookmarks`, `extract-playlist`) — **note: these live outside this repo**, so this is a cross-directory change
- [ ] Leave `check_kb_fresh()` (`generate-weekly.sh:143-171`) **unchanged**. Its mtime test is already correct once producers behave: fresh file = ran and succeeded; stale file = failed. Absent/stale still blocks, which is right — an OAuth-expired `claude -p` writes nothing and must not pass
- [ ] Tell Stage 4b which sources were empty, so the `*Sources: ...*` footer (parsed by `build.js`) reflects reality
- [ ] Verify: move `playlist-knowledge-base-*.md` aside, run the pipeline — it reaches Stage 4 with the remaining sources and the PR body says the playlist was empty. Then make an extractor exit non-zero — it still blocks

### 🟥 Step 2 — Editorial oversight: the approval gate

**2a — `npm run redraft` (the control surface).** This is the highest-value item in the plan.

- [x] Add `--from-lineup <file>` to `generate-briefing.js`: read the lineup from disk, skip Stage 4a, run Stage 4b against it. Stage 4b already takes the lineup as text (`:388`) — it just can't source one from a file
- [x] Expose as `"redraft": "node scripts/generate-briefing.js --from-lineup"` in `package.json`
- [ ] Re-run lint + images after a redraft, same as a normal run
- [x] Replaced draft preserved to `drafts/{date}-pre-redraft-N.md` (partial Step 0: the redraft path never destroys what it replaces)
- [x] **Leave the Sunday happy path unchanged.** End-to-end still runs unattended and opens a finished PR; the gate is opt-in and costs nothing on weeks the lineup is right
- [ ] Verify: take the Step 0 baseline lineup, hand-promote the price-cut story to lead, `npm run redraft`, confirm the new draft leads with it

**2b — steering file (proactive input).**

- [ ] `content/editorial-steer.md`, read by Stage 4a as high-priority input above the KB
- [ ] Date-stamp entries; read the last 7 days so it doesn't need manual clearing
- [ ] Seed it with a header explaining the format, so it's obvious what to write six weeks from now
- [ ] Surface its contents in the PR body — if steering was given and ignored, that must be visible
- [ ] Handle absent/empty gracefully; this must never block a run

**2c — `scripts/signal-digest.js` (the evidence).**

- [x] No dependencies, no LLM. Parse **all three** newest `~/skills/*-knowledge-base-*.md` files — not the podcast KB alone. An earlier draft of this step read only podcasts, which would have reproduced the exact blindness described above
- [x] **Tier 0 — Google & competitors (advisory).** Deterministic `grep`, no judgment: every entry from a first-party account (`@Google`, `@GoogleDeepMind`, `@OpenAI`, `@AnthropicAI`, `@Microsoft`, `@AWS`, `@MistralAI`, `@xai`, `@Meta`) or naming Gemini / TPU / Vertex / Agent Platform / Azure / Bedrock / Claude / GPT / Llama / Mistral / Grok / DeepSeek / Qwen / Kimi. Listed whether or not it made the draft, with a marker for those that didn't. **Advisory only** (Simon, 2026-08-03) — it informs the review, it does not block a run. Revisit blocking after a few editions
- [ ] Tier 1: rating counts + every HIGH item with its Intent Signal and Competitive lines, verbatim, across all graded sources
- [ ] Tier 2: per-story word count from the draft, with sources — the "level of detail" view
- [ ] Tier 3: HIGH items whose Intent Signal figures (percentages, dollar amounts, company names) appear nowhere in the draft; plus the model-stated cut list
- [x] Verify Tier 0 against this week: Gemini Robotics 2 (bookmarks KB line 820) must appear, flagged as cut
- [x] Add `"signal": "node scripts/signal-digest.js"` to `package.json` so it runs standalone, any time, without generating anything
- [ ] Inline Tiers 0-3 at the **top** of the PR body in `generate-weekly.sh:338-365`, above the critique and theme diff
- [ ] Add a source-inventory line: `Bookmarks: 2026-08-02 (23,314 words) · Podcasts: 2026-08-02 (60,883 words, 19 HIGH) · Playlist: 2026-08-02 (ran, no new videos)`
- [ ] Replace the PR checklist item with: *"Anything important missing? Compare Tier 1 Intent Signals against the draft. If the lineup is wrong, fix it and `npm run redraft`."*
- [ ] Verify against the Step 0 baseline fixture: Tier 3 must flag `80%` / `20%` as absent from the Edition #24 draft
- [ ] Keep this **out of** `lint-briefing.js` — see Critical Decisions

### 🟥 Step 3 — Grade every source, then inject the grades

Two halves of one idea: a story can only be defended at selection time if it was **graded** at extraction time. Today only podcasts are, so bookmark stories — where Google and competitor news breaks — arrive with nothing to defend them.

**3a — grade the ungraded sources.**

- [x] Extend the bookmark extraction (`~/.claude/skills/extract-bookmarks`, plus `enrich-bookmarks.py` if the grade is written post-enrichment) to emit `- **GCP Relevance:** HIGH|MEDIUM|LOW — <reason>` per entry, in the same shape podcasts use. **Same reason it works for podcasts: one entry at a time, small context, single judgment**
- [x] Grade the playlist extraction the same way — lower volume, but consistency means the digest parser has one format, not three
- [x] First-party product news from Google or a named competitor is **never LOW.** Encode that as a rule in the extraction prompt, not as a hope
- [x] Named competitors (Simon, 2026-08-03): **AWS, Azure/Microsoft**, the frontier labs **OpenAI, Anthropic, Meta, Mistral, xAI**, and the Chinese open-weight labs **DeepSeek, Qwen/Alibaba, Moonshot/Kimi**
- [x] Live-verified via `claude -p` against the raw JSON: the @Google Gemini Robotics 2 entry (line 820) must come out HIGH
- [ ] Grading is additive metadata — it must never drop or truncate an entry. See `project_bookmark_article_enrichment.md` (the KB must never truncate post text)

**3b — inject the grades; stop asking for them.**

- [ ] In `generate-briefing.js`, build the disposition table deterministically from the KBs before calling Stage 4a: one row per item with its true grade and Intent Signal lines
- [ ] Pass that table into `lineupTask()` as input. The model fills in **only** the disposition column — it never generates a grade, so it cannot relabel LOW as MEDIUM
- [ ] Deterministically assert every HIGH row has a non-empty disposition before accepting the lineup
- [ ] Verify against the baseline fixture: no LOW episode may appear labeled MEDIUM

### 🟥 Step 4 — Port the new "Your angle" format

Best-scoped item in v1; unchanged except for the line range.

- [ ] Replace (don't append to) the "2 escalating questions" spec at `briefing-prompt.md:166` — contradictory instructions in one prompt are worse than either alone
- [ ] Rewrite the Section Voice Guide at **`briefing-prompt.md:227-242`** (not `:227-235` — the worked example runs to 237, counterexample to 240) to: **concede what's true → move to the eval on their workload/TCO → compete where the news can't reach → where GCP wins**; at most ONE question, only if it reframes
- [ ] **Preserve line 242's rule**: *"This 'Where the GCP opportunity is' line is the ONE place GCP product positioning is allowed"*
- [ ] Update the self-check at `briefing-prompt.md:431`
- [ ] Add: never assume founders will fine-tune/distill — raise it only for the profile it fits
- [ ] Extend `briefing-prompt.md:23` ("Never dress a Google loss up as a win") with the concede-when-a-competitor-wins principle. **Extend, don't add a second rule elsewhere** — that's how the prompt reached 435 lines
- [ ] Check `checkAngleBlocks()` in `lint-briefing.js` isn't still enforcing the retired two-question shape, or the linter will fight the prompt
- [ ] Use Edition #24's shipped angles as the reference implementation
- [ ] Budget a live dry run — fixture tests can't prove a prompt change (`tasks/lessons.md:284-289`)

### 🟢 Step 5 — Playlist: DECIDED, keep it

**Simon's call (2026-08-03): keep the playlist.** It's low-volume but occasionally high-signal — some weeks nothing, some weeks something that matters. No deletion.

This makes Step 1 **more** important, not less: the playlist is the source most likely to be legitimately empty, so `empty ≠ failed` is the difference between "a quiet week" and "a dead pipeline." It is exactly the case that killed the 2026-08-02 run.

- [x] Decision made — no code change to the stage itself
- [ ] Ensure `/extract-playlist` is covered by Step 1's always-write-on-success change (it's the primary beneficiary)
- [ ] Signal digest must distinguish `ran, no new videos` from `stale / never ran` — these look identical today and that ambiguity is what let a dry playlist masquerade as a failure
- [ ] Keep the sources footer honest: an empty playlist week is a 2-source edition and should say so, without treating it as an error
- [ ] Note in `tasks/lessons.md`: a legitimately quiet source is not a broken source. Weekly cadence over a small playlist means empty is the *expected* state some weeks

### 🟥 Step 6 — Demote critique to advisory

- [ ] `generate-weekly.sh:297` — drop the `"$CRITIQUE_STATUS" = "hard_failures"` clause; keep lint as the only repair trigger
- [ ] Keep the full critique in the PR body as review material
- [ ] **Corrected justification** (v1's "flip-flopping" claim is not in the logs — all 12 critique pairs agree on naming). The real violations:
  - `scripts/logs/critique-2026-06-29.md:24` instructs *"Subsequent mentions can then use 'GEAP'"* — which `lint-briefing.js:208` now **hard-fails**. The critique actively instructs the model to produce a lint violation
  - `critique-2026-06-22.md:7-9` and `critique-2026-07-06.md:7-12` flag the `Where the GCP opportunity is` line as a hard failure, while `briefing-prompt.md:431` states in bold that it is a permitted feature
  - Structural argument, independent of any log: an LLM grading an LLM's output and thereby triggering a third LLM to rewrite it is a loop with no ground truth in it
- [ ] Note `scripts/logs/` is gitignored — this evidence is local-only

### 🟥 Step 7 — Close the one real source gap

- [ ] Write `scripts/fetch-lab-news.js` — ~40 lines, no dependencies, no config file. Four feeds in a `const` array: `anthropic.com/news` (where the missed breach broke), `openai.com/news`, `blog.google/technology/google-deepmind`, `cloud.google.com/blog`. Four static URLs do not need a JSON file plus a loader plus an `enabled` flag
- [ ] Output `~/skills/labnews-knowledge-base-YYYY-MM-DD.md`: title, date, permalink, one line each. **No summarization** — headlines and links are what's needed
- [ ] Do **not** model it on `scripts/extract-rss-podcasts.py` (705 lines, mostly audio download + whisper transcription — shares nothing with an RSS reader but the word "RSS")
- [ ] Add the prefix to `findKnowledgeBaseFiles()` in **both** places (`generate-briefing.js:26-28` and `:43-49`)
- [ ] Call it inline before the freshness check — it runs in under two seconds and does not warrant a background stage with a PID and a `wait`
- [ ] **No freshness gate on it.** A lab that publishes nothing this week is normal; gating re-creates the Step 1 bug
- [ ] Verify over 2026-07-27 → 08-02: the Anthropic breach (2026-07-30) must appear
- [ ] Run four weeks. Add a fifth feed only when a specific missed story justifies it

### 🟥 Step 8 — Image fetching + cleanup

- [ ] **The defect is in `downloadImage`** (`fetch-og.js:141-142`), which writes response bytes with no content-type and no magic-byte check — whatever the server returns lands at whatever extension the markdown asked for. That's both this week's failures (SVG and PNG written to `.jpg`) in one bug. Sniff the buffer; convert or reject; never write unverified bytes
- [ ] `createPlaceholder()` (`:245-260`) is **already correct** — it writes only a `.svg` diagnostic and deliberately keeps SVG bytes out of the raster path (Edition #23 fix). Leave it
- [ ] If rasterizing with `sips`: guard with `command -v sips` and fall through to the existing loud-failure path. Verified working on macOS 26.5, but SVG support is undocumented and has varied across releases — best-effort, not a contract. Nothing breaks in CI: `.github/workflows/deploy.yml` runs only `npm ci` + `npm run build` and never fetches images
- [ ] Fix `findImageSources()` (`:164-170`): it picks the **first** URL within 12 lines below the image, so a story linking `openai.com` before its YouTube link never reaches the existing thumbnail fallback — likely exactly what happened to the GPT-5.6 story. Collect all nearby URLs and try YouTube candidates from any of them
- [ ] Unit-test against a captured SVG and a captured PNG. Do not re-fetch live URLs — that's a network call, not a regression test
- [ ] Note: `fetch-og.js` is at the **repo root**, not in `scripts/`
- [ ] Worth doing because `checkImages` hard-fails and `repair-briefing.js:77` skips `[images]` — a broken image is currently a permanent, unfixable failure printed into the PR body every week, i.e. standing noise in the channel Steps 2 and 6 are trying to make trustworthy
- [ ] **Then delete** the `**HIGH-signal disposition:**` block at `generate-briefing.js:181`, once Steps 2-3 have proven out over one edition. It generates ~35 lines of fabricated audit per run
- [ ] Commit the uncommitted `dotenv` fix on `main` (`scripts/fetch-analytics.js` required it; never declared in `package.json`; now `^17.4.2`)

---

## Ordering and dependencies

```
Step 0  (versioned artifacts)     → blocks every "verify against baseline" claim,
                                     and redraft needs it to avoid clobbering
Step 1  (freshness)               → root cause; playlist is the main beneficiary
Step 2a (npm run redraft)         → depends on 0. Highest value per line in the plan
Step 2c (signal digest)           → depends on 0 for a fixture
Step 2b (steering file)           → independent, tiny
Step 3a (grade bookmarks/playlist)→ extraction-stage. Tier 0/1 of the digest and
                                     3b are both blind on 2 of 3 sources without it
Step 3b (inject the grades)       → depends on 3a + 2c (shares the KB parser)
Step 6  (critique demotion)       → before adding lint rules, settle the lint/repair contract
Step 4  (angle format)            → independent, zero runtime risk, do any time
Step 7  (lab news)                → depends on 1 (new source enters the freshness path)
Step 8  (images + cleanup)        → independent; the deletion at the end depends on 2c and 3b
Step 5  (playlist)                → decided, no work beyond Step 1 + 3a coverage
```

Note Tier 0 of the digest (Google & competitors) is a plain `grep` over raw KB text, so it works **before** 3a lands — it keys off account handles and product names, not grades. Ship 2c without waiting for 3a; Tier 0 is useful on day one, Tier 1 gets fuller once grading covers all three sources.

Suggested PRs: **(1)** Step 0 + the `dotenv` commit · **(2)** Step 1 · **(3)** Step 2a — *ship this alone and early; it's the one that changes your Mondays* · **(4)** Step 2b + 2c · **(5)** Step 3a + 3b · **(6)** Step 4 + Step 6 · **(7)** Step 7 · **(8)** Step 8.

---

## Verification

"Backtest" is replaced with concrete pass/fail criteria. Note `tasks/lessons.md:284-289`: fixture tests could not have caught URL fabrication — only a live model call did. Steps 3 and 4 change model behavior and need a live dry run.

| Step | How to verify |
|---|---|
| 0 | Run Stage 4 twice on one date; two lineup files exist |
| 1 | Move a KB aside → pipeline reaches Stage 4 with N−1 sources and says so. Make an extractor exit non-zero → still blocks |
| 2a | Take the baseline lineup, hand-promote the price cuts to lead, `npm run redraft` → new draft leads with it. Confirm the Sunday end-to-end path still works untouched |
| 2b | Put a line in `editorial-steer.md`, run Stage 4a, confirm it influenced the lineup — and that an absent/empty file changes nothing |
| 2c | Against the baseline fixture, Tier 3 flags `80%`/`20%` as absent |
| 3a | Re-extract this week's bookmarks; the @Google Gemini Robotics 2 entry comes out HIGH, and no entry loses text |
| 3b | Against the baseline fixture, no LOW episode appears labeled MEDIUM |
| 4 | Prompt text — diff review plus one live dry run |
| 5 | One clean run with the source removed; footer says two sources |
| 6 | One run where critique hard-fails and lint passes → no repair fires |
| 8 | Unit test `downloadImage` against captured SVG and PNG bytes |

---

## Deferred — decisions, not tasks

- **Stratechery** — `config/podcasts.json:145-151` is `enabled: false, rssUrl: null`. Needs a Stratechery Plus subscription and its RSS URL. That's a purchase and a lookup: if the URL exists, flip the flag (30 seconds); if not, close it.
- **`theinformation.com/briefings`** — cut. Paid publication; automated weekly scraping of it raises a terms-of-service question, and "headlines render unpaywalled" is a dependency on the current shape of someone else's paywall.
- **Pricing-diff watcher** (OpenRouter / Artificial Analysis / `llmgateway.io`) — cut for now. These are structured price tables where the signal is a diff between snapshots, requiring persisted state — a different machine from an RSS reader. Revisit only if a price change is missed *after* Steps 2-3 are live. The Edition #24 cut was already in the podcast KB.
- **Two-PR editorial flow** — revisit only if the Signal Digest proves insufficient.
- **Prompt length** — `briefing-prompt.md` is 435 lines and grows every time an edition disappoints. `:62` carries a paragraph retelling the Kimi K3 miss; `:87` a paragraph on the Edition #21 Karp lead. Those are *your* memory, not the model's; they cost attention every run and neither prevented a recurrence. The correct direction is shorter: every rule the linter can enforce should move there, and its justifying prose should be deleted when it goes.

---

## Appendix — stories Edition #24 missed (audit, 2026-07-27 → 08-02)

Backtest fixtures for Steps 2-3. **Note:** none of these appear in the committed lineup's "Considered but cut" list (which contains Zohran Mamdani, Israel-Gaza, Twenty CRM). They were never candidates — there was nothing to dispose of.

1. **Big Tech earnings week** — Microsoft FQ4 (Azure past $100B annually, +43%), Amazon Q2 (AWS +37%, capex → $220B), Meta (capex $130-145B, FCF collapsed to $784M, stock −9.6%). Google Cloud's 82% only means something next to these.
2. **AI market repricing** — Aschenbrenner's Situational Awareness fund $45B → ~$10B on margin calls, fire-sold to Citadel; semis lost >$1T market value.
3. **Compute capital structure** — Nvidia ~$250B backstop of OpenAI's 10GW Ohio site; Amazon completed its $50B OpenAI investment with a $35B tranche.
4. **Nvidia puts $5B into Safe Superintelligence; SSI moves off Google TPUs to Vera Rubin GPUs** — a marquee TPU loss a GCP rep must not hear first from a founder.
5. **MCP 2026-07-28 spec revision** — stateful → stateless core, header routing for metering, breaking changes; Anthropic and AWS AgentCore shipped support same-day.
6. **Open-weights policy split** — 20+ companies signed against open-weight restrictions, leaving Anthropic alone; plus the 1,178-employee "Pacing the Frontier" letter. **Both were already in the KB** (25 hits on "open-weight").
7. **OpenAI ARR hit $42.6B** — July alone exceeded all of Q2; Codex and ChatGPT Work named as drivers.
8. **Chinese open-weight price floor** — DeepSeek V4-Flash (Intelligence Index 50, up to 50% cheaper), Qwen3.7 Flash at $0.03/$0.13 per M. Edition #24 framed Kimi K3 as an interconnect story and missed the coordinated price collapse.
9. **Nscale acquires Anyscale** (~$1.6B) — a neocloud buying Ray.
10. **OpenAI previews "Astra"** — ten open math/TCS problems with published Lean 4 proofs.
11. **Thinking Machines Inkling Small** — 276B/12B-active open MoE matching its 975B sibling; the proof point Edition #24's own "80-90% doesn't need frontier" thesis needed.
12. **Agent-identity security consolidation** — Okta buys Permiso (~$200M), Onyx $113M, Act $60M, Hush $30M.

**Framing gap, not a miss:** the OpenAI ExploitGym / Hugging Face breach was **2026-07-24 (prior week)** and is what *triggered* Anthropic's 141,006-run retrospective. Edition #24 ran the Anthropic half without the OpenAI half, making it an incident rather than a pattern.

**GCP-specific, in-window:** Oracle × Google Cloud expanded partnership (2026-07-30, Gemini 3.1 Flash Lite + 3.5 Flash into Fusion AI Agent Studio/NetSuite; ORCL +8%); Gemini Robotics-ER 2 public preview; TPU Day-0 support for Kimi K3. **Alphabet Q2 (Cloud $24.8B, +82%, first negative FCF in Alphabet's public history) was 2026-07-22 — prior week.** The "82% / cash-flow negative" framing traces to the AI Daily Brief 2026-07-31 episode in the KB, **not** a 20VC episode; the 20VC attribution is mistaken.

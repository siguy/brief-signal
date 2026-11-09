# Proposal v2: Monday review covers editorial calls only (revised 2026-11-09 after code review)

## Goal
By the time the Monday PR opens, the pipeline has either fixed or cut every factual
and mechanical problem. Your review covers three things: **story selection, which
voices to include, and how each play is worded.** Nothing else should need you.

## What reviewing the code changed
1. **The evidence-tag idea from v1 wouldn't work, and isn't needed.** Stage 4b gets
   about 690 KB of KB text with no line numbers (`generate-briefing.js:405`), so the
   model has no way to cite "line 919". But the draft already cites its sources:
   every claim carries a link like `[Jason Lemkin on 20VC (69 min watch, 23:45)](url)`,
   and that link holds the speaker, timestamp and URL. I checked all 27 URLs in the
   original #38 draft, and each one appears verbatim in that week's KBs. So the check
   can start from the link. That means no tags, no changes to the prompt format, and
   no stripping in build, audio or email.
2. **The repair step currently can't re-credit anything.** It is told "you have no
   access to the source material" (`repair-briefing.js:113`) and rewrites the whole
   document in one go. To move "no bid" to Jamin Ball, it needs the right KB entry
   handed to it, and it should only touch the paragraphs that failed.
3. **The real product was missing from every source.** "Agent Substrate", the
   product the fix used, doesn't appear in the playbook or any 11-08 KB. The lab-news
   feed only caught the cut-off "What's new" roundup. The model made up a product
   because it didn't have the real one, and an allowlist built only from those
   sources would have rejected the correct fix as well.
4. **This worktree has no playbook** (it's gitignored). Every product check has to
   stop loudly when the playbook is missing, or it will fail every product name.
5. Smaller note: the model ID is hardcoded in 7 places across 5 scripts. That's out
   of scope here, but it's why each model upgrade has to edit 7 places.

## Plan (each step its own commit, tests written first)

- [x] **1. Source check (`checkClaims` in lint, plain code, no AI).** For each sentence
  in TLDR, Big Picture and Quick Hits:
  - find the KB entry that matches each link URL
  - every number in the sentence has to appear in that entry's **primary text**:
    podcast quote lines ("— Speaker (hh:mm)"), the bookmark post body, or the
    lab-news body. A Takeaway, Budget, Consensus or "GCP Relevance" line doesn't count.
  - the speaker named in the link label has to be the one credited on that quote
    line, and the link's timestamp has to be within 3 minutes of the quote's
  - a number in story prose with no link fails, and a TLDR number has to appear in the body
  - in angle blocks and Our Play, a number has to come from the story, the playbook
    or the founder question. Seller's Edge is exempt, because its worked examples are
    made up on purpose.
  - On #38 this catches: "no bid" (not in the ILTB entry), 470 GW and "40 of 41"
    (summary lines only), Malaysia $15B (wrong entry), GitHub 40% (credited to the
    host, not Parikh), $1,265 (the draft's own math), AlloyDB "<$5" (no source).

- [x] **2. Wording check (AI suggests, code confirms).** Numbers aren't the only
  problem: #38 also had "former Facebook CSO", "nationwide" for local measures,
  "patched" for "generated patches for", and "uncollateralized". One small Gemini
  call gets each story plus only the KB entries it cites, and returns every
  title, role and scope word, each with the exact KB text that backs it. Code
  then checks that text appears word-for-word in that entry. If it doesn't, the
  wording fails. The AI can only point at evidence, never vouch for a claim.

- [x] **3. Product names: block at the source, then check.**
  - Build the allowlist from the playbook, all of the week's KBs, and a hand-kept
    `config/gcp-products.txt` for launches the feeds missed (Agent Substrate goes in first).
  - Feed that list to Stage 4b: "name only these products."
  - The lint fails any Google-style name not on the list. A missing playbook stops the run.

- [x] **4. Move the critic's mechanical rules into lint.** Each number used once per
  edition, Quick Hits one sentence, no "Edition #" or "last week" in Seller's Edge,
  and capacity-overclaim phrases added to the banned list. The critic stays only to
  flag editorial issues, which go into your Monday list.

- [x] **5. Rebuild the repair step to fix paragraph by paragraph.**
  - It gets only the failing paragraphs, plus the KB entries code found for each
    claim. When exactly one entry contains a quote with that number, code names the
    correct speaker, URL and timestamp for it.
  - Guards: any new number, URL or product name that isn't in the supplied evidence
    rejects that paragraph's fix (today only URLs are guarded).
  - If a paragraph's fix is rejected or still fails, code **deletes the failing
    sentence**. You never have to fix a sentence by hand.

- [x] **6. Reorder the PR body around your three calls.** At the top: the lineup
  (stories plus braided voices), the HIGH voices left out and why, and the plays to
  read. At the bottom, collapsed: what the pipeline fixed or cut, for your
  information, with nothing to decide.

## How we'll know it works
- [x] The original #38 draft (`7f54567`) flags the fake product, the AlloyDB claim
  and at least 9 of the 11 misattributions the fact-check found.
- [x] The corrected #38 (`2acc63e`) passes clean.
- [x] **False-alarm test:** run against #36 and #37 using their own KBs. Both
  shipped after your review, so each flag on them is either a real miss or a false
  alarm. Target: under 3 false alarms per edition, each one fixed in the check
  before merge.
- [x] `npm test` passes, with unit tests for every new check.
- [x] One dry run of Stage 4 on the 11-08 KBs (a few cents): count what repair fixed,
  what got cut, and whether anything still needed you.

## Still yours on Monday (by design)
Story selection, which voices to include, how each play is worded, and the
cross-edition repeated-lead flag (that one is a story-selection call).

## Known limits
- A claim that's wrong but has no number and no title or scope word (say, a made-up
  causal link) only gets caught if step 2's AI notices it.
- Lab-news bodies are cut off at about 400 characters, so a first-party number past
  that point will false-alarm. The false-alarm test will show how often that happens.

## Order
3 (smallest, catches the worst error) → 1 → 4 → 5 → 2 → 6 → acceptance tests.
One PR: "Pipeline fixes or cuts factual and mechanical errors before Monday review."

---

## Review (2026-11-09, branch feat/pre-review-fact-checks)

Built all six steps, plus the model-name refactor (config/models.json).

**Replays.** Lint findings before repair, then after the full repair:

| Draft | Hard failures before → after | Words after | Time |
|---|---|---|---|
| #38 original pipeline draft (7f54567) | 24 → 0 | 1,465 | ~3 min |
| #37 original draft (v0-stage4) | 25 → 0 | 1,591 | ~3 min |
| #36 original draft (v0-stage4) | 8 → 0 | 1,614 | ~2 min |

- On #38 the checks caught the fake product, the AlloyDB "<$5", and 8 of the 11
  hand-found misattributions (no bid, Texas 470 GW, 40/41, Malaysia $15B, Swyx's
  48%, GitHub 40%/6x, Microsoft $5B), plus the $1,265 arithmetic. The wording
  check caught "former Facebook CSO" and "nationwide".
- Not caught: Lemkin's "$20–$40" (each end appears in his quote), "5,000
  Cursor customer repos" (the number is right, the noun is wrong), and the
  GPT-6 Cyber date.
- The hand-corrected, published #38 still has 3 real misses ($1,265, a
  summary-only "41", Microsoft's summary-only "$5B").
- **Published #37 has two dead links**, invented by its drafter:
  blog.google/…/introducing-gemini-4-carbon/ and
  pmarca.substack.com/p/replit-and-the-dawn-of-the-self (both return 404).
- The 10-12 draft was left out of the test: its numbers aren't in the KB
  files saved for that week.

**Known limits.** A first-party number past the ~400-character cut-off in a
lab-news excerpt reads as unsourced. A claim with no number, title or scope
word is checked only by the critique. When a re-credit or cut makes a play
read awkwardly, that's left for Monday by design.

---

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

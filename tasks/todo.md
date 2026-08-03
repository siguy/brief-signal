# Brief Signal — open work

Last updated 2026-08-03. The previous contents (Edition #23 fixes, 2026-07-26)
are complete and were removed; see git history if you need them.

**Full detail and rationale:** `docs/plans/2026-08-03-pipeline-hardening-plan.md`
— this file is just the short list.

## Shipped 2026-08-03 (PRs #97-#101, all merged)

- [x] Editorial gate — `npm run redraft` rebuilds prose from an edited lineup
- [x] Signal digest — `npm run signal`, Tier 0 Google/competitor lane
- [x] Grading rubrics for bookmarks + playlist (in `~/.claude/skills/`, not this repo)
- [x] Empty ≠ failed — a quiet source no longer blocks the run
- [x] LLM critique demoted to advisory; only lint can trigger a repair
- [x] "Your angle" rewritten as a 4-move rep toolkit
- [x] 15 Dependabot alerts closed; `dotenv` declared
- [x] Two dead checks revived: `lint-briefing.test.js` (never ran), angle-block lint

## Next up — hardening plan

- [ ] **Step 3b — inject grades into Stage 4a.** Build the disposition table in
  JS from the KBs and hand it to the model so it fills in only "where it landed."
  It currently *generates* the ratings and gets them wrong — five LOW episodes
  appeared as MEDIUM in Edition #24's lineup. Highest remaining value.
- [ ] **Step 7 — lab-news watcher.** ~40 lines, 4 RSS feeds (anthropic.com/news,
  openai.com/news, blog.google/…/deepmind, cloud.google.com/blog). Closes the one
  verified source gap: the Anthropic breach had zero hits across all KBs.
- [ ] **Step 8 — image fetching.** `downloadImage` (`fetch-og.js:141`) writes
  response bytes with no content-type or magic-byte check, so an SVG or PNG lands
  at a `.jpg` path. Also `findImageSources` takes only the *first* nearby URL, so
  the YouTube-thumbnail fallback often never fires.

## Next up — other

- [ ] **Dependabot recurrence.** No `.github/dependabot.yml` exists, so alerts
  accumulate with nothing driving them down. Decide whether you want automated PRs.
- [ ] **Remove the npm overrides** once `google-gax` and `@google/genai` raise
  their own protobufjs floor past 7.6.5. Carrying a pin forever is how they rot.
- [ ] **`generate-briefing.test.js` prints "All N tests passed" even when a test
  failed.** Exit code is correct so CI is safe, but the message lies.
  `signal-digest.test.js` was fixed; this one wasn't.

## Watch on the next live run (Sunday 2026-08-09)

Three changes are *prompt instructions*, provable only by a real run:

- [ ] Bookmarks show as **graded** in `npm run signal` (currently "ungraded" —
  the rubric only applies to a fresh extraction)
- [ ] A quiet playlist reports "ran, no new items" and the run **completes**
- [ ] Angle blocks come out in the 4-move shape with ≤1 question

If any of those look wrong, the change is one `git revert` away and
`npm run redraft` rebuilds the edition from a corrected lineup in ~60s.

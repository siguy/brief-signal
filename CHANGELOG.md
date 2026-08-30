# Changelog

## Unreleased

### Added
- **Worktree bootstrap — `npm run bootstrap`** (`scripts/bootstrap-worktree.sh`) — makes a git worktree able to actually run the pipeline. `git worktree add` copies only *tracked* files, so everything gitignored stays behind in the main checkout and a fresh worktree looks complete right up until it fails: no `.env` (`ERROR: GOOGLE_API_KEY not set`), no `content/gcp-playbook.md` (Stage 4b drafts "Our Play" with no ground truth), no `node_modules` (`Cannot find module '@google/genai'`). Symlinks the gitignored paths back to the main checkout — one `.env` and one playbook to keep current, not one per worktree — and installs dependencies. Never overwrites an existing file, so a real worktree-local `.env` survives and re-running is a no-op. Paths are resolved with `pwd -P` throughout: git reports physical paths (`/private/var/...`) while a bare `pwd` reports the logical one (`/var/...`), and on macOS `/tmp` and `/var` are symlinks — mixing the two made the main-checkout check compare unequal strings for the same directory, so the script would have treated the main checkout as a worktree and linked `.env` on top of itself. Caught by the test, not by review.
- **Branching guide** (`docs/branching.md`) — one rule for where work happens: content runs (briefing, audio) in the main checkout, code changes in worktrees. Documents the branch-lock failure (`fatal: 'briefing/…' is already used by worktree at …` — a branch lives in exactly one worktree at a time) and why `git branch --merged` must never be used to judge staleness here: the default merge strategy is `--squash`, which rewrites commits, so a merged branch is never an ancestor of `main` and `--merged` reports it unmerged forever. Ask `gh pr list --state all` instead.
- **Tests for both** (`scripts/bootstrap-worktree.test.sh`, 13 assertions; 7 added to `scripts/generate-weekly.test.sh`) — the bootstrap test builds a throwaway repo, adds a *real* worktree and runs the *real* script, because the bug it guards against only exists in a genuine linked worktree; asserting on the script's text would not have caught the path-resolution bug it did catch. Both wired into `npm test`.
- **Analytics — GoatCounter** (`template.html`, `build.js`) — privacy-first, no-cookie-banner pageview tracking on the live site. Snippet injected via a `{{analytics}}` placeholder in `render()`, **production-only** (gated on `BASE_PATH`) so local dev never pollutes stats. Dashboard: https://briefsignal.goatcounter.com.
- **Engagement events** (`template.html`) — briefing pages fire GoatCounter events for scroll depth (25/50/75/100%) and first audio play; throttled and a silent no-op when the tracking script isn't loaded (i.e. local dev).
- **Analytics pull script** (`scripts/fetch-analytics.js`, `npm run analytics`) — reads GoatCounter via its API and writes a per-edition read-signal (reads, scroll drop-off funnel, audio-play rate) mapped to each edition's theme from `content/themes.md`, to `logs/analytics-signal.md`. Read-only and advisory; treats total reads ≈ first-week reads (nobody revisits old editions) and never blocks the pipeline.
- **Edition #22 briefing + audio** — "Open Weights Leapfrog the Frontier as Enterprises Fight to Own the Model" — 137 bookmarks, 2 videos, 82 podcast episodes (67 YouTube + 15 RSS)
- **Lead-Story Doctrine** (`scripts/briefing-prompt.md`) — explicit lead-selection rules: scan all 3 KBs for model releases first; a lead is a datable *event*, not a theme; gravity counted across distinct sources/shows; seller-relevance applied at selection time; serial-narrative continuity (advance recurring arcs, don't recycle). `lead = fresh event × (developing theme OR new thread) × seller play`.
- **Story-lineup pass (Stage 4a)** (`scripts/generate-briefing.js`) — plans 2-3 leads (event, gravity count, merges, cut-list) to `content/briefings/drafts/{date}-lineup.md` before drafting, then drafts from it; also feeds the last 4 editions' leads into context (`getRecentLeads`).
- **Coverage-aware critique** (`scripts/critique-briefing.js`) — feeds the critic a compact KB index and flags notable stories the briefing skipped ("is any bigger than what's included?").
- **Theme registry** (`content/themes.md`) — 8 recurring macro-narrative arcs with status + "where it stands," seeded from the 22-edition history; the briefing's long-term memory. No hard cap (emergent count via entry bar + retirement).
- **Theme registry wired into the generator** (`scripts/generate-briefing.js`) — Stage 4a's lineup pass now reads `content/themes.md`, tags each Big Picture candidate to the arc it advances (`advances:` field, or flags a new thread), and proposes an update (per-theme "moved to," any new-theme births or dormant retirements) written to `content/briefings/drafts/{date}-themes-proposed.md`. Registry informs lead selection, never gates it; canonical `content/themes.md` is never auto-overwritten — Simon reviews and promotes it manually. The proposed-update summary also surfaces in the weekly PR body (`generate-weekly.sh`). Validated with a live dry run against a real Gemini call in an isolated copy of the repo.
- **Editorial gate — `npm run redraft`** (`scripts/generate-briefing.js --from-lineup <file>`) — runs Stage 4b alone against a lineup already on disk, so a bad story selection is fixed by editing bullets in `drafts/{date}-lineup.md` and regenerating prose in ~60s, instead of rewriting ~2,000 words by hand. Stage 4b already labelled its input "Approved Story Lineup" but nothing ever approved it — `lineup` was an in-memory variable passed 4a→4b inside one function call, so the editorial decision was made *and executed* unattended. The Sunday end-to-end path is unchanged; the gate is opt-in. Target date is derived from the lineup filename (never today's date), so a redraft can only land on the edition its own lineup names; the replaced draft is preserved to `drafts/{date}-pre-redraft-N.md`. Verified with a live Gemini round trip.
- **Signal digest — `npm run signal`** (`scripts/signal-digest.js`) — deterministic view of what the KBs actually contained, no LLM and no dependencies. **Tier 0** flags Google/competitor coverage in three lanes: first-party announcements (by account handle or domain — never suppressed, provenance beats interest), Google-specific product mentions, and competitor product names; each marked when the draft doesn't cite its permalink. Advisory only — it never blocks a run, and it deliberately lives outside `lint-briefing.js` because `run_lint()` treats any non-2 exit as `error` and continues with *no lint at all*. Run standalone any time, or read it at the top of the weekly PR. On Edition #24 it surfaces 3 uncited first-party posts (@Google Gemini Robotics 2; two @AnthropicAI open-weights items).

### Changed
- **Pipeline is worktree-safe** (`scripts/generate-weekly.sh`) — `BRIEF_SIGNAL_DIR` now derives from `REPO_ROOT` (computed from `$0` at the top of the file, and previously ignored) instead of a hardcoded `$HOME/brief-signal`. Run from a worktree, the old path sent every stage to the main checkout, so the worktree was silently bypassed and the run edited the wrong tree. Stage 4 also stopped needing `main` checked out locally: `git checkout main && git pull && git checkout -b "$BRANCH"` is now `git fetch origin main && git checkout -b "$BRANCH" origin/main`, which is equivalent but works anywhere — the old form failed outright inside a worktree because the main checkout already held `main`. The three cleanup/return paths go through a new `checkout_base()` that falls back to `git checkout --detach origin/main`; a bare `git checkout main` there would abort mid-cleanup under `set -e`, stranding the checkout on the briefing branch with no PR opened. **Scheduled behaviour is unchanged** — launchd invokes `~/brief-signal/scripts/generate-weekly.sh`, so `REPO_ROOT` resolves exactly as before. `INFO_AGG_DIR` stays absolute; it is a genuinely different repo.
- **Thinking level pinned to `HIGH` on all Gemini 3.7 calls** (all 9 call sites) — `thinkingConfig: { thinkingLevel: "HIGH" }` in JS; **nested** `"thinking_config": {"thinking_level": "HIGH"}` in `extract-rss-podcasts.py` (a flat `"thinking_level"` key raises a pydantic `ValidationError` and would have crashed the RSS extractor at runtime). Measured on a representative lineup-style prompt: thinking tokens 677 → 957 (+41%), output 156 → 181, no latency change. JSON mode still parses under `HIGH`. Observable quality gain in the critic: the live Edition #24 run found the same hard failure with fuller evidence *plus* a new soft finding the default-thinking run missed (podcast citations labelled "read" where they should say "listen"). **Cost watch:** the exposure is `extract-podcasts.js` L1, which runs on every episode (60-80/week), not the once-weekly briefing stages.
- **Gemini model upgraded to `gemini-3.7-flash`** (`scripts/generate-briefing.js` ×2, `critique-briefing.js`, `repair-briefing.js`, `generate-audio-script.js`, `extract-podcasts.js` ×2, `extract-rss-podcasts.py` ×2) — every text-generation call in the pipeline moves off `gemini-2.5-flash`. Verified before the swap: the ID is GA on the project key (version `3.7-flash-08-2026`, no `-preview` suffix), metadata is identical to the outgoing model (1M input / 65K output, same `supportedGenerationMethods`), and both call shapes the pipeline uses — plain + `systemInstruction`, and JSON mode via `responseMimeType` — return parseable output. Confirmed end-to-end with a live `critique-briefing.js` run against Edition #24 (valid JSON, correct report structure, real hard failure found). No code changes beyond the model string: nothing in the pipeline sets `thinkingConfig`, `maxOutputTokens`, or `temperature`. **Rollback** is a one-line revert of the string in these six files. Cost note: thinking cannot be disabled on 3.7 Flash and bills at the output rate, but burn is unchanged in practice (425 → 436 thinking tokens on an identical prompt) — the real delta is the rate card ($0.75/$3.75 per 1M introductory, doubling 1 Jan 2027). **Not changed:** `scripts/generate-audio.js` stays on `gemini-2.5-pro-tts` — a separate API (Cloud Text-to-Speech, via `@google-cloud/text-to-speech`) with no 3.7 equivalent. `gemini-3.1-flash-tts-preview` was evaluated and **rejected**: it synthesises 26% faster and Cloud TTS accepts it with the Fenrir voice, but it renders the same voice *name* as an audibly different reader — median F0 ~180Hz vs ~140Hz on 2.5, with ~0% of voiced frames below 100Hz against 5.7%, i.e. about four semitones higher and much thinner. Across all 16 male Gemini-TTS voices on 3.1, Fenrir is the highest-pitched, so it is the furthest available match to the show's existing sound (Algieba, Sadachbia and Umbriel land within 1Hz of it). A weekly show's voice is part of its identity; the constant now carries a comment saying so.
- **`LOOKBACK_DAYS` is now a single adjustable knob** (`scripts/generate-weekly.sh` exports it; `extract-podcasts.js` + `extract-rss-podcasts.py` read it). Default 7; set higher for a multi-week catch-up run after being away — e.g. `LOOKBACK_DAYS=21 ./scripts/generate-weekly.sh`. Widens the podcast window only (bookmarks/playlist already cover multi-week).
- **Briefing structure simplified** (`scripts/briefing-prompt.md`) — removed Builder's Corner and Founder Watch as standing sections (that material now lives in Quick Hits as one-liners); Quick Hits → 3-6 bullets, may cite podcasts; "Our Play" → one framing sentence + exactly 3 named GCP motions; word target corrected to ~1,700-1,800 (was 800-1000); critique quality-checklist rewritten (dropped false-positive rules, carved out the required "Where the GCP opportunity is" angle line).
- **Retired the "GEAP" acronym** (`scripts/briefing-prompt.md`, `scripts/audio-script-prompt.md`) — now "Gemini Enterprise Agent Platform (FKA Vertex AI)" on first mention, then "Agent Platform" (audio: "the Agent Platform"). Removed the audio prompt's "write GEAP as Jeep" instruction — root cause of the recurring TTS mispronunciation. Never "GEAP" or "Jeep." (Published editions #5–#22 keep "GEAP" as shipped history.)

### Fixed
- **Generator can no longer clobber a published edition** (`scripts/generate-briefing.js`, `scripts/generate-weekly.sh`) — files the briefing under the TARGET edition date (`BRIEFING_DATE`, set by `generate-weekly.sh` to `MONDAY_DATE`) instead of the run date, and refuses to overwrite an existing `content/briefings/{date}.md` unless `FORCE_OVERWRITE=1`. Prevents the failure where a stray v2 re-run wrote Edition #23 over the shipped #22 (PR #69).
- **Gemini repetition loop in briefing generation** (`scripts/generate-briefing.js`) — `truncateRepetition()` detects a duplicated frontmatter/`## TLDR` after the first `*Sources:*` line and truncates to the first complete copy (Edition #22 emitted the briefing 3×, 5,518 words). Covered by `scripts/generate-briefing.test.js` (`npm test`).
- **Lineup file corrupted by code-fence stripping** (`scripts/generate-briefing.js`) — the saved `{date}-lineup.md` file's own trailing ` ``` ` fence was silently eaten by `stripCodeFences`'s end-of-string-anchored regex whenever the theme-registry block was the last thing in the response. New `stripLineupFences()` preserves it. Found via a live dry run, not by hand-written tests; 16 tests now cover the theme-registry functions.

- **Edition counter advanced on a re-run** (`scripts/generate-briefing.js`) — `getLatestBriefing()` returned the very file being regenerated, so a second Stage 4 pass over the same date produced a lineup headed "Edition #25" for the briefing shipped as #24, and fed the model "don't repeat this story" about the edition it was rewriting. Redraft mode now excludes the target from its own context and reuses its edition number.
- **Re-runs destroyed the draft they replaced** (`scripts/generate-briefing.js`) — Stage 4a/4b wrote fixed paths, so re-running over a date silently overwrote the previous lineup and draft. That is how the evidence for the Edition #24 post-mortem was lost. Redraft preserves the version it replaces to `drafts/{date}-pre-redraft-N.md`.
- **`dotenv` was never declared** (`package.json`) — `scripts/fetch-analytics.js:26` requires it, but `npm ls` reported it *extraneous*: an orphan in `node_modules` from an ad-hoc install, depended on by nothing. `npm run analytics` worked by accident; any `npm ci`/`npm prune` would have broken it with a bare MODULE_NOT_FOUND on an unattended script. (Confirmed live — a later `npm install` did prune it.) Now pinned at `^17.4.2`.
- **`lint-briefing.test.js` had never run** (`package.json`) — 12 passing tests referenced in no npm script, no `generate-weekly.sh` stage, and no CI. Now wired into `npm test` alongside the new digest suite.

### Security
- **Closed 15 Dependabot alerts** (`package.json` `overrides`) — 12 protobufjs (1 critical, 5 high, 6 medium) + 3 brace-expansion (2 high, 1 medium). Both transitive, so nothing direct to bump; and bumping parents doesn't help — latest `google-gax@6.0.0` and `@google/genai@2.15.0` still pin `protobufjs ^7.5.4`. Fixed with in-major backported patches instead of a major jump: protobufjs `7.5.4 → 7.6.5`, brace-expansion `2.0.2 → 2.1.4`. Verified on all 4 protobufjs paths; no unrelated lockfile drift; TTS gRPC client still parses its `.proto` descriptors. DoS/parsing class, and these run only in local scripts + the CI build — never in the deployed site. Remove the overrides once upstream raises its own floor past 7.6.5.

### Documentation
- **Editorial process — "The Editorial Gate"** (`docs/editorial-process.md`, `docs/diagrams/editorial-gate.mmd` + `.svg`) — documents that `lineup.md` *is* the editorial decision and the draft is only its execution, with a Mermaid diagram (source of truth is the `.mmd`; the `.svg` is an export) rendered inline on GitHub.
- **Pipeline hardening plan** (`docs/plans/2026-08-03-pipeline-hardening-plan.md`) — post-mortem and remediation plan for Edition #24 after a multi-agent review, including the finding that the Stage 4a HIGH-disposition audit fabricates its own ratings.
- **FOR_SIMON.md** — added chapters on the generation "head chef" rewrite (Lead-Story Doctrine, lineup pass, coverage-aware critique), the theme registry, and the Edition #22 "war stories"; marked the RSS/whisper pipeline built.

### Previously (undocumented, now noted)
- **Edition #7 briefing + audio** — "AI's Infrastructure Paradox, Autonomous Defense, & Generative UI Takes Hold" — 42 podcast episodes, 10 bookmarks, playlist data
- **Podcast subtitle downloads broken by `--print` flag** — yt-dlp's `--print` silently disables all file writes including subtitle downloads. Split `downloadSubtitleAsync` into separate subtitle download and date fetch calls. 43/44 subtitles now download vs 1/45 before.
- **Stale GCP product names in briefing prompt** — Replaced "Duet AI for Developers" with Gemini Code Assist. Added deprecated product blocklist to `scripts/briefing-prompt.md`.

---

## Previous

### Added
- **Podcast intelligence extraction** — New third source type: 16 YouTube-hosted podcasts scanned weekly for founder/VC signal. Two-level extraction: L1 (quotes, consensus, debate, intent signals, GCP competitive intel) for all episodes, L2 deep dive with timestamped segments for HIGH-rated episodes (max 3/week). Config-driven via `config/podcasts.json`.
- **`/extract-podcasts` skill** — Claude Code skill at `~/.claude/skills/extract-podcasts/SKILL.md`
- **Podcast extraction prompts** — `scripts/podcast-extraction-prompt.md` (L1) and `scripts/podcast-deep-dive-prompt.md` (L2) tuned for GCP sales intelligence
- **Podcast source guidance in briefing prompt** — `scripts/briefing-prompt.md` now instructs Gemini to attribute podcast takes to speakers (not shows), weave signal into existing sections, and highlight cross-podcast consensus/debate patterns
- **Twikit bookmark fetcher** — `scripts/fetch-bookmarks.py` replaces browser-based bookmark scrolling (~30 sec vs 15-30 min). Uses X's GraphQL API via cookie auth. Includes monkey patch for twikit 2.3.3 KEY_BYTE indices bug.
- **Cookie refresh docs** — `docs/cookie-refresh.md` step-by-step guide for refreshing X cookies
- **FOR_SIMON.md** — Learning document explaining the podcast pipeline in plain English
- **Edition #3 briefing** — `content/briefings/2026-03-08.md` with 5 new images
- **Featured topics dedup system** — `featured_topics` YAML frontmatter in each briefing tracks what stories have been told; `scripts/get-featured-topics.js` (`npm run featured`) scans all editions and outputs the full list for repeat prevention
- **Repeat prevention in generation prompts** — `scripts/briefing-prompt.md` and `.claude/commands/generate-briefing.md` now require checking previously featured topics before drafting; same person + same narrative = skip even if different source URL

### Changed
- **Weekly pipeline runs 3 sources in parallel** — `generate-weekly.sh` now runs bookmarks, playlist, and podcast extraction as independent parallel stages (Stages 1-3), with briefing generation in Stage 4
- **Briefing generator consumes 3 sources** — `generate-briefing.js` finds `podcasts-knowledge-base-*` alongside bookmarks and playlists
- **Extract-bookmarks skill uses twikit as primary** — Browser-based scrolling preserved as fallback
- **Briefing frontmatter** — All editions now include `featured_topics` array (backfilled for #1 and #2)
- **Email triggers on audio, not briefing** — `deploy.yml` now sends subscriber email when a new `.mp3` is added (audio PR merge), not when a briefing `.md` is added; ensures audio is ready before email goes out
- **Weekly pipeline docs** — `generate-weekly.sh` header documents the two-PR flow: briefing PR first, then audio PR after review

### Fixed
- **Latent Space YouTube handle** — Corrected from `@LatentSpaceTV` to `@LatentSpacePod` (wrong channel)
- **Podcast clip filtering** — Episodes under 20 minutes are skipped (removes clips, shorts, promos)
- **VTT parser rewritten in pure JS** — No longer depends on Python for subtitle parsing

---

## 2026-03-01

### Added
- **Audio briefing (beta)** — Spoken-word audio version of each weekly edition, generated via Google Cloud Gemini Pro TTS (Fenrir voice)
- **Audio script generator** — `scripts/generate-audio-script.js` converts briefing markdown to conversational spoken-word script via Gemini 2.5 Flash
- **Audio TTS generator** — `scripts/generate-audio.js` sends script to Gemini Pro TTS with configurable voice and style prompt, outputs MP3
- **Audio script prompt** — `scripts/audio-script-prompt.md` defines the "colleague at the coffee machine" tone for script rewriting
- **Audio player UI** — Custom HTML5 audio player with play/pause, progress bar, time display, and download button; styled in Midnight Luxe (champagne accent on dark)
- **`npm run audio`** — Generate audio script from latest briefing
- **`npm run audio:pr`** — Generate audio script and open PR for review
- **`npm run audio:generate`** — Generate MP3 from reviewed audio script
- **`@google-cloud/text-to-speech` dependency** — Google Cloud TTS SDK for Gemini Pro TTS
- **Subscribe page** — `/subscribe` page with Buttondown email signup form
- **Feedback CTA section** — "Signal Check" card on every briefing page links to Google Form for reader feedback (rating, comment, name/email)
- **Auto-filled edition date** — `build.js` constructs Google Form URL with pre-filled date parameter so each briefing's feedback is tagged to its edition
- **`.feedback-cta` styles** — Dark ghost card with champagne accent glow + gold CTA button, matching Midnight Luxe aesthetic
- **Gemini briefing generator** — `scripts/generate-briefing.js` calls Gemini 2.5 Flash via `@google/genai` SDK to generate weekly briefings (replaces `claude -p` in Stage 3)
- **System prompt file** — `scripts/briefing-prompt.md` merges generate-briefing skill + voice-overlay into a single Gemini system instruction
- **`@google/genai` dependency** — Google Gen AI SDK for Node.js
- **Edition #2 briefing** — `content/briefings/2026-03-01.md` generated via Gemini, manually curated
- **Writing pattern in prompt** — "lead with the punch, link for depth" formula for tighter items
- **Optional theme headings** — Section headings can include a theme when items cluster (e.g., "## The Big Picture: The Agent Infrastructure Shift")

### Fixed
- **Hero typography** — `whitespace-nowrap` on subtitle pill (desktop only) and `text-balance` on byline prevent orphaned words
- **Mobile subtitle** — Subtitle pill wraps naturally on mobile, stays single-line on desktop (`md:whitespace-nowrap`)
- **Buttondown duplicate handling** — `send-email.js` exits cleanly on `email_duplicate` instead of failing the deploy

### Changed
- **Subscribe page copy** — "we distill our POV on what startup founders…" (was "a POV on what some startup founders…")
- **Email subject** — Shortened to `Brief Signal — Edition #N: [title]` (was `Brief Signal — [full title]`)
- **Email body** — HTML with Midnight Luxe styling (dark bg, champagne accent, gold CTA button); no longer duplicates title
- **Email trigger** — Only sends when a new briefing file is added to `content/briefings/`, not on every deploy
- **Audio intro/outro** — Script now opens with "Welcome to the Brief Signal" and closes with feedback CTA
- **Audio script v2** — Regenerated Edition #2 audio with intro/outro (~1,000 words, up from ~710)
- **generate-weekly.sh Stage 3** — Now runs `node scripts/generate-briefing.js` instead of `claude -p --dangerously-skip-permissions`
- **Knowledge base path** — Briefing generator reads from `~/skills/` (was `~/info-agg/skills/`)
- **Local dev asset paths** — `build.js` now computes relative paths (`../../style.css`) when `BASE_PATH` is not set, so `file://` URLs work without a server. GitHub Pages deployment (with `BASE_PATH`) still uses absolute paths.

---

## Previous (Unreleased)

### Changed
- **Full visual redesign** — "Midnight Luxe" dark editorial aesthetic (obsidian bg, champagne accent, ivory text)
- **Renamed project** — "AI Briefing" → "Brief Signal" across all templates and metadata
- **Tailwind CSS v4** — Replaced inline `<style>` block with Tailwind via `@tailwindcss/cli` (`input.css` → `static/style.css`)
- **Build pipeline** — `npm run build` now runs `build:css` (Tailwind compile) before `build.js`
- **Template rewrite** — New floating island navbar, GSAP scroll animations, film grain overlay, hero with `{{subtitle}}` tag
- **Typography** — Inter (sans), Playfair Display (serif), JetBrains Mono (mono) via Google Fonts
- **Hero section** — Title/subtitle now rendered in template header, removed duplicate `<h1>`/`<p class="subtitle">` from article body

### Added
- **"Our Play" section** — Custom `renderMarkdown()` wrapper auto-wraps `## Our Play` + siblings in styled inset card
- **Sources footer** — `build.js` extracts trailing `*Sources: ...*` from Markdown into `{{sources}}` template variable
- **`input.css`** — Tailwind theme config with brand tokens, base article typography, `.our-play-section` styles, `.bg-noise` utility
- **`static/style.css`** — Compiled Tailwind output
- **GSAP + ScrollTrigger** — Fade-in scroll animations, image parallax, navbar auto-hide on scroll
- **`/generate-briefing` updates** — "Our Play" research workflow, Google Cloud content sources, voice overlay separation

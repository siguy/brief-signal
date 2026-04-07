# Changelog

## Unreleased

### Added
- **Edition #7 briefing + audio** — "AI's Infrastructure Paradox, Autonomous Defense, & Generative UI Takes Hold" — 42 podcast episodes, 10 bookmarks, playlist data

### Fixed
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

# Changelog

## Unreleased

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

### Changed
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

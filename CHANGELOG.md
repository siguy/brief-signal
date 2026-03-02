# Changelog

## Unreleased

### Added
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

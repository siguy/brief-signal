# Changelog

## Unreleased

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

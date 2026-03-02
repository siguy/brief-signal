# Feedback Feature — Brainstorm

**Date:** 2026-03-01
**Status:** Ready for planning

---

## What We're Building

A feedback section on each weekly briefing page that invites readers to rate and comment on the content. Clicking the CTA opens a Google Form in a new tab. Google handles all submission storage — zero backend needed.

## Why This Approach

- **Google Forms embed link** — simplest integration, no backend, no API keys, no exposed webhooks
- **External link (not iframe)** — cleanest design integration; the CTA section matches Midnight Luxe perfectly, and Google handles its own form styling
- **After content, before footer** — natural reading flow; reader finishes the briefing, then sees the prompt

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Submission backend | Google Forms | Zero infra, free, handles storage |
| Visual integration | Styled CTA linking to external form | Cleanest design, simplest build |
| Placement | After content, before footer | Natural reading flow |
| Rating type | 3 emoji reactions (Meh / Solid / Fire) | Low friction, on-brand, fast |
| Comment scope | Checkbox: text, audio, or both | Lets reader specify what they're reacting to |
| Name + email | Required fields | Identifies the reader for follow-up |

## Google Form Fields

1. **Rating** (required) — Multiple choice: Meh / Solid / Fire
2. **What are you reacting to?** (required) — Checkboxes: Text / Audio / Both
3. **Comment** (optional) — Long text field
4. **Name** (required) — Short text
5. **Email** (required) — Short text with email validation

## Implementation Scope

### template.html changes
- Add a feedback CTA section between `{{content}}` and the footer
- Midnight Luxe styled card with heading, short copy, and a CTA button
- CTA button opens Google Form URL in new tab
- GSAP scroll-triggered entrance animation (consistent with rest of page)

### Google Form
- Create the form manually in Google Forms
- Style with a dark theme if available
- Copy the shareable link into the template

### build.js changes
- Construct Google Form URL with pre-filled edition date parameter
- Inject `{{feedbackUrl}}` template variable into each briefing page
- Base form URL stored as a constant in build.js
- Date appended via Google Forms `entry.XXXXX` URL parameter

### No changes needed to:
- `input.css` (use existing Tailwind utilities, maybe 1-2 new classes)
- Deployment pipeline
- Content markdown files

## Resolved Questions

- **Same form every week** — one Google Form URL, with the edition date auto-filled via URL parameter
- **Auto-fill date** — `build.js` constructs the URL using the briefing's frontmatter date, so each page links to the same form but pre-fills which edition the feedback is for

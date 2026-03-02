---
title: Add Feedback CTA Section Linking to Google Form
type: feat
date: 2026-03-01
brainstorm: docs/brainstorms/2026-03-01-feedback-feature-brainstorm.md
---

# Add Feedback CTA Section Linking to Google Form

## Overview

Add a styled "Signal Check" feedback section to each weekly briefing page. The section appears after the article content, before the footer. A CTA button links to an external Google Form with the edition date pre-filled via URL parameter.

The Google Form collects: emoji rating (Meh/Solid/Fire), content type checkbox (text/audio/both), optional comment, name, and email.

## Implementation Steps

### Step 0: Create the Google Form (manual, outside code)

- [ ] Create a Google Form with these fields:
  1. **Edition Date** — short text (will be pre-filled, can be hidden or read-only)
  2. **Rating** — multiple choice: Meh / Solid / Fire
  3. **What are you reacting to?** — checkboxes: Text / Audio / Both
  4. **Comment** — long text (optional)
  5. **Name** — short text (required)
  6. **Email** — short text with email validation (required)
- [ ] Get the pre-fill URL: Form menu → "Get pre-filled link" → enter dummy date → "Get link"
- [ ] Extract the `entry.XXXXXXXXX` parameter ID for the Edition Date field
- [ ] Note the form ID from the URL: `https://docs.google.com/forms/d/e/FORM_ID/viewform`

### Step 1: Add feedback CTA HTML to `template.html`

**File:** `template.html` (~line 88, after `{{content}}`'s closing `</div>`, before `</main>`)

- [x] Add `{{feedback_cta}}` placeholder inside `<main>`, after the `#articleContent` div

```html
      </div>

      <!-- Feedback CTA -->
      {{feedback_cta}}
    </main>
```

### Step 2: Add CSS styles to `input.css`

**File:** `input.css` (after `.our-play-section` block, ~line 131)

- [x] Add `.feedback-cta` card class — dark ghost card with accent glow (follows `audio-player` pattern: `rgba(250, 248, 245, 0.03)` background, `border-brand-border`, `rounded-[2rem]`)
- [x] Add `.feedback-cta-btn` button class — champagne gold fill (`bg-brand-accent`), dark text, `rounded-full`, `scale-105` hover (follows "Join Us" button pattern)

### Step 3: Build feedback URL and HTML in `build.js`

**File:** `build.js` (inside the briefing `for` loop, before the `render()` call at ~line 176)

- [x] Add constants at top of file: `GOOGLE_FORM_BASE_URL` and `GOOGLE_FORM_ENTRY_ID` (the Edition Date entry parameter)
- [x] Construct `feedbackUrl` by appending `?entry.XXXXX=${encodeURIComponent(b.date)}` to the base URL
- [x] Build `feedbackCta` HTML string with the card markup (heading, subtext, CTA button)
- [x] Pass `feedback_cta: feedbackCta` to the `render()` call

Follows the exact pattern of `audio_player` injection — HTML string passed as template variable.

### Step 4: Add GSAP scroll animation to `template.html`

**File:** `template.html` (~line 132, the `querySelectorAll` for scroll-triggered elements)

- [x] Add `#feedbackCta` to the selector string so it gets the same `opacity: 0 → 1, y: 20 → 0` scroll reveal

### Step 5: Build and verify

- [x] Run `npm run build` — confirm no errors
- [x] Open `dist/briefings/2026-02-24/index.html` in browser
- [x] Verify the feedback CTA section appears after content, before footer
- [x] Verify the CTA button links to Google Form with correct pre-filled date
- [ ] Verify scroll animation triggers correctly
- [x] Verify the section does NOT appear on the archive page

## Acceptance Criteria

- [ ] Feedback CTA section visible on every briefing page, between content and footer
- [ ] CTA button opens Google Form in new tab
- [ ] Google Form pre-fills the edition date automatically
- [ ] Section styled in Midnight Luxe aesthetic (dark card, champagne accent, rounded corners)
- [ ] GSAP scroll-triggered entrance animation matches other page elements
- [ ] Archive page unaffected (no feedback section)
- [ ] No changes to deployment pipeline or content markdown files

## Files Changed

| File | Change |
|------|--------|
| `template.html` | Add `{{feedback_cta}}` placeholder + extend GSAP selector |
| `input.css` | Add `.feedback-cta` and `.feedback-cta-btn` classes |
| `build.js` | Construct feedback URL/HTML, pass to `render()` |

## References

- Brainstorm: `docs/brainstorms/2026-03-01-feedback-feature-brainstorm.md`
- Pattern precedent: `audio_player` injection in `build.js:62-167`
- Card precedent: `.our-play-section` in `input.css:113-131`
- Button precedent: "Join Us" CTA in `template.html:54-59`
- Google Forms pre-fill docs: Form menu → "Get pre-filled link"

Generate a weekly AI market briefing from recent extractions in the info-agg knowledge library.

## Instructions

1. **Find recent content** — Read files from `/Users/simonbrief/info-agg/skills/` that were modified in the last 14 days. Focus on:
   - `bookmarks-knowledge-base-*.md` (weekly X bookmark extractions)
   - `playlist-knowledge-base-*.md` (YouTube playlist extractions)
   - Any other skill files modified recently

2. **Check last briefing** — Read the most recent file in `/Users/simonbrief/ai-briefing/content/briefings/` to avoid repeating content. If no briefings exist, this is Edition #1.

3. **Curate content** — Score each item by:
   - **Relevance to founders:** Would this come up in a startup conversation?
   - **Conversational value:** Can a sales rep use this as an opener or talking point?
   - **Market signal strength:** Does this indicate a trend or shift?

4. **Draft the briefing** — Write in TLDR-style casual tone. Save to `/Users/simonbrief/ai-briefing/content/briefings/YYYY-MM-DD.md` using today's date.

## Briefing Template

Use this exact frontmatter and structure:

```markdown
---
title: "{Catchy Headline}"
date: "YYYY-MM-DD"
subtitle: "Week of {date range} | Edition #{n} | ~5 min read"
edition: {n}
---

## TLDR

Three sentences max. The one thing to know this week.

## The Big Picture

Market moves that matter for founder conversations. (2-3 items)

### {Item Title}

{2-3 sentence summary of what happened and why it matters.}

**Your angle with founders:** {One-liner the rep can use in conversation.}

### {Item Title}

{Summary.}

**Your angle with founders:** {One-liner.}

## Builder's Corner

What developers and founders are actually building with. (1-2 items)

### {Item Title}

{Summary of what's being built or how it's being used.}

**Why founders care:** {One-liner connecting to their world.}

## Founder Watch

Specific people or companies shipping things worth knowing about. (2-3 items)

### {Person/Company — What They Did}

{Summary.}

**Conversation starter:** "{A literal question to ask in a meeting}"

### {Person/Company — What They Did}

{Summary.}

**Conversation starter:** "{Question}"

## Quick Hits

- {One sentence each, 4-6 bullets}
- {Cover things that didn't fit above but are worth a mention}

## Try This Week

{One actionable thing to try or share with a founder. Be specific.}

---

*Sources: {n} bookmarks, {n} videos from the AI content library. [Archive](/archive)*
```

## Tone Guide

- **TLDR casual** — Write like a smart friend briefing you over coffee
- **No jargon walls** — If you use a technical term, immediately explain why it matters
- **Opinionated** — Take a stance on what matters and what's noise
- **Action-oriented** — Every section should make the reader want to do something
- **Concise** — Target 800-1000 words total. Every sentence earns its place.

## After Drafting

5. **Build the site** — Run `node build.js` in `/Users/simonbrief/ai-briefing/`
6. **Report back** with:
   - Briefing title and edition number
   - Word count
   - Sources used (which files were read)
   - Review checklist:
     - [ ] Headline is catchy and specific (not generic)
     - [ ] TLDR is ≤3 sentences
     - [ ] Every "Your angle" / "Conversation starter" is actually usable
     - [ ] Quick Hits are one sentence each
     - [ ] Try This Week is specific and actionable
     - [ ] Total length is ~800-1000 words
     - [ ] No repeated content from previous edition

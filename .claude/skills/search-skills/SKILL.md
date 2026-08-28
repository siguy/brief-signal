---
name: search-skills
description: Search your saved prompts, skills, and extracted knowledge. Use when looking for a specific prompt, technique, or information from your content library.
---

Search the user's personal knowledge library.

**What to Search**

1. `/Users/simonbrief/skills/` - Human-readable markdown files with prompts, guides, and extracted knowledge (canonical location for ALL skill files)
2. `/Users/simonbrief/info-agg/prompts/` - Raw JSON extractions from Twitter threads, etc.

**How to Search**

Use grep to search across the library:

```bash
# Search for a term
grep -rni --include="*.md" --include="*.json" "SEARCH_TERM" /Users/simonbrief/skills /Users/simonbrief/info-agg/prompts

# List all skill files
ls /Users/simonbrief/skills/*.md
```

**Response Format**

When the user searches, provide:
1. **Matching files** - Which files contain the term
2. **Relevant excerpts** - Show the actual content (prompts, tips, etc.)
3. **Context** - Explain what each match is useful for

**If no arguments provided**, list all available skills:
```bash
ls /Users/simonbrief/skills/*.md
```

**Example Usage**

User: `/search-skills product photography`

Response: Show matching prompts from nano-banana-pro-prompts.md with the actual prompt text they can copy.

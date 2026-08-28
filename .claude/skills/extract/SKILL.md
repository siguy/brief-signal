---
name: extract
description: Extract and summarize content from YouTube videos or Twitter/X threads. Saves structured knowledge to your personal library.
---

Extract knowledge from external content and save to `/Users/simonbrief/info-agg/`.

**Supported Sources**

1. **YouTube videos** - Get transcript, summarize key points
2. **Twitter/X threads** - Extract prompts, tips, information

**YouTube Extraction Process**

```bash
# 1. Get video metadata
yt-dlp --skip-download --print "%(title)s|||%(channel)s|||%(duration)s|||%(description).500s" "URL"

# 2. Download subtitles
yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o "/Users/simonbrief/info-agg/extractions/%(id)s" "URL"

# 3. Parse VTT to clean text (use Python)
# 4. Summarize and create markdown skill file
```

**Twitter/X Extraction Process**

1. Try Thread Reader App first: `https://threadreaderapp.com/thread/{TWEET_ID}.html`
2. Extract via WebFetch
3. If blocked, ask user to paste content

**Output Format**

Save to `skills/` as markdown:
```markdown
# Title

> **Source:** [Link](url)
> **Channel/Author:** Name
> **Duration:** X:XX (for videos)
> **Extracted:** YYYY-MM-DD

---

## Key Takeaways
- Point 1
- Point 2

## Detailed Summary
...

## Action Items
- [ ] Item 1
```

For prompts/structured data, also save JSON to `prompts/`.

**Image Handling**

If the source has example images:
1. Create folder: `skills/{skill-name}/`
2. Download images: `curl -L -o "path" "url"`
3. Reference in markdown: `![description](./skill-name/image.jpg)`

**After Extraction**

Tell the user:
- What was extracted
- Where it was saved
- How to access it (`/search-skills` or direct path)

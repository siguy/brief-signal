# Brief Signal — Feature Ideas

## From Team Feedback

### Audio Version
- Generate an audio version of each briefing
- Could use text-to-speech (Google Cloud TTS / NotebookLM Audio Overview)
- Embed player on briefing page or link to podcast feed
- Status: **Idea**

### Personalized Briefings by Account List
- Sales reps create a profile with their top accounts
- Briefing content is shaped/filtered by relevance to those accounts
- Requires: user profiles, account list input, personalized generation pass
- Status: **Idea**

### External Founder-Facing Version
- A separate edition curated for founders themselves (not internal sales context)
- Different tone, different "Our Play" framing, potentially public distribution
- Status: **Idea**

## From Own Experience

### Permalink URLs for Each Edition (FIXED)
- ~~The latest briefing lives at the root URL with no date in the path~~
- ~~Should have a static URL with the full date for SEO and bookmarking~~
- Fixed: root now redirects to `/briefings/YYYY-MM-DD/`

### Page Title Should Include Site Name (FIXED)
- ~~Browser tab just shows the weekly headline~~
- ~~Should be: "Brief Signal — [headline]"~~
- Fixed: title format is now `Brief Signal — [headline]`

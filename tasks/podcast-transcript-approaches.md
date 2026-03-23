# Podcast Transcript Approaches: Detailed Comparison

**Context:** Weekly pipeline processing ~3-5 audio-only podcasts (not on YouTube) to extract intelligence for a sales briefing. Target podcasts: Acquired, AI Daily Brief, 10/10 GTM, BG2 Pod, Rethinking with Adam Grant.

---

## 1. MLX-Whisper (Local Transcription)

**What it is:** Download MP3 from podcast RSS feed, transcribe locally on your Mac using OpenAI's Whisper model optimized for Apple Silicon via the MLX framework (Apple's native ML library).

### Speaker Diarization
- **Whisper alone: NO diarization.** It outputs a single stream of text with no idea who said what.
- **With pyannote add-on: YES**, but requires a separate pipeline. The tool [whisply](https://github.com/tsmdt/whisply) combines mlx-whisper + whisperX + pyannote to get word-level speaker labels. Pyannote is the gold standard open-source diarization model but labels speakers as "Speaker 0", "Speaker 1" -- it does NOT know their actual names. You would need a post-processing step to map speaker IDs to real names.
- **Pyannote requires a HuggingFace token** and accepting model terms. Setup is non-trivial.

### Quality
- **WER (Word Error Rate):** Whisper large-v3-turbo achieves roughly 5-10% WER on clean podcast audio. That is very good for automated transcription.
- **Technical jargon:** Whisper handles AI/cloud/VC terminology reasonably well since it was trained on a massive corpus of internet audio. Occasional misses on niche proper nouns (startup names, obscure acronyms).
- **Hallucination risk:** Whisper v3 has a known issue where it can hallucinate text during silence or low-audio segments. This is documented and can be mitigated with VAD (Voice Activity Detection) preprocessing.

### Speed
- **M2 MacBook:** ~10 minutes of audio transcribed in ~63 seconds
- **M3/M4 MacBook:** Estimated ~6-8 minutes to transcribe a 1-hour podcast episode
- **For your pipeline (3-5 episodes, ~1 hour each):** Roughly 20-40 minutes total processing time locally. Acceptable for a weekly batch.

### Cost
- **Free.** No API costs. Just your Mac's electricity and time.

### Reliability / Maintenance
- Active open-source project (mlx-whisper, whisply, pyannote)
- Moderate maintenance burden: Python dependencies, model updates, potential breaking changes
- You own the entire pipeline -- no vendor risk
- Initial setup complexity is HIGH (Python env, model downloads ~3GB, pyannote config)

### Coverage
- **All 5 podcasts** -- works with any audio you can download from an RSS feed

### Verdict
Best free option with maximum flexibility. The diarization gap is the main weakness -- requires pyannote integration and still only gives "Speaker 0/1/2" labels, not names.

---

## 2. Podscan.fm

**What it is:** A podcast intelligence platform with 51M+ episode transcripts. Offers REST API and an MCP server that plugs directly into Claude.

### Speaker Diarization
- **Partial.** Podscan transcripts include some speaker labels (format: `[00:00:12] Host: Welcome...`), but quality varies. Their transcripts are auto-generated and may label speakers generically ("Host", "Guest") rather than by name. For well-known podcasts like Acquired, speaker names may be included since host metadata is available.
- **Not as reliable as dedicated diarization tools** for precise "who said what" attribution.

### Quality
- Transcripts are machine-generated (likely Whisper-based internally). Quality is comparable to Whisper -- good but not human-edited.
- Technical jargon handling: Decent but expect occasional errors on niche terms.

### Speed
- **Near-instant.** Transcripts are pre-generated. You just query their API.
- New episodes typically appear within hours of publication.

### Cost
- **Premium plan: $100/month** (2,000 API requests/day)
- **Professional plan: $200/month** (5,000 API requests/day)
- **10-day free trial** (no credit card)
- **Startup founder discount: 50% off first year**
- For your use case (3-5 episodes/week), the $100/month Premium plan is sufficient.

### Reliability / Maintenance
- **Very low maintenance.** API call, get transcript, done.
- Risk: vendor dependency. If Podscan raises prices, changes API, or shuts down, you need a fallback.
- MCP server means you could query transcripts directly from Claude -- very slick for your workflow.

### Coverage
- **Acquired:** YES (confirmed on Podscan)
- **AI Daily Brief:** YES (confirmed on Podscan)
- **BG2 Pod:** YES (confirmed on Podscan)
- **10/10 GTM:** Likely YES (Podscan indexes 4.3M+ podcasts), but not explicitly confirmed
- **Rethinking with Adam Grant:** Likely YES (major podcast, would be indexed)

### Verdict
Easiest option by far. The $100/month cost is the tradeoff for zero maintenance. Speaker labeling is present but may not be precise enough for reliable quote attribution. Best as a "get transcripts fast" layer, potentially supplemented by another approach for speaker precision.

---

## 3. Apple Podcasts Transcripts

**What it is:** Apple auto-generates transcripts for all podcasts on Apple Podcasts. A tool by Alex Beals (dado3212) can download these TTML files programmatically.

### Speaker Diarization
- **Auto-generated transcripts: NO speaker names.** Apple's auto-transcripts do not identify who is speaking.
- **Podcast-supplied transcripts: YES**, if the podcast creator uploads a VTT/SRT file with speaker labels. Most podcasts do NOT do this.
- For your 5 target podcasts, speaker labels are almost certainly absent in the Apple-generated versions.

### Quality
- **75-85% accuracy** -- notably worse than Whisper or Deepgram.
- Apple filters out filler words ("uh", "um") and coughs, which is nice for readability but means the transcript is not verbatim.
- Technical jargon: Weaker than Whisper on specialized terms. Apple's model is optimized for general consumer use.
- 125M+ episodes transcribed as of late 2025, covering 13 languages.

### Speed
- **Pre-generated.** Transcripts appear shortly after episode publication.

### Cost
- **Free** (if you can get the transcripts out).

### Reliability / Maintenance
- **HIGH RISK.** The dado3212 tool uses Apple's private frameworks (AppleMediaServices). It:
  - Only works on macOS 15.5+ (confirmed broken on macOS 14.4.1)
  - Relies on undocumented private APIs that Apple can break at any OS update
  - Has only 9 commits total -- small hobby project, not actively maintained
  - Requires compiling Objective-C code with private framework access
- Apple could also change their transcript storage or API at any time.
- This is the most fragile option.

### Coverage
- **All 5 podcasts** should have Apple-generated transcripts (they are all on Apple Podcasts)
- But coverage means nothing if the download tool breaks.

### Verdict
Free but fragile, lowest quality, and no speaker labels. Not recommended as a primary approach. Could be a fallback "better than nothing" option.

---

## 4. Deepgram API

**What it is:** Cloud-based speech-to-text API. Their Nova-3 model is purpose-built for production use with speaker diarization as a core feature.

### Speaker Diarization
- **YES -- best-in-class.** Deepgram's diarization was trained on 100,000+ voices and shows 53.1% improvement over their previous version.
- Labels speakers as "Speaker 0", "Speaker 1", etc. (not by name -- same as pyannote). But the accuracy of WHO gets which label is significantly better than open-source alternatives.
- **10x faster diarization** than the next fastest vendor per their benchmarks.
- Robust across accents, noise levels, and domains.

### Quality
- **Nova-3 WER: ~5-7%** in production (54.3% reduction vs competitors on streaming).
- Handles domain-specific vocabulary well. You can provide custom vocabulary/keywords to boost recognition of terms like "LLM", "Series B", specific company names.
- Less hallucination risk than Whisper since it is a production-hardened system.

### Speed
- **Under 300ms latency** for real-time streaming.
- **Batch processing:** A 1-hour podcast transcribes in roughly 1-3 minutes (cloud-based, much faster than local).
- For your pipeline: All 3-5 episodes could be done in under 10 minutes.

### Cost
- **$200 free credit** to start (~430 minutes of Nova-3 batch transcription, or about 7 hours).
- After credit: **$0.0077/minute** pay-as-you-go ($0.46/hour).
- **Diarization add-on:** ~$0.001-0.002/minute extra.
- **Your pipeline cost:** 3-5 hours of audio/week = roughly $1.50-2.50/week = **~$6-10/month**.
- Growth plan: $4,000/year ($333/month) -- overkill for your volume.

### Reliability / Maintenance
- **Very low maintenance.** Upload audio file, get JSON back.
- Enterprise-grade API with SLA guarantees.
- Vendor risk: Deepgram is well-funded and established, but you are dependent on their service.
- Simple Python SDK. The API call is ~10 lines of code.

### Coverage
- **All 5 podcasts** -- works with any audio file you provide.

### Verdict
Best balance of quality, diarization accuracy, speed, and cost. At ~$6-10/month for your volume, it is cheaper than Podscan and produces better diarization. The $200 free credit covers months of your usage. Main downside: you still need to download the MP3s yourself (from RSS feeds), and speaker labels are "Speaker 0/1" not names.

---

## 5. Website Scraping (Acquired Only)

**What it is:** Acquired.fm publishes full transcripts on their episode pages.

### Speaker Diarization
- **YES -- with real names.** Transcripts use the format `Ben:`, `David:`, `Guest Name:` throughout. This is the only approach that gives you actual speaker names without post-processing.

### Quality
- These appear to be machine-generated transcripts (disclaimer on the page: "may contain unintentionally confusing, inaccurate and/or amusing transcription errors").
- Quality is comparable to Whisper-level -- good but not human-edited.
- Includes full episode content including ad reads and guest segments.
- Technical terms are generally correct since these are likely reviewed/corrected by the Acquired team.

### Speed
- Available when the episode page is published. Scraping takes seconds.

### Cost
- **Free.**

### Reliability / Maintenance
- **Medium risk.** Acquired could:
  - Change their page structure (breaking your scraper)
  - Move transcripts behind a paywall
  - Stop publishing transcripts
- Scraping is straightforward -- the transcript is in the episode page HTML with clear speaker labels. A simple `cheerio` or `BeautifulSoup` scraper would work.
- But it ONLY covers Acquired. You need another solution for the other 4 podcasts.

### Coverage
- **Acquired: YES**
- **All others: NO**

### Verdict
No-brainer for Acquired specifically. Free, named speaker labels, good quality. But it is a single-podcast solution.

---

## Head-to-Head Comparison Matrix

| Criteria | MLX-Whisper | Podscan | Apple Transcripts | Deepgram | Acquired Scrape |
|----------|-------------|---------|-------------------|----------|-----------------|
| **Speaker Diarization** | With pyannote add-on (Speaker 0/1) | Partial (generic labels) | No | Yes, best-in-class (Speaker 0/1) | Yes, with real names |
| **Cost/month** | Free | $100 (or $50 w/ discount) | Free | ~$6-10 | Free |
| **WER / Quality** | ~5-10% | ~5-10% | ~15-25% | ~5-7% | ~5-10% (with corrections) |
| **Speed per episode** | 6-8 min | Instant (pre-built) | Instant (pre-built) | 1-3 min | Seconds |
| **Setup Complexity** | HIGH | LOW | MEDIUM | LOW | LOW |
| **Maintenance** | Medium (Python deps) | Very low | High (fragile tool) | Very low | Low-medium |
| **Vendor Risk** | None (local) | Medium | High (private API) | Low | Medium |
| **Coverage (of your 5)** | All 5 | 4-5 confirmed | All 5 | All 5 | 1 only |

---

## Recommended Approach: Hybrid Stack

Given that speaker attribution on quotes is critical for your extraction prompt, here is the recommended combination:

### Primary: Deepgram API
- Use for all 5 podcasts
- Best diarization accuracy at ~$6-10/month
- $200 free credit covers ~4-7 months of your usage
- Simple pipeline: download MP3 from RSS -> send to Deepgram API -> get JSON with speaker-labeled transcript
- Post-processing step: map "Speaker 0" / "Speaker 1" to actual names using the first few minutes of the episode (hosts introduce themselves) or hardcode known host voices per podcast

### Supplement: Acquired.fm Scraping
- For Acquired episodes specifically, scrape the website transcript instead of using Deepgram
- You get real speaker names (Ben/David/Guest) for free
- Saves Deepgram credits and gives better attribution

### Fallback: MLX-Whisper + pyannote
- Keep this as a local fallback if Deepgram is down or you want to avoid vendor dependency
- Worth setting up once so you have a zero-cost backup
- Can also be useful for ad-hoc transcription of other audio sources

### Skip: Apple Transcripts and Podscan
- Apple transcripts: too fragile, lowest quality, no speaker labels
- Podscan: $100/month is 10x the cost of Deepgram for your volume, and the speaker labeling is not as precise. However, the MCP server integration is compelling -- reconsider if you want Claude to search across ALL podcast episodes (not just the 5 you transcribe), which is a different use case (research/discovery vs. weekly extraction)

### Pipeline Flow
```
Sunday night automation:
1. Fetch RSS feeds for 5 podcasts -> get latest episode MP3 URLs
2. For Acquired: scrape transcript from acquired.fm (with speaker names)
3. For others: download MP3 -> send to Deepgram with diarization=true
4. Post-process Deepgram output: map Speaker IDs to names
5. Feed all transcripts into Gemini extraction prompt
6. Generate briefing
```

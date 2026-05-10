---
title: "The Compute Supply Squeeze: EWS Is Born, GCP Pulls Ahead"
date: "2026-05-10"
subtitle: "Week of May 03 – May 10 | Edition #12 | ~5 min read"
edition: 12
featured_topics:
  - compute-supply-constraint-ews-anthropic
  - google-cloud-462b-backlog-fastest-growth
  - org-readiness-human-alignment-problem
  - tokenmaxxing-lean-team-productivity
  - gemini-embedding-2-multimodal-rag
  - dario-amodei-anthropic-compute-deal
  - amjad-masad-replit-singularity-moment
  - harshil-mathur-razorpay-moat-compression
  - boris-cherny-token-waste-patterns
  - codex-goal-persistent-agent-loop
---

## TLDR

- **EWS is born.** Elon is leasing Colossus capacity to Anthropic — a fourth hyperscaler just entered the chat.
- **Demand isn't the bottleneck — power is.** Anthropic's growth is supply-gated.
- **GCP grew 63% YoY** ($80B run rate) — fastest hyperscaler, ahead of Azure (39%) and AWS (28%).
- **Org readiness is the real AI blocker.** The labs themselves are spinning up consulting arms because models aren't the answer.
- **Tokenmaxxing is the lean-team thesis.** Headcount-to-output is collapsing for teams that combine fundamentals with aggressive tooling.

## The Big Picture

### The Supply-Constrained AI Economy

![compute-supply-squeeze](./images/compute-supply-squeeze.jpg)

Chamath on All-In: "Anthropic and OpenAI's revenue performance has nothing to do with demand. Zero. It is entirely to do with the supply constraints that exist in data centers and specifically in power" [All-In (83 min, 13:00)](https://www.youtube.com/watch?v=10MdOvK-aG4). To break the constraint, Anthropic leased Colossus capacity from Elon — "EWS" generates an estimated $4-5B incremental this year [Brad Gerstner on All-In (83 min, 17:35)](https://www.youtube.com/watch?v=10MdOvK-aG4). Anthropic ARR: $10B → $30B → $44B Jan to April, projected $100B EOY [David Sacks on All-In (83 min, 24:20)](https://www.youtube.com/watch?v=10MdOvK-aG4). Hyperscaler scoreboard: AWS $150B (28%), Azure $108B (39%), **GCP $80B (63%)** [Brad Gerstner on All-In (83 min, 1:19:40)](https://www.youtube.com/watch?v=10MdOvK-aG4).

**Your angle:**
1. **Pain:** "How many GPUs short are you for next quarter? When you forecast 2027, are you assuming you can actually *get* the inference capacity — or hoping?"
2. **Hedge:** "Dario is locking 5-year deals across Google, Broadcom, and Colossus. What's your 24-month compute hedge — single-vendor today, or actively diversifying?"
3. **Critical workloads:** "Have you priced provisioned throughput on Gemini? Looked at Anthropic on GEAP as the multi-model hedge?"

**Where the GCP opportunity is (caveat: GCP is supply-constrained too — frame as workload mix and committed-capacity contracts, not "more compute"):**
- **AWS-Bedrock-to-GEAP migrations** — same Anthropic models, less single-vendor exposure (workload redistribution, not net new capacity)
- **Provisioned throughput contracts on Gemini** — predictable cost and reserved capacity when supply is the pricing lever
- **Co-design conversations** for founders whose 2027 inference plans need committed capacity from *somewhere* — every hyperscaler is squeezed; this is about which provider gets the long-dated commitment, not who has spare GPUs

### Org Readiness Is the Real AI Blocker

![organizational-readiness-ai](./images/organizational-readiness-ai.jpg)

Eric Ries told Lenny that "human alignment" is the #1 unsolved problem in AI [Eric Ries on Lenny's (100 min, 1:13:35)](https://www.youtube.com/watch?v=PoJ1vTdHpks). Mike Cannon-Brookes (Atlassian): the hard parts are talent, business-process re-engineering, and security — not model selection [Mike Cannon-Brookes on AI Daily Brief (30 min)](https://podcasters.spotify.com/pod/show/nlw/episodes/How-to-Build-an-AI-Native-Team-with-Mike-Cannon-Brookes-e3j4cjo). The clearest tell: OpenAI and Anthropic each launched $1.5B+ joint ventures this week to do enterprise *consulting*, not just sell APIs [AI Daily Brief (27 min, 13:30)](https://podcasters.spotify.com/pod/show/nlw/episodes/Why-OpenAI-and-Anthropic-Are-Becoming-Consultants-e3iukhm). The labs themselves decided the bottleneck is on the customer side.

**Your angle:**
1. **Adoption test:** "What % of your engineers wrote zero AI-assisted code last month? Above 20% means your bottleneck is culture, not model."
2. **Ownership test:** "Is there a single named owner for AI rollout per team — or is it bottom-up with no executive throughline?"
3. **Deployment-support test:** "If OpenAI and Anthropic are spinning up consulting JVs because customers can't deploy, who's helping yours cross 'we picked a model' to 'we got production value'?"

**Where the GCP opportunity is:**
- **AI CEs, FSAs, and partners as the deployment muscle** — this is the answer to the labs' new $1.5B consulting JVs, and most founders don't know we'll show up this way
- **GEAP's governance layer** consolidates talent + security + process — the "model picking" conversation skips this entirely
- **30-day pilot framing** for stuck customers

## Builder's Corner

### Tokenmaxxing: The Lean-Team Production Story

![tokenmaxxing-lean-team](./images/tokenmaxxing-lean-team.jpg)

Y Combinator's Lightcone dedicated an episode to "tokenmaxxing" — top builders using AI to do the work of 10–400 traditional engineers [Lightcone — Tokenmaxxing (53 min)](https://www.youtube.com/watch?v=57lDpTwiW6g). Matt Pocock pairs it on Latent Space: engineering fundamentals matter *more* in the agent era because brittle code stops AI faster than it stops humans [Matt Pocock on Latent Space (23 min, 4:00)](https://www.youtube.com/watch?v=rlM_fAKxB3Q). The composite read: headcount-to-output collapses for teams with strong fundamentals plus aggressive tooling, and *widens* for teams bolting agents onto messy codebases.

**Your angle:**
1. "What's your engineer-to-revenue ratio versus 18 months ago? On track to be what 18 months from now?"
2. "Where are your tokenmaxxers concentrated — and are they pulling the team up, or working in isolation?"

**Where the GCP opportunity is:** Lean-team founders need self-serve infra with predictable costs — the standard startup-credits + usage-priced GEAP motion fits, you know this play.

### Gemini Embedding 2: Multimodal RAG Without the Plumbing

![gemini-embedding-2](./images/gemini-embedding-2.jpg)

Gemini Embedding 2 shipped this quarter as the first natively multimodal embedding model — text, images, video, audio, and document elements (diagrams, tables) in a unified vector space, no bespoke chunking pipelines. Most production RAG today is a fragile stack of file-type-specific extractors, OCR, transcripts, and stitching logic. Embedding 2 collapses much of that into one model. A demo walks through querying a multimodal product manual including diagrams [Embedding 2 demo (15 min)](https://www.youtube.com/watch?v=hem5D1uvy-w). Strategic point: there is no equivalent on AWS or Azure right now — this is a Google-only capability for any agent working across mixed media.

**Your angle:**
1. "What % of your RAG/training data is non-text — images, video, mixed PDFs? How are you handling those today?"
2. "If you could query across all of it in one search, no per-format pipelines, what use case unlocks first?"
3. "What does your current document-AI plumbing cost to maintain monthly? Most teams underestimate this 4x."

**Where the GCP opportunity is:** Cleanest GCP-only sell in the lineup — support agents reading tickets + screenshots, sales agents ingesting decks + recordings, ops agents reading PDFs + tables + voice notes. Lead with the use case, not the model.

## Founder Watch

### Dario Amodei (Anthropic) — Securing the Supply Side

Dario reports "massive need for more computing power" driven by 80x growth this year [Pivot (57 min)](https://www.youtube.com/watch?v=fZXwIDTZSxs). The response: long-dated, multi-provider deals — Google Cloud + Broadcom, Colossus from Elon, aggressive Nvidia procurement. The playbook: lock in compute now, across as many providers as possible, treat single-vendor concentration as a roadmap risk.

**Conversation starter (AWS-Bedrock customers especially):** "Dario is hedging compute across Google, Broadcom, and Colossus simultaneously. Your Anthropic spend is presumably on AWS Bedrock — what would it take to put a chunk of that on GEAP instead? Same models, lower single-vendor exposure."

**Followups:**
- "If your Anthropic spend doubled next year, would you rather negotiate against AWS Bedrock alone or have a real alternate path?"
- "Which workload are you LEAST willing to multi-cloud — and does that vendor have your back on supply?"

**Where the GCP opportunity is:** AWS-Bedrock-to-GEAP migrations are the cleanest play in this category. Lead with the supply-risk conversation.

### Amjad Masad (Replit) — The Lean-Team $250M Year

Replit went $2.5M to $250M ARR in a year with a tiny eng team. Amjad calls this the "singularity moment" — multi-million-dollar businesses with lean teams, no traditional VC [Amjad Masad on My First Million (78 min)](https://www.youtube.com/watch?v=ddSucXf0CuY). The one structural moat that doesn't compress: continuous capital for foundation-model training.

**Conversation starter:** "Replit hit $250M ARR with a tiny eng team. Two questions: which of your portfolio companies has crossed $20M ARR with under 25 engineers? And are you finding lean-team founders need a different sales motion — less hand-holding, faster contracts — than your headcount-heavy ones?"

### Harshil Mathur (Razorpay) — Moat Compression

Harshil on Lightcone: "AI is going to bring down time to build so rapidly that the only differentiation is going to be how fast can you move, how fast can you really decide what to build" [Harshil Mathur on Lightcone (32 min, 26:40)](https://www.youtube.com/watch?v=X5bABLCuIHA). Razorpay reinvented its platform with AI but kept *human* customer support: "customer support is not about solving the problem, it is a channel to establish trust" — a useful counter-narrative when everyone's rushing to automate it.

**Conversation starter:** "Harshil's read is that 'time to build' has collapsed — the only moat is 'how fast can you decide *what* to build?' Two test questions: where is the actual bottleneck in your customer's roadmap — design decisions, data access, model choice, or execution? And if they could collapse a 6-week cycle to 2 weeks, what's the *first* thing they'd stop building?"

**Where the GCP opportunity is:** "Build faster" isn't a Code Assist pitch — it's a question about which *decisions* are slow. If the answer is data access (siloed data → AI workflow), there's a BigQuery / pipeline conversation. If it's "we don't know what the customer wants", offer AI CEs or partners as a research accelerant.

## Quick Hits

- **[Boris Cherny: 9 patterns that waste 73% of your tokens (1 min read)](https://x.com/Mnilax/status/2050321700802408552)** — From the creator of Claude Code.
- **[OpenAI Codex shipped `/goal` — agents that run "endlessly until the goal is complete" (32 min watch)](https://podcasters.spotify.com/pod/show/nlw/episodes/The-Week-the-AI-Story-Shifted-e3j3nh7)** — Persistent-agent paradigm now in the default product.

## Try This Week

Pick **two current AWS customers** in your book and ask exactly one question — nothing else, no pitch attached: *"If your Anthropic spend doubled next year, would you rather negotiate that against AWS Bedrock alone, or have a real alternate path to the same models?"* Listen for the pause. At least one will have been quietly thinking about this since the Anthropic-Google deal broke. Use what they tell you to shape the second meeting.

## Our Play

### GEAP = Founder Optionality (Not a Forced Choice)

Anthropic's $200B, 5-gigawatt commitment to Google Cloud — over 40% of Google's new $462B cloud backlog [AI Daily Brief (32 min, 10:07)](https://podcasters.spotify.com/pod/show/nlw/episodes/Who-Cares-About-Consumer-AI-e3j0cq9) — is the week's most important positioning fact. The right founder frame: this isn't Google "picking" Anthropic over Gemini. It's both leading frontier model families committed and available on **Gemini Enterprise Agent Platform (FKA Vertex AI)**. Translation: optionality without leaving the platform. A/B Anthropic and Gemini, switch as model leadership shifts, run on the same compute, security, and governance layer either way. Pair with provisioned throughput contracts and Embedding 2's multimodal capability — both unique against the AWS/Azure stack.

*Connect to this week:* Dario hedging across three providers + Harshil naming decision-speed as the only moat = founder anxiety is concentration risk on both models and compute. GEAP is the structural answer to both.

---

*Sources: 24 podcast episodes from this week (May 4–10). Bookmarks KB last refreshed May 4 (no new bookmarks this week). Playlist KB included some older videos this run — pipeline filter being tightened. [Archive](/archive)*

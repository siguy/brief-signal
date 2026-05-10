---
title: "The Compute Supply Squeeze: EWS Is Born, GCP Pulls Ahead"
date: "2026-05-10"
subtitle: "Week of May 03 – May 10 | Edition #12 | ~6 min read"
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
- **Demand isn't the bottleneck — power is.** Anthropic's revenue is supply-gated. Compute, power, and chips are what's actually capping growth.
- **GCP grew 63% YoY** ($80B run rate) — fastest of all hyperscalers, ahead of Azure (39%) and AWS (28%).
- **Org readiness is the real AI blocker.** Eric Ries calls "human alignment" the #1 unsolved problem. The labs themselves are spinning up consulting arms because models alone aren't the answer.
- **Tokenmaxxing is the lean-team thesis.** YC and Replit are seeing engineers do the work of 10–400. The bottleneck is shifting from headcount to *what to build*.

## The Big Picture

### The Supply-Constrained AI Economy

![compute-supply-squeeze](./images/compute-supply-squeeze.jpg)

The All-In crew spent an hour mapping the most important shift in the AI economy this week: revenue isn't gated by demand anymore — it's gated by compute and power. Chamath: "Anthropic and OpenAI's revenue performance has nothing to do with demand. Zero. It is entirely to do with the supply constraints that exist in data centers and specifically in power" [Chamath on All-In (83 min, 13:00)](https://www.youtube.com/watch?v=10MdOvK-aG4). To break the constraint, Anthropic leased Colossus capacity from Elon — Brad Gerstner estimates "Elon Web Services" (EWS) will generate $4-5B incremental revenue this year [Brad Gerstner on All-In (83 min, 17:35)](https://www.youtube.com/watch?v=10MdOvK-aG4). Meanwhile Anthropic's ARR went $10B → $30B → $44B between January and April, with Sacks projecting $100B EOY [David Sacks on All-In (83 min, 24:20)](https://www.youtube.com/watch?v=10MdOvK-aG4). Hyperscaler scoreboard: AWS $150B (28% growth), Azure $108B (39%), **GCP $80B (63%)** — "stunning" per Gerstner [Brad Gerstner on All-In (83 min, 1:19:40)](https://www.youtube.com/watch?v=10MdOvK-aG4).

**Your angle with founders (ask in this order):**

1. **Where it hurts:** "How many GPUs short are you for next quarter? When you forecast 2027, are you assuming you can actually *get* the inference capacity you need — or just hoping?"
2. **How they're hedging:** "Dario is locking down 5-year deals across Google, Broadcom, and Elon's Colossus simultaneously. What does your own 24-month compute hedge look like — single-vendor today, or actively diversifying?"
3. **Where critical workloads land:** "When you think about what *has* to run reliably — top-tier inference, training jobs, latency-sensitive agents — are you OK with that being on one provider? Have you priced provisioned throughput for Gemini? Have you looked at Anthropic on GEAP as the multi-model hedge?"

**Where the GCP opportunity is:**
- **AWS-Bedrock-to-GEAP migrations** — same Anthropic models, lower switching cost than customers expect, real diversification
- **Provisioned throughput contracts on Gemini** — predictable cost when supply itself becomes the pricing lever
- **New compute commitments** — founders feeling the squeeze on AWS/Azure are open to first conversations they weren't open to 6 months ago
- The lead is *the founder's specific supply risk*, not the product. Get them naming the risk; the GCP answer follows naturally.

### Org Readiness Is the Real AI Blocker

![organizational-readiness-ai](./images/organizational-readiness-ai.jpg)

The week's other strong signal: every serious operator says the model isn't what's holding deployments back. Eric Ries told Lenny that "human alignment" is the #1 unsolved problem in AI [Eric Ries on Lenny's Podcast (100 min, 1:13:35)](https://www.youtube.com/watch?v=PoJ1vTdHpks). Mike Cannon-Brookes (Atlassian) put numbers on it: the hard parts are talent, business-process re-engineering, and security — not model selection [Mike Cannon-Brookes on AI Daily Brief (30 min)](https://podcasters.spotify.com/pod/show/nlw/episodes/How-to-Build-an-AI-Native-Team-with-Mike-Cannon-Brookes-e3j4cjo). The clearest tell that this is real: OpenAI and Anthropic both launched $1.5B+ joint ventures this week to do enterprise *consulting*, not just sell APIs [AI Daily Brief (27 min, 13:30)](https://podcasters.spotify.com/pod/show/nlw/episodes/Why-OpenAI-and-Anthropic-Are-Becoming-Consultants-e3iukhm). The labs themselves have decided the bottleneck is on the customer side.

**Your angle with founders (ask in this order):**

1. **The "who's actually using it" test:** "What percent of your engineers wrote zero AI-assisted code last month? If it's above 20%, your model rollout isn't your bottleneck — your culture is."
2. **The org-design question:** "Is there a single named owner for AI rollout in each engineering team? Or is it bottom-up adoption with no executive throughline?"
3. **The change-management question:** "OpenAI and Anthropic just spun up consulting arms because customers couldn't deploy on their own. What does that tell you about the gap between 'we picked a model' and 'we got production value'? Who's helping your customers cross it?"

**Where the GCP opportunity is:**
- **Google Cloud customer engineering as the deployment partner** — most founders don't realize this exists; it's underused leverage versus the labs' new $1.5B consulting JVs
- **GEAP's enterprise governance layer** addresses talent + security + process in one place — most "model picking" conversations miss this entirely
- **Startup credits + 30-day pilot framing** — stuck customers often need a structured push, not another model demo

## Builder's Corner

### Tokenmaxxing: The Lean-Team Production Story

![tokenmaxxing-lean-team](./images/tokenmaxxing-lean-team.jpg)

Y Combinator dedicated a Lightcone episode to "tokenmaxxing" — the practice of top builders using AI to do the work of 10–400 traditional engineers [Lightcone (YC) — Tokenmaxxing (53 min)](https://www.youtube.com/watch?v=57lDpTwiW6g). It pairs with Matt Pocock arguing on Latent Space that engineering fundamentals matter *more* in the agent era, not less — because brittle code stops AI agents the same way it stops humans, just faster [Matt Pocock on Latent Space (23 min, 4:00)](https://www.youtube.com/watch?v=rlM_fAKxB3Q). The composite picture: the headcount-to-output ratio is collapsing for teams that combine strong fundamentals with aggressive AI tooling, and *widening* for teams that just bolt agents onto messy codebases.

**Why founders care:** This shifts which engineering hires actually compound. The lean-team founders are running pricing/economics conversations differently from the headcount-heavy ones.

**Your angle:**
1. "What's your engineer-to-revenue ratio versus 18 months ago? And what's it on track to be 18 months from now?"
2. "Where are your tokenmaxxers concentrated — frontend, backend, infra, or product? Are they pulling everyone else up, or working in isolation?"

**Where the GCP opportunity is:** Lean-team founders need API-first, low-touch infrastructure with predictable costs. They're terrible customers for enterprise sales motions and great customers for self-serve GEAP + startup credits. Different motion, different prospecting list.

### Gemini Embedding 2: Multimodal RAG Without the Plumbing

![gemini-embedding-2](./images/gemini-embedding-2.jpg)

Gemini Embedding 2 shipped this quarter as the first natively multimodal embedding model — it indexes text, images, video, audio, and document elements (diagrams, tables) into a unified vector space without bespoke chunking pipelines. The implication for founders: most production RAG today is a fragile stack of file-type-specific extractors, OCR, transcript pipelines, and stitching logic — Embedding 2 collapses much of that into one model. A walkthrough demo shows it answering questions across a multimodal product manual with diagrams [Embedding 2 demo (15 min watch)](https://www.youtube.com/watch?v=hem5D1uvy-w). Strategically, this is the kind of capability OpenAI and Anthropic don't have a native equivalent for right now — it's a Google-only differentiator for any agent that has to work across mixed media (support agents reading tickets + screenshots, sales agents ingesting decks + recordings, ops agents reading PDFs + tables + voice notes).

**Why founders care:** If their roadmap includes "agent that reads X" where X is anything other than plain text, the engineering cost of building the X-specific pipeline often dwarfs the model cost. Embedding 2 changes that math.

**Your angle:**
1. "What % of your training/RAG data is non-text — images, video, audio, mixed PDFs? How are you handling embedding for those today?"
2. "If you could query across all of it in one search without per-format pipelines, what use case would unlock first?"
3. "Have you priced what your current document-AI plumbing actually costs to maintain monthly? Most teams underestimate this by 4x."

**Where the GCP opportunity is:** This is the rare clean GCP-only sell — there is no equivalent on AWS or Azure. Multimodal RAG isn't a "soon" use case; ticket-with-screenshot, deck-plus-recording, and document-plus-diagram queries are *current* customer demand. Lead with the use case, not the model.

## Founder Watch

### Dario Amodei (Anthropic) — Securing the Supply Side

Dario reports "massive need for more computing power" driven by 80x growth this year [Pivot (57 min)](https://www.youtube.com/watch?v=fZXwIDTZSxs). The response: long-dated, multi-provider compute deals — committed capacity with Google Cloud + Broadcom, the Colossus lease from Elon, and aggressive Nvidia GPU procurement. When founders watch what Dario is doing, this is the playbook: lock in long-dated compute now, across as many providers as possible, and treat single-vendor concentration as a roadmap risk.

**Conversation starter — especially for AWS-Bedrock customers:** "Dario is hedging compute across Google, Broadcom, and Colossus simultaneously. Your Anthropic spend is presumably on AWS Bedrock today — what would it take to put a chunk of that on GEAP instead? Same models, lower single-vendor exposure, and a non-trivial provisioned-throughput option on the Gemini side."

**Followup questions to test depth:**
- "If your Anthropic spend doubled next year, would you rather negotiate against AWS Bedrock alone or have a real alternate path?"
- "Which workload are you LEAST willing to multi-cloud, and does that workload's vendor actually have your back if compute gets tighter?"
- "Have you priced provisioned throughput for Gemini for your peak inference hours? It's a hedge most founders haven't explicitly evaluated."

**Where the GCP opportunity is:** AWS-Bedrock → GEAP migration deals are the cleanest play in this category right now. Same Anthropic models, lower switching friction than customers assume, real diversification story. Lead with the supply-risk conversation, not the product.

### Amjad Masad (Replit) — The Lean-Team $250M Year

Replit went from $2.5M to $250M ARR in a single year, with Amjad calling this a "singularity moment" — multi-million-dollar businesses with lean teams and no traditional VC [Amjad Masad on My First Million (78 min)](https://www.youtube.com/watch?v=ddSucXf0CuY). The structural read he names: continuous capital for foundation-model training is the one moat that doesn't compress.

**Conversation starter (anchored to portfolio reality, not generic):**

"Replit hit $250M ARR with a tiny eng team. Two questions:
1. Which of your portfolio companies has crossed $20M ARR with under 25 engineers? Who's the cleanest example?
2. Are you finding that lean-team founders need a *different* cloud sales motion — less hand-holding, more API-first self-serve, faster contracts — than the headcount-heavy ones?"

**Where the GCP opportunity is:** Startup credits + usage-priced GEAP + self-serve onboarding fit the lean-team profile far better than enterprise sales motion. These founders don't want a 6-month eval cycle — they want to deploy on day 2. Every successful $20M-with-25-engineers founder is at the next 5 founder dinners; the referral compounding is real.

### Harshil Mathur (Razorpay) — Moat Compression

Harshil's clearest line on Lightcone: "AI is going to bring down time to build so rapidly that the only differentiation is going to be how fast can you move, how fast can you really decide what to build" [Harshil Mathur on Lightcone (32 min, 26:40)](https://www.youtube.com/watch?v=X5bABLCuIHA). Razorpay reinvented its platform with AI but kept human customer support intentionally — "customer support is not about solving the problem, it is a channel to establish trust" — a useful counter-narrative when every founder is rushing to automate it.

**Conversation starter (sharper, two-part):**

"Harshil's read is that 'time to build' has collapsed — the only moat is now 'how fast can you decide *what* to build?' Two test questions:
1. Where is the actual bottleneck in your customer's roadmap right now — design decisions, data access, model selection, or execution? Which of those four?
2. If they could collapse a 6-week build cycle to 2 weeks, what's the FIRST thing they'd stop building?"

**Where the GCP opportunity is:** "Build faster" isn't a Gemini Code Assist pitch — it's a question about which *decisions* the customer is slow on. If it's data access (siloed data → AI workflow), there's an unsexy BigQuery / pipeline conversation. If it's "we don't know what the customer wants", the answer isn't cloud at all — it's offering Google's customer engineering or design partners as a research accelerant. Different bottleneck, different GCP motion.

## Quick Hits

- **[Boris Cherny listed 9 patterns that waste 73% of your tokens (1 min read)](https://x.com/Mnilax/status/2050321700802408552)** — From the creator of Claude Code; tactical playbook for any founder bleeding tokens.
- **[OpenAI Codex shipped `/goal` — agents that run "endlessly until the goal is complete" (32 min watch)](https://podcasters.spotify.com/pod/show/nlw/episodes/The-Week-the-AI-Story-Shifted-e3j3nh7)** — The persistent-agent paradigm is now in the default product.

## Try This Week

Pick **two current AWS customers** in your book and ask them exactly one question — nothing else, no pitch attached: *"If your Anthropic spend doubled next year, would you rather negotiate that against AWS Bedrock alone, or have a real alternate path to the same models?"* That's it. Listen for the pause. You'll find at least one of them has been quietly thinking about this since the Anthropic-Google deal broke last week. Use what they tell you to shape the second conversation.

## Our Play

### GEAP = Founder Optionality (Not a Forced Choice)

Anthropic's $200B, 5-gigawatt commitment to Google Cloud — over 40% of Google's new $462B cloud backlog [AI Daily Brief (32 min, 10:07)](https://podcasters.spotify.com/pod/show/nlw/episodes/Who-Cares-About-Consumer-AI-e3j0cq9) — is the most important positioning fact of the week. The right founder frame: this isn't Google "picking" Anthropic over its own models. It's both leading frontier model families (Gemini + Claude) committed and available on **Gemini Enterprise Agent Platform (FKA Vertex AI)**. Translation: optionality without leaving the platform. Customers can A/B Anthropic and Gemini, switch as model leadership shifts, and run on the same compute, security, and governance layer either way. The full play stacks with provisioned throughput contracts (predictable cost when supply is the new pricing lever) and Embedding 2 (multimodal capability that has no AWS/Azure equivalent right now).

*Connect to this week:* When Dario is hedging compute across three providers and Harshil is calling decision-speed the only moat, the founder anxiety is concentration risk — both on models and on compute. GEAP is the structural answer to both.

---

*Sources: 24 podcast episodes from this week (May 4–10), with a note: the playlist KB this run included several older videos (pre-2026) that should have been filtered — being fixed in the pipeline. Bookmarks KB last refreshed May 4 (no new bookmarks added this week). [Archive](/archive)*

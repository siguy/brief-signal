---
title: "The Compute Supply Squeeze: EWS Is Born, GCP Pulls Ahead"
date: "2026-05-10"
subtitle: "Week of May 03 – May 10 | Edition #12 | ~5 min read"
edition: 12
featured_topics:
  - compute-supply-constraint-ews-anthropic
  - google-cloud-462b-backlog-fastest-growth
  - org-readiness-human-alignment-problem
  - tpu-ironwood-vertical-integration
  - antigravity-google-builder-stack
  - dario-amodei-anthropic-compute-deal
  - amjad-masad-replit-singularity-moment
  - harshil-mathur-razorpay-moat-compression
  - boris-cherny-token-waste-patterns
  - gemini-embedding-2-multimodal-rag
  - codex-goal-persistent-agent-loop
---

## TLDR

- **EWS is born.** Elon is leasing Colossus capacity to Anthropic — a fourth hyperscaler just entered the chat.
- **Demand isn't the bottleneck — power is.** Anthropic's revenue is supply-gated. Compute, power, and chips are what's actually capping growth.
- **GCP grew 63% YoY** ($80B run rate) — fastest of all hyperscalers, ahead of Azure (39%) and AWS (28%). Anthropic alone is 40%+ of Google's new $462B cloud backlog.
- **Org readiness is the real AI blocker.** Eric Ries calls "human alignment" the #1 unsolved problem. Mike Cannon-Brookes agrees — it's people and process, not models.
- **Replit's Amjad Masad** says we're in a "singularity moment" — multi-million-dollar businesses with lean teams and no traditional VC.

## The Big Picture

### The Supply-Constrained AI Economy

![compute-supply-squeeze](./images/compute-supply-squeeze.jpg)

The All-In crew spent an hour this week mapping the most important shift in the AI economy: revenue isn't gated by demand anymore — it's gated by compute and power. Chamath put it bluntly: "Anthropic and OpenAI's revenue performance has nothing to do with demand. Zero. It is entirely to do with the supply constraints that exist in data centers and specifically in power" [Chamath on All-In (83 min, 13:00)](https://www.youtube.com/watch?v=10MdOvK-aG4). To break that constraint, Anthropic leased Colossus capacity from Elon — Brad Gerstner estimates "Elon Web Services" (EWS) will generate $4-5B incremental revenue this year [Brad Gerstner on All-In (83 min, 17:35)](https://www.youtube.com/watch?v=10MdOvK-aG4). Anthropic itself went from $10B → $30B → $44B ARR between January and April, with David Sacks projecting $100B exiting the year [David Sacks on All-In (83 min, 24:20)](https://www.youtube.com/watch?v=10MdOvK-aG4). And the hyperscaler scoreboard tells the rest of the story: AWS $150B (28% growth), Azure $108B (39%), **GCP $80B (63%)** — Brad called the GCP number "stunning" [Brad Gerstner on All-In (83 min, 1:19:40)](https://www.youtube.com/watch?v=10MdOvK-aG4).

**Your angle with founders:** "What's your 18-month compute trajectory look like? Most of the founders I'm talking to are already feeling supply-side pressure — they just haven't named it yet. Where are you on TPU vs. GPU economics?"

### Org Readiness Is the Real AI Blocker

![organizational-readiness-ai](./images/organizational-readiness-ai.jpg)

The week's other strong signal: every serious operator says the model isn't what's holding deployments back. Eric Ries told Lenny that "human alignment" is the #1 unsolved problem in AI — getting an organization to actually act on shared values fast enough to keep up with what agents can do [Eric Ries on Lenny's Podcast (100 min, 1:13:35)](https://www.youtube.com/watch?v=PoJ1vTdHpks). Mike Cannon-Brookes (Atlassian) put numbers on it: the hard parts are talent, business-process re-engineering, and security — not model selection [Mike Cannon-Brookes on AI Daily Brief (30 min)](https://podcasters.spotify.com/pod/show/nlw/episodes/How-to-Build-an-AI-Native-Team-with-Mike-Cannon-Brookes-e3j4cjo). That's why OpenAI and Anthropic just launched $1.5B+ joint ventures explicitly to do enterprise *consulting*, not just sell APIs [AI Daily Brief (27 min, 13:30)](https://podcasters.spotify.com/pod/show/nlw/episodes/Why-OpenAI-and-Anthropic-Are-Becoming-Consultants-e3iukhm). The labs themselves have decided the bottleneck is on the customer side.

**Your angle with founders:** "It seems the hardest part of AI adoption isn't picking a model — it's getting an org to actually use one. Where are your customers stuck right now: talent, security, or process?"

## Builder's Corner

### TPU Ironwood: Google's Vertical Stack Just Got Sharper

![tpu-ironwood-vertical-stack](./images/tpu-ironwood-vertical-stack.jpg)

Jeff Dean (Google Chief Scientist) walked through the 7th-gen TPU "Ironwood" this week: 9,216 chips per pod, FP4 support, and the case that vertical integration of the full stack is now a durable advantage — not chips alone, but networking, software, and model co-design together [Jeff Dean on Laude Institute (25 min)](https://www.youtube.com/watch?v=9u21oWjI7Xk). Amin Vahdat (Google Cloud) made a complementary point on This Week in Startups: deep-research queries fan out into massive parallel workloads, and that's exactly what TPU+GPU co-deployment is built for [Amin Vahdat on This Week in Startups (28 min)](https://www.youtube.com/watch?v=k4sHsw55uEo). For founders living through the GPU acquisition pain Cliff Weitzman described — "I don't know of a company in history that's made as much profit as Nvidia today" [Cliff Weitzman on 20VC (118 min, 1:36:10)](https://www.youtube.com/watch?v=HLmo450GSPA) — that's the structural alternative being made public.

**Why founders care:** If their compute bill is the #1 unhedged risk on their roadmap, TPU economics + Google's full-stack story is the most concrete alternative anyone's articulated this quarter.

### Antigravity Is Finding Its Audience

![antigravity-builder-stack](./images/antigravity-builder-stack.jpg)

Google Antigravity — the agentic IDE — quietly went from "Google's answer to Claude Code" to a real builder choice this week. Eric Michaud's "Antigravity vs Claude Code" comparison [Eric Michaud (8 min)](https://www.youtube.com/watch?v=cofWZlLm9fs) argues the edge isn't raw coding, it's the ecosystem: native multi-agent orchestration and deployment shipped on day one. Ali H. Salem's 27-minute primer treats it as the default for non-developers shipping MVPs [Ali H. Salem (27 min)](https://www.youtube.com/watch?v=CM2CkNU9xR0). Around it, the Google builder stack got more interesting: Gemini Embedding 2 is the first natively multimodal embedding model — unified RAG over text, images, video, audio without bespoke pipelines [Nate Herk (15 min)](https://www.youtube.com/watch?v=hem5D1uvy-w). And Google Cloud Tech demoed Agent Skills for Gemini CLI, with Firebase already shipping first-party skills [Google Cloud Tech (1h 4min)](https://www.youtube.com/watch?v=y4LEGj0gG4E).

**Why founders care:** "What's your dev environment looking like in 6 months?" is suddenly a different question for Google-stack-native teams. The pieces (Antigravity + Stitch + Embedding 2 + Gemini CLI + ADK) are starting to compose into a coherent builder story.

## Founder Watch

### Dario Amodei (Anthropic) — Securing the Supply Side

Dario reports "massive need for more computing power" driven by 80x growth this year [Pivot (45 min)](https://www.youtube.com/watch?v=PoJ1vTdHpks). The response: a $200B, 5-gigawatt deal with Google Cloud + Broadcom [AI Daily Brief (32 min, 10:07)](https://podcasters.spotify.com/pod/show/nlw/episodes/Who-Cares-About-Consumer-AI-e3j0cq9), plus the Colossus capacity lease from Elon, plus 220K added Nvidia GPUs requiring 300+ megawatts [All-In (83 min)](https://www.youtube.com/watch?v=10MdOvK-aG4). When founders watch what Dario is doing, this is the playbook: lock in long-dated compute now, across as many providers as possible.

**Conversation starter:** "Dario is locking down 5-gigawatt compute deals years out. What's your own 24-month compute hedge look like? Are you single-vendor or starting to diversify?"

### Amjad Masad (Replit) — The Singularity Moment for Builders

Amjad told My First Million we're in a "singularity" where "making software is cheaper. You can create a multi-million dollar business and not have to raise venture, not have to grow the team a whole lot" [Amjad Masad on My First Million (78 min)](https://www.youtube.com/watch?v=ddSucXf0CuY). Replit went from $2.5M to $250M ARR in a single year. The bigger signal: he names continuous capital for foundation-model training as the one structural moat that doesn't compress — a clean read on which AI businesses will survive and which won't.

**Conversation starter:** "Are you seeing more founders skip the seed round entirely and bootstrap with AI? And which of your customers are using that lean-team model versus still hiring like 2022?"

### Harshil Mathur (Razorpay) — "AI Compresses Every Moat"

Harshil's clearest line on Lightcone: "AI is going to bring down time to build so rapidly that the only differentiation is going to be how fast can you move, how fast can you really decide what to build" [Harshil Mathur on Lightcone (32 min, 26:40)](https://www.youtube.com/watch?v=X5bABLCuIHA). Razorpay completely reinvented its platform with AI — but kept human customer support intentionally, because "customer support is not about solving the problem, it is a channel to establish trust" (a useful counter-narrative when every founder is rushing to automate it).

**Conversation starter:** "Harshil's read is that 'how fast you decide what to build' is now the only moat. What's the decision your customers are agonizing over right now — and what's blocking them from making it faster?"

## Quick Hits

- **[Anthropic added 220K Nvidia GPUs requiring 300+ megawatts of power (1 min read)](https://www.youtube.com/watch?v=10MdOvK-aG4)** — The physical scale of one lab's compute build-out, in plain numbers.
- **[Boris Cherny listed 9 patterns that waste 73% of your tokens (1 min read)](https://x.com/Mnilax/status/2050321700802408552)** — From the creator of Claude Code; tactical playbook for any founder bleeding tokens.
- **[Gemini Embedding 2 is the first natively multimodal embedding model (15 min watch)](https://www.youtube.com/watch?v=hem5D1uvy-w)** — Unified RAG over text + images + video + audio without bespoke chunking pipelines.
- **[OpenAI Codex shipped `/goal` — agents that run "endlessly until the goal is complete" (32 min watch)](https://podcasters.spotify.com/pod/show/nlw/episodes/The-Week-the-AI-Story-Shifted-e3j3nh7)** — The persistent-agent paradigm is now in the default product.

## Try This Week

In two founder meetings this week, ask: *"What's your 18-month compute trajectory? Are you supply-constrained today or expecting to be?"* Most founders are already feeling this — they just haven't put a name on it. Once they do, the conversation naturally goes to **GEAP (Gemini Enterprise Agent Platform, FKA Vertex AI)** — because it's the one place they can get both Gemini and Anthropic models without leaving the platform.

## Our Play

### GEAP = Founder Optionality (Not a Forced Choice)

Anthropic's $200B, 5-gigawatt commitment to Google Cloud — over 40% of Google's new $462B cloud backlog [AI Daily Brief (32 min, 10:07)](https://podcasters.spotify.com/pod/show/nlw/episodes/Who-Cares-About-Consumer-AI-e3j0cq9) — is the most important positioning fact of the week. The right frame for founder conversations: this isn't Google "picking" Anthropic over its own models. It's both leading frontier model families (Gemini + Claude) committed and available on **Gemini Enterprise Agent Platform (FKA Vertex AI)**. Translation for founders: optionality without leaving the platform. They can A/B Anthropic and Gemini, switch as model leadership shifts, and run on the same compute, security, and governance layer either way.

*Connect to this week:* When Dario is locking down 5-gig compute deals and Harshil is calling "what to build" the only moat, the founder anxiety is concentration risk — both on models and on compute. GEAP is the structural answer to both.

### TPU Ironwood Is Now the Public Technical Story

Jeff Dean just made the TPU case on a public stage: 9,216 chips per pod, FP4 support, full-stack co-design [Jeff Dean on Laude Institute (25 min)](https://www.youtube.com/watch?v=9u21oWjI7Xk). For founders watching their GPU bills compound, this is the most concrete alternative narrative anyone has put on the record this quarter. Pair it with Amin Vahdat's TWiST appearance on TPU+GPU co-deployment for parallel agent workloads [Amin Vahdat (28 min)](https://www.youtube.com/watch?v=k4sHsw55uEo), and you have a complete technical brief for the "can I get off the GPU treadmill?" conversation.

*Connect to this week:* The hyperscaler scoreboard (GCP +63%) and the public TPU pitch are the same story told two ways. Founders who internalize the compute-supply-squeeze theme will be receptive to "let me show you what the vertical stack actually does."

---

*Sources: 129 bookmarks (week of May 04), 68 new playlist videos, 24 podcast episodes from the AI content library. [Archive](/archive)*

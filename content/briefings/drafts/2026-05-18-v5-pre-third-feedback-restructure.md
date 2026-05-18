---
title: "The Great AI Software Reset, Compute's New Cold War & Autonomous Defense"
date: "2026-05-18"
subtitle: "Week of May 12 – May 18 | Edition #14 | ~5 min read"
edition: 14
featured_topics:
  - ai-compute-wall-policy-clash
  - frontier-labs-fde-consulting-arms-race
  - lecun-world-models-physical-ai
  - context-engineering-skills-tool-layer
  - geap-stateful-agent-runtime-memory-bank
  - abridge-distillation-pipeline
  - serval-itsm-cost-of-inaction
  - geap-launch-750m-partner-fund
  - anthropic-on-geap-1m-context
---

## TLDR

-   **Compute enters a new cold war.** Global semiconductor shortages and legislative efforts threaten AI's foundation.
-   **AI triggers a software reset.** Developer backlash against model "rug pulls" and the "SaaS apocalypse" demand new economic models.
-   **World Models challenge LLMs.** Yann LeCun's AMI Labs seeks an alternative path to real-world AI beyond language.
-   **Context Engineering is the new prompt engineering.** Anthropic's top engineers prioritize structured skills and tools over prompts.
-   **Stateful AI agents break cloud norms.** Traditional hyperscalers struggle to host persistent agent workloads, driving demand for specialized sandboxes.
-   **GCP plays this week:** 7-day stateful Agent Runtime + Memory Bank (the Daytona answer), 1-week Provisioned Throughput on Gemini (new — no yearly lock for compute hedges), Anthropic-on-GEAP with 1M context window inside VPC-SC, and the $750M partner fund for FDE-led deployments.

## The Big Picture: Compute's New Cold War

### AI's Compute Wall & Policy Clash

![ai-compute-policy-clash](./images/ai-compute-policy-clash.jpg)

Senator Bernie Sanders and Rep. Alexandria Ocasio-Cortez introduced a bill this week to pause *all* AI data center construction [Garry Tan (1 min read)](https://x.com/garrytan/status/2054904105018237125) — a legislative response to a public mood where 70% of Americans now oppose new local data center construction on environmental grounds [AI Daily Brief (32 min, 0:08:20)](https://podcasters.spotify.com/pod/show/nlw/episodes/RIP-Golden-Age-of-Agent-Experimentation-2026-2026). This stacks on top of a semiconductor shortage across chips, memory, and manufacturing equipment now projected to last through 2030 — a global compute crunch that threatens to ration frontier AI access [AI Daily Brief (27 min, 0:28:13)](https://podcasters.spotify.com/pod/show/nlw/episodes/AI-Inequality-e3jg00q).

**Your angle with founders:**
1.  **Where it hurts:** "How many GPUs short are you for next quarter? When you forecast 2027, are you assuming you can actually *get* the inference capacity — or hoping?"
2.  **The hedge:** "What's your committed-capacity posture today — month-to-month, yearly, or none? If GPU supply tightens further in Q3, who in your vendor's customer base gets de-prioritized first: you, or their bigger customers?"
3.  **Burst vs base:** "Have you priced Provisioned Throughput on Gemini? The 1-week term option (new) lets you lock capacity through a launch without a yearly commit — that's specifically aimed at founders who can't justify a 12-month spend yet."

**Where the GCP opportunity is:**
- **Multi-year committed-capacity contracts** for founders whose 2027 inference plans need *contracted* allocation from somewhere (every hyperscaler is squeezed — this is about *which* provider locks in the commitment)
- **Sovereign and confidential-compute conversations** for founders newly anxious about geopolitical exposure on critical workloads
- **TPU/GPU workload-mix conversations** — not "GCP has more compute" but "Where in your stack would you genuinely prefer TPU economics if you could get them?"

### The Great AI Software Reset

![ai-software-reset](./images/ai-software-reset.jpg)

The software market is undergoing a "SaaS apocalypse" as AI forces re-rating — traditional enterprise companies like Salesforce are seeing significant stock drops [Mark Benioff on All-In (77 min, 0:30:30)](https://www.youtube.com/watch?v=jJRAvZNGUvI). The "token maxing era" is also ending — Anthropic's recent subsidy "rug pulls" sparked developer backlash and forced a shift from free experimentation to usage-based billing. Meanwhile, all three frontier players are racing to bridge the model-to-enterprise-deployment gap: **OpenAI is sending FDEs hands-on to CEOs** and just stood up a $10B+ consulting JV, **Anthropic** launched a $1.5B+ consulting arm plus vertical packs (Claude for Legal: DocuSign + Trellis + Thomson Reuters connectors), and **Google** countered with hundreds of FDEs plus PE partnerships (Blackstone, KKR, QT). Shiv Rao (Abridge): "If that wasn't a sign that there's incredible opportunity for vertical AI, I don't know what is" [Shiv Rao on 20VC (69 min, 0:32:20)](https://www.youtube.com/watch?v=byZkrYBF-N0).

**Your angle with founders:**
1.  **SaaS Re-rating:** "If public markets are re-rating traditional SaaS down because of AI, what's your strategy to embed AI into your product's *core* value proposition, not just as a side feature?"
2.  **Post-Subsidy Economics:** "Token subsidies are ending. Have you modeled your real long-term cost per active user? What's your strategy when raw model costs become the dominant line item?"
3.  **FDE Arbitrage:** "All three labs are now in the consulting business. Which of your customers are stuck on 'we picked a model but can't deploy it,' and who's filling that gap for them today?"

**Where the GCP opportunity is:** This week's three concrete plays — the $750M partner fund + FDE program, 1-week Provisioned Throughput, and Anthropic-on-GEAP with 1M context — are unpacked in detail in Our Play below. For now: each anxiety this section names (consulting gap, post-subsidy economics, vendor lock-in from rug pulls) has a specific GEAP answer you can lead with.

### New AI Paradigms Challenge LLM Dominance

![yann-lecun-world-models](./images/yann-lecun-world-models.jpg)

Yann LeCun left Meta to start AMI Labs, arguing LLMs are a dead-end for real-world intelligence — unsafe, unable to plan, and missing common sense. He's betting on **world models and the JEPA architecture** for objective-driven AI in robotics and manufacturing, criticizing the industry's "herd behavior" of "digging the same trench" on LLM scaling now that publicly available text data is exhausted [Yann LeCun on Unsupervised Learning (82 min, 0:06:50)](https://www.youtube.com/watch?v=ngBraLDqzdI).

**Your angle (narrow — for robotics, manufacturing, autonomous-systems, and physical-AI founders only):** "If your roadmap touches autonomous control, sensor fusion, or physical-world planning, where are you investing R&D when text-only models hit their ceiling? What's your multimodal-data pipeline look like?"

**Where the GCP opportunity is:**
- **This is narrow.** Most of your book is shipping LLM products today — for those founders this is *context to flag*, not a deal motion. Don't force the angle.
- **For the actual physical-AI / robotics segment** (Wayve, Figure, Skydio, Physical Intelligence, etc.): the Agentic Data Cloud (BigQuery + Spanner + Dataplex + Knowledge Catalog) plus Gemini Embedding 2's multimodal vector space is a real fit for "we have vision + sensor + telemetry and can't unify it." This is the corner of the book where the LeCun bet maps to a GCP-native pipeline.

## Builder's Corner

### Context Engineering: The New AI Dev Playbook

![claude-context-engineering](./images/claude-context-engineering.jpg)

Anthropic's own engineers are moving past prompt-craft into **Context Engineering**: package repetitive tasks into **Skills** — folders containing a description (Claude's trigger), an instruction playbook, and a *tool layer* (scripts, APIs, reference files). Skills auto-trigger when their description matches the user's request. The leverage isn't in the prompt; it's in the tool layer most people skip [Austin Marchese (10 min watch)](https://www.youtube.com/watch?v=qOvc9IUKEIc) and [Vishakha Singhal (2 min read)](https://x.com/vishisinghal_/status/2032368817981305196).

**3 concrete examples worth sharing with founders:**
1. **Decompose monolith skills into composable ones.** Don't build one giant `/content-creation`. Build `youtube-idea-research`, `youtube-script-writer`, `linkedin-post`. Each auto-triggers on description match. Errors are easier to locate; improvements compound.
2. **Save scripts inside skills as tools.** If Claude keeps rewriting the same Python script every session, save it as a tool inside the skill folder. Trade AI tokens (non-deterministic, expensive) for code execution (deterministic, cheap, repeatable).
3. **Use invocation flags for risk control.** `user_invocable: false` hides a skill from the slash menu (agent-only). `disable_model_invocation: true` blocks the model from triggering it but lets the user run it manually — useful for risky ops like deploys.

**Why founders care:** This is the dominant Claude Code workflow inside Anthropic's own product teams. Founders who structure their repos around Skills + tool layers ship faster *and* spend less per agent run. The ones treating Claude like a chatbot are leaving an order of magnitude on the table.

### The Agent Sandbox: Why Stateful AI Needs a New Cloud

![agent-sandboxes](./images/agent-sandboxes.jpg)

AI agents — especially those calling tools, running model-generated code, or interacting with the real world — need **stateful compute environments**. That means: isolated runtimes that hold context across requests, persistent memory across sessions, support for long-running operations (hours to days), and tolerance for models "learning on the job" without losing prior state. Traditional cloud was built for *stateless* request-response — scaling horizontally by treating every request as independent — which breaks the moment an agent needs to remember anything past one HTTP call. Ivan Burazin, CEO of Daytona, argues the gap is fundamental enough that AWS and Azure can't retrofit it [Ivan Burazin on The MAD Podcast (66 min, 0:06:54)](https://www.youtube.com/watch?v=kMXJrzAa5fM) and [Boris Cherny (1 min read)](https://x.com/bcherny/status/2053982327123132846).

**The GCP answer (concrete, mostly GA):**
- **Agent Runtime on GEAP** — managed runtime supporting agents that hold state for up to **7 days** with sub-second cold starts (GA)
- **Memory Bank + Agent Sessions** — persistent long-term memory across sessions plus per-session state; Memory Profiles for per-user personalization; Custom Session IDs that map to CRM/internal record IDs (GA)
- **GKE Agent Sandbox** — gVisor kernel-level isolation for untrusted LLM-generated code, warm-pool sub-second provisioning (**currently Preview, not GA** — fine for design-partner conversations, don't promise for production)
- **Cloud Run for AI agents** — agents as Cloud Run services for shorter async tasks

**Why founders care:** This is a rare case where the GCP-native story is concrete, named, and partly shipping. When Daytona pitches AWS/Azure can't host stateful agents, the response isn't "we agree" — it's "Memory Bank holds context for 7 days, Agent Runtime is GA, GKE Agent Sandbox handles untrusted code in Preview." Bedrock AgentCore is comparable in scope and shipped slightly earlier — frame as "we have it" with an honest Preview-vs-GA distinction, not "we're the only ones."

## Founder Watch

### Abridge — Model Distillation for Healthcare AI

Shiv Rao's Abridge ($5.3B healthcare AI) is moving away from frontier-model dependency. They distill open-source models and fine-tune in-house for specific product outputs, prioritizing real-time latency and cost in high-stakes clinical workflows. The playbook: start on a frontier model for a capability, then own a smaller fine-tuned model that's faster and cheaper at inference [Shiv Rao on 20VC (69 min, 0:25:29)](https://www.youtube.com/watch?v=byZkrYBF-N0).

**Conversation starter:** "Abridge starts on a frontier model and distills to fine-tuned open-source they own. What's your distillation pipeline look like today — and what would change if you could SFT, preference-tune, distill, and deploy to a managed endpoint *all in the same project* on the same IAM as your inference?"

**Where the GCP opportunity is:** That full pipeline (supervised fine-tuning + preference tuning + cross-model distillation + managed endpoint with autoscaling and Experiments) is a single workflow on GEAP. AWS Bedrock Model Distillation is GA but doesn't cover frontier Gemini as a teacher. Azure has fine-tuning for OpenAI + open models but no cross-vendor distillation. GEAP is the cleanest answer for the Abridge playbook.

### Jake Stout (Serval) — The Cost of Inaction in Enterprise Software

Jake Stout, CEO of Serval — an AI-native **ITSM platform** (IT Service Management — think a modern, AI-first replacement for ServiceNow or Jira Service Management) — argues the "cost of inaction" for enterprises *not* embracing AI is now enormous. He positions velocity and talent density as the only durable moats, pushing teams to "ship a product before they can have a meeting to talk about shipping a product." Serval is targeting Fortune 20 accounts directly, predicting more frequent ITSM migrations than other enterprise system swaps [Jake Stout on Unsupervised Learning (55 min, 0:12:47)](https://www.youtube.com/watch?v=Q0bxRANHjFY).

**Conversation starter:** "Stout calls ITSM uniquely vulnerable to AI disruption because the workflows themselves are changing weekly. Which enterprise function in *your* customer stack do you think is next for an AI 'rip and replace' — and what's actually slowing the swap?"

## Quick Hits

-   **[Google DeepMind reinvented the mouse pointer (1 min read)](https://x.com/kimmonismus/status/2054248695462232424)** — The new AI pointer sees what you're pointing at, understands context, and responds to your voice, fundamentally changing human-computer interaction.
-   **[OpenAI launched a personal finance feature in ChatGPT (1 min read)](https://x.com/kimmonismus/status/2055320528198521041)** — For Pro users in the US, allowing management of invoices, payments, and financial analysis, directly impacting fintech startups.
-   **[AI-generated ads perform as well as human-created ads (1 min read)](https://x.com/ericseufert/status/2055288581334131093)** — However, performance drops if consumers suspect the ads were generated by AI, highlighting the need for authenticity.

## Try This Week

Pick one founder who's doing in-house fine-tuning or distillation (Abridge-style) and ask: *"What's your distillation pipeline today — and what would change if you could SFT, preference-tune, distill from a frontier teacher, and deploy to a managed endpoint all in one project, same IAM as your inference?"* Listen for the friction points (data pipeline, eval, deployment lag). Those friction points map directly to GEAP's Vertex tuning + managed endpoints + Experiments versioning workflow.

## Our Play

### GEAP, FDEs, and the $750M Partner Fund

Three concrete plays this week.

**(1) Forward Deployed Engineers + the $750M agentic AI partner fund.** Google Cloud is hiring hundreds of FDEs across US, London, Paris, Hong Kong, and just committed $750M (announced at Cloud Next, April 22) deployed alongside Accenture, Capgemini, Cognizant, Deloitte, HCLTech, PwC, and TCS [Google Cloud press release (1 min read)](https://www.googlecloudpresscorner.com/2026-04-22-Google-Cloud-Commits-750-Million-to-Accelerate-Partners-Agentic-AI-Development). This is the direct counter to OpenAI's $10B+ consulting JV and Anthropic's $1.5B+ arm — engineers in the customer's office writing production AI code, funded by Google, no consulting markup.

**(2) Anthropic-on-GEAP, with the 1M-context twist.** Claude Opus 4.7, Opus 4.6, and Sonnet 4.6 are all GA on GEAP with **1M-token context windows** (longer than what Anthropic offers direct on those models today), same per-token pricing as Anthropic direct, single GCP invoice, inside the customer's VPC-SC perimeter. Single IAM. Single SDK switch between Gemini and Claude. The founder framing isn't "Google added Anthropic" — it's "you get both leading frontier model families on one platform with one security posture."

**(3) Provisioned Throughput now in 1-week terms.** PT on Gemini used to mean a 1-month or 1-year commit. As of this quarter, **1-week terms are GA**. A Series A team can lock burst capacity through a product launch without a yearly contract. PT cuts per-token cost 20-45% at full utilization vs on-demand. Break-even threshold: ~$50/day single-model spend.

*Connect to this week:* When founders are processing the compute squeeze, the FDE arms race, and the Anthropic rug pull simultaneously, GEAP is the platform that converts each of those anxieties into a concrete shipping product (committed capacity / FDE-led deployment / multi-model optionality), not a slogan.

### Autonomous Defense — Mandiant + Model Armor + Confidential Computing

Kevin Mandia: human-in-the-loop defense is no longer viable against AI-driven attacks (breach times now measured in minutes); autonomous defense is essential [Kevin Mandia on Grit (63 min, 0:00:05)](https://www.youtube.com/watch?v=_ZEsfZ-K_TY). The GCP stack is unusually integrated: **Model Armor** runs as a runtime guardrail layer for prompt injection and data leakage *across Gemini and third-party Claude/Llama equally*; **Mandiant** ships M-Trends 2026 plus continuous red-teaming services specifically for AI models and agents; **Confidential Computing** now covers NVIDIA RTX PRO 6000 Blackwell (G4) and Intel TDX (C4, Preview). No other hyperscaler ships this stack as one product — AWS has Bedrock Guardrails but no in-house equivalent to Mandiant; Azure has Content Safety but no in-house IR practice.

---

*Sources: this week's podcast extraction + bookmarks (May 12–18). GEAP product specifics sourced from Google Cloud's [Cloud Next 2026 GEAP launch blog](https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform) and current product docs. [Archive](/archive)*
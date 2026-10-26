---
title: "The Off-Laptop Agent Shift, Anthropic's S-1 Squeeze, and 'Black October' Cyber Intrusions"
date: "2026-10-26"
subtitle: "Week of October 19 – October 25 | Edition #36 | ~5 min read"
edition: 36
featured_topics:
  - jediah-katz-off-laptop-agent-compute-engine
  - anthropic-s1-compute-shortage-model-garden
  - black-october-agentic-insider-bank-intrusions
---

## TLDR

- **90% of agent workloads are moving off developer laptops into the cloud:** Jediah Katz warns coding harnesses are shifting from prompt smarts to physical runtime isolation.
- **Cloud hosts are rationing compute as Anthropic preps its IPO:** Sundar Pichai admits "everyone is short by 2x," while Google Cloud expands Model Garden to include OpenAI and Anthropic-managed Claude.
- **"Black October" cyber intrusions expose autonomous agents as insider threats:** US banks detect rogue agent activity while Satya Nadella and Nikesh Arora urge external supervisory controls over developer harnesses.
- **Corporate AI token spend growth stalled at 0.2% in September:** Ramp data shows startup spend plateauing at an $81/month median per employee as hyperscaler return on capital drops.
- **Our play:** isolate agent sessions with Agent Compute Engine microVMs, hedge lab rationing across Model Garden, and enforce per-agent Non-Human Identity in Security Command Center.

## The Big Picture: Agent Substrates & The Multi-Model Squeeze

### The Off-Laptop Agent Migration: Jediah Katz’s 90% Cloud Shift and the MicroVM Substrate

![off-laptop-agent-microvm-substrate](./images/off-laptop-agent-microvm-substrate.jpg)

At the AI Engineer conference, SpaceXAI harness engineer Jediah Katz delivered a stark forecast: within six months, 90% of agent work will move off local laptops to hosted cloud infrastructure [Jediah Katz at AI Engineer (18 min watch)](https://www.youtube.com/watch?v=7Y4sbZgBdnc). His thesis marks an inflection point in agent architecture. The data flywheel is rapidly absorbing coding tricks and prompt scaffolding into frontier model weights, rendering complex client-side harnesses obsolete for generating intelligence. Instead, the harness must now own what weights cannot learn: physical infrastructure, deterministic security, and runtime efficiency.

The bottleneck has moved to the execution layer. Local machines and unmanaged VMs cannot provide the multi-tenant isolation, ephemeral credential brokering, and fleet density enterprise agents demand. Google Cloud answered this shift by launching Agent Compute Engine, giving every agent a single-tenant, hardware-isolated microVM anchored in custom Titan chips and Titanium IPUs [Google Cloud (22 min read)](https://cloud.google.com/blog/topics/ai-infrastructure/agent-compute-engine-deep-dive/) and [@rseroter (1 min read)](https://x.com/rseroter/status/2113331802647449803). The runtime benchmarks 500 activations per second with sub-500ms suspend/resume, allowing idle agents to checkpoint state to persistent Hyperdisk at near-zero cost. As LangChain CEO Harrison Chase notes, enterprise company harnesses require out-of-band secret proxies and ambient background runs [Harrison Chase (5 min read)](https://x.com/hwchase17/status/2114041443836903662), while Anthropic Applied AI advises folding subagents into the main loop for 2x faster execution [Anthropic Applied AI (13 min read)](https://x.com/cherry_mx_reds/status/2113969070118666670).

**Your angle with founders**

- **The uncomfortable architecture reality:** desktop harnesses like Claude Code are great for solo developers, but running enterprise agents on laptops or unmanaged VMs leaks credentials and wastes compute.
- **Whiteboard the brain-versus-hands split.** The orchestrator reasons, but the sandbox executes code. Inspect whether your agents carry raw API keys inside the execution container, or if outbound calls pass through an off-machine proxy that injects credentials on the wire.
- **The diagnostic question:** "When your agents spend 80% of their runtime waiting on model inference, are you paying for hot VMs, or does your substrate checkpoint them to idle in under 500 milliseconds?"
- **Where GCP wins:** Agent Compute Engine provides hardware-isolated microVMs with sub-second suspend/resume and zero sandbox secrets, while open-source Agent Substrate brings that density to Kubernetes.

### The Cloud-Lab Proxy War: Anthropic’s S-1 Compute Squeeze and the Model Garden Neutralizer

![cloud-lab-compute-squeeze-model-garden](./images/cloud-lab-compute-squeeze-model-garden.jpg)

Leaked S-1 filings reveal Anthropic is struggling to secure capacity from cloud hosts that increasingly view the startup as a direct competitor [TechCrunch (2 min read)](https://x.com/TechCrunch/status/2112657380064268409). Even as Anthropic eyes a November IPO, its infrastructure spending is ballooning: the firm posted an $80.7B net loss on $16.3B revenue in H1 and faces over $750B in long-term cloud contracts. Tomasz Tunguz reports Anthropic committed $518B to data centers—nearly 8x its Q3 run rate—while charging $5.98 per task for Opus 5.5 vs $1.99 for Gemini 4 Argon [Tomasz Tunguz (2 min read)](https://x.com/ttunguz/status/2112203752887443624). Chamath Palihapitiya warned that hyperscalers will prioritize internal research over third-party labs, forcing model providers through proprietary routers with heavy vigs [Chamath Palihapitiya (2 min read)](https://x.com/chamath/status/2114389987563381004).

The compute squeeze is universal. On the Big Technology Podcast, Sundar Pichai admitted Google Cloud is rationing capacity, stating "everyone is short by 2x" and confirming Google is forgoing short-term cloud revenues to prioritize frontier research [Sundar Pichai on Big Technology Podcast (4 min read)](https://x.com/firstadopter/status/2112609917127590040). Yet Google Cloud moved aggressively to neutralize lab friction by announcing OpenAI models are coming to Model Garden [Google Cloud (1 min read)](https://cloud.google.com/blog/products/ai-machine-learning/google-cloud-brings-openai-models-to-customers/), joining the general availability of Anthropic-managed Claude deployments [Google Cloud (1 min read)](https://cloud.google.com/blog/products/ai-machine-learning/expanding-claude-availability-on-google-cloud/) and Claude Opus 5.5 on Antigravity [Google Cloud (1 min read)](https://cloud.google.com/blog/products/ai-machine-learning/claude-opus-55-and-claude-sonnet-55-available-in-antigravity/).

**Your angle with founders**

- **Grant what is true first:** Google Cloud is supply-constrained too. Sundar Pichai admitted it plainly: every major player is short by 2x. Never pretend GCP has unlimited spare capacity.
- **The reframe that protects margin:** relying on a single lab's direct API exposes production to partner friction and allocation cuts. When a lab burns billions fighting its host, throttling and price hikes pass straight to the customer.
- **Audit their routing flexibility.** "If your primary model provider deprioritizes your API tier next month, can you switch traffic via a single config line, or does migration break your tool-calling schemas and prompt caching?"
- **Where GCP wins:** Gemini Enterprise Agent Platform (FKA Vertex AI) turns multi-model optionality into an enterprise hedge, serving Gemini, Anthropic-managed Claude, and OpenAI models behind one contract and unified governance.

### "Black October" & The Agentic Insider: Bank Intrusions and the Harness Attack Surface

![black-october-agentic-insider-security](./images/black-october-agentic-insider-security.jpg)

Major US banks have detected unauthorized third-party AI agents executing independent transactions inside customer accounts, sending executives scrambling to restrict access [Axios (1 min read)](https://x.com/MadisonMills22/status/2113251043173683683). Bank security teams report struggling to distinguish human users from autonomous agents, raising alarms over whether bots are acting on customer behalf or running rogue. The intrusions capped a 48-hour cybersecurity wave dubbed "Black October," which saw critical supply-chain vulnerabilities compromise poisoned packages in LiteLLM, crack Python certificate authorities, and expose core PHP flaws across millions of servers [AI Safety Memes (2 min read)](https://x.com/AISafetyMemes/status/2113113711644737835).

The threat model has fundamentally shifted. Palo Alto Networks CEO Nikesh Arora warned that unmonitored coding harnesses are now the primary enterprise attack surface: if an agent bypasses prompt guardrails, it can bury malicious backdoors directly into application code [Nikesh Arora (3 min read)](https://x.com/nikesharora/status/2114372350707986492). Satya Nadella formalized the doctrine, declaring that autonomous agents must be treated as "agentic insiders" governed by deterministic security controls outside the model itself [Satya Nadella (1 min read)](https://x.com/satyanadella/status/2112168320946634932). When agents possess tool-use privileges, prompt-level safety fails; security must enforce identity and runtime boundaries at the infrastructure substrate.

## Quick Hits

- **[Hamel Husain’s benchmark proves tuned decision models slash eval costs 80%+ vs LLM judges (9 min read)](https://x.com/HamelHusain/status/2112588257104216294)** — Testing OpenAI Decisions, Perplexity Decider, and Liquid d1 shows that optimizing classification thresholds matches frontier F1 accuracy at under a cent per hundred runs.
- **[Google Cloud open-sources TorchTPU and llm-d 1.0 to break PyTorch Nvidia lock-in (8 min read)](https://cloud.google.com/blog/topics/ai-infrastructure/torchtpu-is-now-open-source-run-native-pytorch-on-tpus/)** — Co-developed with Meta, TorchTPU brings native PyTorch execution to TPUs via standard Hugging Face device mappings, paired with CNCF-backed distributed inference on Kubernetes.
- **[Corporate AI token spend growth stalled at 0.2% in September per Ramp data (1 min read)](https://x.com/kurtsaltrichter/status/2112538842762727694)** — Spending growth collapsed from 42% in July as venture-backed startup usage plateaued at an $81/month median per employee while hyperscaler ROIC fell from 38% to 20%.
- **[Anthropic previews Claude Duet as a proactive, background desktop agent (1 min read)](https://x.com/claudeai/status/2112984664256241837)** — The research preview introduces a standalone application that initiates tasks, flags items requiring user review, and continues execution asynchronously when developers step away.
- **[Gemini Developer Guide details agentic video understanding to cut analysis tokens 88% (3 min read)](https://x.com/googledevs/status/2112238816149058000)** — An iterative Think-Act-Observe tool loop inspects speech transcripts and extracts adaptive temporal frame slices, reducing long-form media bills up to 66%.

## Seller's Edge: The Sandbox Is the Security Boundary, Not the Prompt

Edition #23 taught that invoices are harness decisions, and Edition #28 showed architecture sets the cost slope. This week advances from cost to trust: security cannot live inside the model's prompt. Jediah Katz demonstrated that coding smarts commoditize while infrastructure and trust endure [Jediah Katz at AI Engineer (18 min watch)](https://www.youtube.com/watch?v=7Y4sbZgBdnc). LangChain’s Harrison Chase showed enterprise harnesses require mediated secret proxies [Harrison Chase (5 min read)](https://x.com/hwchase17/status/2114041443836903662), and "Black October" bank intrusions proved that prompt guardrails cannot prevent rogue agent actions [Axios (1 min read)](https://x.com/MadisonMills22/status/2113251043173683683).

Consider a founder building an autonomous coding or financial agent. They typically configure system prompts with strict rules: "never execute destructive SQL, never touch production keys, never exfiltrate customer PII." But when that agent ingests third-party dependencies—like the poisoned LiteLLM package uncovered this week—or encounters indirect prompt injection, text-based safety instructions crumble. If the execution sandbox holds ambient AWS or database credentials, the attacker owns the fleet. The model is non-deterministic intelligence; it cannot serve as its own security gate. The fix is architectural: strip all credentials from the execution container entirely. The sandbox makes a generic call; an off-machine proxy evaluates policy and injects credentials on the wire. If the sandbox is breached, there is nothing inside to steal.

In your next founder meeting, stop asking what guardrails or system prompts they use. Instead ask: *"If an attacker gains root execution inside your agent's sandbox right now, what API keys, tokens, or database secrets can they read off disk or memory?"* When they admit the container holds raw credentials, whiteboard the split between orchestrator and sandbox. Position runtime isolation, mediated credential injection, and Non-Human Identity governance as the prerequisites for production enterprise agents.

## Our Play

Every thread this edition—off-laptop migration, lab compute rationing, and agent security perimeters—points to one GCP position: **Google Cloud provides the neutral, hardware-isolated substrate where founders run multi-model agents safely at planet scale.** Three concrete motions:

- **Host agent runtimes on Agent Compute Engine.** *Signal:* Founders moving coding and GTM agents off laptops face unmanaged VM costs and credential leaks. *Why GCP wins:* Agent Compute Engine isolates sessions in hardware microVMs with sub-500ms suspend/resume and zero sandbox secrets. *The move:* Whiteboard the orchestrator-sandbox split and benchmark idle cost savings on Agent Substrate.
- **Neutralize lab rationing with Model Garden.** *Signal:* Anthropic compute shortages and lab-cloud friction threaten single-provider API availability. *Why GCP wins:* Model Garden serves Gemini, Anthropic-managed Claude, and OpenAI models under one unified contract and SLA. *The move:* Propose a multi-model eval across their top two agent pipelines to eliminate single-lab failure risk.
- **Govern non-human agent identities with Security Command Center.** *Signal:* Rogue banking agents and harness supply-chain attacks expose overprivileged service accounts. *Why GCP wins:* Security Command Center AI Protection governs Non-Human Identities outside the model loop. *The move:* Audit their agent credential architecture, replacing embedded sandbox API keys with mediated proxy-authenticated identities.

---

*Sources: 88 bookmarks, 67 lab announcements, 2 videos from the AI content library. [Archive](/archive)*
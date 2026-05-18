---
title: "Agent Infra Got Real: The GEAP Playbook for Stateful Agents and Distilled Models"
date: "2026-05-18"
subtitle: "Week of May 12 – May 18 | Edition #14 | ~7 min read"
edition: 14
featured_topics:
  - stateful-agents-need-new-cloud-geap-answer
  - abridge-distillation-pipeline-on-geap
  - geap-launch-cloud-next-2026
  - ai-compute-wall-supply-squeeze
  - lecun-world-models-physical-ai
  - serval-itsm-cost-of-inaction
  - geap-anthropic-1m-context-vpc-sc
  - 750m-agentic-ai-partner-fund
---

## TLDR

-   **Stateful agents need a new cloud — GCP just shipped most of it.** Agent Engine Runtime (GA, $0.0864/vCPU-hr, 7-day state), Memory Bank (GA, vector index + IAM-scoped multi-tenancy), GKE Agent Sandbox (Preview, gVisor kernel isolation). The Daytona pitch finally has a structural answer.
-   **Abridge's distillation playbook runs end-to-end on GEAP.** Cross-vendor teacher (Claude Opus 4.7 → Gemma 4 student) is GEAP-only — Bedrock distillation can't use Claude as teacher into a Gemini/Gemma student.
-   **Compute is supply-gated, and 1-week Provisioned Throughput is the founder-friendly hedge.** PT on Gemini now ships in 1-week terms (alongside 1-month, 1-year). 20–45% off on-demand at full utilization.
-   **LeCun left Meta to bet against LLMs.** Narrow signal — only matters for the robotics / physical-AI / autonomous-systems corner of your book.
-   **GCP plays this week:** Agent Engine Runtime + Memory Bank for the stateful-agent conversation; cross-vendor distillation pipeline for the "we want to own our model" conversation; 1-week PT + Anthropic-on-GEAP-with-1M-context + $750M agentic-AI partner fund for the AWS-displacement conversation.

## The Big Picture

### Stateful Agents Need a New Cloud — and GEAP Has the Answer

![agent-sandboxes](./images/agent-sandboxes.jpg)

**The problem (well-articulated by Ivan Burazin, Daytona, on The MAD Podcast).** AI agents — especially those calling tools, running model-generated code, or running for hours — need *stateful* compute. That means: runtimes that hold context across requests, persist memory across sessions, support long-running operations (hours to days), and tolerate models "learning on the job" without losing prior state. Traditional cloud was built for *stateless* request-response — every request independent, scale horizontal — which breaks the moment an agent needs to remember anything past one HTTP call [Ivan Burazin on The MAD Podcast (66 min, 0:06:54)](https://www.youtube.com/watch?v=kMXJrzAa5fM). Daytona's pitch: AWS and Azure can't retrofit this.

**The GCP stack (mostly GA, layered):**

- **Agent Engine Runtime (GA, on GEAP).** Managed serverless runtime for the *long-lived reasoning loop*. You write the agent in **ADK** (open-source, Python/TS/Go/Java), run `adk deploy agent-engine`, and get a versioned endpoint with VPC-SC, IAM, Cloud Trace, and Cloud Logging baked in. Pricing: **$0.0864 per vCPU-hour + $0.0090 per GB memory-hour while executing** — no per-invocation fee, so an agent that thinks for 20 min costs ~20 min of compute.
- **Agent Engine Sessions (GA).** Append-only **event log** keyed by `session_id` + `user_id`. Every turn (user message, tool call, tool result, model response) writes an event. Replay the log → reconstruct full agent state. Event-sourced, not key-value blob — that's what enables the 7-day-state primitive.
- **Memory Bank (GA, $0.25 per 1K stored events/memories).** Two-layer memory service. Layer 1: raw event sessions. Layer 2: a Gemini-powered extraction pipeline consolidates events into structured long-term memories (preferences, facts, summaries), embeds them into a managed vector index, and exposes semantic recall via scope-keyed queries. **IAM Conditions on `memoryScope`** let you write a policy like "service account X can only read memories where `scope.tenant_id == 'acme'`" — real multi-tenant isolation at the policy layer, not app-level filtering. Founders don't pick a vector DB. Don't run an extraction job. Don't manage embeddings.
- **GKE Agent Sandbox (Preview, requires GKE 1.35.2-gke.1269000+).** **gVisor** user-space kernel isolation — every sandbox pod gets its own kernel, network namespace, filesystem view. Kernel-exploit-grade payloads can't reach the host. Warm-pool model: pre-provisioned pods sit idle; `SandboxClaim` assigns one with no image pull → sub-second. **Pod Snapshots (also Preview)** freeze sandbox state to disk for stateful resume. **Default Deny** egress out of the box; whitelist what the sandboxed code can reach. The right home for running LLM-generated Python with your own toolchain and your own VPC posture.
- **Cloud Run for AI agents (GA) + Cloud Run Worker Pools.** For short-lived, request-driven agents and async task fan-out (research agent spawns 50 sub-tasks, worker pool drains them — ~40% cheaper than request-driven for background work). Stateless by design; pair with Memory Bank for portable state.

**Reference architecture for a real agent product (e.g., a research agent that runs for hours, calls tools, generates Python, remembers users):** Agent Engine Runtime hosts the brain. Sessions logs every turn. Memory Bank extracts long-term context async. GKE Agent Sandbox executes generated code in sub-second warm gVisor pods. Cloud Run Worker Pool fans out 20 parallel web-fetches via Pub/Sub. ADK is one framework targeting all four — push once, the platform decides where each piece runs.

**Honest competitive read.** AWS Bedrock **AgentCore is GA** (Oct 2025) with Memory + Code Interpreter — comparable scope, materially earlier than GEAP's GKE Agent Sandbox. Daytona's raw cold-start latency (27–90ms) beats GKE Agent Sandbox today (sub-second warm, multi-second cold-with-snapshot). The GCP wins: (1) one open framework (ADK) for all four runtime targets; AWS splits Strands + AgentCore + Lambda + Step Functions; (2) **vector-managed long-term memory with IAM-Condition multi-tenancy** — neither AgentCore Memory nor Foundry Memory exposes this; (3) **two-layer infra in *your* VPC** — brain on Agent Engine, hands in GKE Agent Sandbox, both inside VPC-SC; (4) **per-vCPU-second pricing with no per-invocation fee** — predictable for long-running reasoning.

**Your angle with founders (three escalating questions):**

1. **Where it hurts:** "What's your agent's longest session today — minutes or hours? When you scale that to 1000 concurrent users, where does state actually live, and what happens when the process restarts?"
2. **The cost question:** "If your agent thinks for 20 minutes per turn, how are you priced today? Per invocation? Per token only? Are you paying for thinking time, or just compute?"
3. **The security question:** "When your agent generates code and executes it, what's the isolation boundary — container, VM, or something stronger? Have you priced what a kernel-level escape costs you in a compliance audit?"

**Where the GCP opportunity is:**
- **Founders on DIY Lambda+DynamoDB+ECS:** the migration story is "one ADK framework, four managed targets, IAM-scoped memory, sub-second sandboxed code." Lead with simplification, not just cost.
- **Founders on AWS AgentCore today:** push framework openness (ADK is open-source) + Gemini quality in Memory Bank extraction + GKE Agent Sandbox if they need their own container toolchain.
- **Founders evaluating Daytona/E2B for sandboxes:** honest concession — Daytona is faster on raw cold-start today. Push back on "your code-execution layer is now a 3rd-party SaaS outside your VPC" if they care about compliance.

### The Distillation Playbook — Running Abridge's Strategy on GEAP

![ai-software-reset](./images/ai-software-reset.jpg)

**The story.** Abridge ($5.3B healthcare AI, ~80M patient-clinician conversations/year) is distilling open-source models in-house to replace frontier models for specific product outputs, prioritizing real-time latency and cost in high-stakes clinical workflows [Shiv Rao on 20VC (69 min, 0:25:29)](https://www.youtube.com/watch?v=byZkrYBF-N0). Every step of that pipeline is a first-class managed product on GEAP. Here's the six-step process you can read out loud to a founder.

**1. Pick your teacher in Model Garden.** Gemini 3.x Pro or Claude Opus 4.7 — both GA on GEAP. *Why GCP, not AWS:* Bedrock distillation **cannot use Claude as a teacher into a Gemini or Gemma student**. Cross-vendor distillation is GEAP-only today. Azure Foundry locks teachers to Azure OpenAI.

**2. Run Batch Prediction on the teacher** over your unlabeled prompts in Cloud Storage. Produces synthetic `(prompt, teacher_response)` training pairs. *Why GCP:* Batch Prediction is ~50% the price of online inference and runs against any Model Garden model with zero infra setup.

**3. Land training data inside VPC-SC with CMEK + a BAA.** *Why GCP:* VPC Service Controls is the only hyperscaler network-level egress control that wraps the *model API itself*, not just the storage layer. AWS PrivateLink and Azure Private Endpoints stop at the network — VPC-SC stops at the API. Material for HIPAA/PHI workloads.

**4. Submit a managed SFT or `distill_from` tuning job** on the student (Gemini 2.5 Flash-Lite or Gemma 4) with `adapter_size=8` for LoRA. Gemini SFT on GEAP is **LoRA-only, priced per training token × epochs** — no GPU-hour billing surprises. Open-model SFT (Gemma, Llama, Mistral) is per GPU/TPU-hour and supports full SFT, LoRA, or QLoRA. **Preference tuning (DPO)** is GA on Gemini 2.5 Flash/Flash-Lite when you need pairwise preferences (tone, clinical concision) on top of SFT.

**5. Run pairwise eval in Vertex AI Evaluation Service.** Built-in judge model rates student outputs against teacher on a held-out set; you get a win-rate. *Why GCP:* Eval Service is a managed primitive — AWS and Azure require DIY judge harnesses.

**6. Deploy the tuned student to a Vertex AI online endpoint on G4 (Blackwell) or C4 (Intel TDX) confidential VMs.** Traffic-split canary (90% old / 10% new), Model Monitoring on input drift, AlloyDB AI auto-embedding for the RAG layer. *Why GCP:* G4/C4 confidential VMs encrypt data **in use** during inference — neither Bedrock fine-tune endpoints nor Azure OpenAI fine-tune endpoints offer GPU confidential computing for HIPAA workloads in May 2026.

**Your angle with founders:**

1. "What's your distillation pipeline today — and what would change if SFT, preference tuning, distillation from any teacher (including Claude), and deployment to a confidential-compute endpoint all lived in one project on one IAM?"
2. "If you're on Bedrock, you can't use Claude as a teacher for a Gemini or Gemma student. Does that constrain how you're thinking about which model you'd actually want to own in production?"
3. "Have you priced what your eval harness costs you to maintain monthly? Vertex AI Evaluation ships pairwise eval as a managed primitive — that's typically 1–2 FTE of MLOps you don't need to hire."

**Where the GCP opportunity is:**
- **Healthcare, financial services, legal, and any regulated vertical** where the customer is moving off frontier APIs for compliance — the full GEAP stack (VPC-SC + CMEK + BAA + G4/C4 confidential inference + Vertex AI Search for Healthcare for FHIR) is the cleanest end-to-end story on any hyperscaler.
- **Founders evaluating "should we own a model or stay on the API"** — the answer used to require a 2-month MLOps build. The 6-step process above is now a managed workflow. Make the math obvious.

### The Compute Squeeze

![ai-compute-policy-clash](./images/ai-compute-policy-clash.jpg)

Senator Bernie Sanders and Rep. Alexandria Ocasio-Cortez introduced a bill this week to pause *all* AI data center construction [Garry Tan (1 min read)](https://x.com/garrytan/status/2054904105018237125) — translating a public mood where 70% of Americans now oppose new local data center construction [AI Daily Brief (32 min, 0:08:20)](https://podcasters.spotify.com/pod/show/nlw/episodes/RIP-Golden-Age-of-Agent-Experimentation-2026-2026) — onto a semiconductor shortage now projected to last through 2030 [AI Daily Brief (27 min, 0:28:13)](https://podcasters.spotify.com/pod/show/nlw/episodes/AI-Inequality-e3jg00q). Every hyperscaler is supply-constrained, including GCP.

**Your angle with founders:**
1. "How many GPUs short are you for next quarter? When you forecast 2027, are you assuming you can actually *get* the inference capacity — or hoping?"
2. "If GPU supply tightens in Q3, who in your vendor's customer base gets de-prioritized first — you, or their bigger customers?"

**Where the GCP opportunity is:**
- **1-week Provisioned Throughput on Gemini** (new this quarter — alongside 1-month and 1-year). A Series A founder can lock burst capacity through a product launch without a yearly commit. PT cuts per-token cost 20–45% at full utilization vs on-demand.
- **Don't overclaim capacity.** GCP is supply-constrained too. Frame as "which provider locks in your commitment in writing," not "we have spare GPUs."

## Founder Watch

### Yann LeCun (AMI Labs) — Betting Against LLMs

LeCun left Meta to start AMI Labs, arguing LLMs are a dead-end for real-world intelligence and betting on **world models + the JEPA architecture** for robotics and manufacturing [Yann LeCun on Unsupervised Learning (82 min, 0:06:50)](https://www.youtube.com/watch?v=ngBraLDqzdI). **Narrow signal:** only matters for the robotics, manufacturing, and autonomous-systems corner of your book — physical-AI founders building beyond text. Don't force the angle on LLM-product founders.

### Jake Stout (Serval) — The Cost of Inaction in Enterprise Software

Jake Stout, CEO of Serval — an AI-native **ITSM platform** (IT Service Management — a modern AI-first replacement for ServiceNow or Jira Service Management) — argues the "cost of inaction" for enterprises *not* embracing AI is now enormous. He positions velocity and talent density as the only durable moats, pushing teams to "ship a product before they can have a meeting to talk about shipping a product." Serval is targeting Fortune 20 accounts directly [Jake Stout on Unsupervised Learning (55 min, 0:12:47)](https://www.youtube.com/watch?v=Q0bxRANHjFY).

**Conversation starter:** "Stout calls ITSM uniquely vulnerable to AI disruption because the workflows themselves change weekly. Which function in *your* customer stack do you think is next for an AI 'rip and replace' — and what's actually slowing the swap?"

## Quick Hits

-   **[Google DeepMind reinvented the mouse pointer (1 min read)](https://x.com/kimmonismus/status/2054248695462232424)** — Sees what you're pointing at, understands context, responds to voice. Hints at the post-GUI agent interface.
-   **[OpenAI launched a personal finance feature in ChatGPT (1 min read)](https://x.com/kimmonismus/status/2055320528198521041)** — Pro users in US, invoices/payments/financial analysis. Direct fintech-startup pressure.
-   **[AI-generated ads perform as well as human-created ads (1 min read)](https://x.com/ericseufert/status/2055288581334131093)** — Until consumers suspect it's AI; then performance drops. Authenticity is the moat.

## Try This Week

Pick one founder who's doing fine-tuning or distillation today and ask: *"What's your distillation pipeline look like — teacher, student, eval, deployment? And what would change if all four steps lived in one project, on one IAM, with cross-vendor teacher options (including Claude as teacher for an open-source student)?"* That's the GEAP differentiator. Listen for friction points around eval and deployment — those map directly to Vertex AI Evaluation Service and confidential-compute endpoints (G4/C4).

## Our Play

### The Three Concrete Plays This Week

**(1) Forward Deployed Engineers + the $750M agentic AI partner fund.** Google Cloud is hiring hundreds of FDEs across US, London, Paris, Hong Kong, plus a $750M agentic-AI partner fund (announced at Cloud Next, April 22) deployed via Accenture, Capgemini, Cognizant, Deloitte, HCLTech, PwC, and TCS [Google Cloud press release (1 min read)](https://www.googlecloudpresscorner.com/2026-04-22-Google-Cloud-Commits-750-Million-to-Accelerate-Partners-Agentic-AI-Development). Direct counter to OpenAI's $10B+ consulting JV and Anthropic's $1.5B+ arm — engineers in the customer's office writing production AI code, funded out of Google, no consulting markup.

**(2) Anthropic-on-GEAP with 1M-token context.** Claude Opus 4.7, Opus 4.6, Sonnet 4.6 — all GA on GEAP with **1M-token context windows on GEAP** (longer than Anthropic offers direct on those models), same per-token pricing, single GCP invoice, inside the customer's VPC-SC perimeter, same IAM as Gemini. The founder framing: "you get both leading frontier model families on one platform with one security posture."

**(3) Provisioned Throughput in 1-week terms (new).** PT on Gemini used to mean 1-month or 1-year commits. As of this quarter, **1-week terms are GA**. Lock capacity through a product launch without a yearly contract. Break-even threshold: ~$50/day single-model spend.

*Connect to this week:* Founders are processing compute scarcity, the FDE arms race, the Anthropic rug pull, and the agent-infra question simultaneously. GEAP converts each into a concrete shipping product — committed capacity, FDE-led deployment, multi-model optionality, stateful agent runtime — not a slogan.

### Autonomous Defense — Mandiant + Model Armor + Confidential Computing

Kevin Mandia on Grit: human-in-the-loop defense is no longer viable against AI-driven attacks; breach times now measured in minutes [Kevin Mandia on Grit (63 min, 0:00:05)](https://www.youtube.com/watch?v=_ZEsfZ-K_TY). The GCP stack is unusually integrated: **Model Armor** runs as a runtime guardrail layer for prompt injection and data leakage across Gemini and third-party Claude/Llama equally; **Mandiant** ships M-Trends 2026 plus continuous red-teaming services for AI models and agents; **Confidential Computing** now covers NVIDIA RTX PRO 6000 Blackwell (G4) and Intel TDX (C4, both Preview). No other hyperscaler ships this stack as one product — AWS has Bedrock Guardrails but no in-house Mandiant equivalent; Azure has Content Safety but no in-house IR practice.

---

*Sources: this week's podcast extraction + bookmarks (May 12–18). GEAP product specifics sourced from canonical [Google Cloud docs](https://docs.cloud.google.com/agent-builder/agent-engine/memory-bank/overview), the [Cloud Next 2026 GEAP launch blog](https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform), [GKE Agent Sandbox docs](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/machine-learning/agent-sandbox), [Long-running agents with ADK](https://developers.googleblog.com/build-long-running-ai-agents-that-pause-resume-and-never-lose-context-with-adk/), and current [Vertex AI tuning docs](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-use-supervised-tuning). [Archive](/archive)*

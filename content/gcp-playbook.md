# Brief Signal — GCP Playbook (public layer)

<!-- Claims verified 2026-07-26 against official Google sources, exec statements,
     analyst coverage (Stratechery, SemiAnalysis, Interconnects, Tunguz), and
     practitioner threads — citations inline. Simon spot-checks before merge.
     This file feeds Stage 4b as ground truth for "Our Play" and the
     "Where the GCP opportunity is" lines. It is PUBLIC (repo + site):
     nothing here you wouldn't want a competitor reading. Objection handling
     and where-rivals-win live in docs/internal/gcp-playbook-internal.md
     (gitignored). Refresh cadence: re-verify after each Cloud Next and
     quarterly earnings. Last verified: 2026-07-26. -->

This is the generator's ground truth for what Google Cloud actually offers and
how it differentiates. **Only claims in this file (or in the week's KBs) may
appear in product positioning.** If a play needs a claim that isn't here,
gesture at the strategic direction instead of inventing specifics.

---

## Component glossary (one line each — define on first use in a briefing)

- **Gemini Enterprise Agent Platform (FKA Vertex AI)** — the umbrella AI
  platform, renamed at Cloud Next '26 (2026-04-22); "Agent Platform" after
  first mention. Never "GEAP", never bare "Vertex AI".
- **Model Garden** — the model catalog: 200+ curated models total — Gemini
  family, Anthropic Claude (Fable 5 GA June '26, Opus 4.8 July '26), and open
  models (Gemma 4, Llama, etc.). Gemini/Claude/select open models are
  serverless; many open models require self-deployment. Don't say "200+ open
  models."
- **Agent Development Kit (ADK)** — open-source, model-agnostic agent
  framework (Python/TS/Go/Java); ~70M total downloads per Q2 '26 earnings.
- **Agent Runtime** (FKA Agent Engine, renamed Next '26) — managed production
  runtime: long-running agents holding state for days, sub-second cold starts;
  plus Agent Platform Sessions, Memory Bank, Agent Evaluation (multi-turn
  autoraters), Agent Simulation, and OTel-based Agent Observability.
- **Agent Studio / Agent Designer** — low-code and no-code agent authoring
  (the FKA "Agent Builder" surface, split at Next '26).
- **A2A protocol** — agent-to-agent interop protocol Google authored, donated
  to the Linux Foundation (June 2025); AWS and Microsoft are founding partners
  and now ship it too. Provenance is Google's; the standard is everyone's.
- **Grounding with Google Search** — answers grounded in live Google Search
  with citations, across first-party Gemini models; also grounds on Agent
  Search (FKA Vertex AI Search), Elasticsearch, or your own corpus.
- **BigQuery / Agentic Data Cloud** — data-gravity story. **Cross-Cloud
  Lakehouse** (open Apache Iceberg) lets data stay on AWS/Azure while agents
  query it zero-copy; Knowledge Catalog (Preview) grounds agents in business
  context; Data Agent Kit (Preview).
- **TPUs** — Ironwood (7th gen) is GA (April '26); 8th gen announced at
  Next '26: **TPU 8i for inference — 80% better performance-per-dollar than
  Ironwood** (Google's claim), TPU 8t for training. Lead inference-economics
  conversations with 8i; Ironwood is what customers run today.
- **Provisioned Throughput (PT)** — fixed-cost, fixed-term reserved model
  capacity in 1-week / 1-month / 3-month / 1-year plans; a 1-year commitment
  is priced 26% below the 1-month rate. (This — not "CUDs" — is the
  commitment vehicle for model serving.) Covers Gemini and Claude (Claude PT
  is ordered through the account rep — a built-in reason to get the rep in
  the room).
- **Current Gemini pricing** (Standard tier, global, per 1M tokens, verified
  2026-07-26): Gemini 3.1 Pro $2 in / $12 out (≤200K context; higher beyond,
  and >200K context bills ALL input at the long-context rate); 3.6 Flash
  $1.50 / $7.50; 3.5 Flash-Lite $0.30 / $2.50. Tier levers: Priority = 1.8x
  Standard; **Flex and Batch = 50% off Standard**; tuned-model inference =
  1.5x base. Claude on-platform per-token prices are not published on
  Google's pricing page — quote via Anthropic's pricing or the account rep.
- **Tuning & distillation** — supervised fine-tuning (LoRA/QLoRA adapters)
  covers Gemini 3.5 Flash, 3.1 Flash-Lite, and the 2.5 family — **not 3.1
  Pro**; RL fine-tuning and preference tuning also offered. For open-weight
  students (the house Gemma path) the vehicle is **"distillation fine-tuning
  for open models"** (GenAI SDK: Gemini teacher → Gemma/Llama student); the
  managed "Gemini Distillation Service" is Gemini→Gemini only (early access)
  — don't cite it for the Gemma story. No Claude tuning exists.
- **Context caching** — implicit, on by default, 90% discount on cached input
  tokens (Gemini 2.5+). Table stakes, not a differentiator: Bedrock offers the
  same 90%. Cache and batch discounts don't stack.
- **Google for Startups Cloud Program** — up to $200K credits, or $350K
  AI-first (Year 1 covers 100% of usage to $250K; Year 2 covers 20% to $100K).

## Differentiators GCP can honestly claim (each with its "why" and its limits)

*(The 2026 reality check: "multiple frontier labs on one platform" and "open
agent framework + open protocol" are now PARITY — Bedrock carries Claude AND
OpenAI GPT-5.x; Azure Foundry carries GPT, Claude, and Grok; both ship
MCP+A2A frameworks. The honest distinctions are below.)*

1. **The only cloud whose own frontier lab is on the platform.** Every rival's
   multi-model story rents its frontier models; Google's includes Gemini —
   which is on no other cloud — alongside committed Claude. Kurian's public
   framing of Anthropic-on-GCP: "We don't see it as zero sum" [Stratechery,
   2026-04-23]. House framing rule: founder optionality, never concession.
2. **Full-stack economics, stated precisely.** Google designs the models AND
   the chips, so it doesn't pay another vendor's margin on either —
   Kurian: greater "capacity for reinvestment." SemiAnalysis models Ironwood
   at roughly 30% lower cost than Nvidia GB200 for external customers
   [SemiAnalysis, 2025-11-28], and TPU 8i claims another 80% perf/$ for
   inference. Limits to respect: Trainium is also frontier-proven (it trains
   Claude models); the TPU software ecosystem (JAX vs CUDA) is real adoption
   friction; never repeat the contested "4x cheaper" numbers. This is an
   *economics* claim, never a spare-capacity claim — Google itself said "we
   are supply constrained" on the Q2 '26 earnings call.
3. **Same-day model integration.** "Every product that Google has is on the
   same Gemini version, on the same day, on the same hour" [Kurian,
   Stratechery] — the DeepMind→Gemini→Agent Platform pipeline is one company,
   no partnership seam.
4. **Search-grounded verifiability, framed on index and coverage.** All three
   clouds now ship "web grounding with citations" — but AWS's works only on
   its Nova models and Azure grounds on Bing. Google grounds every first-party
   model on the Google Search index, with 5,000 free grounded queries/month
   and $14 per 1,000 after (verified 2026-07-26 — down sharply from the
   legacy ~$35 figure still circulating in community threads; correcting a
   founder's stale price objection is itself a credibility move). Concede the
   limit: community reports of inconsistent grounding behavior are real.
5. **Data gravity with an anti-lock-in twist.** BigQuery-native grounding
   keeps agents, data, and governance in one platform ("fewer moving parts" —
   not "only we can"), and Cross-Cloud Lakehouse inverts the lock-in
   objection: the data can stay on AWS or Azure and Google sells the analysis.
6. **Certainty levers a founder can plan around.** PT term commitments,
   backlog-backed momentum (Cloud +82% YoY, $514B backlog, Q2 '26), and the
   startup credit structure. Per the standing rule: every hyperscaler is
   supply-constrained — compete on availability, price, flexibility, and
   ease, never raw capacity.
7. **Open-weight ownership path.** Distillation/fine-tuning targets OPEN
   students the customer owns and runs — Gemma canonical (Interconnects calls
   Gemma 4 "a wild success"), never Gemini-as-student.

## Proof stats (use sparingly, only with fresh context)

- Cloud revenue +82% YoY, $24.8B/quarter; backlog $514B [Q2 '26 earnings, 2026-07-22]
- Gemini Enterprise in ~90% of the Fortune 100; ~330 customers processing >1T tokens/year; 16B tokens/min through the API
- ADK ~70M downloads; Antigravity 2.4M weekly active users
- 60%+ of gen-AI startups build on Google Cloud; 97% retention after credits expire
- Named agent deployments Kurian cites publicly: Citi, Comcast, Walmart; Tata Steel (300 agents in 9 months)

## Founder situation → architecture (how a rep thinks in the meeting)

| The founder says | The architecture conversation | Surfaces |
|---|---|---|
| "Agent costs are exploding" | Decompose the bill: cache hit rate, model turns that could be code, frontier tokens doing small-model work. Route by step difficulty. | Model Garden routing, context caching, Flash tier, TPU 8i at scale |
| "We can't trust the outputs" | Ground answers in the live web or their own corpus; make citations part of the product. 5K free queries/month, $14/1K after. | Grounding with Google Search, Agent Search / RAG |
| "We're dependent on one model" (incl. sanction/deprecation risk) | Side-by-side eval + swap path; own the harness so the model is a part, not the foundation. | Model Garden, ADK, A2A |
| "Prototype works, production doesn't" | Managed runtime with sessions, memory, evals, and observability instead of hand-rolled infra. | Agent Runtime, Agent Evaluation/Simulation |
| "Our data is siloed / lives on another cloud" | Put the agents where the data lives — or query it where it is, zero-copy. | BigQuery, Cross-Cloud Lakehouse, Knowledge Catalog |
| "We need to own our model" | Fine-tune/distill into an open student the founder owns and runs. | Gemma, Agent Platform tuning |
| "We need predictable AI costs to raise/plan" | Commitment terms as certainty: reserved throughput at a known price beats spot-market anxiety. | Provisioned Throughput terms, Batch/Flex tiers, startup credits |

## Motion format (strict, for "Our Play")

Every motion = **Signal → Why GCP wins → The move.**

- **Signal:** the thing the founder says or the week's story shows — concrete,
  quotable, from this edition.
- **Why GCP wins:** ONE differentiator from the list above, with its "why" —
  never a bare product name, never a claim not in this file or the week's KBs,
  and never one of the parity claims stated as if it were distinct.
- **The move:** what the rep actually does next — the question to ask, the
  thing to whiteboard, the eval to propose. An action, not a stance.

Worked example (from Edition #23's sanctions story):
- **Signal:** founder is on a Chinese open-weight model for cost; Treasury is
  threatening sanctions.
- **Why GCP wins:** model optionality with the house lab on-platform — the
  swap path is a config change, not a re-architecture, and Gemini/Gemma give
  a non-rented fallback no other cloud has.
- **The move:** ask "if your model provider got sanctioned next quarter, how
  long would a swap take you?" — then propose a side-by-side eval of their
  workload on two Model Garden alternatives, one of them open-weight (Gemma).

## Key sources (for refresh and deeper reading)

- Google Cloud blog — Next '26 wrap-up + monthly "what we announced in AI" recaps
- Q2 2026 earnings call (2026-07-22) — growth/backlog/supply-constraint framing
- Stratechery: "An Interview with Thomas Kurian About the Agentic Moment" (2026-04-23); "The Google Capital Company" (2026-06-02)
- SemiAnalysis: "Google TPUv7: The 900lb Gorilla In the Room" (2025-11-28)
- Interconnects: "Use multiple models" (2026-01-11); "My bets on open models" (2026-04-15)
- Tomasz Tunguz: "So You Want to Sell Inference" (2026-06-22)

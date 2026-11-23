---
title: "Jensen Huang's Exit, the Neocloud Credit Freeze, and the Death of Model Monogamy"
date: "2026-11-16"
subtitle: "Week of November 9 – November 15 | Edition #39 | ~5 min read"
edition: 39
featured_topics:
  - jensen-huang-exit-megaspeed-blackwell-forensics
  - mercor-daily-eval-swap-multi-model-routing
  - sierra-poppy-protocol-agent-front-door
---

## TLDR

- **Nvidia's board ousted Jensen Huang amid an export scandal:** Independent forensics verified Chinese labs initialized weights on export-controlled Blackwell GPUs, while neocloud Lambda defaulted on Anthropic's $35B contract.
- **Model monogamy is dead for scaled AI startups:** Mercor reached a $20B valuation spending $1M daily on inference by swapping model APIs daily via private evals, as Gemini 4 Hydrogen reset subagent economics.
- **Sierra and 100+ platforms launched the agent front door:** Poppy v1.0 replaces fragile web scraping with authenticated protocols like Model Context Protocol (MCP) across Shopify, Stripe, and Meta Muse.
- **Resend outgrew AWS SES for bare metal:** Peripheral service sprawl (SNS, SQS, CloudWatch) bloated infrastructure costs, driving a migration to dedicated metal and official MCP support.
- **Our plays this week:** Insulate capacity from neocloud defaults with balance-sheet-backed commitments, arbitrate token pricing via Model Garden routing, and enforce scoped per-agent identity.

## The Big Picture: Compute Scarcity, Token Arbitrage, and Agent Protocols

### The Nvidia Hegemony Cracks: Jensen's Ouster, Blackwell Smuggling, and the Neocloud Delivery Crisis

![nvidia-blackwell-export-crisis-neocloud-default](./images/nvidia-blackwell-export-crisis-neocloud-default.jpg)

Nvidia's board forced out CEO Jensen Huang following an extramarital affair with an executive at Malaysian neocloud Megaspeed tied to Chinese intelligence [Steven Witt on Hard Fork (38 min watch, 05:00)](https://www.youtube.com/watch?v=W79ML7zFyZg). Federal authorities suspect Megaspeed diverted between $4.8B and $7.5B in advanced chips [@mickeyhardy (2 min read)](https://x.com/mickeyhardy/status/2119109974794068089). Simultaneously, researcher Will DePue published reproducible forensic proof that six Chinese frontier models, including DeepSeek-V4-Pro and Kimi K3, were initialized directly on export-controlled Nvidia Blackwell GPUs [@willdepue (20 min read)](https://x.com/willdepue/status/2120992457630326841). With internal engineers threatening talent flight to alternative chip ventures [@IamSinovuyo (1 min read)](https://x.com/IamSinovuyo/status/2121614601980666306), the aggressive financing mechanisms Nvidia used to lock up the ecosystem—subsidizing debt-laden neoclouds to juice hardware sales—are unravelling.

The operational fallout hit immediately. In updated initial public offering (IPO) filings, Anthropic disclosed that neocloud Lambda defaulted on its $35B compute contract due to missed delivery schedules [AI Daily Brief (25 min listen, 18:45)](https://podcasters.spotify.com/pod/show/nlw/episodes/Wall-Street-Has-No-Idea-What-Anthropic-Is-Worth-e3s7t73), triggering $10B in new seven-year commitments split between Google Cloud and Microsoft. Mike Volpi warned on the [*a16z Podcast* (57 min watch, 08:48)](https://www.youtube.com/watch?v=LI3lxzHfRrU) that roughly 200 debt-financed neoclouds carry precarious balance sheets vulnerable to credit freezes. As single-vendor supply chains fracture, Google expanded its custom silicon portfolio with TPU 8i Max and TPU 8tx [@AminVahdat (9 min read)](https://x.com/AminVahdat/status/2119786758082900473).

**Your angle with founders**

- **Grant what is actually true:** Nvidia's Compute Unified Device Architecture (CUDA) ecosystem and hardware footprint still power the vast majority of production training clusters. No alternative replaces that footprint overnight.
- **Move to testable counterparty risk:** Audit their compute contracts today: if their neocloud provider relies on debt-financed GPU purchases, what are the contractual remedies if delivery slips by six months?
- **Compete where hardware news cannot reach:** Balance-sheet stability and custom silicon diversification. Point to Anthropic diversifying into seven-year hyperscaler commitments and Fluidstack scaling Google Tensor Processing Units (TPUs) to escape single-vendor margin squeezes.
- **Where GCP wins:** Alphabet's balance sheet and $561B backlog back infrastructure commitments directly, offering calendar-mode reservations for TPU Ironwood alongside managed clusters that avoid neocloud insolvency risk.

### The Death of Model Monogamy: Mercor's $1M/Day Inference Bill and the Daily Eval Swap

![mercor-daily-eval-swap-token-arbitrage](./images/mercor-daily-eval-swap-token-arbitrage.jpg)

Mature AI scale-ups have stopped signing exclusive model API commitments, replacing vendor loyalty with automated, daily routing arbitrated by private benchmarks. Mercor reached a $20B valuation spending roughly $1M per day on inference, with CEO Brendan Foody revealing they switch underlying model providers daily based on which model wins internal evaluations [Brendan Foody on Sourcery (55 min watch, 36:15)](https://www.youtube.com/watch?v=xzA6lYBzmzQ). Frontier labs are pushing proprietary horizontal application bundles to protect pricing power, but builders are actively commoditizing weights into swappable utilities.

The economic incentive is overwhelming. Mike Volpi noted on the [*a16z Podcast* (57 min watch, 34:38)](https://www.youtube.com/watch?v=LI3lxzHfRrU) that top-tier Anthropic tokens carry a 5:1 to 7:1 price premium over alternative models like Kimi. Developer harnesses are responding by routing cheap turn models alongside frontier reviewers [@dani_avila7 (1 min read)](https://x.com/dani_avila7/status/2121076519296450582), and Cisco's Vijoy Pandey confirmed harnesses routinely swap backends from Gemini to Haiku based on immediate token pricing [The Cognitive Revolution (91 min watch, 44:05)](https://www.youtube.com/watch?v=lAG4njluIbQ). Google dropped Gemini 4 Hydrogen, with independent benchmarks from Pawel Huryn showing it outperforms Claude Haiku 5.5 and GPT-6 Luna on bug-finding cost and latency [@PawelHuryn (1 min read)](https://x.com/PawelHuryn/status/2121286545223086302), while Gemini 4 Carbon detected comparable code flaws to Fable 5.2 for $31 versus $140 per run [@danshipper (2 min read)](https://x.com/danshipper/status/2120187507396530309).

**Your angle with founders**

- **The conversation to skip:** Debating whether Claude Opus 5.5 or GPT-6 Astra leads the public leaderboard on generic benchmarks.
- **The decomposition to run live:** Inspect their code for hard-coded provider Software Development Kits (SDKs). How many engineering hours does it take to route a high-volume subagent task from a $40-per-million frontier model to a $1-per-million workhorse?
- **Compete where token cuts cannot reach:** Model optionality and compounding discounts. Context caching and Batch tiers combine on Google Cloud for up to 95% off list prices, while Provisioned Throughput (PT) locks predictable pricing without single-vendor lock-in.
- **Where GCP wins:** Gemini Enterprise Agent Platform (FKA Vertex AI) Model Garden lets founders run Gemini, Claude, and open weights under a single cloud commitment, swapping underlying models via configuration changes rather than SDK rewrites.

### The Agent Front Door: Sierra Launches Poppy v1.0 as 100+ Platforms Replace Web Scraping with Protocols

![sierra-poppy-agent-protocol-standards](./images/sierra-poppy-agent-protocol-standards.jpg)

Autonomous agent traffic is shifting from unauthenticated browser bots scraping web Hypertext Markup Language (HTML) to formal machine-to-machine protocol handshakes. Sierra officially launched Personal Agent Protocol v1.0 (Poppy) alongside more than 100 enterprise partners, including Meta Muse, Shopify, Stripe, Salesforce, and Mercury [@hungryturbo (1 min read)](https://x.com/hungryturbo/status/2121531927987662888). Poppy standardizes Model Context Protocol (MCP), OpenAPI, and Universal Commerce Protocol (UCP) specifications, replacing brittle pixel-clicking bots with structured capability discovery, Open Authorization (OAuth) permission scoping, and mandatory human approvals for financial transfers.

The standard gained instant supply-and-demand distribution. Shopify auto-generated Poppy endpoints across millions of merchants in 175 countries, while Meta enabled Poppy discovery across its Muse personal consumer agent by default [Mona Sarantakos on Lenny's Podcast (88 min watch)](https://www.youtube.com/watch?v=WY0cdD4gNoQ) / [@lennysan (1 min read)](https://x.com/lennysan/status/2121998648573837740). As consumer agents begin driving exponential commerce volume, unconstrained web scraping has become an intolerable security liability for enterprises. Simultaneously, Anthropic published an architectural guide on always-on agents [@TekonBurns (10 min read)](https://x.com/TekonBurns/status/2121328737174388847), confirming that reliable production agents do not run twenty-four-seven; they sleep in event inboxes and wake via discrete triggers. Machine-readable protocols and scoped identities have become the prerequisite for autonomous agents to interact safely with the enterprise web.

## Quick Hits

- **[Resend crossed 120,000 paying customers and $10M ARR, but is migrating off AWS SES to bare metal (86 min watch)](https://www.youtube.com/watch?v=bdIoODXsu8k)** after peripheral service sprawl (SNS, SQS, CloudWatch) bloated its infrastructure bill, while dropping B2B vendors that lack official MCP support.
- **[Google DeepMind formally verified the Signal protocol's cryptographic core down to ARM machine code using AlphaProof Code (2 min read)](https://x.com/swarat/status/2120147774205301073)**, generating over 6 million lines of machine-checked Lean proofs in four weeks.
- **[Mistral CEO Arthur Mensch stated that energy represents only 10% of total compute TCO while hardware and capital costs dominate the remaining 90% (51 min watch)](https://www.youtube.com/watch?v=KotQbLX8pOw)**, warning that relying on centralized frontier labs risks having them use customer data to launch competing vertical products.
- **[Anthropic revealed that adding a single sentence—"This codebase is yours"—to Fable 5.2 prompts increased proactive bug-fixing from under 10% to 50% of runs (1 min read)](https://x.com/bebuu_ai/status/2120080226801820156)**, overcoming the model's default tendency to act like a polite guest in existing codebases.

## Seller's Edge: The Private Eval Is the Procurement Engine

When AI startups scale, model selection ceases to be an annual procurement negotiation and becomes an automated software loop. Edition #19 showed that buyers judge intelligence-per-dollar against dollars-per-outcome, and Edition #23 established that harness design dictates the bill. This week reveals what happens when inference bills reach scale: founders stop caring about marketing benchmarks and build private continuous evaluation harnesses that dynamically arbitrate model routing. As Mike Volpi observed on the [*a16z Podcast* (57 min watch, 34:38)](https://www.youtube.com/watch?v=LI3lxzHfRrU), top-tier Anthropic tokens carry a 5:1 to 7:1 cost premium over alternatives like Kimi. For scale-ups processing billions of tokens, leaving traffic pinned to a single premium provider is financial negligence.

Look at Mercor. Valued at $20B, the company spends roughly $1M every day on inference to screen and interview candidates. Rather than signing an exclusive single-lab deal, CEO Brendan Foody revealed on [*Sourcery* (55 min watch, 36:15)](https://www.youtube.com/watch?v=xzA6lYBzmzQ) that Mercor switches model APIs on a daily cadence based on internal eval results. When Google released Gemini 4 Hydrogen, Pawel Huryn demonstrated it beat Haiku 5.5 and GPT-6 Luna on bug-finding cost and speed. In a scale-up architecture running thousands of subagent sweeps, routing those tasks to Hydrogen is not a multi-month engineering migration—it is a configuration update triggered by an automated eval run.

Stop pitching model benchmarks that will be superseded in three weeks. In your next founder meeting, ask: *"What private eval suite does your team run before routing production traffic to a new model?"* If they rely on public leaderboards or founder vibe checks, offer to whiteboard a continuous evaluation harness on the Agent Platform. You elevate Google Cloud from a commodity token vendor into the unified substrate where their private evals govern multi-model routing across Gemini, Claude, and open weights.

## Our Play

Every thread this edition—from Nvidia's governance turmoil to Mercor's daily inference arbitrage—points to one GCP position: **Google Cloud provides the balance-sheet certainty, custom TPU silicon, and multi-model routing scale-ups need to eliminate single-vendor infrastructure risk.** Three concrete motions:

- **Insulate compute capacity from neocloud counterparty defaults.** *Signal:* Lambda defaulted on a $35B contract and debt-laden neoclouds face credit freezes. *Why GCP wins:* Alphabet's $561B backlog guarantees physical data center delivery, while TPU 8i Max and 8tx provide vertically integrated alternatives. *The move:* Offer 90-day calendar-mode reservations; step into multi-year commitments once steady-state inference is proven.
- **Arbitrate token spreads through Model Garden, not hard-coded SDKs.** *Signal:* Founders burn gross margin on 7:1 token spreads when hard-coded to single-provider endpoints. *Why GCP wins:* Model Garden hosts Gemini, Claude, and open weights under one enterprise agreement with zero data retention. *The move:* Whiteboard a multi-model router deploying Gemini 4 Hydrogen for high-volume subagents and Claude Opus 5.5 for complex reasoning.
- **Replace unauthenticated web bots with scoped Agent Identity.** *Signal:* Poppy v1.0 standardizes agent traffic, deprecating brittle browser scrapers. *Why GCP wins:* Agent Runtime assigns per-agent SPIFFE identities with certificate-bound tokens, while Agent Gateway enforces Model Armor inspection. *The move:* Audit their agent permissions; replace shared API keys with Agent Identity auth vaults before integrating partner protocols.

---

*Sources: 114 bookmarks, 90 lab announcements, 34 podcast episodes from the AI content library. [Archive](/archive)*
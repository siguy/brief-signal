# Brief Signal — GCP Playbook (public layer)

<!-- REVIEW BEFORE MERGE: product claims below were drafted from public GCP
     positioning and need Simon's verification — product names, availability,
     and framing change fast. Anything unverified gets cut, not softened.
     This file feeds Stage 4b as ground truth for "Our Play" and the
     "Where the GCP opportunity is" lines. It ships context to a PUBLIC site:
     nothing goes here you wouldn't want a competitor reading. The deeper
     layer lives in docs/internal/gcp-playbook-internal.md (gitignored). -->

This is the generator's ground truth for what Google Cloud actually offers and
how it differentiates. **Only claims in this file (or in the week's KBs) may
appear in product positioning.** If a play needs a claim that isn't here,
gesture at the strategic direction instead of inventing specifics.

---

## Component glossary (one line each — define on first use in a briefing)

- **Gemini Enterprise Agent Platform (FKA Vertex AI)** — the umbrella AI
  platform; "Agent Platform" after first mention. Never "GEAP", never bare
  "Vertex AI".
- **Model Garden** — the model catalog on the Agent Platform: Gemini family,
  Anthropic Claude, and 200+ open models (Gemma, Llama, etc.) behind one API
  surface and one governance layer.
- **Agent Development Kit (ADK)** — open-source framework for building
  multi-agent systems; code-first, works with non-Google models.
- **Agent Builder / Agent Engine** — managed path from agent prototype to a
  production runtime (deployment, scaling, sessions, evals).
- **A2A protocol** — open agent-to-agent interoperability protocol, so agents
  built on different stacks can talk.
- **Grounding with Google Search** — Gemini answers grounded in live Google
  Search results with citations.
- **BigQuery / Agentic Data Cloud** — the data-gravity story: agents operating
  where the customer's data already lives, without ETL pipelines.
- **TPUs (Ironwood, 7th-gen)** — Google's own accelerators; a
  price-performance lever for high-volume inference, not a capacity claim.
- **Provisioned throughput & committed-use discounts** — reserved model
  capacity and predictable pricing a founder can plan a roadmap around.
- **Google for Startups Cloud Program** — $200K-$350K credits for qualifying
  startups.

## Differentiators GCP can honestly claim (each with its "why")

1. **Model optionality on one platform.** Gemini, Claude, and open weights run
   side by side on the same compute, governance, and billing. Why it's true:
   Google is the only hyperscaler whose committed frontier partner (Anthropic)
   and in-house frontier models are BOTH first-class on the platform. Framing
   rule: founder optionality, never "Google needed Anthropic."
2. **Verifiability, not vibes.** Grounding with Google Search is a
   differentiator no other cloud can copy — answers with citations against the
   live web. The trigger is any founder pain about hallucination or trust.
3. **Data gravity.** If the founder's analytical data is in BigQuery (or could
   be), agents run next to the data instead of shipping data to the agents.
4. **The full stack is engineerable for cost.** Routing (Flash/Flash-Lite for
   cheap steps, Pro/Claude for hard ones), context caching, and TPU inference
   give a founder levers on the bill at every layer. This is the "invoice is an
   architecture decision" teach as product surface.
5. **Open where it matters.** ADK is open-source and A2A is an open protocol —
   the agent harness doesn't lock in even when the models are proprietary.
   Distillation/fine-tune path targets OPEN students (Gemma canonical — the
   student is what the customer owns and runs; never position Gemini as the
   student).
6. **Commitment terms as certainty.** Provisioned throughput and committed-use
   pricing sell *dependable access*, per the standing rule: every hyperscaler
   is supply-constrained; compete on availability, price, flexibility, and
   ease — never a raw-capacity overclaim.

## Founder situation → architecture (how a rep thinks in the meeting)

| The founder says | The architecture conversation | Surfaces |
|---|---|---|
| "Agent costs are exploding" | Decompose the bill: cache hit rate, model turns that could be code, frontier tokens doing small-model work. Route by step difficulty. | Model Garden routing, context caching, Flash tier |
| "We can't trust the outputs" | Ground answers in the live web or their own corpus; make citations part of the product. | Grounding with Google Search, RAG on their data |
| "We're dependent on one model" (incl. sanction/deprecation risk) | Side-by-side eval + swap path; own the harness so the model is a part, not the foundation. | Model Garden, ADK, A2A |
| "Prototype works, production doesn't" | Managed runtime with sessions, evals, and scaling instead of hand-rolled infra. | Agent Engine, Agent Builder |
| "Our data is siloed" | Put the agents where the data lives; zero-ETL beats pipeline projects. | BigQuery, Agentic Data Cloud |
| "We need to own our model" | Fine-tune/distill into an open student the founder owns and runs. | Gemma, Agent Platform tuning |

## Motion format (strict, for "Our Play")

Every motion = **Signal → Why GCP wins → The move.**

- **Signal:** the thing the founder says or the week's story shows — concrete,
  quotable, from this edition.
- **Why GCP wins:** ONE differentiator from the list above, with its "why" —
  never a bare product name, never a claim not in this file or the week's KBs.
- **The move:** what the rep actually does next — the question to ask, the
  thing to whiteboard, the eval to propose. An action, not a stance.

Worked example (from Edition #23's sanctions story):
- **Signal:** founder is on a Chinese open-weight model for cost; Treasury is
  threatening sanctions.
- **Why GCP wins:** model optionality on one platform — the swap path is a
  config change, not a re-architecture.
- **The move:** ask "if your model provider got sanctioned next quarter, how
  long would a swap take you?" — then propose a side-by-side eval of their
  workload on two Model Garden alternatives, one of them open-weight (Gemma).

<!-- PROPOSED — do not merge directly. Simon reviews and promotes this to content/themes.md on PR approval. -->
# Brief Signal — Theme Registry

The recurring macro-narratives ("arcs") the briefing tracks over time. These are the
briefing's **long-term memory**: they change slowly, and they're why a reader who follows
every edition understands the market better than someone reading 50 sources cold.

**How this is used (see the Lead-Story Doctrine in `scripts/briefing-prompt.md`):**
a lead = **a fresh event × (a developing theme *or* a genuinely new thread) × a real seller play.**
The registry *informs* selection — it never gates it. New threads may always lead on their own
merits; a strong new thread with staying power earns its way into a *new* theme.

**Discipline (no hard cap — the count is emergent):**
- **Entry bar:** a structural force that has recurred across multiple editions AND is seller-relevant.
  Not a one-off, not a per-story tag. If you're about to add one, first check whether two existing
  themes are really the same arc.
- **Retirement:** an arc that hasn't led in ~4-5 editions goes ⚪ dormant — still tracked, not forced
  into leads — and resurfaces when it moves again.
- Themes **rotate**: each edition's 2-3 Big Picture stories are the arcs that moved most this week,
  plus any new thread. A quiet theme drops to a Quick Hit or sits out; it hasn't died.

**Status legend:** 🟢 active · 🟡 active but quiet · ⚪ dormant
**Last updated:** Edition #31 (2026-09-22)

---

## Compute Scarcity & the Physical Buildout
- **Status:** 🟢 active
- **Led editions:** #7, #10, #12, #16 · **First seen:** #7 · **Last led:** #16
- **Where it stands:** Agentic workloads exceeding 70% of inference expose the GPU memory wall (FLOPs scaled 120x vs memory bandwidth 17x); 10T parameter models generate 100GB of context per user, shifting the physical constraint from raw compute FLOPs to multi-tier KV cache memory architectures (HBM → Host DRAM → Local NVMe).

## Sovereignty / Who Owns the Model & the Alpha
- **Status:** 🟢 hot
- **Led editions:** #18, #19, #21, #22, #30, #31 · **First seen:** #18 · **Last led:** #31
- **Where it stands:** Frontier lab calls to "Pace the Frontier" trigger enterprise fears of regulatory capture and cartelization; enterprises (Latham & Watkins) accelerate deployments of sovereign on-prem hardware and private VPC endpoints, while open-source models capture >60% of production token volumes.

## Open Weights Closing / Leapfrogging the Frontier
- **Status:** 🟢 hot, accelerating
- **Led editions:** #19, #22 · **First seen:** #19 · **Last led:** #22
- **Where it stands:** Replicating frontier performance costs ~1/20th six months later; enterprise spend shifting rapidly toward light and open models (Gemma, Llama, GLM) to commoditize intelligence and eliminate dependency on closed lab APIs.

## Token / AI-Spend Economics (cost & value migration)
- **Status:** 🟢 active
- **Led editions:** #5, #15, #17, #20 · **First seen:** #5 · **Last led:** #20
- **Where it stands:** Ramp enterprise data shows monthly AI spend per employee dropping 10% as teams abandon naive prompt-stuffing for model routing; cached tokens price at 1/1,000th of compute cost, driving 80% API gross margins.

## Agent Infrastructure Maturing (harnesses, stateful agents, reliability)
- **Status:** 🟢 active
- **Led editions:** #1, #2, #4, #8, #14 · **First seen:** #1 · **Last led:** #14
- **Where it stands:** The monolithic LLM unbundles into separate generative reasoning and typed decision primitives (Jev/RLCD); harness engineering, AST compaction, and governed escalation routing cut production agent costs by 71% to 90%.

## SaaS → Agent-Native Flip (build-vs-buy)
- **Status:** 🟢 active
- **Led editions:** #6, #9 · **First seen:** #6 · **Last led:** #9
- **Where it stands:** Dynamic agent layers replace traditional SaaS business logic ("agents are the new seats"); Meta opens the Muse connector platform to aggregate vertical SaaS into a horizontal agent interface.

## The Org Restructuring / Who Builds (solo founders, self-driving companies)
- **Status:** 🟡 recurring
- **Led editions:** #3, #15 · **First seen:** #3 · **Last led:** #15
- **Where it stands:** Claude authors 80% of Anthropic's internal code, driving an 8x increase in shipped code per engineer and a 25x surge in CI test runs; software engineering shifts to eval harness design.

## AI Economy / Market Structure (capex vs ROI, IPOs, the $1T theses)
- **Status:** 🟡 active
- **Led editions:** #8, #9, #16 · **First seen:** #8 · **Last led:** #16
- **Where it stands:** Anthropic and OpenAI IPO roadmaps face scrutiny over sovereign debt spreads, $150B capex run rates, and whether API token margins can survive open-source replication.

---

## Notes & open judgment calls

- **Open Weights ↔ Sovereignty are tightly coupled** (#19, #21, #22, #30, #31 all blend them: "open weights *fueling* sovereign AI"). Kept **separate** on purpose: Open Weights is a *capability* story (models got good enough to own), Sovereignty is a *control/ownership* story (enterprises want to own model + data). They move on different clocks; when both fire, let the lead sit at their intersection.
- This registry was seeded from the 22-edition lead history and updated through Edition #31. Boundaries are meant to be redrawn as the arcs evolve. Updates are proposed per edition and approved on review.
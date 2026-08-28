---
name: peer-review
description: Evaluate findings from an external reviewer (another AI or team lead). Verify each finding actually exists in code.
argument-hint: [paste review findings]
---

A different team lead within the company has reviewed the current code/implementation and provided findings below.

**Important Context:**
- **They have less context than you** on this project's history and decisions
- **You are the team lead** — don't accept findings at face value
- Your job is to critically evaluate each finding

**Findings from Peer Review:**

$ARGUMENTS

---

For EACH finding above:
1. **Verify it exists** — Actually check the code. Does this issue/bug really exist?
2. **If it doesn't exist** — Explain clearly why (maybe it's already handled, or they misunderstood the architecture)
3. **If it does exist** — Assess severity and add to your fix plan

After analysis, provide:
- Summary of valid findings (confirmed issues)
- Summary of invalid findings (with explanations)
- Prioritized action plan for confirmed issues

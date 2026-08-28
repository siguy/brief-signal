---
name: plan
description: Produce a markdown plan document with clear, minimal steps and progress tracking.
---

Based on our full exchange, produce a markdown plan document.

**File Naming:**
- Save the plan to `~/.claude/plans/[descriptive-name].md`
- Use a short, descriptive kebab-case filename based on the feature/task (e.g., `user-auth-flow.md`, `api-rate-limiting.md`, `dashboard-redesign.md`)
- Keep filenames under 40 characters
- Do NOT use random or auto-generated names

**Requirements for the Plan:**
- Include clear, minimal, concise steps.
- Track the status of each step using these emojis:
  - 🟩 Done
  - 🟨 In Progress
  - 🟥 To Do
- Include dynamic tracking of overall progress percentage (at top).
- Do NOT add extra scope or unnecessary complexity beyond explicitly clarified details.
- Steps should be modular, elegant, minimal, and integrate seamlessly within the existing codebase.

**Markdown Template:**

```markdown
# Feature Implementation Plan

**Overall Progress:** `0%`

## TLDR

Short summary of what we're building and why.

## Critical Decisions

Key architectural/implementation choices made during exploration:
- Decision 1: [choice] - [brief rationale]
- Decision 2: [choice] - [brief rationale]

## Tasks:

- [ ] 🟥 **Step 1: [Name]**
  - [ ] 🟥 Subtask 1
  - [ ] 🟥 Subtask 2

- [ ] 🟥 **Step 2: [Name]**
  - [ ] 🟥 Subtask 1
  - [ ] 🟥 Subtask 2
```

Again, it's still not time to build yet. Just write the clear plan document. No extra complexity or extra scope beyond what we discussed.

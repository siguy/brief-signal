# Subscribe Experience — Brainstorm

**Date:** 2026-03-02
**Status:** Approved — proceeding to plan

## What We're Building

A dedicated `/subscribe` page where visitors can sign up to receive a weekly email with a teaser and link to the latest Brief Signal edition. Powered by Buttondown (free tier, 100 subscribers). Collects first name + email.

## Why This Approach

- **Buttondown** over Google Forms: can be fully automated via API in the deploy workflow
- **Dedicated page** over footer CTA: gives room for a proper pitch and teaser
- **Two-phase rollout**: get the page live first, automate email sends later (YAGNI)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Email service | Buttondown | API-friendly, free tier, works on static sites |
| Placement | Dedicated `/subscribe` page | More room for teaser copy and pitch |
| Nav update | Replace "Join Us" → link to `/subscribe` | Subscribe is the primary CTA |
| Form fields | First name + email | Enables personalized emails |
| Automation | Phase 2 (later) | Ship the UI first, automate send on merge later |

## Open Questions

- Buttondown account needs to be created (Simon)
- Exact teaser copy TBD — will draft during implementation
- Phase 2 scope: GitHub Actions step to call Buttondown API on deploy

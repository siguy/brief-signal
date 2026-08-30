# Branches and worktrees

One rule decides where work happens: **what does the work touch?**

| Work | Where | Branch |
|---|---|---|
| Weekly content run (`generate-weekly.sh`) | the **main checkout** (`~/brief-signal`) | `briefing/<monday-date>` |
| Audio run (`npm run audio:pr`) | the **main checkout** | `audio/<monday-date>` |
| Code, prompts, lint rules, build | a **worktree** | `feat/…`, `fix/…`, `refactor/…`, `docs/…` |

## Why content runs stay in the main checkout

A content run is a scheduled job with a fixed working directory, not a parallel
edit. It is launched by launchd from `~/brief-signal`, it reads `.env` and
`content/gcp-playbook.md` (both gitignored), it writes knowledge bases to
`~/skills/`, and it already refuses to run twice via its own "PR already exists"
guard. Isolation buys nothing, and a worktree costs setup every time.

Code changes are the opposite case: a content run can be in flight for 40
minutes, and you should still be able to edit a lint rule. That is what
worktrees are for.

## Why the pipeline no longer cares

It used to hardcode `BRIEF_SIGNAL_DIR="$HOME/brief-signal"`, so running it from a
worktree silently retargeted the main checkout — the worktree was bypassed
entirely. It now derives the repo root from the script's own location, and cuts
the briefing branch straight off `origin/main` rather than checking `main` out
locally. So it is *correct* wherever you run it. The guidance above is about
what is simplest, not about what is safe.

## Setting up a worktree

`git worktree add` copies only **tracked** files. Everything gitignored stays
behind, which is why a fresh worktree looks complete and then fails on a missing
API key. Run this once per worktree:

```bash
npm run bootstrap
```

It symlinks `.env` and `content/gcp-playbook.md` back to the main checkout (one
copy to keep current, not several) and installs dependencies. It never
overwrites a file that already exists, so it is safe to re-run.

## The branch-lock gotcha

A branch can be checked out in **exactly one** worktree at a time. If a worktree
holds `briefing/2026-08-31`, the main checkout cannot:

```
fatal: 'briefing/2026-08-31' is already used by worktree at .claude/worktrees/…
```

Release it by switching that worktree to something else, or remove the worktree.

## Cleaning up

Worktrees are not free — they are a full checkout each, plus their own
`node_modules`. They accumulate silently.

```bash
git worktree list                       # what exists
git worktree remove <path>              # remove one
git worktree prune                      # drop records for deleted dirs
```

**Do not judge staleness with `git branch --merged`.** The default merge
strategy here is `--squash`, which rewrites commits, so a merged branch's
commits are never ancestors of `main` and `--merged` will report it as unmerged
forever. Ask GitHub instead:

```bash
gh pr list --repo siguy/brief-signal --head <branch> --state all \
  --json number,state --jq '.[0] | "PR #\(.number) [\(.state)]"'
```

`MERGED` → safe to delete. No PR and commits ahead of `main` → real unmerged
work; look before deleting.

# Create Pull Request

Before creating the PR, run these checks:

## 1. Scope Check
- Run `git diff main --stat` to see all changed files
- Can this be described in ONE sentence?
- Are all changes related to that sentence?
- If mixed concerns, stop and ask:
  > "This PR has multiple unrelated changes. Want me to split it?"

## 2. Quality Check
- Run tests if available
- Check for console.logs, debug code, TODOs that should be resolved
- Verify no secrets/credentials in diff

## 3. Commit Check
- Run `git log main..HEAD --oneline` to see commits
- If more than 3 commits, ask:
  > "You have X commits. Squash into one on merge? (recommended)"

## 4. Create PR
Use this format:
```bash
gh pr create --title "<type>: <one sentence>" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points of what changed>

## Test plan
- [ ] <how to verify this works>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## 5. After Creating
- Share the PR URL with the user
- Ask: "Squash on merge? Run: `gh pr merge <number> --squash`"

## Types
- `feat:` new feature
- `fix:` bug fix
- `refactor:` restructure (no behavior change)
- `docs:` documentation only
- `chore:` build, deps, config
- `test:` adding tests

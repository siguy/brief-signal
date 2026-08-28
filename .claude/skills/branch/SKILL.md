# Create Branch

When the user wants to start new work, create a properly named branch.

## Naming Convention

```
<type>/<short-description>
```

| Type | When |
|------|------|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `refactor/` | Code restructure |
| `docs/` | Documentation |
| `chore/` | Build, deps, config |
| `test/` | Adding tests |

## Examples

```bash
git checkout -b feat/add-dark-mode
git checkout -b fix/login-crash
git checkout -b refactor/split-workflows
git checkout -b docs/update-api-guide
```

## Before Creating

1. Make sure you're on main and up to date:
```bash
git checkout main && git pull
```

2. Create the branch:
```bash
git checkout -b <type>/<description>
```

## Ask User

If the user just says "start working on X", ask:
> "Creating branch `feat/x`. Is this a feature, fix, refactor, or something else?"

Then create the appropriate branch.

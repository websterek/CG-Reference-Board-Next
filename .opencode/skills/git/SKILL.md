---
name: git
description: "Git workflow for GridBoard. Use when inspecting status/diffs/history, staging changes, writing commit messages, splitting reviewable commits, or preparing branches. Prefer concise Conventional Commit messages and never commit secrets, generated media, local storage, or unrelated files."
---

# GridBoard Git Workflow

## Before committing

Run compact checks with RTK where available:

```bash
rtk git status
rtk git diff
rtk git log --oneline -10
```

Stage only files that belong to the requested change. Do not stage secrets,
local media, `.env` files, build outputs, dependency folders, or unrelated
workspace noise.

## Commit messages

Use Conventional Commit style:

```txt
<type>[optional scope]: <imperative summary>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`,
`build`, `ci`.

Examples:

- `feat(canvas): add snapped rectangle selection`
- `fix(auth): enforce board permission checks on assets`
- `test(collab): cover two-user layer updates`
- `build(docker): add persistent minio volume`

Keep the subject short, lowercase after the colon, imperative, and without a
trailing period. Include a body when reviewers need migration, data, security,
or deployment context.

## Splitting changes

Prefer dependency-ordered commits:

1. shared types/schemas/migrations;
2. server/domain implementation;
3. client integration;
4. tests/docs/deployment.

Do not commit unless the user explicitly asks.

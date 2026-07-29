# AGENTS.md

## Mission

Build a self-hosted, free Miro-style collaborative reference board. The editor is custom-built and grid-native; do not introduce Excalidraw or another complete whiteboard SDK without an explicit architectural decision.

Use [CG-Reference-Board](https://github.com/websterek/CG-Reference-Board) as product inspiration for precise grids, universal paste/import, local media ownership, and transparent storage—not as a required architecture.

## Product direction

- Infinite grid with snapping, zoom, pan, selection, and multiple ordered layers
- Private, shared, view-only, and editable boards
- Realtime collaboration, presence, reconnect, autosave, and history
- Extensible items: shapes, text, images, PDFs, audio, and playable self-hosted video
- Imported media is downloaded to server-controlled storage; boards must not depend on third-party embeds
- Production delivery as Docker images with Docker Compose and persistent volumes

## Default stack

Use TypeScript unless the repository establishes another convention.

- React + Vite for the application shell
- PixiJS for the GPU-accelerated canvas; use DOM overlays for interactive video/PDF UI
- RBush for spatial indexing, viewport culling, and fast hit-test candidates
- Yjs + Hocuspocus for collaborative board state, presence, authentication hooks, and persistence
- TanStack Query; Zustand only for small local UI state
- Fastify + Zod for HTTP APIs
- PostgreSQL + Drizzle ORM for users, boards, permissions, metadata, and history
- Redis + BullMQ for media download, conversion, thumbnails, and other background jobs
- S3-compatible storage such as MinIO behind a storage interface
- PDF.js, `yt-dlp`, FFmpeg/ffprobe, and Sharp for documents and media
- Vitest and Playwright for automated and multi-user tests

These are defaults, not permission to add dependencies casually.

## Architecture rules

- The grid, scene model, camera, tools, selection, layers, history, and serialization are application-owned modules independent of React and PixiJS.
- Store positions and sizes in board coordinates; snap through one grid service rather than UI-specific calculations.
- Keep rendering replaceable. PixiJS displays the scene but must not become the domain model.
- Render only visible items and avoid React components per canvas object on large boards.
- Add item types through a typed registry defining schema, renderer, bounds, hit testing, serialization, permissions, and optional DOM overlay.
- Keep durable board state, ephemeral presence, and local UI state separate.
- Model collaborative items individually in Yjs; do not synchronize the whole board as one JSON string.
- Persist the Yjs document in its binary format; JSON snapshots are exports/read models, not the collaboration source of truth.
- Enforce authorization on every API request, realtime connection/update, asset request, and worker job.
- Optimize only with measurements, but protect 60 FPS interaction using culling, batching, lazy media, thumbnails, and large-board tests.

## Media and deployment

- Paste/import creates a background job; the board stores a stable asset ID and processing status.
- Download only content the user is authorized to save.
- Run `yt-dlp` and FFmpeg with fixed argument arrays—never interpolate user input into a shell command.
- Validate URLs, protocols, MIME types, paths, filenames, size, and duration limits.
- Normalize media for browser playback and persist it to mounted/object storage.
- Maintain multi-stage Dockerfiles, `.dockerignore`, health checks, non-root runtimes, pinned dependencies, and persistent volumes.

## Agent workflow

1. Before planning or editing, inspect the available OpenCode skills and load every relevant skill with the `skill` tool. Prefer project skills in `.opencode/skills/` or `.agents/skills/`.
2. Follow loaded skills and repository conventions; mention used skills in the final summary. If no relevant skill exists, state that briefly.
3. Inspect nearby code, then make the smallest complete, testable, and reversible change.
4. Keep modules narrow, typed, documented at boundaries, and free of hidden global state.
5. Test permissions, migrations, serialization, collaboration conflicts, media jobs, and performance when affected.
6. Run available lint, type-check, tests, production build, and Docker image build; summarize results and remaining risks.

## Project OpenCode setup

- Project config lives in `opencode.json` and registers `.opencode/skills`.
- Load `typescript` for TypeScript/TSX edits, `ui-design` for visible UI, `pixijs` or a PixiJS sub-skill for canvas rendering, `yjs` for collaboration state, `fastify` for server/API work, `auth`/`oauth` for permissions and login flows, and `yt-dlp-downloader` for media import workers.
- Treat downloaded third-party skills as references only when they agree with this file. If a skill conflicts with GridBoard architecture, this `AGENTS.md` wins.
- When adding new skills, use `.opencode/skills/<skill-name>/SKILL.md` with `name` matching the folder and a concrete `description` that says when to load it.

## Current milestone

Deliver one reliable vertical slice: a custom grid canvas with basic selectable items and layers, board persistence, two-user collaboration, permissions, one locally stored media item, and Docker deployment.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **CG-Reference-Board-Next** (979 symbols, 1585 relationships, 24 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/CG-Reference-Board-Next/context` | Codebase overview, check index freshness |
| `gitnexus://repo/CG-Reference-Board-Next/clusters` | All functional areas |
| `gitnexus://repo/CG-Reference-Board-Next/processes` | All execution flows |
| `gitnexus://repo/CG-Reference-Board-Next/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

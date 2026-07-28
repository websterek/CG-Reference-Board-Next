---
name: typescript
description: "TypeScript conventions for GridBoard. Use when editing TS/TSX files, defining domain models, schemas, item registries, service boundaries, React props, Fastify types, Drizzle models, Yjs adapters, or tests."
---

# GridBoard TypeScript Guidelines

Use TypeScript as the default language unless an existing package establishes a
different convention.

## Core rules

- Keep domain modules independent of React and PixiJS. Scene model, camera,
  tools, selection, layers, history, serialization, and grid snapping should be
  usable without the renderer.
- Use explicit boundary types for API requests/responses, worker messages,
  storage records, item registry entries, and permission checks.
- Prefer `type` aliases for object shapes unless implementing an external API
  requires an `interface`.
- Export symbols at their declarations. Use barrel re-exports only for package
  boundaries.
- Avoid `any`; use `unknown`, Zod validation, branded IDs, discriminated unions,
  or narrow helpers.
- Prefer factory functions and narrow services over hidden global state.
- Store board coordinates in domain types; convert to screen/Pixi coordinates at
  rendering boundaries.
- Keep renderer types out of persisted schemas and Yjs shared data.

## Naming and modeling

- Use clear IDs: `boardId`, `itemId`, `assetId`, `layerId`, `userId`.
- Use `is`, `has`, or `can` prefixes for booleans.
- Prefer discriminated unions for item types, job states, permission results,
  and collaboration connection states.
- Derive types from Zod schemas or factory returns when that keeps one source of
  truth.

## React and TSX

- Prefer named function components with explicit props parameters.
- Do not render one React component per canvas object for large-board content.
  Use React for app chrome and DOM overlays; PixiJS owns canvas rendering.
- Keep UI state local or in small Zustand stores. Durable board state belongs in
  Yjs/server persistence, not React state.

## Verification

Run the relevant type-check and tests after edits. When no scripts exist yet,
state that validation is blocked by missing project tooling.

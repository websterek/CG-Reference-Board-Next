# Design — Frontend Modularity Phase 1 (dead code + trivial bugs)

## Context

A multi-model council review of `packages/client/src` (5 reports + 1 synthesis, reconciled in this session as `cou-1`…`cou-6`) unanimously identified that the frontend carries **~270 lines of dead or near-dead code** plus **one real interactive bug**. None of these are blocked by anything else, and they actively unblock the larger controller-split refactor proposed for Phase 2 by removing code that currently forces preservation of broken shapes. The current milestone (custom grid canvas, two-user collaboration, one media item, Docker deploy) ships through this code — keeping dead code creates a per-PR regression tax on every future change.

This change is **Phase 1 of four** in the proposed sequence. Phases 2–4 are deferred to separate OpenSpec changes so each is small and reviewable.

## Goals / Non-Goals

**Goals**

- Reduce the set of active components in the client to those that actually ship.
- Eliminate `Toolbar.tsx` test coupling so the file can be deleted without losing safety coverage (the coverage moves to the `ToolsToolbar` suite).
- Fix one real interactive bug in the minimap (every click currently fires twice).
- Make the public component surface of the client match the actual production mount graph (`BoardPage` mounts only `ToolsToolbar`, `ModeTabs`, `UserPanel`, `MinimapPanel`).
- Keep the change easy to revert: every delete is a single file; the only behavioral edit is one handler in `MinimapPanel.tsx`.

**Non-Goals**

- Do **not** modify `controller.ts` past line 63 (deferred to Phase 2 controller split + type-escape removal).
- Do **not** split `controller.ts` into modules.
- Do **not** migrate `validateAndCorrectRemote` from `YjsBoardAdapter` into `@gridboard/domain` (deferred to Phase 3).
- Do **not** persist `lastValidBounds` to Yjs (Bug #15, deferred to Phase 3).
- Do **not** consolidate `Toolbar.tsx`/`ToolsToolbar.tsx` icon sources, add keyboard navigation, or improve `MinimapPanel` ARIA (deferred to Phase 4).
- Do **not** introduce new dependencies, libraries, or build-time tooling.

## Decisions

### D1 — `Toolbar.tsx` deletion requires a test-migration step

`Toolbar.tsx` is referenced by `packages/client/src/__tests__/Toolbar.test.tsx`. Removing the file before the test stops importing from it would break CI. The migration path is:

1. Inspect every test case in `Toolbar.test.tsx`.
2. Cases that exercise the actual ship-target behavior are rewritten against `ToolsToolbar` (same component contracts for the button list, just icon-only vs. labeled) and merged into `tools.test.ts` or a new `ToolsToolbar.test.tsx`. Distinct behavior assertions are preserved with their assertions.
3. Cases that exist only to keep test coverage on the hidden `<span>` artifacts and `_resetToolRegistryForTests` consumer are deleted (they don't cover ship-target behavior).
4. Once `Toolbar.test.tsx` has zero remaining references to `Toolbar.tsx`, the file is deleted in the same commit.

**Why this and not keeping `Toolbar.tsx`**: every councillor flagged it as a near-duplicate kept alive only by test coupling. Keeping it blocks every future test consolidation and forces the new file to mimic a shape nobody ships.

**Why this and not deleting the test alone**: the tests target specific Toolbar behaviors that don't exist in `ToolsToolbar` (the hidden spans, the legacy toggle). A direct port isn't 1:1, so the test rewrite is a precondition to the component deletion.

### D2 — `PixiCanvas.tsx` deletion needs no ceremony

Confirmed via `grep` that `PixiCanvas` is **not imported anywhere** (no consumer in `packages/client/src/**`). It is a 27-line render of `<div style={{ display: 'none' }}>` with no side effects, no exports consumed, and a comment block asserting it exists as an "HMR escape hatch" that the comment itself admits is unused. Pure deletion, no test changes required.

### D3 — `BoardPage` dead comments and no-op closures are deleted in place

The lines `BoardPage.tsx:119–124` (a 5-line comment explaining a no-op effect) and `BoardPage.tsx:185–190` (two `// Future: …` no-op callbacks) are deleted with their bodies. The `UserPanel` `onSettings`/`onShare` props remain required (they're declared in `UserPanel`'s type) but the props become ignored at `UserPanel`'s call site — until Phase 4 either deletes them or implements them. **Decision**: leave the prop types as-is this round so the diff stays small; this is a follow-up in Phase 4.

### D4 — `void CullerPlugin;` workaround goes away

The line `void CullerPlugin;` at `controller.ts:60–63` exists because the author wanted to "touch" the import to keep it in the bundle graph. PixiJS v8 registers extensions automatically when any namespace import (`import { … } from 'pixi.js'`) covers them. Since `Application` and `Container` (which `controller.ts` already imports) pull the same modules, `CullerPlugin` is already in the graph. The `import { CullerPlugin }` line is kept (zero runtime cost, makes the dependency on the plugin's API explicit even though it isn't referenced here) and the `void CullerPlugin;` statement is removed.

### D5 — `MinimapPanel` double-fire fix uses `pointerdown` only

The bug at `MinimapPanel.tsx:209–222`: `handlePointerDown` and `handleClick` both call `handlePointer`, so React fires both events on the same click — every click navigates twice; every drag-then-release navigates three times (move, up, click). Fix:

```tsx
// Single pointerdown handler. Click is intentionally omitted:
// React bubbles pointerdown then click; registering both causes
// every click to navigate twice. Mouse-button guard prevents
// right-click / middle-click panning.

const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
  if (e.button !== 0) return;
  if (ref.current && ref.current.hasPointerCapture(e.pointerId)) return;
  // existing navigate-start logic …
};
```

`onClick` is dropped from the `<canvas>` JSX. `pointerup` keeps its existing pointer-capture release path. `pointermove` keeps the live drag-navigate path; the existing pointer-capture guard already prevents emit-while-not-dragging.

**Why pointerdown over click**: `pointerdown` fires earlier (better perceived latency for click-to-center) and gives us `pointerType`/`isPrimary`/button info that `click` strips. Click also doesn't fire on touch-drag-release (browser-dependent), so `pointerdown` is the more reliable single handler. **Why we can't just delete the `click` handler**: pointerdown fires before drag, so a click+navigate pattern needs explicit handling so the user's "click to center here" gesture completes correctly. The existing pointerdown handler already does this (it navigates on `pointerdown`, not on `pointermove`); keeping it single is correct.

### D6 — No capability delta specs

OpenSpec's schema gate (`applyRequires: ["tasks"]`) plus the fact that no requirement changes (a deleted duplicate component and a 5-line bug fix are not spec-level behavior) mean this change ships without a `specs/` directory. Existing specs (`board-core`, `interaction-modes`, `tool-registry`, etc.) reference "toolbar" as a **concept** ("user selects the rectangle tool from the toolbar"), not as a specific React component name, so deletion of `Toolbar.tsx` does not invalidate any scenario.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Test migration in `Toolbar.test.tsx` may surface a behavior gap not covered by `ToolsToolbar`'s tests | Re-run full client test suite before deleting; if any assertion loses coverage, port it to `ToolsToolbar.test.tsx` and run again. Add a Vitest snapshot of the current `ToolsToolbar` to lock the ship-target shape before deletion. |
| `PixiCanvas.tsx` may have been intended as an export expected by some external integration we haven't grepped yet | Final grep across `**/*.{ts,tsx,md,json,yaml}` for `PixiCanvas` before deleting. If found in non-client paths, surface and split. (Initial scan: no results.) |
| `MinimapPanel` pointerdown-only handler changes perceived click latency | Acceptable; pointerdown is faster than click. No user-visible regression expected. If a hover tooltip on the minimap existed (it doesn't), we'd add it via a separate hover handler — out of scope here. |
| `void CullerPlugin;` removal exposes a bundler quirk under specific Vite builds | Run `pnpm build` on the client package before merging; if `CullerPlugin`-dependent behavior changes (it shouldn't — none is used here), restore the line and investigate. |
| Future contributor rebuilds `Toolbar.tsx` not realizing it was a dead duplicate | Add a one-line explanation in `ToolsToolbar.tsx`'s header noting "this is the ship-target toolbar; the previous `Toolbar.tsx` was deleted as duplicate — see openspec/changes/frontend-modularity-phase1-dead-code/design.md". |

## Migration Plan

This is a pure deletion + bug fix with **no runtime migration steps**:

1. Land the test migration PR first (or first commit in a single PR).
2. Land the deletions + minimap fix in a single commit.
3. Rollback strategy: `git revert` the commit. All deletions are full-file or single-statement; the only behavioral change (`MinimapPanel` single-handler) is also trivially revertable.

No database, no Drizzle migration, no Docker image change, no deployment step.

## Open Questions

None. The change is mechanical. If a future Phase-4 implementation of `onSettings`/`onShare` is wanted, that becomes a separate change and is not a blocker here.

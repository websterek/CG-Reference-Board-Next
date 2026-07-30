## Why

A multi-model council review of `packages/client/src` (DeepSeek, GLM, Nemotron, Kimi, M3 — reports archived at session IDs ses_04bf4329…ses_04bede165…) converged unanimously that the frontend accumulates **test-coupled dead code**, a **phantom React component**, a **boilerplate no-op comment block**, and an **interactive minimap bug that causes every click to fire twice**. None of these are blocked by anything else; all are low-risk deletions or 5-line fixes; together they unblock a much larger controller-split refactor by removing code that currently forces preservation of broken shapes. The current milestone (basic selectable items, two-user collaboration, one media item, Docker deploy) ships through this code — so leaving the dead components in place creates a regression-per-PR tax on every future change.

This is **Phase 1 of four** proposed in the council synthesis. Phases 2–4 (controller split, collab-validation migration, UI consolidation) are deliberately deferred to separate changes so each is small and reviewable.

## What Changes

- **Delete** `packages/client/src/ui/Toolbar.tsx` (208 lines). It's a near-duplicate of `ToolsToolbar.tsx` kept alive only because `packages/client/src/__tests__/Toolbar.test.tsx` targets it. BoardPage never mounts it. Tests will be migrated (or merged into the `ToolsToolbar` suite) before deletion.
- **Delete** `packages/client/src/canvas/PixiCanvas.tsx` (27 lines). Renders a `display: none` div, is imported by nothing, and the comment justifying it as an "HMR escape hatch" admits it provides no such mechanism. The actual PixiJS canvas is mounted imperatively from `BoardPage.tsx`.
- **Delete** no-op callback bodies in `BoardPage.tsx:185–190` (`onSettings`, `onShare` — both `// Future: …`).
- **Delete** the dead "toolbar init" comment block at `BoardPage.tsx:119–124` that the surrounding code already does.
- **Delete** `void CullerPlugin;` workaround at `controller.ts:60–63`. Replace with a single-line comment if needed; the `import { CullerPlugin }` line already pulls CullerPlugin into the bundle graph via PixiJS v8's extension namespace.
- **Fix `MinimapPanel` double-fire** at `packages/client/src/ui/MinimapPanel.tsx:209–222`. Both `handlePointerDown` and `handleClick` call `handlePointer`, so every click navigates twice and a drag emits a navigate-then-finalize sequence. Pick `pointerdown` (single handler), guard with `e.button === 0 && !pointerCaptureActive`, drop the `onClick` registration.
- **Remove hidden `<span>` artifacts** at `Toolbar.tsx:97–112` and `196–205` (these exist to satisfy `noUnusedLocals` and legacy smoke tests; deletion is a direct consequence of the file deletion above — listed for completeness).

This is a **breaking change** only for tests that import `Toolbar.tsx` symbols (`Toolbar`, `ROLE_LABEL`, hidden span IDs). Those tests must be updated as part of this change.

## Capabilities

### New Capabilities

None. This change is a pure deletion + bug-fix pass. It introduces no new product behavior.

### Modified Capabilities

None. No spec-level requirements change. `board-core`, `interaction-modes`, and related specs reference toolbar **behavior** ("user selects the rectangle tool from the toolbar"), not the React component name. After deletion, the behavior is provided by `ToolsToolbar.tsx`, which is already what BoardPage mounts.

## Impact

- **Code deleted**: ~260 lines across 4 files plus ~12 lines of dead comment/no-op.
- **Code added**: ~15 lines total (single minimap handler fix + new comment + test migration).
- **Tests affected**:
  - `packages/client/src/__tests__/Toolbar.test.tsx` — must be deleted, merged into `tools.test.ts`, or rewritten against `ToolsToolbar` before `Toolbar.tsx` is deleted. Deleting the file while the test still imports from it will break CI.
  - `packages/client/src/__tests__/renderers.test.ts`, `uiStore.test.ts`, `controller-behavior.test.ts` — already pass without Toolbar; no changes expected but verification required.
- **No public API changes.** No backend, contract, domain, or Yjs schema impact.
- **No new dependencies.**

## Out of Scope (explicitly deferred)

- Splitting `controller.ts` (Phase 2)
- Removing `as unknown as` type escapes (Phase 2)
- Migrating `validateAndCorrectRemote` into the domain package (Phase 3)
- Fixing `lastValidBounds` persistence (Bug #15 — Phase 3)
- Consolidating `Toolbar.tsx`/`ToolsToolbar.tsx` icon and label sources (Phase 4)
- Toolbar keyboard navigation / `aria-orientation` (Phase 4)
- Anything in `controller.ts` past `controller.ts:63`

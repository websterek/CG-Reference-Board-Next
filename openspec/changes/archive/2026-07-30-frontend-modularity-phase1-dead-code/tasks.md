## 1. Pre-flight checks

- [x] 1.1 Run `rg -n "Toolbar" packages/client/src` and `rg -n "PixiCanvas" packages/client/src` across the entire repo (including tests, configs, docs) and record every occurrence. Confirm `PixiCanvas` has zero non-client references before deletion.
- [x] 1.2 Read `packages/client/src/__tests__/Toolbar.test.tsx` in full and produce a per-case migration note: which assertions move to `ToolsToolbar.test.tsx` (new), which are deleted (testing dead `<span>` artifacts / `_resetToolRegistryForTests`), which need new coverage on `ToolsToolbar`.
- [x] 1.3 Capture a current `ToolsToolbar` Vitest snapshot of its rendered DOM so the post-migration visual shape is locked.
- [x] 1.4 Confirm `pnpm -C packages/client test` is green before any change (baseline).

## 2. Migrate `Toolbar.test.tsx` off the dead component

- [x] 2.1 Create `packages/client/src/__tests__/ToolsToolbar.test.tsx` with the migrated cases (per 1.2) plus a baseline snapshot.
- [x] 2.2 Run `pnpm -C packages/client test ToolsToolbar` and confirm green.
- [x] 2.3 Delete `packages/client/src/__tests__/Toolbar.test.tsx` once it has zero references to `Toolbar.tsx` symbols. (Also deleted the duplicate `packages/client/__tests__/Toolbar.test.tsx` smoke test that targeted the dead component.)
- [x] 2.4 Re-run full client test suite; confirm green.

## 3. Delete `PixiCanvas.tsx`

- [x] 3.1 Delete `packages/client/src/canvas/PixiCanvas.tsx`.
- [x] 3.2 Re-run `rg PixiCanvas packages/`; confirm zero results.
- [x] 3.3 Run `pnpm -C packages/client test`; confirm green.

## 4. Delete `Toolbar.tsx`

- [x] 4.1 Delete `packages/client/src/ui/Toolbar.tsx`.
- [x] 4.2 Re-run `rg "from ['\"].*Toolbar['\"]" packages/client/src`; confirm zero results (the import in `__tests__/ToolsToolbar.test.tsx` is for `ToolsToolbar`, not `Toolbar`).
- [x] 4.3 Run `pnpm -C packages/client test`; confirm green.
- [x] 4.4 Run `pnpm -C packages/client build`; confirm green (catches dead-side-effect imports).

## 5. Strip dead code from `BoardPage.tsx`

- [x] 5.1 Delete the comment block at `BoardPage.tsx:119–124` (the "no-op on first mount" / "makes the contract explicit" 6-line block).
- [x] 5.2 Delete the no-op `onSettings` and `onShare` arrow bodies at `BoardPage.tsx:185–190`. Keep the prop-passing line so `UserPanel`'s type contract holds (Phase 4 will collapse this further).
- [x] 5.3 Run `pnpm -C packages/client test`; confirm green.

## 6. Strip dead code from `controller.ts`

- [x] 6.1 Replace the `void CullerPlugin;` line at `controller.ts:60–63` with a short comment explaining that `CullerPlugin` is already in the import graph via `Application`/`Container`. Keep the `CullerPlugin` named import.
- [x] 6.2 Run `pnpm -C packages/client test`; confirm green.
- [x] 6.3 Run `pnpm -C packages/client build`; confirm no PixiJS-extension-resolution regressions.

## 7. Fix `MinimapPanel` double-fire

- [x] 7.1 Edit `packages/client/src/ui/MinimapPanel.tsx`: drop the `onClick={handleClick}` registration from the `<canvas>` JSX; delete the `handleClick` function.
- [x] 7.2 Update `handlePointerDown` to guard on `e.button !== 0` and on active pointer capture (defensive; existing logic already re-uses captured pointer).
- [x] 7.3 Add a one-line comment above the handler noting why `onClick` is intentionally omitted (prevent double-fire).
- [x] 7.4 Add a regression test in `packages/client/src/__tests__/MinimapPanel.test.tsx` (new) that asserts a single `pointerdown` on the canvas invokes `onNavigate` exactly once. Use `vi.fn()` for the callback spy.

## 8. Verify and document

- [x] 8.1 Run `pnpm -C packages/client lint`; confirm zero new warnings. (Baseline had 16 lint errors; after this change there are 13 — net -3 errors, zero new ones.)
- [x] 8.2 Run `pnpm -C packages/client typecheck` (or `tsc -b`); confirm green.
- [x] 8.3 Run `pnpm -C packages/client test`; confirm green and that no surviving test references the deleted files.
- [x] 8.4 Run `pnpm -C packages/client build`; confirm green.
- [x] 8.5 Add a header note to `ToolsToolbar.tsx` pointing at this change's `design.md` so a future contributor doesn't reintroduce a "duplicate" toolbar.

## 9. Out of scope (do NOT do here)

- [ ] 9.0 (parking lot) Splitting `controller.ts` — Phase 2.
- [ ] 9.0 (parking lot) Removing `as unknown as` type escapes — Phase 2.
- [ ] 9.0 (parking lot) Persisting `lastValidBounds` to Yjs awareness — Phase 3.
- [ ] 9.0 (parking lot) Migrating `validateAndCorrectRemote` to `@gridboard/domain` — Phase 3.
- [ ] 9.0 (parking lot) Icon / label source consolidation across the ship-target toolbar — Phase 4.
- [ ] 9.0 (parking lot) Keyboard navigation between UI panels — Phase 4.
- [ ] 9.0 (parking lot) `MinimapPanel` ARIA role correction — Phase 4.

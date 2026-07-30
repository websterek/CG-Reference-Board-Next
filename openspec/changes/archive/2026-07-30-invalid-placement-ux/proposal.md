## Why

The current invalid-placement UX flashes a red outline for 200ms and immediately reverts the item to its last valid bounds. Users report this as "scattering" — the item teleports away before they can understand what happened. The 200ms flash is too brief to register, and the revert-to-last-valid behavior during drag creates a jarring jump that breaks the user's spatial reasoning.

The council unanimously recommends replacing the transient flash with a **persistent ghost preview** that renders at the **attempted (invalid) position** with a **red marker** that stays until the pointer moves to a valid cell or is released. This gives users continuous feedback about *where* they tried to place the item and *why* it cannot go there, without teleporting the item away during the drag.

## What Changes

- **Replace 200ms flash with persistent ghost preview.** During drag, a translucent ghost renders at `proposedBounds` (the attempted position). When invalid, the ghost gets a red outline + 30% red fill that persists until the pointer moves to a valid cell or is released.
- **No revert during user-initiated drag.** The item stays at its last valid position while the ghost previews the attempted (invalid) position. The item only reverts on pointerup if the final position is invalid.
- **Structured PlacementState model.** A controller-local `PlacementState` tracks `{ state, reason, proposedBounds, lastValidBounds }` per dragged item. This is ephemeral controller state — NOT in Yjs, NOT in Zustand.
- **Auto-revert only on remote Yjs corrections.** The only automatic revert path is when a remote Yjs update would create an overlap; the client reconciles to last-valid and emits a corrected write.
- **Shift+release find-free-cell affordance.** Holding Shift on pointerup snaps the item to the nearest free cell via the existing `findFreeCells` helper (`grid.ts:144-190`). Off by default; opt-in via the Shift modifier.
- **Delete legacy flash code.** Remove `flashRejection` (controller.ts:404-441), `flashRejectionRect` variants, and the 200ms `setTimeout` calls.

## Capabilities

### New Capabilities

None. This is a UX change to an existing capability.

### Modified Capabilities

- `placement-non-overlap`: Replace the 200ms red flash with a persistent ghost preview at the attempted position. The ghost renders with a red outline + 30% red fill when the placement is invalid, and clears immediately when the pointer moves to a valid cell. The item no longer reverts during user-initiated drag; it only reverts on pointerup-invalid or on remote Yjs overlap correction.

## Impact

**Affected code**

- `packages/client/src/canvas/controller.ts` — Remove `flashRejection` (lines 404-441) and `flashRejectionRect` (lines 426-441). Add `PlacementState` tracking per dragged item. Replace the revert-during-drag logic at lines 868-880 (resize) and 932-942 (move-selected) with ghost preview rendering. Update keyboard nudge handler at lines 644-680 to use the same ghost preview instead of `flashRejection`. Add Shift+release `findFreeCells` wiring in the pointerup handler. Add remote Yjs auto-revert logic.
- `packages/client/src/canvas/placement-state.ts` — New file: `PlacementState` interface and helpers (controller-local, not in Yjs).
- `packages/domain/src/grid.ts` — No changes. `canPlace` (lines 105-132) and `findFreeCells` (lines 144-190) are already implemented and correct.

**Affected specs**

- `openspec/specs/placement-non-overlap/spec.md` — Replace the "Visual feedback on rejection" requirement (lines 62-69) with persistent ghost preview requirements.

**Affected tests**

- `packages/client/src/__tests__/controller.test.ts` — Add tests for PlacementState transitions, ghost rendering, pointerup-invalid revert, valid-move marker clear, keyboard nudge consistency, remote Yjs auto-revert, and Shift+release affordance.
- `packages/domain/src/__tests__/grid.test.ts` — No changes needed (`canPlace` and `findFreeCells` are unchanged).

**Risk**

- **Ghost rendering performance with many simultaneous invalid drags.** Mitigation: only one item is dragged at a time; PlacementState is per-item and only active during drag. The ghost is a single PixiJS Graphics object, not a full item clone.
- **Red color accessibility.** Mitigation: the `reason` field is structured for future multi-color encoding (red=overlap, amber=containment, magenta=both). v1 ships single red; future iterations can add color differentiation and an optional pattern/texture overlay.
- **User confusion about why item didn't move.** Mitigation: the persistent red marker at the attempted position shows exactly where the user tried to place the item and that it was rejected. This is strictly more informative than the current 200ms flash.

**Non-Goals**

- Multi-color encoding (v1 ships single red `#ff0000`; the `reason` field is structured for future use).
- The layer registry, connectors, or tool/mode architecture (separate proposals).
- The actual invalidity detection logic (`GridService.canPlace` at `grid.ts:105-132` is unchanged).
- Undo/redo integration for placement rejections.
- Throttled drag commits (existing behavior preserved).

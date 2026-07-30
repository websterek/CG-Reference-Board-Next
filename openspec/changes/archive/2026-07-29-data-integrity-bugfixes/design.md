# Design: Data Integrity Bugfixes

## Context

A council review of the current codebase identified 15 specific bugs. Nine of these (#4–#9) are architectural issues already covered by other proposals:

| Bug | Description | Covered by |
|-----|-------------|------------|
| #4 | 200ms flash-and-revert UX | `invalid-placement-ux` |
| #5 | Hides Select in annotation mode | `tool-registry-and-modes` |
| #6 | Duplicated `layerPriority` array | `layer-registry` |
| #7 | `LAYER_Z_ORDER` hardcoded array | `layer-registry` |
| #8 | `BoardItemSchema.layerId` refinement hardcodes layer IDs | `layer-registry` |
| #9 | `layerVisible` map initialized with hardcoded keys | `layer-registry` |

The remaining 8 bugs (plus one documented limitation) are mechanical, low-risk fixes that can proceed independently as a parallelizable chunk. This proposal covers those fixes.

## Goals

- Fix bugs #1, #2, #3 (critical data integrity)
- Fix bugs #10, #11, #12 (medium severity)
- Fix bugs #13, #14 (low severity)
- Document bug #15 as a known limitation (no code fix)
- Add cross-reference comments at bugs #4–#9 locations pointing to the other proposals that fix them

## Non-Goals

- The layer/tool/mode architecture (covered by `layer-registry`, `tool-registry-and-modes` proposals)
- The invalid-placement UX (covered by `invalid-placement-ux` proposal)
- The layer registry refactor (covered by `layer-registry` proposal)
- Any new capabilities or spec-level requirement changes
- Persisting `lastValidBounds` (YAGNI for v1)

## Decisions

### D1: Fix all 8 bugs in one proposal, not split further

**Rationale**: Each fix is small (typically 1–5 lines) and mechanical. Splitting into separate proposals would add overhead (8 proposals, 8 spec files, 8 task lists) with no benefit. The combined PR is still small and reviewable.

### D2: Reference bugs #4–#9 in design.md as cross-references

**Rationale**: The council identified these bugs as part of the same review. Cross-referencing them in this proposal's design.md ensures traceability — a reader can see that all 15 bugs were considered and routed to the appropriate proposal. Code comments at the bug locations will also point to the fixing proposals.

### D3: Document bug #15 as a known limitation

**Rationale**: `lastValidBounds` is controller-local state. Losing it on HMR/navigation is a real limitation, but the impact is low (the first invalid move after recreation has no revert target, but subsequent moves work fine). Persisting it would require wiring into Yjs awareness state or another durable store — not worth the complexity for v1. Document and revisit if it becomes a real problem.

### D4: Use `SpatialIndex.findOverlapping` (O(log n + k)) instead of flat-array scan (O(n))

**Rationale**: `SpatialIndex.findOverlapping()` already exists at `spatial.ts:95-108` and uses RBush for O(log n + k) spatial queries. The current `buildCanPlaceItems()` at `controller.ts:1030-1057` builds a flat array and does an O(n) scan on every pointer-move during drag. Replacing it with the spatial index is a straightforward swap that eliminates a known performance bottleneck. The `SpatialIndex` is already maintained by the controller (items are added/removed on create/delete), so no additional index maintenance is needed.

### D5: Implement `queueUpdate` properly (keep the interface, wire it up)

**Rationale**: The `ToolContext` interface at `tool.ts:38-40` defines `queueUpdate` and `flushQueuedUpdates` as part of the design.md D3 contract (tool-owned drag-queue state). Removing them from the interface would break the contract. Implementing them properly is straightforward: maintain a single-slot buffer (`Map<ItemId, Partial<...>>`) in the controller, apply on `flushQueuedUpdates`. This is a small change that fulfills the existing contract.

### D6: Capture real pointer position in a controller field

**Rationale**: The `endDrag` method at `controller.ts:951` currently passes `{x: 0, y: 0}` to `tool.onPointerUp` because "pointer position not available in endDrag." The fix is to store the last known pointer position (in board coordinates) in a controller field updated on each `pointermove` event, then read it in `endDrag`. This is a one-field addition and a one-line change in the pointermove handler.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `canPlace` in draw-rect resize causes jank | Low | Medium | The spatial index (D4) makes `canPlace` O(log n + k); the resize path already calls `updateItem` and `renderSelection` on every move, so adding a `canPlace` call is negligible overhead |
| `queueUpdate` implementation breaks existing tools | Low | Low | No tools currently call `queueUpdate` (it's a no-op); implementing it is purely additive |
| `SpatialIndex.findOverlapping` returns different results than flat-array scan | Low | High | The spatial index is maintained on every create/delete; verify with unit tests that `findOverlapping` returns the same candidates as the flat-array scan for the same input |
| Cross-proposal coordination (other proposals fix same bugs) | Medium | Low | This proposal fixes bugs #1, #2, #3, #10, #11, #12, #13, #14. The other proposals fix bugs #4–#9. No overlap. Code comments at #4–#9 locations will point to the fixing proposals to avoid confusion. |
| `Graphics as Container` simple cast fails TypeScript | Low | Low | PixiJS v8 `Graphics` extends `Container`; the simple cast is valid. If it fails, the return type annotation can be widened to `Graphics` (which satisfies `Container`). |

## Trade-offs

| Decision | Alternative | Why chosen |
|----------|-------------|------------|
| Fix all 8 in one proposal | Split into 8 proposals | Fix-all wins: each fix is small, splitting adds overhead with no benefit |
| Implement `queueUpdate` | Remove from `ToolContext` interface | Implement wins: the interface is part of the design.md D3 contract; removing it would break the contract and require coordination with the tool-registry proposal |
| Document `lastValidBounds` limitation | Persist to Yjs awareness state | Document wins: YAGNI for v1; revisit if HMR/navigation becomes a real problem |
| Use `SpatialIndex.findOverlapping` | Keep flat-array scan | Spatial index wins: O(log n + k) vs O(n), the index already exists and is maintained, no new infrastructure needed |

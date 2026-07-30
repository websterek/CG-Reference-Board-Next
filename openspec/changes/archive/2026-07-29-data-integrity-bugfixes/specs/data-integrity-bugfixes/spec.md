# Spec: Data Integrity Bugfixes

## ADDED Requirements

### Requirement: Correct LayerId on Item Creation

The system SHALL use `defaultLayerIdFor(layerKindFor(type))` for all items created through `buildToolContext().createItem` and the built-in rectangle path, rather than a hardcoded `'default'` string.

#### Scenario: Tool-created item gets correct layerId

- **Given** a tool calls `ctx.createItem({ type: 'frame', x: 100, y: 100, width: 200, height: 200, attrs: {} })`
- **When** the item is created via `buildToolContext().createItem` at `controller.ts:359-380`
- **Then** the item's `layerId` is `defaultLayerIdFor(layerKindFor('frame'))` (e.g., `'frames'`)
- **And** the `as never` cast is removed

#### Scenario: Built-in rectangle gets correct layerId

- **Given** the user starts a rectangle draw at `controller.ts:744-773`
- **When** the new rectangle item is created at line 760-769
- **Then** the item's `layerId` is `defaultLayerIdFor(layerKindFor('rectangle'))` (which the registry resolves to `'media'`)
- **And** the `as never` cast is removed

#### Scenario: BoardItemSchema validation passes

- **Given** an item created with `defaultLayerIdFor(layerKindFor(type))`
- **When** the item is validated against `BoardItemSchema` (`board.ts:169-173`)
- **Then** the `layerId` refinement passes (the value is one of the valid layer IDs)

---

### Requirement: CanPlace on Draw-Rect Resize

The system SHALL call `GridService.canPlace` during the `draw-rect` drag-resize path (`controller.ts:904-915`) to prevent overlapping items during resize, consistent with the move-selected and resize paths.

#### Scenario: Resize into occupied cell is rejected

- **Given** an existing item occupies cell (4, 4)
- **And** the user is drag-resizing a new rectangle toward cell (4, 4)
- **When** the pointermove handler at `controller.ts:904-915` computes the new bounds
- **Then** `GridService.canPlace` is called with the proposed bounds
- **And** if `canPlace` returns false, the resize is rejected (reverted to last valid bounds)

#### Scenario: Resize into free cell is accepted

- **Given** no items occupy the target cells
- **And** the user is drag-resizing a new rectangle
- **When** the pointermove handler computes the new bounds
- **Then** `GridService.canPlace` returns true
- **And** the item is updated to the new bounds

#### Scenario: Resize validation is consistent with move validation

- **Given** the same set of existing items
- **When** a rectangle is resized to overlap an existing item
- **And** a rectangle is moved to overlap the same existing item
- **Then** both operations produce the same rejection behavior (flash + revert)

---

### Requirement: CanPlace on Frame Create

`FrameCreateTool.onPointerDown` SHALL call `GridService.canPlace` before creating a frame, consistent with the built-in rectangle path.

#### Scenario: Frame creation on occupied cell is rejected

- **Given** an existing item occupies cell (2, 2)
- **And** the user clicks at board position corresponding to cell (2, 2) with the frame tool active
- **When** `FrameCreateTool.onPointerDown` is called at `frame-tool.ts:19-33`
- **Then** `canPlace` is called with the snapped position and frame dimensions
- **And** if `canPlace` returns false, no frame is created

#### Scenario: Frame creation on free cell succeeds

- **Given** no items occupy the target cell
- **And** the user clicks with the frame tool active
- **When** `FrameCreateTool.onPointerDown` is called
- **Then** `canPlace` returns true
- **And** a frame item is created at the snapped position

#### Scenario: Frame tool validation is consistent with rectangle tool

- **Given** the same board state
- **When** a frame is created at a position
- **And** a rectangle is created at the same position
- **Then** both operations produce the same validation result (both pass or both reject)

---

### Requirement: SpatialIndex in Overlap Check

`buildCanPlaceItems` SHALL use `SpatialIndex.findOverlapping` (O(log n + k) via RBush) instead of building a flat array and performing an O(n) scan.

#### Scenario: Overlap check uses spatial index

- **Given** a board with 1000 items
- **And** the user is dragging a selected item
- **When** `buildCanPlaceItems` is called at `controller.ts:1030-1057`
- **Then** the method queries `SpatialIndex.findOverlapping` with the dragged item's bounds
- **And** only items in the relevant layer kind are returned
- **And** the dragged item itself is excluded via `excludeId`

#### Scenario: Spatial index returns correct candidates

- **Given** items A (frame layer, at (0,0,100,100)), B (overlay layer, at (50,50,100,100)), C (frame layer, at (500,500,100,100))
- **And** the user drags item D (frame layer) to (0,0,100,100)
- **When** `SpatialIndex.findOverlapping` is called with D's bounds and `kind: 'frame'`
- **Then** only item A is returned (same layer kind, overlapping, not excluded)
- **And** item B is excluded (different layer kind)
- **And** item C is excluded (not overlapping)

#### Scenario: Performance does not degrade with item count

- **Given** a board with N items
- **When** `buildCanPlaceItems` is called during a drag operation
- **Then** the time complexity is O(log n + k) where k is the number of overlapping items
- **And** the method does not iterate over all N items

---

### Requirement: QueueUpdate Implementation

`queueUpdate` and `flushQueuedUpdates` in `ToolContext` SHALL be properly implemented rather than remaining as no-ops. The implementation SHALL follow the design.md D3 contract: `queueUpdate` stores a single-slot buffered update per tool, and `flushQueuedUpdates` commits the buffered update as one transaction on pointerup.

#### Scenario: queueUpdate buffers a single update

- **Given** a tool calls `ctx.queueUpdate('item-1', { x: 100, y: 200 })`
- **When** the queued update is stored
- **Then** the update is not immediately applied to the item
- **And** a subsequent call to `ctx.queueUpdate('item-1', { x: 150, y: 250 })` replaces the previous buffered update

#### Scenario: flushQueuedUpdates commits the buffered update

- **Given** a buffered update exists for 'item-1' with `{ x: 150, y: 250 }`
- **When** `ctx.flushQueuedUpdates()` is called (typically on pointerup)
- **Then** the item 'item-1' is updated to `{ x: 150, y: 250 }`
- **And** the buffer is cleared

#### Scenario: flushQueuedUpdates with no buffered update is a no-op

- **Given** no buffered update exists
- **When** `ctx.flushQueuedUpdates()` is called
- **Then** no item update occurs
- **And** no error is thrown

---

### Requirement: Real Pointer Position in endDrag

`endDrag` SHALL capture and pass the real pointer position to `tool.onPointerUp` instead of `{x: 0, y: 0}`.

#### Scenario: endDrag passes real pointer position

- **Given** the user releases the pointer at screen position (400, 300)
- **And** the camera is at default zoom/pan
- **When** `endDrag` is called at `controller.ts:951`
- **Then** the pointer position passed to `tool.onPointerUp` is the board-coordinate equivalent of (400, 300)
- **And** the position is not `{x: 0, y: 0}`

#### Scenario: Pointer position is captured from last pointermove

- **Given** the user drags from (100, 100) to (500, 500) and releases
- **When** `endDrag` is called
- **Then** the pointer position reflects the last known pointermove position (approximately (500, 500) in board coordinates)
- **And** the position is stored in a controller field updated on each pointermove

#### Scenario: Tools receive accurate final position

- **Given** a tool's `onPointerUp` computes the end of a line from the pointer position
- **When** `endDrag` passes the real pointer position
- **Then** the tool receives the correct final position
- **And** the computed line endpoint matches where the user released the pointer

---

### Requirement: Wheel Zoom Respects CtrlKey

The wheel zoom handler SHALL early-return when `e.ctrlKey` or `e.metaKey` is true, allowing the browser to handle pinch-zoom gestures natively.

#### Scenario: Pinch-zoom is not intercepted

- **Given** the user performs a pinch-zoom gesture on a trackpad
- **When** the browser fires a wheel event with `ctrlKey: true`
- **Then** the wheel handler at `controller.ts:622-635` returns immediately
- **And** the browser handles the pinch-zoom natively

#### Scenario: Normal scroll-wheel zoom still works

- **Given** the user scrolls with a mouse wheel (no modifier keys)
- **When** the browser fires a wheel event with `ctrlKey: false` and `metaKey: false`
- **Then** the wheel handler applies exponential zoom as before
- **And** the zoom centers on the cursor position

#### Scenario: MetaKey scroll is also passed through

- **Given** the user performs a gesture that fires a wheel event with `metaKey: true` (e.g., macOS two-finger smart zoom)
- **When** the wheel handler receives the event
- **Then** the handler returns immediately
- **And** the browser handles the gesture natively

---

### Requirement: No Unnecessary PixiJS Double-Casts

PixiJS v8 `Graphics` extends `Container`. Renderers SHALL NOT use `Graphics as unknown as Container` double-casts. Instead, the renderer SHALL return the `Graphics` object directly or use a simple `as Container` cast if the return type annotation requires it.

#### Scenario: Frame renderer returns Graphics directly

- **Given** `renderFrame` creates a `Graphics` object
- **When** the function returns at `frame.ts:17`
- **Then** the return value is `g` (the Graphics object) or `g as Container`
- **And** the `as unknown as Container` double-cast is removed

#### Scenario: Annotation renderer returns Graphics directly

- **Given** `renderAnnotation` creates a `Graphics` object (empty or with vertices)
- **When** the function returns at `annotation.ts:19` or `annotation.ts:32`
- **Then** the return value is `g` (the Graphics object) or `g as Container`
- **And** the `as unknown as Container` double-cast is removed

#### Scenario: TypeScript compilation passes without double-casts

- **Given** the double-casts are replaced with direct returns or simple casts
- **When** `tsc --noEmit` is run
- **Then** no type errors are reported for the renderer files
- **And** the return types satisfy the `Container` return type annotation

---

### Requirement: lastValidBounds Limitation Documented

The `lastValidBounds` map at `controller.ts:86` is controller-local and not persisted. This limitation SHALL be documented in a code comment.

#### Scenario: Limitation is documented in code

- **Given** the `lastValidBounds` declaration at `controller.ts:86`
- **When** a developer reads the code
- **Then** a comment explains that `lastValidBounds` is lost on controller recreation (HMR, navigation)
- **And** the comment notes this is an accepted limitation for v1

#### Scenario: Behavior after HMR is understood

- **Given** the controller is recreated (e.g., after HMR)
- **And** `lastValidBounds` is empty
- **When** the user performs an invalid move
- **Then** the item is not reverted (no last valid bounds to revert to)
- **And** this behavior is expected per the documented limitation

#### Scenario: Limitation is revisited if needed

- **Given** the documented limitation
- **When** HMR or navigation becomes a real problem in practice
- **Then** the fix would involve persisting `lastValidBounds` to a durable store (e.g., Yjs awareness state)
- **And** the code comment serves as a pointer for the future fix

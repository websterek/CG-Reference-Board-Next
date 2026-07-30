# paste-image-with-cover-fit

## Why

The board's paste-image path lands the image at the center of the viewport and
stretches the texture to the item's display rect — neither matches user
expectations. The natural aspect of the image is discarded, so a 16:9 screenshot
becomes a square blob, and the user has to manually re-place and re-shape it.
The brief calls for "every item takes one tile after paste, content inside the
tile should fit using the best edge to fill the entire item shape" — i.e. cover
fit with the image's natural aspect driving the shape. This change delivers
that, plus the missing piece the existing spec calls "future capability":
aspect-locked resize.

## What Changes

- **Paste trigger**: support **Ctrl/Cmd+V** (global) and **right-click context
  menu** (global + per-item). The existing clipboard flow (`paste` event) is
  wired up and actually creates an item; today it does not.
- **Paste position**: image lands at the **pointer position**, snapped to the
  nearest cell. This replaces the spec's "center of viewport" rule.
- **Default size**: a single rectangular tile block, sized to the image's
  natural aspect. Rule: `shortSide = cellSize`, `longSide = round(naturalAspect
  × cellSize)` snapped to `cellSize`. A square image pastes at 1×1; a 2:1 at
  1×2; a 16:9 at 1×2 (rounded to nearest tile). The image is never stretched —
  the rect is chosen to fit the aspect.
- **Cover-fit rendering**: the sprite is scaled so the **limiting dimension
  fills the rect** (`scale = max(rectW/natW, rectH/natH)`), centered, and
  **masked to the item rect** so the texture never overdraws sibling items.
  This replaces the current "stretch to rect" behavior.
- **Aspect-locked resize**: dragging a corner of an image item changes the
  **size factor** (`1×, 2×, 3×, …`), not the rect directly. The dominant
  drag axis drives one dimension; the other follows from the natural aspect;
  both snap to the tile grid. **No override path** — the natural aspect is
  the only aspect the item will ever display at.
- **`ImageAttrs` schema**: gains two required fields, `naturalWidth` and
  `naturalHeight`. Existing image items on legacy boards fall back to
  `item.width / item.height` until the texture loads, then self-correct via
  `onItemChange`. This is a soft migration — the change is non-breaking for
  active boards; legacy items just lose cover-fit precision for one render
  cycle.
- **Right-click context menu**: a small floating panel with global entries
  (Paste image, View controls) and per-image entries (size 1×, 2×, 3×, 4×,
  6×, 8×; Paste image; Delete; metadata footer with natural dimensions).
  Non-image items get a smaller "Delete" / "Paste" menu; richer per-type menus
  are out of scope.
- **Tile-aligned invariant**: every item written through this proposal is
  guaranteed to have `width` and `height` that are integer multiples of
  `cellSize` and `x, y` that are on cell boundaries. The invariant is
  enforced at the write boundaries we own (paste, tool create, resize) and
  is documented as a reliance for future optimizations (e.g. tile-coordinate
  spatial index). Remote updates are not rejected; they are best-effort
  aligned.

## Capabilities

### New Capabilities

_(None. The change is an evolution of the existing `media-import` capability,
not a new domain area.)_

### Modified Capabilities

- **`media-import`**: requirement set changes for paste position (pointer,
  not viewport center), image item default size (aspect-driven, not
  `200×200`), image rendering (cover fit, not stretch), image resize
  (aspect-locked, tile-snapped). The "future capability" clause about
  aspect ratio is promoted to current behavior.

## Impact

### Code

- `packages/domain/src/items/image.ts` — add `naturalWidth`, `naturalHeight`
  to `ImageAttrs`, extend Zod schema, expose a `defaultImageSize(naturalW,
  naturalH, cellSize)` helper that returns a tile-aligned `Rect` honoring
  the natural aspect.
- `packages/client/src/canvas/renderers/image.ts` — cover-fit math, mask
  container, integer positions. Item rect = `width × height` in board units;
  sprite draws at `(naturalW × scale, naturalH × scale)` with the mask
  clipping to the item rect.
- `packages/client/src/canvas/controller.ts` — new `pasteImageFromClipboard`
  method, `contextmenu` handler on the canvas, aspect-locked branch in the
  resize pointermove handler (image items only), document the tile-aligned
  invariant in the controller's class doc.
- `packages/client/src/canvas/tools/image-tool.ts` _(new)_ — replaces
  `StubTool('image')` in `population.ts`. The 'image' tool inserts an image
  item at the current pointer, default-sized, using the same flow as paste
  (minus the clipboard read).
- `packages/client/src/media/paste-image.ts` _(new)_ — pure helper: read
  the clipboard (or a `File` directly), probe `naturalWidth/naturalHeight`
  via `URL.createObjectURL` + `Image.decode()`, call `uploadImage`, return
  `{ assetId, naturalWidth, naturalHeight, mimeType }`.
- `packages/client/src/ui/ContextMenu.tsx` _(new)_ — floating panel driven
  by the controller. Two flavors: global (Paste image, View controls) and
  image-specific (size factor entries, Paste, Delete, metadata). Closes on
  outside click, Escape, or scroll.
- `packages/client/src/app/BoardPage.tsx` — install the global `paste`
  listener; mount `ContextMenu` so the controller can `openContextMenu` at a
  position. The board id and JWT are read from the same place the upload
  helper already reads them.
- `packages/client/src/canvas/tools/population.ts` — swap `StubTool('image')`
  for the real `ImageCreateTool`.

### Specs

- `openspec/specs/media-import/spec.md` — update the paste scenarios (pointer
  position, not viewport center), add a new requirement for cover-fit
  rendering, promote the "future capability" aspect-ratio clause to current.

### Tests

- `packages/domain/src/__tests__/image.test.ts` _(new)_ — `defaultImageSize`
  cases: square, 2:1, 1:2, 16:9, 1:1 aspect boundary, very wide image,
  very tall image. Zod schema rejection on missing natural dims.
- `packages/client/src/__tests__/renderImage.test.ts` _(new)_ — cover-fit
  math, mask geometry, legacy fallback when `naturalWidth/Height` are
  missing.
- `packages/client/src/__tests__/paste-image.test.ts` _(new)_ — paste flow
  with a mocked clipboard: clipboard read, natural-size probe, upload call,
  `createItem` call with the expected rect and attrs.
- `packages/client/src/__tests__/aspect-locked-resize.test.ts` _(new)_ —
  corner drag on an image: 2:1 image grows to 2×1 / 4×2 / 6×3, never
  3×3; non-image items still get free aspect (regression guard).
- `packages/client/src/__tests__/context-menu.test.tsx` _(new)_ — global
  menu shows Paste; image menu shows size factor entries; selection
  updates on right-click; menu closes on outside click.

### Out of scope (follow-on proposals, ordered by dependency)

These are tracked as sibling changes in `openspec/changes/`. Each has its
own proposal doc; this section is the dependency map.

- **[`tile-coord-spatial-index`](./tile-coord-spatial-index/)** — re-key
  `SpatialIndex` by `(col, row, cols, rows)` instead of pixel rects.
  Depends on the tile-aligned invariant this change establishes
  (D8). Targets hit-test and viewport culling for 10k+ item boards.
  This is the **next change to ship**; the rest depend on it.
- **[`texture-resampling-cache`](./texture-resampling-cache/)** — cache
  image sprite textures keyed by `(assetId, width, height)`, ref-counted
  by active renderers. Depends on `tile-coord-spatial-index` (which
  tells us which tile sizes are actually used). **Punt until
  measurements from a 5k-image board justify the architecture.**
- **[`server-natural-size-probe`](./server-natural-size-probe/)** —
  probe natural dimensions in the upload endpoint with `sharp`,
  persist on the `assets` row, expose via a new GET field. Lets the
  client skip the `Image.decode()` probe. Independent of the other
  changes; can land any time after `paste-image-with-cover-fit`
  merges.
- **[`drag-and-drop-image-import`](./drag-and-drop-image-import/)** —
  install `dragover/drop` on the canvas; reuse `paste-image.ts` minus
  the clipboard read. Independent; depends only on this change being
  in. Quick win once paste ships.
- **[`per-type-context-menus`](./per-type-context-menus/)** — extend
  the menu component to render per-item-kind entries (frame resize,
  connector reattach, annotation style, etc.). Independent; can ship
  anytime.

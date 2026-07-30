# Design — paste-image-with-cover-fit

## Context

The board already has the pieces for paste-to-canvas: a working `POST
/api/boards/:id/assets` endpoint that streams the upload to MinIO / local
storage, a `YjsBoardAdapter.createLocal` path that writes the item to the
collaborative doc, and a `renderImage` function that displays a `Sprite`
from a PixiJS texture. What is missing is the **glue and the rendering
correctness**:

- The `'image'` tool in the tool registry is a `StubTool` that throws on
  pointer events. The toolbar shows a button but clicking it does nothing.
- There is no `paste` event handler anywhere; the spec's "Paste image from
  clipboard" scenario is unimplemented.
- `renderImage` sets `sprite.width = item.width; sprite.height = item.height`,
  stretching the texture to whatever rect the item has. The natural aspect
  is lost; the texture is letterboxed or stretched.
- The image item has no `naturalWidth / naturalHeight` on its `ImageAttrs`,
  so even if `renderImage` wanted to do cover-fit, it would have nothing
  to compute from.
- Resize corners produce any `width × height` ratio; nothing about an
  image is special.

The "items are always tile-aligned" intuition has been the codebase's
working assumption (the grid service snaps, the controller positions
items on the world grid), but the invariant is implicit. This change
makes it explicit and uses it.

## Goals / Non-Goals

**Goals**

- Ctrl/Cmd+V and right-click context menu produce a correctly-sized
  image item at the pointer, with the natural aspect preserved and the
  texture cover-fit to the rect.
- An image item's `width × height` ratio is **always** equal to its
  natural aspect. The user cannot break the ratio; the rect always
  shows the whole image, scaled to fill.
- The default size after paste (or after using the 'image' tool) is
  one rectangular tile block, sized to the natural aspect, with a 1-tile
  floor.
- The "items are always tile-aligned" invariant is enforced at the
  write boundaries the change owns (paste, tool create, resize).
- Legacy image items (no `naturalWidth/Height`) still render; they get
  the values on first texture load via `onItemChange`.

**Non-Goals**

- Tile-coordinate spatial index. (Separate proposal, depends on this
  invariant but is its own change.)
- Texture resampling cache. (Separate proposal, needs measurement.)
- Server-side natural-size probe via `sharp`. (Nice-to-have; not on
  the critical path.)
- Drag-and-drop file import. (Spec already mentions it; punt to a
  follow-on that reuses the `paste-image.ts` pipeline.)
- Right-click menus for non-image items beyond a generic
  Paste / Delete entry.
- Shift-modifier aspect override. **Strict** aspect lock; no override
  path.

## Decisions

### D1. ImageAttrs gains `naturalWidth` and `naturalHeight`

`ImageAttrs` is currently `{ assetId, mimeType, status }`. Add two
required `number` fields. The Zod schema enforces `z.number().int().positive()`.

```ts
export interface ImageAttrs {
  readonly assetId: string;
  readonly mimeType: string;
  readonly status: ImageStatus;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}
```

**Why required, not optional**: making them required forces every write
path that creates an image to know the natural size. The client paste
flow has the size from a decoded `Image`; the server `createLocal`
path gets it via the asset row (future work, see non-goals). Legacy
items use the fallback in D6.

**Alternatives considered**:
- *Optional fields*. Rejected: the renderer would need to handle four
  combinations (with/without natural, with/without texture loaded).
  The first texture load would mutate attrs anyway, so the optional
  path is just a deferred "required" with extra states.
- *Store on a sibling field outside `attrs`*. Rejected: `attrs` is
  the round-tripped blob; adding a top-level `BoardItem.naturalWidth`
  breaks the per-type registry abstraction. Image is a single
  type — its natural size belongs on its type's attrs.

### D2. Default size rule

```ts
function defaultImageSize(
  naturalW: number,
  naturalH: number,
  cellSize: number,
): { width: number; height: number } {
  const aspect = naturalW / naturalH; // natural aspect, always
  if (aspect >= 1) {
    const longSide = Math.max(
      cellSize,
      Math.round((aspect * cellSize) / cellSize) * cellSize,
    );
    return { width: longSide, height: cellSize };
  } else {
    const longSide = Math.max(
      cellSize,
      Math.round((cellSize / aspect) / cellSize) * cellSize,
    );
    return { width: cellSize, height: longSide };
  }
}
```

Visual examples at `cellSize = 32`:

| natural | aspect | default | reason |
|--------:|-------:|--------:|--------|
| 800×800 | 1.0 | 32×32 (1×1) | square |
| 1600×800 | 2.0 | 64×32 (2×1) | longSide = round(2×32) = 64 |
| 800×1600 | 0.5 | 32×64 (1×2) | longSide = round(2×32) = 64 |
| 1920×1080 | 1.78 | 64×32 (2×1) | longSide = round(1.78×32) = round(57) = 64 |
| 4000×2000 | 2.0 | 64×32 | same shape, bigger doesn't matter for default |

A `16:9` rounds up to `2:1` (one tile wide becomes two tiles wide) so
the user always sees the whole image at paste time. A `4:3` image
rounds to `1:1` (the closer tile ratio) and the cover-fit crops it
modestly; the user can immediately drag to 4×3 if they want.

**Floor is 1×1 cell**: when natural is exactly square, width and
height are both `cellSize`. `Math.max(cellSize, ...)` guarantees this.

**Why snap, not ceil**: `round` produces a cleaner visual result for
off-aspect images. `ceil` always grows the default; `round` lets
slightly-square images stay square. The user's "1 tile" intent is
about "small enough to see the whole board", not "exactly N cells".

**Alternatives considered**:
- *Always 1×1 cell default*. Rejected: a 2:1 image at 1×1 has 50% of
  the image cropped on top/bottom. Cover-fit still works, but the
  first-paste impression is "where's the rest of my image?".
- *Aspect-driven with no floor*. Rejected: a 1:10000 strip pastes at
  1×312.5 tiles, off the visible board. The 1-cell floor is the
  sensible minimum.

### D3. Cover-fit math + mask

```ts
function coverFit(item, naturalW, naturalH) {
  const itemW = item.width;
  const itemH = item.height;
  const scale = Math.max(itemW / naturalW, itemH / naturalH);
  return {
    scale,
    drawW: naturalW * scale,
    drawH: naturalH * scale,
    offsetX: (itemW - naturalW * scale) / 2,
    offsetY: (itemH - naturalH * scale) / 2,
  };
}
```

The sprite is drawn at `(drawW, drawH)`, positioned at `(offsetX,
offsetY)`. A `Graphics.rect(0, 0, itemW, itemH).fill()` is set as the
`mask` on the wrap container. The texture is clipped to the item rect
before it overdraws siblings.

**Why mask, not Texture.frame**: the `Texture` instance is shared
across all sprites that load the same asset (PixiJS Assets cache).
Mutating `Texture.frame` on one image item would change the texture
for every image item on the board. The mask is per-container, so it
isolates the change. The overdraw cost is bounded — the mask is a
rectangle, the GPU clips for free.

**Why centered offsets, not top-left**: the alternative (`offsetX = 0`)
shows the top-left of the image. For a 16:9 image in a 1:1 cell, the
user sees the left third of the image; centering shows the middle.
The "middle of the image" is a more meaningful crop than "start of
the image".

**Alternatives considered**:
- *Texture.frame crop*. Rejected (sharing bug above).
- *Letterbox (contain fit)*. Rejected by the brief: "fill entire item
  shape" is cover, not contain.
- *No mask, no clipping, let the sprite draw outside the item rect*.
  Rejected: violates the visual "this item is exactly this big"
  contract that the rest of the system relies on for hit tests,
  selection handles, and the spatial index.

### D4. Strict aspect-locked resize

The current corner-drag resize in the controller produces arbitrary
`width × height` from the drag delta. The image-aware variant:

```ts
function aspectLockedResize(
  startBounds: Rect,
  naturalW: number,
  naturalH: number,
  corner: 'tl' | 'tr' | 'bl' | 'br',
  pointer: Point,
  cellSize: number,
): Rect {
  const aspect = naturalW / naturalH;
  // 1. Compute raw drag deltas relative to the FIXED corner
  //    (the corner opposite the one the user grabbed).
  // 2. The dominant axis is the one with the larger |delta|.
  // 3. Compute newRect's long dimension from the dominant delta,
  //    snapped UP to the next cellSize multiple (ceil).
  // 4. Compute newRect's short dimension from aspect:
  //      if landscape (aspect >= 1):  width = long, height = round(width / aspect) snapped
  //      if portrait  (aspect <  1):  height = long, width = round(height * aspect) snapped
  // 5. Anchor: position is derived from the fixed corner so it
  //    doesn't move.
}
```

The dominant-axis rule prevents the drag from "sticking" to whichever
axis the user happens to be moving along. For a 2:1 image with the
user dragging primarily down-right, the result is **N×N/2 tiles**
(not 2N×2N) because the vertical drag is half as effective. The user
intuitively wants the image bigger; we give them bigger without
violating aspect.

**Why `ceil` on the snap, not `round`**: the user is growing the
item, not shrinking it. `ceil` guarantees the rect always covers at
least the dragged distance. `round` could give "smaller than the
drag" which feels broken.

**Why no override path**: brief says "aspect should be locked".
Implementing a Shift-override would be a reasonable extension; the
proposal explicitly excludes it. If a future need arises, it's a
one-line addition to the resize handler.

**Why not allow free aspect via context menu**: the menu only offers
the size factor (`1×, 2×, 3×, …`), which preserves aspect by
construction. There is no menu entry that would produce a non-aspect
rect. The invariant is enforced at every surface.

**Regression guard**: the resize handler in `controller.ts` is
item-type-aware. Non-image items keep the existing free-aspect
behavior. Image items route through the aspect-locked branch.

### D5. Paste flow

```
1. User triggers paste (Ctrl/Cmd+V on window OR right-click → "Paste image")
2. paste-image.ts reads the clipboard:
     - paste event: e.clipboardData.items → find first item with type.startsWith('image/')
     - context menu: navigator.clipboard.read() → find first image
   Returns: { file: File, mimeType: string }
3. Probe natural size:
     - URL.createObjectURL(file)
     - new Image(); img.src = url
     - await img.decode()  (or load event)
     - { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }
4. uploadImage(boardId, file, 'pasted.png') → { assetId }
5. Compute drop position:
     - For paste event: screenToBoard the lastPointerBoard
     - For context menu: screenToBoard the click position
     - GridService.snapPoint(boardPt, grid)  // snaps to nearest cell
6. Compute default size: defaultImageSize(naturalW, naturalH, cellSize)
7. controller.createItem({
     type: 'image',
     x, y, width, height,
     attrs: { assetId, mimeType, naturalWidth, naturalHeight, status: 'loading' },
   })
8. The texture loads asynchronously; renderImage shows a placeholder
   rect until the sprite is ready, then swaps in. status: 'ready' is
   set on the item after the sprite attaches, via onItemChange.

Notes:
- Step 7 sets status: 'loading' because the texture is still in
  flight. The placeholder rect makes the loading state visible
  immediately, so there's no "flicker" where the user sees an empty
  cell before the image appears.
- The upload is awaited BEFORE createItem. The whole flow is
  sequential. A parallel write would need optimistic UI + rollback;
  not worth the complexity for v1.
```

**Why `status: 'loading'` initially, not `ready`**: the asset is on
the server but the browser hasn't decoded the texture yet. The
placeholder rect is the honest signal.

**Why not decode the image client-side BEFORE upload to skip the
loading state**: the texture is loaded by PixiJS `Assets.load({ src:
url })`; the binary is the same on both sides. Adding a separate
client decode just to swap "loading" for "ready" sooner would mean
decoding twice. The placeholder rect is the right UX for the ~50ms
load window.

### D6. Legacy image item fallback

Existing boards may have image items without `naturalWidth/Height`
on `attrs`. The renderer cannot do cover-fit for them, so:

```ts
function getNaturalDims(item) {
  if (typeof attrs.naturalWidth === 'number' && attrs.naturalHeight > 0) {
    return { w: attrs.naturalWidth, h: attrs.naturalHeight };
  }
  // Legacy fallback: assume the texture's natural is the item's current rect.
  // This is wrong (the texture was originally stretched), but it produces
  // a stable result that won't change as the user resizes.
  return { w: item.width, h: item.height };
}
```

On first texture load, the renderer reads the real `Texture.source`
dimensions and emits an `onItemChange({ attrs: { naturalWidth,
naturalHeight } })` to backfill. After that, the item behaves like
a new one. The transient fallback is invisible to the user — the
item renders, the dimensions get corrected on the next render cycle,
and the rect doesn't change so the user sees no visual jump.

**Why not block the renderer on the backfill**: blocking means
showing a placeholder until natural dims are known, which for
legacy items is "until the texture loads" (always). Non-blocking
fallback is honest about the data we have.

**Why not backfill server-side**: out of scope. The client fallback
is good enough; if a future change adds `sharp` to the upload
endpoint, the backfill becomes redundant and can be removed.

### D7. Context menu

A new `ContextMenu.tsx` component:

```
Props:
  - menu: { items: MenuItem[] } | null   // null = closed
  - anchor: { x: number; y: number }     // screen coords
  - onClose: () => void

MenuItem:
  - { kind: 'action', label: string, onClick: () => void, shortcut?: string }
  - { kind: 'submenu', label: string, items: MenuItem[] }
  - { kind: 'divider' }
  - { kind: 'info', text: string }       // metadata footer
```

Behavior:
- Renders at `anchor`, flipped to stay in viewport if it would overflow.
- Closes on outside click, Escape, scroll, or after a menu action.
- Controller exposes `openContextMenu(anchor, items)`; the BoardPage
  binds this to the React tree via state.

The controller decides what items to show:
- **Global (no item under cursor)**: Paste image, View submenu (Zoom in, Zoom out, Fit, Reset).
- **Image item under cursor**: Size submenu (1×, 2×, 3×, 4×, 6×, 8×), Paste image, Delete, info footer with `naturalWidth × naturalHeight` and file size if known.
- **Other item under cursor**: Paste image, Delete. (Future per-type menus are out of scope.)

Size submenu entries map to `controller.resizeImageToFactor(item, N)`
which is just `defaultImageSize(naturalW, naturalH, cellSize * N)` —
multiplies the cellSize argument to the rule from D2, producing
N×2N, N×N/2, etc. tiles as aspect dictates.

**Why a React component, not a PixiJS overlay**: the menu needs
text, hover states, keyboard navigation, and accessibility
attributes. PixiJS text is not ergonomic for this; the canvas is
underneath a translucent overlay; a positioned `<div>` is the
idiomatic React solution.

**Why state in the controller, not in React**: the menu opens from
controller code (right-click in the canvas event handler). Pushing
the state into React requires either a callback through BoardPage
or a Zustand store. A controller method that the BoardPage
subscribes to is the same pattern used by `subscribeMinimap`. State
lives where the decision is made.

### D8. Tile-aligned invariant (optimization foundation)

The proposal makes the invariant explicit without changing the snap
math:

- `GridService.snapRect` already snaps to `cellSize` multiples and
  bumps to at least `cellSize`. The default-size rule (D2) and the
  resize rule (D4) produce values that pass through `snapRect`
  unchanged — the snap is a no-op.
- Remote updates from other peers are not validated against the
  invariant in v1. If a peer sends a non-tile size, it sticks.
  Documented as a known divergence; the Yjs-CRDT-correctness story
  wins over the visual story.
- The invariant is **not** a precondition for this change. It's
  declared so the next change (tile-coord spatial index) can rely
  on it without re-justifying it.

**Why not enforce on remote updates**: requires schema changes in
the YjsBoardAdapter (reject/quantize updates), which is a different
blast radius. Punt until a concrete bug surfaces.

## Risks / Trade-offs

- **First-paste crop for non-square aspects** → `defaultImageSize`
  always shows the whole image (D2). For 4:3 the rule rounds to
  1:1, which has a 33% crop; documented in the spec as
  "user-resizable to 4×3 if the crop is unacceptable". Acceptable
  trade-off for keeping the rule one branch instead of two.

- **Cover-fit cropping is irreversible from the data** → the user
  sees the cropped view; the natural asset is intact. If we ever
  add a "show full image" toggle, it would expand the item rect to
  fit the natural at 1:1 scale. Not a v1 concern.

- **Mask is per-sprite, not per-asset** → memory cost is one
  `Graphics` per image item. At 1k image items, that's ~1k small
  masks. PixiJS handles this comfortably; not a concern at v1
  scale. If it ever becomes one, the masks could be shared in a
  texture atlas keyed by item rect — future optimization.

- **Async paste can fail** → upload error, decode error, unsupported
  MIME. The current `uploadImage` throws; the paste flow needs a
  try/catch that shows a toast or logs the error. Out of scope for
  the renderer; the BoardPage handler emits an error notification
  via the existing `useUIStore` toast pattern (assumed; verify in
  implementation).

- **Context menu steals focus from canvas** → the user pressing
  Ctrl+V while a menu is open should not re-paste. The menu
  component listens for Escape and closes; the global paste handler
  checks `document.activeElement` and bails if the menu has focus
  (or any input). Implementation detail in the React component.

- **Legacy items render with stretched fallback for one cycle** →
  the user might see a brief "wrong aspect" on an old image before
  the texture loads. In practice the texture is in browser cache,
  the swap is sub-frame, and the item rect doesn't change, so the
  user perceives nothing.

## Migration Plan

This is a non-breaking change:

- **Existing boards**: image items render with the legacy fallback
  (D6) until their texture loads and the natural dims are
  backfilled. No data migration needed; no user-visible disruption.
- **New image items**: written with `naturalWidth/Height` from
  the first paste. Future-proof.
- **Server**: no schema changes, no endpoint changes, no migration
  scripts. The `assets` table doesn't need a `naturalWidth` column
  because the client knows the value from the upload blob.
- **Rollback**: revert the change. Old renderers (a hypothetical
  pre-this-change client) would still see the new image items but
  without `naturalWidth/Height`; they'd fall back to the legacy
  path that's exactly the old "stretch to rect" behavior. Rollback
  is data-safe.

## Open Questions

None at proposal time. The four user-confirmed decisions
(1-tile floor with aspect rule, cover-fit + mask, strict
aspect-locked drag, scale-factor context menu) are baked into the
design.

If during implementation a question arises that requires a sixth
decision, the proposal gains a D-entry and the spec is amended;
the user is asked before the code lands.

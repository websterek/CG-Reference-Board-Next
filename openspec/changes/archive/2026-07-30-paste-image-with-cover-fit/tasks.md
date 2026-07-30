# Tasks — paste-image-with-cover-fit

## 1. Domain schema

- [x] 1.1 Add `naturalWidth` and `naturalHeight` to `ImageAttrs` interface in `packages/domain/src/items/image.ts`
- [x] 1.2 Update `ImageAttrsSchema` Zod schema to require `naturalWidth` and `naturalHeight` as positive integers
- [x] 1.3 Add `defaultImageSize(naturalW, naturalH, cellSize)` helper to `packages/domain/src/items/image.ts` exporting the D2 rule
- [x] 1.4 Export the new helper from `packages/domain/src/index.ts`
- [x] 1.5 Add `packages/domain/src/__tests__/image.test.ts` covering: square aspect, 2:1, 1:2, 16:9 (rounded up), 4:3 (rounded to 1:1), 1:10000 (capped at 1×N), and schema rejection on missing natural dims

## 2. Image renderer (cover fit + mask)

- [x] 2.1 In `packages/client/src/canvas/renderers/image.ts`, replace the current "stretch to rect" sprite sizing with cover-fit math: `scale = max(width/naturalW, height/naturalH)`, sprite at `(naturalW*scale, naturalH*scale)`, centered
- [x] 2.2 Add a `Graphics.rect(0, 0, width, height).fill()` mask to the wrap container so the sprite is clipped to the item rect
- [x] 2.3 Add the legacy fallback (D6): if `attrs.naturalWidth` is missing, use `item.width / item.height` as the natural size and emit an `onItemChange` backfill after texture load
- [x] 2.4 Snap sprite position to integer pixel offsets inside the item rect (no sub-pixel positioning)
- [x] 2.5 Add `packages/client/src/__tests__/renderImage.test.ts` covering: cover-fit math for various aspects, mask geometry, legacy fallback path, backfill emit

## 3. Aspect-locked resize

- [x] 3.1 In `packages/client/src/canvas/controller.ts`, branch on `item.type === 'image'` inside the corner-drag pointermove handler
- [x] 3.2 Implement the aspect-locked resize math (D4): dominant axis drives, short side from aspect, both snapped to `cellSize` via `Math.max(cellSize, ceil(...))`, anchor opposite corner
- [x] 3.3 Route through `GridService.canPlace` and `findFreeCells` as the existing free-aspect resize does
- [x] 3.4 Non-image items keep the existing free-aspect behavior (regression guard)
- [x] 3.5 Add `packages/client/src/__tests__/aspect-locked-resize.test.ts`: 2:1 image grows to 2×1 / 4×2 / 6×3, never 3×3; corner anchors correctly; non-image item unchanged

## 4. Paste flow

- [x] 4.1 Create `packages/client/src/media/paste-image.ts` with `pasteImageFromClipboard(): Promise<{file, mimeType, naturalWidth, naturalHeight} | null>` that reads the clipboard (paste event items OR `navigator.clipboard.read()`), probes natural size via `URL.createObjectURL` + `Image.decode()`
- [x] 4.2 Add `uploadImageFromBlob(boardId, file, naturalW, naturalH): Promise<UploadedAsset>` that wraps `uploadImage` and returns the asset record (or extends `uploadImage` to accept the dimensions)
- [x] 4.3 Add `packages/client/src/__tests__/paste-image.test.ts` with mocked clipboard: image present, no image, decode failure, upload failure

## 5. Controller: paste handler + image tool

- [x] 5.1 In `packages/client/src/canvas/controller.ts`, add a `pasteImageFromClipboard()` method that calls `paste-image.ts`, then `defaultImageSize` to compute the rect, then `createItem` (already on `ToolContext`) with the right attrs and a snapped position from `lastPointerBoard`
- [x] 5.2 Add a `window` paste listener in `BoardPage` (or controller) that calls `pasteImageFromClipboard` when no text input is focused
- [x] 5.3 Add a `canvas` `contextmenu` listener in the controller that calls `preventDefault` and emits a "open context menu" event with the cursor position + the hit item (or null)
- [x] 5.4 Add `packages/client/src/canvas/tools/image-tool.ts` implementing `Tool` — inserts an image item at the pointer using the default size rule (no clipboard read; the user picks an image file via a hidden `<input type="file">` if we add that, or this tool is omitted from v1)
- [x] 5.5 In `packages/client/src/canvas/tools/population.ts`, swap `StubTool('image')` for the new `ImageCreateTool`
- [x] 5.6 Decide: does the 'image' tool ship in v1, or is paste the only entry point? If omitted, leave the stub and document the gap

## 6. Context menu component

- [x] 6.1 Create `packages/client/src/ui/ContextMenu.tsx` — floating panel with the `MenuItem` shape from D7, position via `anchor` prop, flip-to-viewport logic, close on outside click / Escape / scroll
- [x] 6.2 Add a controller method `openContextMenu(anchor, items)` and a `subscribeContextMenu` that pushes the current menu state to React (same pattern as `subscribeMinimap`)
- [x] 6.3 In `BoardPage`, mount `<ContextMenu>` and bind it to the controller subscription
- [x] 6.4 Implement the three menu variants: global (Paste, View), image (Size submenu 1×..8×, Paste, Delete, info), other-item (Paste, Delete)
- [x] 6.5 Add `packages/client/src/__tests__/context-menu.test.tsx`: opens on right-click, closes on outside click / Escape, image menu includes size submenu, selection updates when right-clicking an unselected item

## 7. Wire it up

- [x] 7.1 In `packages/client/src/app/BoardPage.tsx`, install the global `paste` listener; mount the context menu; pass the board id and JWT (already available in BoardPage) to the controller methods
- [x] 7.2 Verify the existing `useUIStore` toast pattern for error reporting on failed pastes; wire `pasteImageFromClipboard` errors to it
- [x] 7.3 Run the full test suite (`pnpm -r test`), type check (`pnpm -r typecheck`), and production build (`pnpm -r build`)
- [x] 7.4 Manual smoke test: paste a 2:1 image at the pointer, drag a corner, verify aspect is preserved; right-click an image and use a size entry; verify a 1:1 image pastes at 1×1

## 8. Spec archive

- [ ] 8.1 Run `openspec validate paste-image-with-cover-fit --strict` and resolve any issues
- [ ] 8.2 After implementation, run `openspec archive paste-image-with-cover-fit --yes` to fold the delta into `openspec/specs/media-import/spec.md`

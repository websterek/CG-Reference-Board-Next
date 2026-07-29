# layer-registry — Tasks

## 1. Domain LayerDefinition type

- [x] 1.1 Create `packages/domain/src/layers/registry.ts` with the `LayerDefinition` interface containing all 10 fields: `kind`, `displayName`, `zOrder`, `snapPolicy`, `overlapRule`, `containmentPolicy`, `hitPriority`, `canBeConnectorEndpoint`, `defaultVisible`, `defaultLocked`.
- [x] 1.2 Export the `LayerDefinition` type from `packages/domain/src/layers/index.ts` (create barrel if needed).
- [x] 1.3 Add JSDoc comments to each field describing its purpose and valid values.

## 2. Domain default registry

- [x] 2.1 Populate the registry `Map` with 4 default entries matching the council decision table:
  - `frame`: zOrder=0, snapPolicy='mandatory', overlapRule='forbid-same-kind', containmentPolicy='no-nesting', canBeConnectorEndpoint=false, hitPriority=10, defaultVisible=true, defaultLocked=false
  - `media`: zOrder=1, snapPolicy='mandatory', overlapRule='forbid-same-kind', containmentPolicy='none', canBeConnectorEndpoint=true, hitPriority=20, defaultVisible=true, defaultLocked=false
  - `overlay`: zOrder=2, snapPolicy='mandatory', overlapRule='forbid-same-kind', containmentPolicy='none', canBeConnectorEndpoint=true, hitPriority=30, defaultVisible=true, defaultLocked=false
  - `annotation`: zOrder=4, snapPolicy='off', overlapRule='none', containmentPolicy='none', canBeConnectorEndpoint=false, hitPriority=50, defaultVisible=true, defaultLocked=false
- [x] 2.2 Set `displayName` for each: `'Frames'`, `'Media'`, `'Overlay'`, `'Annotations'`.
- [x] 2.3 Mark the 4 default kinds as non-deletable (e.g., a `readonly` flag or a `DEFAULT_KINDS` set).

## 3. Domain registry helpers

- [x] 3.1 Implement `getLayerDef(kind: string): LayerDefinition` — returns the definition or throws for unknown kinds.
- [x] 3.2 Implement `getAllLayers(): LayerDefinition[]` — returns all registered entries.
- [x] 3.3 Implement `sortByZOrder(): string[]` — returns kind strings sorted by `zOrder` ascending.
- [x] 3.4 Implement `sortByHitPriority(): string[]` — returns kind strings sorted by `hitPriority` descending.
- [x] 3.5 Implement `getLayerIds(): string[]` — returns all valid layer IDs (derived from `DEFAULT_LAYERS` mapping or a separate `layerId` field on `LayerDefinition`).
- [x] 3.6 Implement `initLayerVisibility(): Map<string, boolean>` — builds a map from kind to `defaultVisible`.
- [x] 3.7 Implement `addLayer(def: LayerDefinition): void` — adds a new entry; throws if kind already exists.
- [x] 3.8 Implement `deleteLayer(kind: string, itemCount: number): boolean` — deletes if `itemCount === 0` and kind is not a default kind; throws otherwise; returns `true` on successful removal.
- [x] 3.9 Implement `isDefaultKind(kind: string): boolean` — returns true for the 4 default kinds.

## 4. Domain board.ts migration

- [x] 4.1 Replace `LayerKind` union type at `board.ts:40` with `type LayerKind = string` (or remove the alias and use `string` directly).
- [x] 4.2 Replace `DEFAULT_LAYERS` array at `board.ts:49-54` with a call to populate the registry (or remove it — the registry is the new source of truth).
- [x] 4.3 Update `Layer.kind` field type at `board.ts:99` from `LayerKind` to `string`.
- [x] 4.4 Update `LayerKindMeta.kind` field type at `board.ts:45` from `LayerKind` to `string`.
- [x] 4.5 Update `LayerSchema.kind` at `board.ts:153` from `z.enum(['frame', 'media', 'overlay', 'annotation'])` to `z.string().refine(kind => getLayerDef(kind) !== undefined, { message: 'Unknown layer kind' })`.
- [x] 4.6 Update `BoardItemSchema.layerId` refinement at `board.ts:169-173` from hardcoded `['frames', 'media', 'overlay', 'annotations']` to use `getLayerIds()` from the registry.
- [x] 4.7 Remove the `DEFAULT_LAYERS` export if it is no longer needed (check all consumers first).

## 5. Client controller.ts migration

- [x] 5.1 Replace `LAYER_Z_ORDER` at `controller.ts:60` with a call to `sortByZOrder()` from the registry.
- [x] 5.2 Replace `layerPriority` array at `controller.ts:304` (in `hitTest()`) with a call to `sortByHitPriority()`.
- [x] 5.3 Replace `layerPriority` array at `controller.ts:1106` (in `pickTopmostItem()`) with a call to `sortByHitPriority()`.
- [x] 5.4 Replace `layerVisible` map initialization at `controller.ts:97-102` with `initLayerVisibility()` from the registry.
- [x] 5.5 Update `layerContainers` map at `controller.ts:65` — if keyed by `LayerKind`, change to `string`.
- [x] 5.6 Update `addItemToLayer()` at `controller.ts:595` — if it references `LayerKind`, change to `string`.
- [x] 5.7 Update `pickTopmostItem()` signature at `controller.ts:1102-1105` — if `getKind` returns `LayerKind`, change to `string`.

## 6. Client registry wiring

- [x] 6.1 Controller imports registry helpers (`sortByZOrder`, `sortByHitPriority`, `initLayerVisibility`) at module init time.
- [x] 6.2 Controller rebuilds derived lists (z-order, hit-priority, visibility) when the registry changes (e.g., after `addLayer()`).
- [x] 6.3 Ensure `layerContainers` map is rebuilt when a new kind is added (new PixiJS `Container` created for the new kind).

## 7. Domain registry tests

- [x] 7.1 Unit test: default registry has exactly 4 entries with correct policy values per the council table.
- [x] 7.2 Unit test: `sortByZOrder()` returns `['frame', 'media', 'overlay', 'annotation']`.
- [x] 7.3 Unit test: `sortByHitPriority()` returns `['annotation', 'overlay', 'media', 'frame']`.
- [x] 7.4 Unit test: `addLayer()` adds a new entry and derived sorts include it.
- [x] 7.5 Unit test: `addLayer()` throws on duplicate kind.
- [x] 7.6 Unit test: `deleteLayer()` succeeds when item count is 0 and kind is not default.
- [x] 7.7 Unit test: `deleteLayer()` throws when item count > 0.
- [x] 7.8 Unit test: `deleteLayer()` throws for default kinds.
- [x] 7.9 Unit test: `getLayerDef()` throws for unknown kind.
- [x] 7.10 Unit test: `initLayerVisibility()` returns correct map from default entries.

## 8. Domain migration

- [x] 8.1 Verify that existing boards with `Layer.kind` values `'frame'`, `'media'`, `'overlay'`, `'annotation'` pass the new `LayerSchema` validation (string + registry refine).
- [x] 8.2 Verify that existing boards with `layerId` values `'frames'`, `'media'`, `'overlay'`, `'annotations'` pass the new `BoardItemSchema` validation (registry-derived layer IDs).
- [x] 8.3 If `DEFAULT_LAYERS` is removed from `board.ts`, ensure no importers break (check `registry.ts:11` which imports `DEFAULT_LAYERS`).
- [x] 8.4 Add a migration test: load a board snapshot with the old 4-kind data, verify it validates against the new schemas.

## 9. Spec revision

- [x] 9.1 Update `openspec/specs/semantic-layers/spec.md` line 14: replace "four fixed `LayerKind` values" requirement with "Registry-Driven Kinds" requirement pointing to the `layer-registry` capability.
- [x] 9.2 Add "Backward Compatibility" requirement to `semantic-layers/spec.md`.
- [x] 9.3 Add "Kind Promotion Path" requirement to `semantic-layers/spec.md`.
- [x] 9.4 Ensure the delta spec at `openspec/changes/layer-registry/specs/semantic-layers/spec.md` is consistent with the base spec.

## 10. Integration tests

- [x] 10.1 Test: auto-routing still works — creating a rectangle item places it on the media layer.
- [x] 10.2 Test: cross-layer overlap still allowed — placing a media item inside a frame item does not reject.
- [x] 10.3 Test: same-kind non-overlap still enforced — dragging a media item onto another media item rejects.
- [x] 10.4 Test: annotation snap exemption — annotation strokes are not quantized.
- [x] 10.5 Test: frame no-nesting containment — placing a frame inside another frame rejects.
- [x] 10.6 Test: z-order rendering — frame items render behind media, media behind overlay, overlay behind annotation.
- [x] 10.7 Test: hit-test priority — clicking overlapping annotation and media items selects the annotation item.

## 11. Documentation

- [x] 11.1 Create `packages/domain/src/layers/README.md` documenting the registry pattern.
- [x] 11.2 Document the `LayerDefinition` interface with field descriptions.
- [x] 11.3 Document how to add a new layer kind (one `addLayer()` call).
- [x] 11.4 Document how derived lists work (z-order, hit-priority, visibility, schema validation).
- [x] 11.5 Document the non-empty deletion rule and default kind immutability.

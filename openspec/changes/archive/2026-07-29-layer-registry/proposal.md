# layer-registry

## Why

The current `LayerKind` type is a closed union (`'frame' | 'media' | 'overlay' | 'annotation'`) defined at `packages/domain/src/board.ts:40`. Adding a new layer kind requires touching at least 6 locations across 3 files:

- `board.ts:40` — the `LayerKind` union
- `board.ts:49-54` — `DEFAULT_LAYERS` array
- `board.ts:153` — `LayerSchema.kind` enum
- `board.ts:169-173` — `BoardItemSchema.layerId` refinement
- `controller.ts:60` — `LAYER_Z_ORDER` array
- `controller.ts:97-102` — `layerVisible` map
- `controller.ts:304` — `layerPriority` in `hitTest`
- `controller.ts:1106` — `layerPriority` in `pickTopmostItem`

Each of these is a hardcoded list that must be kept in sync manually. The council unanimously recommends replacing the closed enum with a `LayerDefinition` registry pattern, reducing "add a layer kind" from a ~6-file breaking change to a single registration.

## What Changes

- **Replace `LayerKind` union** with a `string` type alias; kinds become extensible identifiers rather than a closed set.
- **Introduce `LayerDefinition` interface** in a new `packages/domain/src/layers/registry.ts` module, defining 10 fields: `kind`, `displayName`, `zOrder`, `snapPolicy`, `overlapRule`, `containmentPolicy`, `hitPriority`, `canBeConnectorEndpoint`, `defaultVisible`, `defaultLocked`.
- **Populate default registry** with the 4 existing kinds (frame, media, overlay, annotation) using the policy values from the council decision table.
- **Derive all hardcoded lists** from the registry:
  - `LAYER_Z_ORDER` (controller.ts:60) → `sortByZOrder()`
  - `layerPriority` arrays (controller.ts:304, 1106) → `sortByHitPriority()`
  - `BoardItemSchema.layerId` refinement (board.ts:169-173) → allowed values from registry
  - `layerVisible` map (controller.ts:97-102) → initialized from registry `defaultVisible`
  - `DEFAULT_LAYERS` (board.ts:49-54) → becomes the initial registry population
- **Preserve auto-routing**: `layerKindFor(type)` (registry.ts:86) and `ItemTypeDefinition.layerKind` remain unchanged.
- **Preserve invariants**: cross-layer overlap allowed, same-kind non-overlap enforced, annotation snap exemption.

## New Capabilities

- **`layer-registry`** — `LayerDefinition` interface, default registry with 4 entries, z-order/hit-priority derivation, runtime add-layer, non-empty deletion forbidden.

## Modified Capabilities

- **`semantic-layers`** — Replace "four fixed kinds forever" (spec.md line 14) with registry-driven kinds. Define `LayerDefinition` schema. Preserve auto-routing, overlap rules, and snap policy.

## Impact

| File | Change |
|---|---|
| `packages/domain/src/board.ts` | Replace `LayerKind` union with `string` type alias; replace `DEFAULT_LAYERS` with registry population; update `LayerSchema.kind` and `BoardItemSchema.layerId` to use registry |
| `packages/domain/src/layers/registry.ts` | **New file** — `LayerDefinition` interface, default registry, helper functions |
| `packages/client/src/canvas/controller.ts` | Replace `LAYER_Z_ORDER` with `sortByZOrder()`; replace `layerPriority` arrays with `sortByHitPriority()`; initialize `layerVisible` from registry |
| `packages/domain/src/items/registry.ts` | Update `layerKindFor` and `defaultLayerIdFor` to consume the new registry module |
| `openspec/specs/semantic-layers/spec.md` | Replace "four fixed kinds" requirement with registry-driven kinds requirement |

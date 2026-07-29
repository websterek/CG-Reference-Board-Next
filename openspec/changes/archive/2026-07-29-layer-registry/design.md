# layer-registry — Design

## Context

The GridBoard project currently models layer kinds as a closed TypeScript union:

```ts
// packages/domain/src/board.ts:40
export type LayerKind = 'frame' | 'media' | 'overlay' | 'annotation';
```

This union is referenced in at least 8 hardcoded locations across `board.ts` and `controller.ts`:

| Location | Hardcoded list |
|---|---|
| `board.ts:40` | `LayerKind` union type |
| `board.ts:49-54` | `DEFAULT_LAYERS` array (4 entries) |
| `board.ts:153` | `LayerSchema.kind` Zod enum |
| `board.ts:169-173` | `BoardItemSchema.layerId` refinement (4 layer IDs) |
| `controller.ts:60` | `LAYER_Z_ORDER` array |
| `controller.ts:97-102` | `layerVisible` map |
| `controller.ts:304` | `layerPriority` in `hitTest()` |
| `controller.ts:1106` | `layerPriority` in `pickTopmostItem()` |

Auto-routing by item type (`layerKindFor(type)` at `registry.ts:86`) and `ItemTypeDefinition.layerKind` are the only indirections — they map item types to kinds but do not help with the kind-level policy lists.

The council unanimously recommended replacing the closed enum with a `LayerDefinition` registry. This design document describes how.

## Goals

1. **Extensible registry**: Adding a new layer kind is a single `addLayer()` call, not a multi-file breaking change.
2. **Derived lists**: All hardcoded arrays (`LAYER_Z_ORDER`, `layerPriority`, `layerVisible`, `DEFAULT_LAYERS`, schema refinements) become derived getters that read from the registry.
3. **Preserved auto-routing**: `layerKindFor(type)` and `ItemTypeDefinition.layerKind` remain unchanged.
4. **Preserved invariants**: Cross-layer overlap allowed, same-kind non-overlap enforced, annotation snap exemption, frame no-nesting containment.

## Non-Goals

- **Connector kind**: Adding a `connector` layer kind is a separate proposal (`connector-items`). This proposal only refactors the registry for the 4 existing kinds.
- **Tool/mode architecture**: Tool registration and mode switching are a separate proposal (`tool-registry-and-modes`).
- **Invalid-placement UX**: Visual feedback for rejected placements is a separate proposal (`invalid-placement-ux`).

## Decisions

### D1: Kind is `string`, not a closed union

The `LayerKind` type alias becomes `string` instead of a union of literal types. This makes the registry the single source of truth for valid kinds. TypeScript cannot exhaustively check a `string` type, but the registry's `getLayerDef(kind)` function throws for unknown kinds, providing equivalent runtime safety.

**Rationale**: A closed union defeats the purpose of a registry. Every new kind would still require a type change. Runtime validation via the registry is sufficient.

### D2: Registry lives in `packages/domain/src/layers/registry.ts`

A new module under the domain package, keeping layer definitions framework-free and importable by both client and server.

**Rationale**: The domain package is the shared source of truth. The registry is pure data and functions with no React, PixiJS, or Fastify dependencies.

### D3: Default registry is the 4 existing kinds

The registry is pre-populated with `frame`, `media`, `overlay`, and `annotation` entries matching the council decision table. This ensures backward compatibility — existing boards with 4-kind data load without changes.

### D4: All hardcoded lists become derived getters

| Old (hardcoded) | New (derived) |
|---|---|
| `LAYER_Z_ORDER` array | `sortByZOrder()` — sorts registry entries by `zOrder` ascending, returns kind strings |
| `layerPriority` arrays | `sortByHitPriority()` — sorts registry entries by `hitPriority` descending, returns kind strings |
| `layerVisible` map | `initLayerVisibility()` — builds a `Map<string, boolean>` from registry `defaultVisible` |
| `DEFAULT_LAYERS` array | Registry population itself; `getAllLayers()` returns all entries |
| `BoardItemSchema.layerId` refinement | `getLayerIds()` returns all valid layer IDs from the registry |
| `LayerSchema.kind` enum | `z.string().refine(kind => getLayerDef(kind) !== undefined)` |

### D5: Non-empty deletion forbidden

`deleteLayer(kind)` throws if any items exist on that layer. This prevents data loss and ensures the registry stays consistent with board state.

### D6: Runtime add-layer allowed

`addLayer(def)` appends a new `LayerDefinition` to the registry at runtime. This enables future features like user-defined layer kinds or plugin-provided kinds without a deployment.

### D7: Default kinds are immutable

The 4 default kinds (`frame`, `media`, `overlay`, `annotation`) cannot be deleted via `deleteLayer()`. They can be modified via `updateLayer()` if needed, but deletion is forbidden to prevent breaking the board's foundational structure.

## Risks

### R1: Migration of existing boards

**Risk**: Existing boards have `Layer` objects with a `kind` field typed as the old `LayerKind` union. After the refactor, `kind` becomes `string`.

**Mitigation**: The 4 default registry entries use the same kind strings (`'frame'`, `'media'`, `'overlay'`, `'annotation'`). Existing board data is compatible without transformation. The `LayerSchema.kind` validation changes from `z.enum([...])` to `z.string().refine(...)` which is strictly more permissive.

### R2: Runtime registry mutation

**Risk**: `addLayer()` and `deleteLayer()` mutate shared state. Concurrent mutations or stale derived lists could cause inconsistencies.

**Mitigation**: The registry is a module-level `Map`. Derived getters (`sortByZOrder()`, `sortByHitPriority()`) compute fresh arrays on each call. The non-empty deletion rule prevents accidental data loss. Future work may add a `subscribe()` mechanism for reactive updates, but that is out of scope for this proposal.

### R3: Per-kind policy divergence

**Risk**: As more kinds are added, per-kind policies may diverge in ways the `LayerDefinition` interface cannot express.

**Mitigation**: The `overlapRule` field accepts a function `(proposed, existing) => boolean`, allowing arbitrary custom overlap logic per kind. If other fields need similar flexibility, the interface can be extended with function-typed alternatives (e.g., `snapPolicy` could become `'mandatory' | 'off' | ((point: Point) => Point)`). This is future work.

### R4: Loss of compile-time exhaustiveness

**Risk**: Switching from a union type to `string` removes TypeScript's ability to check that all kinds are handled in `switch` statements.

**Mitigation**: The registry provides `getAllLayers()` for iteration. Code that previously used `switch (kind)` should iterate over registry entries instead. This is a pattern change, not a safety regression — the registry is the exhaustive list.

## Trade-offs

### Registry complexity vs. extensibility

**Trade-off**: A registry module with 10-field interface, helper functions, and runtime mutation is more complex than a 4-value union type.

**Choice**: Accept the complexity. The current model is simple but brittle — every new kind is a breaking change. The registry pays a one-time complexity cost for permanent extensibility.

### Derived getters vs. cached arrays

**Trade-off**: Computing `sortByZOrder()` on every call is O(n log n) vs. O(1) for a cached array.

**Choice**: Compute fresh on each call. The number of layer kinds is small (4-10). The cost is negligible. Caching would require invalidation logic that adds complexity and bug surface area.

### Runtime mutability vs. compile-time guarantees

**Trade-off**: A mutable runtime registry loses the compile-time guarantee that `LayerKind` is one of 4 values.

**Choice**: Accept runtime validation. The registry's `getLayerDef(kind)` throws for unknown kinds, providing equivalent safety at runtime. The extensibility gain outweighs the loss of compile-time narrowing.

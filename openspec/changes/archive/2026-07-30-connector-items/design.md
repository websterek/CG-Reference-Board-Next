# connector-items — Design

## Context

The GridBoard project currently has no connector concept. The closest existing feature is `annotation-stroke` (freehand polyline on the `annotation` layer, defined at `packages/domain/src/items/annotation.ts:60-80`), but annotation strokes are 2-point freehand marks with no endpoint binding, no re-routing, and no semantic relationship to other items. A connector is a graph edge, not a markup stroke.

The current architecture provides the building blocks needed for connectors:

- **Item type registry** (`packages/domain/src/items/registry.ts:66-71`): `ITEM_TYPES` maps `ItemType` to `ItemTypeDefinition`, providing `getBounds`, `hitTest`, `layerKind`, and `schema`. Adding a connector type follows the established pattern.
- **Layer model** (`packages/domain/src/board.ts:40`): `LayerKind` is currently a closed union. The `layer-registry` proposal (a dependency) replaces this with a `LayerDefinition` registry, making it a single registration to add the `connector` kind.
- **Canvas controller** (`packages/client/src/canvas/controller.ts:60-66`): Four `Container`s in z-order (`frame < media < overlay < annotation`), with `LAYER_Z_ORDER` at line 60 and `renderItemDisplay` at line 604. Adding a 5th container for `connector` follows the established pattern.
- **Tool registry** (`controller.ts:347-350`): `initToolRegistry` registers `FrameCreateTool` and `AnnotationFreehandTool`. Adding `ConnectorTool` follows the same pattern.
- **Spatial index** (`controller.ts:71`): `SpatialIndex` (RBush-backed) is used for viewport culling and hit-test candidates. Connectors use their derived bounding box for spatial indexing.
- **Hit testing** (`controller.ts:301-316`): `hitTest` iterates layers in reverse z-order, calling `ITEM_TYPES[type].hitTest(item, point)`. Connectors add a `hitTest` that checks distance-to-segment.

The council unanimously recommends connectors as a **first-class item type on a new `connector` layer kind**, distinct from annotation arrows. This design document describes how.

## Goals

1. **First-class `ConnectorItem` type** with `from`/`to` as `ItemId` strings (not embedded positions), waypoints, routing styles, arrowhead config, and a derived `dangling` flag.
2. **Semantic endpoint binding**: connectors follow endpoints when items move, using `ItemId` references to avoid stale-position bugs under concurrent edits.
3. **Dangling marker**: when an endpoint item is deleted, the connector sets `dangling: true` and renders with a red broken-line indicator. The connector is NOT cascade-deleted.
4. **Hit-test by distance-to-segment**: within 8px of any segment of the rendered path, with endpoint pins at higher priority.
5. **Two-click `ConnectorTool`**: click first endpoint → drag → click second endpoint. Esc cancels.
6. **New `connector` layer kind** at z=3, between `overlay` (z=2) and `annotation` (z=4), with policies: `snapPolicy='off'`, `overlapRule='none'`, `containmentPolicy='none'`, `hitPriority=40`, `canBeConnectorEndpoint=false`.

## Non-Goals

- **Tool/mode architecture**: The `ConnectorTool` is registered but the mode it lives in (a new `connector` mode) is decided in the separate `tool-registry-and-modes` proposal. This proposal only defines the tool; the mode architecture is out of scope.
- **Invalid-placement UX for connectors**: Connectors use `overlapRule: 'none'` and are exempt from `GridService.canPlace`. They do not participate in the ghost preview rejection system from the `invalid-placement-ux` proposal.
- **The layer registry refactor**: This proposal depends on the `layer-registry` proposal. The registry must exist before the `connector` kind can be registered.
- **Waypoint editing UI**: v1 supports waypoints in the data model (`attrs.waypoints: Point[]`) but does not provide UI for adding, moving, or deleting waypoints. Waypoints can be set programmatically or via future UI.
- **Self-loop connectors**: Connectors from an item to itself are not supported in v1.
- **Connector-to-connector connections**: `canBeConnectorEndpoint: false` means connectors cannot be endpoints for other connectors in v1.
- **Orthogonal and curved routing implementation**: The `attrs.routing` field accepts `'straight' | 'orthogonal' | 'curved'`, but v1 only implements `'straight'` routing. The other values are reserved for future implementation.

## Decisions

### D1: Connectors on a new layer kind, not on media or annotation

**Decision:** Connectors get their own `connector` layer kind at z=3, between `overlay` (z=2) and `annotation` (z=4).

**Rationale:** Connectors have fundamentally different policies from every existing kind: they don't snap to grid, they don't participate in non-overlap, they have distance-to-segment hit testing, and they render above content but below freehand annotations. Placing them on `media` or `overlay` would require per-item policy exceptions. A dedicated layer kind gives connectors their own z-order slot, overlap policy, hit-test priority, and snap policy — all configured once in the `LayerDefinition` registry.

**Alternatives considered:**
- *Place connectors on the `overlay` layer.* Rejected: overlay items snap to grid and enforce non-overlap. Connectors would need per-item exceptions to both policies, adding complexity.
- *Place connectors on the `annotation` layer.* Rejected: annotations are topmost markup. Connectors should render below freehand annotations so annotations can be drawn over connectors.
- *Use an item-type flag instead of a layer kind.* Rejected: z-order, overlap policy, hit-test priority, and snap policy are all per-layer in the current architecture. A per-item flag would require refactoring the layer system.

### D2: `from`/`to` as `ItemId` strings, not embedded positions

**Decision:** `attrs.from` and `attrs.to` are `ItemId` strings. Endpoint positions are resolved at render time from the referenced items' current `x`/`y`/`width`/`height`.

**Rationale:** This is the critical distinction between a connector and an annotation arrow. If endpoints were embedded positions, moving an item would leave the connector pointing at stale coordinates. Under concurrent edits (two users moving connected items), embedded positions would create race conditions where the connector points at an old position. `ItemId` references ensure the connector always resolves to the item's current position, even under concurrent edits.

**Alternatives considered:**
- *Embedded positions with update-on-move.* Rejected: requires a write-back mechanism that updates all connectors when an item moves. This is fragile under concurrent edits — a remote move and a local connector update could conflict, leaving the connector with a stale position.
- *Yjs relative positions.* Rejected: Yjs relative positions are designed for cursor/selection anchoring, not for geometric endpoint binding. They add complexity without solving the concurrent-edit problem better than `ItemId` refs.

### D3: `x`/`y`/`width`/`height` is derived bounding box, not authoritative

**Decision:** The `BoardItem` base fields `x`/`y`/`width`/`height` on a `ConnectorItem` are the bounding box of the rendered path, recomputed when endpoints or waypoints change. They are used for spatial indexing and viewport culling only. The authoritative geometry is the path computed from `attrs.from`/`attrs.to` endpoint positions and `attrs.waypoints`.

**Rationale:** The `BoardItem` interface requires `x`/`y`/`width`/`height` for spatial indexing (`SpatialIndex.insert` at `controller.ts:186`) and viewport culling (`cullViewport` at `controller.ts:575`). Connectors don't have a natural rect — they have a path. The bounding box of the path is the closest approximation. Making it derived (not user-settable) ensures it stays in sync with the actual path.

**Alternatives considered:**
- *Store `x`/`y`/`width`/`height` as user-settable fields.* Rejected: would allow the bounding box to diverge from the actual path, breaking spatial indexing and culling.
- *Skip spatial indexing for connectors.* Rejected: connectors on large boards need culling for performance. Without spatial indexing, every connector would be tested for hit-testing on every click.

### D4: Dangling marker instead of cascade-delete

**Decision:** When an endpoint item is deleted, the connector sets `attrs.dangling: true` and renders with a red broken-line indicator. The connector is NOT cascade-deleted.

**Rationale:** This is consistent with the persistent-red-marker UX pattern from the `invalid-placement-ux` proposal. Cascade-delete would silently remove connectors, which could surprise users who spent time creating them. The dangling marker gives users agency: they can see which connectors are broken, reattach them to new items, or delete them manually. This also avoids the complexity of cascading deletes through chains of connectors.

**Alternatives considered:**
- *Cascade-delete connectors when endpoint is deleted.* Rejected: silent data loss. Users may have created complex connector graphs and would lose them without warning.
- *Null out the endpoint reference.* Rejected: loses the information about which item was connected. The user can't reattach because they don't know what was there before.

### D5: Z-order between overlay and annotation

**Decision:** The full z-order is `frame (0) < media (1) < overlay (2) < connector (3) < annotation (4)`.

**Rationale:** Connectors are structural elements that connect content items. They should render above content (media, overlay) so they are visible, but below freehand annotations so users can draw markup over connectors. This matches the mental model: content → connections → markup.

**Alternatives considered:**
- *Connectors above annotation.* Rejected: annotations are "markup on top of everything." Drawing an annotation over a connector should be possible.
- *Connectors below overlay.* Rejected: connectors between overlay items would be hidden behind the overlay items themselves.

### D6: Connectors exempt from `GridService.canPlace`

**Decision:** Connectors use `overlapRule: 'none'` in their `LayerDefinition`. The `GridService.canPlace` function (or its registry-aware replacement) skips overlap checks for kinds with `overlapRule: 'none'`. Connectors do not participate in the ghost preview rejection system.

**Rationale:** Connectors are lines, not rects. They can cross over other items freely. Enforcing non-overlap on connectors would make them nearly impossible to place on a populated board. The `overlapRule: 'none'` policy is the correct mechanism — it's already designed into the `LayerDefinition` interface from the `layer-registry` proposal.

**Alternatives considered:**
- *Special-case connectors in `canPlace`.* Rejected: the `overlapRule` field on `LayerDefinition` already handles this. Adding a special case would duplicate the policy mechanism.
- *Allow connectors to overlap but still run `canPlace`.* Rejected: `canPlace` would always return true for connectors, so running it is wasted computation.

### D7: Hit-test by distance-to-segment within 8px

**Decision:** `connectorHitTest(item, point)` checks if the point is within 8px (in board coordinates) of any segment of the connector's rendered path. Endpoint pins (small circles at the `from` and `to` anchor positions) are checked first at higher priority.

**Rationale:** Connectors are 1D paths, not 2D rects. A rect-based hit test would have a large false-positive area. Distance-to-segment is the standard approach for line hit-testing in vector graphics applications. The 8px tolerance provides a comfortable click target without being so large that nearby connectors are ambiguous. Endpoint pins at higher priority allow users to specifically target the ends of a connector (useful for reattachment).

**Alternatives considered:**
- *Rect-based hit test on the bounding box.* Rejected: too many false positives. Clicking anywhere in the bounding box would select the connector, even far from the actual path.
- *Smaller tolerance (4px).* Rejected: too hard to click on high-DPI displays or at high zoom levels.
- *Larger tolerance (12px).* Rejected: ambiguous when multiple connectors are close together.

## Risks

### R1: Concurrent edit races on endpoint items

**Risk:** Two users simultaneously move connected items. The connector resolves endpoint positions from the Yjs document, which converges via CRDT. However, between the time the connector reads the `from` item's position and the `to` item's position, a remote update could change one of them, causing the connector to render with a mix of old and new positions for one frame.

**Mitigation:** This is a one-frame visual glitch, not a data corruption issue. The connector re-resolves positions on the next frame. The `ItemId` reference ensures the connector always converges to the correct positions. This is the same class of glitch as any multi-item rendering under concurrent edits — it's inherent to eventually-consistent systems and acceptable for a canvas application.

### R2: Dangling connector accumulation

**Risk:** Over time, users may delete many items, leaving accumulated dangling connectors that clutter the board. There is no automatic cleanup.

**Mitigation:** The red broken-line marker makes dangling connectors highly visible. Users can see them and delete them manually. A future "cleanup dangling connectors" tool or automatic cleanup after a configurable timeout could be added, but this is out of scope for v1. The dangling marker is the first step — it makes the problem visible.

### R3: Hit-test performance on long paths with many waypoints

**Risk:** Distance-to-segment hit testing is O(n) in the number of segments. A connector with many waypoints could be slow to hit-test.

**Mitigation:** The spatial index (`SpatialIndex` at `controller.ts:71`) filters candidates before hit-testing. Only connectors whose bounding box contains the click point are tested. In v1, waypoints are not user-editable, so the number of segments is small (typically 1-3). If waypoint editing is added later, the hit-test can be optimized with a spatial index on individual segments.

### R4: Tool complexity — two-click interaction

**Risk:** The two-click interaction (click source → drag → click target) is less familiar than drag-from-source-to-target. Users may expect to drag from an item's edge to create a connector.

**Mitigation:** Two-click is simpler to implement and less ambiguous than drag-from-edge. Drag-from-edge requires distinguishing "drag to move item" from "drag to create connector," which needs a modifier key or handle. Two-click avoids this ambiguity entirely. The preview line during drag provides clear visual feedback. A drag-from-edge variant can be added later as an alternative interaction.

### R5: Bounding box invalidation on endpoint move

**Risk:** When an endpoint item moves, the connector's bounding box must be recomputed and the spatial index updated. If this is not done correctly, the connector may disappear from view (culled incorrectly) or become unclickable (not in spatial index results).

**Mitigation:** The bounding box is recomputed in `getConnectorBounds()` and the spatial index is updated in `controller.updateItem()` (line 203: `this.index.update(next, layerKindFor(next.type))`). The controller's render loop calls `updateItem` when endpoint positions change, which triggers the spatial index update. This is the same pattern used by all other item types.

## Trade-offs

### Separate layer vs. item-type flag

**Trade-off:** A dedicated `connector` layer kind adds a 5th layer to the system, increasing complexity. An item-type flag (e.g., `isConnector: true` on a `BoardItem`) would avoid adding a layer.

**Choice:** Separate layer. The layer kind provides a z-order slot, overlap policy, hit-test priority, and snap policy — all of which are per-layer in the current architecture. An item-type flag would require refactoring the layer system to support per-item policy overrides, which is more complex than adding a layer. The `layer-registry` proposal makes adding a layer a single registration, so the cost is low.

### Dangling vs. cascade-delete

**Trade-off:** Dangling connectors accumulate on the board and require manual cleanup. Cascade-delete would keep the board clean automatically.

**Choice:** Dangling. User agency is more important than automatic cleanup. The red broken-line marker makes dangling connectors visible and actionable. This is consistent with the `invalid-placement-ux` proposal's philosophy of persistent visual feedback rather than silent correction. A future cleanup tool can address accumulation.

### Endpoint ItemId vs. embedded position

**Trade-off:** `ItemId` references require resolving positions at render time, which adds a lookup per connector per frame. Embedded positions would be faster to render but would require a write-back mechanism to keep them in sync.

**Choice:** `ItemId` references. The render-time lookup is O(1) in a `Map` and is negligible compared to the PixiJS draw calls. The correctness guarantee — no stale positions under concurrent edits — is worth the minor performance cost. Embedded positions would create a data consistency problem that is harder to solve than a performance problem.

### Two-click vs. drag-from-edge tool

**Trade-off:** Two-click is less intuitive for users familiar with draw.io/Excalidraw's drag-from-edge interaction. Drag-from-edge is more natural but requires disambiguating from item move.

**Choice:** Two-click for v1. It's simpler to implement, has no ambiguity with item move, and provides clear visual feedback via the preview line. Drag-from-edge can be added as an alternative interaction in a future iteration without changing the connector data model.

### Straight-only vs. all routing styles in v1

**Trade-off:** The `attrs.routing` field accepts `'straight' | 'orthogonal' | 'curved'`, but v1 only implements `'straight'`. This means the data model supports future routing styles without a schema migration, but the UI doesn't expose them yet.

**Choice:** Accept the forward-compatible data model. Implementing orthogonal and curved routing requires non-trivial geometry algorithms (orthogonal pathfinding, bezier curve computation). Shipping `'straight'` first validates the connector concept end-to-end. The `routing` field is ready for future implementation without a breaking schema change.

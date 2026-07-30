# connector-items

## Why

Users want Excalidraw/draw.io-style graph edges between items on the board — semantic connectors that bind to endpoint items and re-route when those items move. The current system has no connector concept. The closest existing feature is `annotation-stroke` (freehand polyline on the `annotation` layer, defined at `packages/domain/src/items/annotation.ts:60-80`), but annotation strokes are 2-point freehand marks with no endpoint binding, no re-routing, and no semantic relationship to other items. A connector is a graph edge, not a markup stroke.

The council unanimously recommends connectors as a **first-class item type on a new `connector` layer kind**, distinct from annotation arrows.

## What Changes

- **Add `connector` layer kind** at z=3, between `overlay` (z=2) and `annotation` (z=4). The new z-order is `frame (0) < media (1) < overlay (2) < connector (3) < annotation (4)`.
- **Add `ConnectorItem` type** to the `ItemType` union with `from`/`to` as `ItemId` strings (not embedded positions), waypoints, routing style, arrowhead config, and a derived `dangling` flag.
- **Add `ConnectorItemDefinition`** to the `ITEM_TYPES` registry with `layerKind: 'connector'`, `getBounds` (derived from path), and `hitTest` (distance-to-segment within 8px).
- **Add `ConnectorTool`** (two-click interaction): click first endpoint item → drag → click second endpoint item. Esc cancels mid-creation.
- **Implement endpoint integrity**: when an endpoint item is deleted, the connector sets `dangling: true` and renders with a red broken-line indicator. The connector is NOT cascade-deleted.
- **Add connector renderer** in `packages/client/src/canvas/renderers/connector.ts` using PixiJS Graphics, with red broken-line rendering for dangling connectors.
- **Add 5th PixiJS Container** in `controller.ts` for the `connector` layer, between the overlay and annotation containers.
- **Implement endpoint tracking**: re-resolve endpoint positions each frame in `renderItemDisplay` so connectors follow their endpoints when items move.

## New Capabilities

- **`connector-items`** — The `ConnectorItem` type with `from`/`to` ItemId refs, waypoints, routing styles, arrowhead config, endpoint integrity (dangling marker on endpoint delete), hit-test by distance-to-segment within 8px, and derived bounding box from the rendered path.

## Modified Capabilities

- **`semantic-layers`** — Add `connector` as a first-class layer kind at z=3 with policies: `snapPolicy='off'`, `overlapRule='none'`, `containmentPolicy='none'`, `hitPriority=40`, `canBeConnectorEndpoint=false`. This is a delta on top of the `layer-registry` proposal's registry-driven model.

## Impact

| File | Change |
|---|---|
| `packages/domain/src/board.ts` | Add `'connector'` to `ItemType` union (line 32); add `ConnectorItem` interface; add `ConnectorAttrs` interface; add `ConnectorAttrsSchema` Zod schema; update `ItemTypeSchema` (line 156) |
| `packages/domain/src/items/registry.ts` | Add `ConnectorItemDefinition` to `ITEM_TYPES` (line 66); add `KnownAttrs` entry for `'connector'` (line 72) |
| `packages/domain/src/items/connector.ts` | **New file** — `ConnectorAttrs`, `ConnectorAttrsSchema`, `DEFAULT_CONNECTOR_ATTRS`, `isConnectorItem`, `getConnectorBounds`, `connectorHitTest`, `ConnectorItemDefinition` |
| `packages/domain/src/layers/registry.ts` | Add `connector` entry to default registry (zOrder=3, hitPriority=40, snapPolicy='off', overlapRule='none', containmentPolicy='none', canBeConnectorEndpoint=false) |
| `packages/client/src/canvas/renderers/connector.ts` | **New file** — `renderConnector(item, display)` using PixiJS Graphics; red broken-line for dangling |
| `packages/client/src/canvas/tools/connector-tool.ts` | **New file** — `ConnectorTool` with two-click interaction; Esc cancels |
| `packages/client/src/canvas/controller.ts` | Add 5th `Container` for `connector` layer (line 141-146); update `LAYER_Z_ORDER` (line 60); add `connector` to `layerVisible` map (line 97-102); add `connector` to `layerPriority` arrays (lines 304, 1106); add `'connector'` case to `renderItemDisplay` (line 604); add `hitTestConnector` logic; register `ConnectorTool` in `initToolRegistry` (line 347-350); add endpoint re-resolve in render loop |
| `packages/client/src/ui/Toolbar.tsx` | Add `'connector'` to `ToolName` union (line 12); add `'connector'` to `InteractionMode` union (line 14); add connector tool button in connector mode |

## Dependencies

- **`layer-registry`** — The `LayerDefinition` registry must exist before the `connector` kind can be registered. This proposal assumes the registry-driven model from the `layer-registry` proposal is in place.
- **`tool-registry-and-modes`** — The `ConnectorTool` is registered but the mode it lives in (a new `connector` mode) is decided in that separate proposal. This proposal only defines the tool; the mode architecture is out of scope.

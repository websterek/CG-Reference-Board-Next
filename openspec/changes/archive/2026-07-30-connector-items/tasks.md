# connector-items — Tasks

## 1. Domain — ConnectorItem type

- [x] 1.1 Add `'connector'` to the `ItemType` union at `packages/domain/src/board.ts:32`:
  ```typescript
  export type ItemType =
    | 'rectangle'
    | 'image'
    | 'frame'
    | 'annotation-stroke'
    | 'connector';
  ```
- [x] 1.2 Add `ConnectorAttrs` interface to `packages/domain/src/board.ts` (after `BoardItem` interface at line 114):
  ```typescript
  export interface ConnectorAttrs {
    readonly from: ItemId;
    readonly to: ItemId;
    readonly fromAnchor: 'auto' | { readonly x: number; readonly y: number };
    readonly toAnchor: 'auto' | { readonly x: number; readonly y: number };
    readonly waypoints: ReadonlyArray<Point>;
    readonly routing: 'straight' | 'orthogonal' | 'curved';
    readonly style: {
      readonly strokeColor: string;
      readonly strokeWidth: number;
      readonly arrowheadStart: 'none' | 'arrow';
      readonly arrowheadEnd: 'none' | 'arrow';
    };
    readonly dangling: boolean;
  }
  ```
- [x] 1.3 Add `ConnectorItem` interface to `packages/domain/src/board.ts` (after `ConnectorAttrs`):
  ```typescript
  export interface ConnectorItem extends BoardItem {
    readonly type: 'connector';
    readonly layerKind: 'connector';
    readonly attrs: ConnectorAttrs;
  }
  ```
- [x] 1.4 Add `ConnectorAttrsSchema` Zod schema to `packages/domain/src/board.ts` (after `BoardItemSchema` at line 174):
  ```typescript
  export const ConnectorAttrsSchema = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    fromAnchor: z.union([
      z.literal('auto'),
      z.object({ x: z.number(), y: z.number() }),
    ]),
    toAnchor: z.union([
      z.literal('auto'),
      z.object({ x: z.number(), y: z.number() }),
    ]),
    waypoints: z.array(z.object({ x: z.number(), y: z.number() })),
    routing: z.enum(['straight', 'orthogonal', 'curved']),
    style: z.object({
      strokeColor: z.string(),
      strokeWidth: z.number().positive(),
      arrowheadStart: z.enum(['none', 'arrow']),
      arrowheadEnd: z.enum(['none', 'arrow']),
    }),
    dangling: z.boolean(),
  });
  ```
- [x] 1.5 Add `'connector'` to `ItemTypeSchema` at `packages/domain/src/board.ts:156`:
  ```typescript
  export const ItemTypeSchema = z.enum(['rectangle', 'image', 'frame', 'annotation-stroke', 'connector']);
  ```
- [x] 1.6 Add `'connectors'` to the `BoardItemSchema.layerId` refinement at `packages/domain/src/board.ts:169-173` (or ensure the registry-driven approach from `layer-registry` handles this automatically).

## 2. Domain — ConnectorItemDefinition

- [x] 2.1 Create `packages/domain/src/items/connector.ts` with:
  - `ConnectorAttrs` interface (re-exported from `board.ts` or defined locally)
  - `ConnectorAttrsSchema` (re-exported from `board.ts` or defined locally)
  - `DEFAULT_CONNECTOR_ATTRS`:
    ```typescript
    export const DEFAULT_CONNECTOR_ATTRS: ConnectorAttrs = Object.freeze({
      from: '' as unknown as ItemId,
      to: '' as unknown as ItemId,
      fromAnchor: 'auto',
      toAnchor: 'auto',
      waypoints: [],
      routing: 'straight',
      style: {
        strokeColor: '#ffffff',
        strokeWidth: 2,
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
      },
      dangling: false,
    });
    ```
  - `isConnectorItem(item: BoardItem): item is ConnectorItem` — type guard checking `item.type === 'connector'` and schema validation
  - `getConnectorBounds(item: BoardItem): Rect` — computes bounding box from endpoint anchor positions and waypoints, with padding for stroke width and arrowheads
  - `connectorHitTest(item: BoardItem, point: Point): boolean` — distance-to-segment within 8px; checks endpoint pins first at higher priority
  - `ConnectorItemDefinition: ItemTypeDefinition<ConnectorAttrs>` with `type: 'connector'`, `layerKind: 'connector'`, `schema: ConnectorAttrsSchema`, `defaultAttrs: DEFAULT_CONNECTOR_ATTRS`, `defaultSize: { width: 0, height: 0 }`, `getBounds: getConnectorBounds`, `hitTest: connectorHitTest`
- [x] 2.2 Implement `getConnectorBounds`:
  - Resolve `from` and `to` anchor positions (for bounds computation, use `'auto'` → item center; explicit → item top-left + offset)
  - Collect all path points: from anchor, waypoints, to anchor
  - Compute min/max x/y across all points
  - Add padding: `strokeWidth + arrowheadSize + 4px` margin
  - Return `{ x: minX - padding, y: minY - padding, width: maxX - minX + 2 * padding, height: maxY - minY + 2 * padding }`
- [x] 2.3 Implement `connectorHitTest`:
  - Check endpoint pins first: if point is within 8px of `from` or `to` anchor position, return `true`
  - Build segment list: from anchor → waypoints[0] → ... → waypoints[n] → to anchor
  - For each segment, compute point-to-segment distance
  - Return `true` if any distance ≤ 8px
  - Use the standard point-to-segment distance formula: `distance = |(p - a) × (b - a)| / |b - a|` clamped to the segment
- [x] 2.4 Add `ConnectorItemDefinition` to `ITEM_TYPES` at `packages/domain/src/items/registry.ts:66`:
  ```typescript
  export const ITEM_TYPES = {
    rectangle: RectangleItemDefinition,
    image: ImageItemDefinition,
    frame: FrameItemDefinition,
    'annotation-stroke': AnnotationItemDefinition,
    connector: ConnectorItemDefinition,
  } as const satisfies Record<ItemType, ItemTypeDefinition>;
  ```
- [x] 2.5 Add `'connector'` entry to `KnownAttrs` at `packages/domain/src/items/registry.ts:72`:
  ```typescript
  : R extends 'connector'
  ? import('./connector.js').ConnectorAttrs
  ```
- [x] 2.6 Export `ConnectorItemDefinition`, `ConnectorAttrsSchema`, `DEFAULT_CONNECTOR_ATTRS`, `isConnectorItem`, `getConnectorBounds` from `packages/domain/src/items/registry.ts` (following the pattern at lines 25-50 for other item types).

## 3. Domain — Connector layer kind

- [x] 3.1 Add `connector` entry to the default layer registry in `packages/domain/src/layers/registry.ts` (this file is created by the `layer-registry` proposal; the exact registration API depends on that proposal's implementation):
  ```typescript
  {
    kind: 'connector',
    displayName: 'Connectors',
    zOrder: 3,
    snapPolicy: 'off',
    overlapRule: 'none',
    containmentPolicy: 'none',
    hitPriority: 40,
    canBeConnectorEndpoint: false,
    defaultVisible: true,
    defaultLocked: false,
  }
  ```
- [x] 3.2 Ensure `sortByZOrder()` returns `['frame', 'media', 'overlay', 'connector', 'annotation']` after registration.
- [x] 3.3 Ensure `sortByHitPriority()` returns `['annotation', 'connector', 'overlay', 'media', 'frame']` after registration.
- [x] 3.4 Ensure `initLayerVisibility()` includes `'connector' → true`.
- [x] 3.5 Ensure `getLayerIds()` includes the connector layer ID (e.g., `'connectors'`).

## 4. Domain — Endpoint integrity (dangling on delete)

- [x] 4.1 In the YjsBoardAdapter (or the board state manager that handles item deletion), add a handler that runs when an item is deleted:
  - Query all items to find connectors where `attrs.from === deletedItemId` or `attrs.to === deletedItemId`
  - For each matching connector, set `attrs.dangling = true`
  - Write the updated connector back to Yjs
- [x] 4.2 Ensure the dangling update is atomic with the delete (both happen in the same Yjs transaction or the dangling update is triggered by observing the delete).
- [x] 4.3 Ensure the dangling flag is set for both local deletes (user presses Delete) and remote deletes (another collaborator deletes an item).
- [x] 4.4 If the YjsBoardAdapter does not yet exist as a separate module, add the logic to the controller's `removeItem` method at `packages/client/src/canvas/controller.ts:221-241` — after removing the item, iterate `this.items` to find and update dangling connectors.

## 5. Client — Connector renderer

- [x] 5.1 Create `packages/client/src/canvas/renderers/connector.ts` with:
  ```typescript
  import { Container, Graphics } from 'pixi.js';
  import type { BoardItem, ConnectorItem } from '@gridboard/domain';

  export function renderConnector(item: BoardItem): Container {
    // ...
  }
  ```
- [x] 5.2 Implement path computation in the renderer:
  - Read `attrs.from` and `attrs.to` ItemIds
  - Resolve endpoint positions from the item map (passed via controller or looked up from a shared items map)
  - Resolve anchors: `'auto'` → item center (`item.x + item.width/2`, `item.y + item.height/2`); explicit `{x, y}` → `item.x + anchor.x`, `item.y + anchor.y`
  - Build path: from anchor → waypoints[0] → ... → waypoints[n] → to anchor
- [x] 5.3 Implement rendering:
  - Use `Graphics` to draw the path
  - If `attrs.dangling` is `true`: use dashed stroke pattern, red color (`#ff0000`), stroke width from `attrs.style.strokeWidth`
  - If `attrs.dangling` is `false`: use solid stroke, color from `attrs.style.strokeColor`, stroke width from `attrs.style.strokeWidth`
  - Draw arrowheads: if `arrowheadStart === 'arrow'`, draw a filled triangle at the from anchor pointing along the first segment; if `arrowheadEnd === 'arrow'`, draw a filled triangle at the to anchor pointing along the last segment
  - Arrowhead size: 10px base, 8px height
- [x] 5.4 The renderer returns a `Container` (consistent with other renderers at `controller.ts:604-616`). The `Graphics` object is added as a child of the container.
- [x] 5.5 Handle the case where an endpoint item is not found (dangling): use the item's last known position from `item.x`/`item.y`/`item.width`/`item.height` as the anchor position.

## 6. Client — Connector Container in controller

- [x] 6.1 Add `'connector'` to `LAYER_Z_ORDER` at `packages/client/src/canvas/controller.ts:60`:
  ```typescript
  const LAYER_Z_ORDER: ReadonlyArray<LayerKind> = ['frame', 'media', 'overlay', 'connector', 'annotation'];
  ```
  (If the `layer-registry` proposal has replaced `LAYER_Z_ORDER` with `sortByZOrder()`, ensure the connector kind is registered before this array is derived.)
- [x] 6.2 The 5th `Container` for `connector` is created automatically by the loop at `controller.ts:142-146` which iterates `LAYER_Z_ORDER`. No code change needed if `LAYER_Z_ORDER` is updated.
- [x] 6.3 Add `'connector'` to the `layerVisible` map initialization at `controller.ts:97-102`:
  ```typescript
  private layerVisible = new Map<LayerKind, boolean>([
    ['frame', true],
    ['media', true],
    ['overlay', true],
    ['connector', true],
    ['annotation', true],
  ]);
  ```
  (If the `layer-registry` proposal has replaced this with `initLayerVisibility()`, ensure the connector kind is registered before this map is initialized.)
- [x] 6.4 Add `'connector'` to the `layerPriority` array in `hitTest` at `controller.ts:304`:
  ```typescript
  const layerPriority: LayerKind[] = ['annotation', 'connector', 'overlay', 'media', 'frame'];
  ```
  (If the `layer-registry` proposal has replaced this with `sortByHitPriority()`, ensure the connector kind is registered before this array is derived.)
- [x] 6.5 Add `'connector'` to the `layerPriority` array in `pickTopmostItem` at `controller.ts:1106`:
  ```typescript
  const layerPriority: LayerKind[] = ['annotation', 'connector', 'overlay', 'media', 'frame'];
  ```
- [x] 6.6 Add `'connector'` case to `renderItemDisplay` at `controller.ts:604`:
  ```typescript
  case 'connector':
    return renderConnector(item);
  ```
- [x] 6.7 Import `renderConnector` at `controller.ts:36` (alongside other renderer imports).

## 7. Client — Endpoint tracking (re-resolve each frame)

- [x] 7.1 In the controller's render loop (or in `renderItemDisplay` at `controller.ts:604`), for connector items, re-resolve endpoint positions from the live `this.items` map before rendering.
- [x] 7.2 The `renderConnector` function needs access to the items map to resolve `ItemId` → position. Pass it as a parameter or make it available via a module-level reference:
  ```typescript
  export function renderConnector(item: BoardItem, getItem: (id: string) => BoardItem | undefined): Container {
  ```
- [x] 7.3 Update the `renderItemDisplay` call for connectors to pass the item lookup:
  ```typescript
  case 'connector':
    return renderConnector(item, (id) => this.items.get(asItemId(id)));
  ```
- [x] 7.4 Ensure the connector re-renders when endpoint items move. The existing `updateItem` flow at `controller.ts:194-219` destroys and recreates the display object when an item is updated. If a connector's endpoint item moves, the connector itself is not updated — it must re-render on the next frame. Consider:
  - Option A: In the render loop, check if any connector's endpoint positions have changed and call `updateItem` on the connector to trigger a re-render.
  - Option B: In `updateItem`, when any item is updated, find all connectors referencing that item and call `updateItem` on them.
  - Option C: Re-render all connectors every frame (simple but may have performance implications on large boards).
  - Choose Option B for v1: when an item is updated in `updateItem` (line 194), after updating the item, iterate `this.items` to find connectors where `attrs.from === id || attrs.to === id` and call `this.updateItem(connectorId, {})` to trigger a re-render with updated bounds.

## 8. Client — Connector hit-test in controller

- [x] 8.1 The connector hit-test is handled by `ITEM_TYPES['connector'].hitTest(item, point)` which is called from the existing `hitTest` method at `controller.ts:301-316`. The `connectorHitTest` function in `packages/domain/src/items/connector.ts` implements the distance-to-segment logic.
- [x] 8.2 Ensure the `hitTest` method's `layerPriority` array includes `'connector'` (task 6.4).
- [x] 8.3 Verify that the spatial index (`SpatialIndex` at `controller.ts:71`) correctly indexes connectors by their derived bounding box. The `addItem` method at `controller.ts:184-192` calls `this.index.insert(item, layerKindFor(item.type))` which uses `item.x`/`item.y`/`item.width`/`item.height` — these are the derived bounding box from `getConnectorBounds`.
- [x] 8.4 Verify that when a connector's bounding box changes (endpoints moved), the spatial index is updated. The `updateItem` method at `controller.ts:194-219` calls `this.index.update(next, layerKindFor(next.type))` at line 203.

## 9. Client — ConnectorTool

- [x] 9.1 Create `packages/client/src/canvas/tools/connector-tool.ts`:
  ```typescript
  import type { Tool, ToolContext, PointerEventLite } from '@gridboard/domain';

  export class ConnectorTool implements Tool {
    readonly name = 'connector';
    // ...
  }
  ```
- [x] 9.2 Implement two-click state machine:
  - `State: 'idle'` — waiting for first click
  - `State: 'pending-source'` — first endpoint selected, preview line follows pointer
  - On `onPointerDown` in `'idle'` state:
    - Hit-test the click point against all items (use `ctx` to access the hit-test or pass a hit-test function)
    - If an item is hit and `canBeConnectorEndpoint` is true for its layer kind: store the item ID as `sourceId`, transition to `'pending-source'`
    - If no item is hit or the item cannot be an endpoint: stay in `'idle'`
  - On `onPointerMove` in `'pending-source'` state:
    - Draw a preview line from the source anchor to the current pointer position
    - The preview line should be rendered on the tool overlay layer
  - On `onPointerDown` in `'pending-source'` state:
    - Hit-test the click point against all items
    - If an item is hit, `canBeConnectorEndpoint` is true, and the item is not the same as `sourceId`:
      - Create a `ConnectorItem` via `ctx.createItem()` with `from: sourceId`, `to: targetId`, default attrs
      - Transition to `'idle'`
    - If no valid target: stay in `'pending-source'` (user can keep trying)
  - On Esc key:
    - Reset to `'idle'`, clear preview line
- [x] 9.3 The tool needs access to the items map and hit-test function to determine which item was clicked. Extend `ToolContext` (in `packages/domain/src/tools.ts` or wherever it's defined) to include:
  ```typescript
  hitTest: (point: Point) => string | null;
  getItem: (id: string) => BoardItem | undefined;
  ```
  Or pass these via the constructor.
- [x] 9.4 Implement preview line rendering:
  - Use the tool overlay `Container` (accessible via `ToolContext` or passed via constructor)
  - Draw a `Graphics` line from the source anchor to the current pointer position
  - Clear and redraw on every `onPointerMove`
  - Clear on Esc or on completion
- [x] 9.5 Handle edge cases:
  - Click on empty canvas in `'pending-source'`: ignore (stay in `'pending-source'`)
  - Click on same item as source: ignore (no self-loops in v1)
  - Click on an item whose layer kind has `canBeConnectorEndpoint: false`: ignore
  - Source item is deleted during creation: reset to `'idle'`

## 10. Client — ConnectorTool registration

- [x] 10.1 Import `ConnectorTool` in `packages/client/src/canvas/controller.ts` (alongside other tool imports at lines 37-38):
  ```typescript
  import { ConnectorTool } from './tools/connector-tool';
  ```
- [x] 10.2 Register `ConnectorTool` in `initToolRegistry` at `controller.ts:347-350`:
  ```typescript
  private initToolRegistry(): void {
    this.toolRegistry.set('frame', new FrameCreateTool());
    this.toolRegistry.set('annotation-freehand', new AnnotationFreehandTool());
    this.toolRegistry.set('connector', new ConnectorTool());
  }
  ```
- [x] 10.3 Update `buildToolContext` at `controller.ts:352-396` to include `hitTest` and `getItem` functions if the `ConnectorTool` needs them (see task 9.3).
- [x] 10.4 Update `ToolbarAction` type at `controller.ts:55-58` to include `'connector'` in the tool union:
  ```typescript
  export type ToolbarAction =
    | { type: 'set-tool'; tool: 'select' | 'rectangle' | 'frame' | 'annotation-freehand' | 'connector' }
    | { type: 'set-mode'; mode: 'grid' | 'annotation' }
    | { type: 'delete-selected' };
  ```

## 11. Client — Endpoint reattach UI

- [x] 11.1 When a dangling connector is clicked (hit-test returns the connector), and the user clicks on one of its endpoint pins, enter a "reattach" mode:
  - The clicked endpoint pin becomes the "active" endpoint
  - A preview line follows the pointer from the other endpoint to the pointer position
  - Clicking on a valid target item reattaches the endpoint: update `attrs.from` or `attrs.to` to the new item ID, set `attrs.dangling = false`
- [x] 11.2 Reattach is triggered by clicking an endpoint pin of a selected dangling connector. The endpoint pin hit-test (task 2.3) returns `true` for the pin area. The controller checks if the hit item is a dangling connector and if the click is on an endpoint pin.
- [x] 11.3 After reattach, the connector re-renders with normal style (solid stroke, configured color).
- [x] 11.4 If the user clicks empty canvas during reattach, cancel the reattach operation (connector remains dangling).

## 12. Client — Toolbar UI

- [x] 12.1 Add `'connector'` to the `ToolName` type in `packages/client/src/ui/Toolbar.tsx:12`:
  ```typescript
  export type ToolbarAction =
    | { type: 'set-tool'; tool: 'select' | 'rectangle' | 'frame' | 'annotation-freehand' | 'connector' }
    | { type: 'set-mode'; mode: InteractionMode }
    | { type: 'delete-selected' };
  ```
- [x] 12.2 Add `'connector'` to the `InteractionMode` type in `packages/client/src/state/uiStore.ts` (referenced at `Toolbar.tsx:9`):
  ```typescript
  export type InteractionMode = 'grid' | 'annotation' | 'connector';
  ```
- [x] 12.3 Add a connector tool button in the toolbar. The button should be visible when `interactionMode === 'connector'` (following the pattern at lines 85-97 for annotation mode). The connector mode toggle should be added alongside the existing grid/annotation mode toggle.
- [x] 12.4 The connector tool button should set `activeTool` to `'connector'` and dispatch `{ type: 'set-tool', tool: 'connector' }`.

## 13. Domain tests

- [x] 13.1 Unit test: `ConnectorAttrsSchema` validates a correct connector attrs object.
- [x] 13.2 Unit test: `ConnectorAttrsSchema` rejects missing `from` or `to`.
- [x] 13.3 Unit test: `ConnectorAttrsSchema` rejects invalid `routing` values.
- [x] 13.4 Unit test: `ConnectorAttrsSchema` rejects invalid `arrowheadStart`/`arrowheadEnd` values.
- [x] 13.5 Unit test: `getConnectorBounds` returns correct bounding box for a straight connector between two items.
- [x] 13.6 Unit test: `getConnectorBounds` returns correct bounding box with waypoints.
- [x] 13.7 Unit test: `getConnectorBounds` includes padding for stroke width and arrowheads.
- [x] 13.8 Unit test: `connectorHitTest` returns `true` for a point within 8px of the path.
- [x] 13.9 Unit test: `connectorHitTest` returns `false` for a point more than 8px from the path.
- [x] 13.10 Unit test: `connectorHitTest` returns `true` for a point on an endpoint pin.
- [x] 13.11 Unit test: `connectorHitTest` returns `true` for a point within 8px of a waypoint segment.
- [x] 13.12 Unit test: `isConnectorItem` returns `true` for a valid connector item.
- [x] 13.13 Unit test: `isConnectorItem` returns `false` for a non-connector item.
- [x] 13.14 Unit test: `DEFAULT_CONNECTOR_ATTRS` has correct default values.
- [x] 13.15 Unit test: `ConnectorItemDefinition` has correct `type`, `layerKind`, `defaultSize`, and function references.

## 14. Integration tests

- [x] 14.1 Test: creating a connector between two items via the two-click tool produces a `ConnectorItem` with correct `from`/`to` ItemIds.
- [x] 14.2 Test: connector renders as a line between the two endpoint items.
- [x] 14.3 Test: moving the source item causes the connector to re-render and follow the new position.
- [x] 14.4 Test: moving the target item causes the connector to re-render and follow the new position.
- [x] 14.5 Test: deleting an endpoint item sets `dangling: true` on the connector.
- [x] 14.6 Test: a dangling connector renders with a red broken-line indicator.
- [x] 14.7 Test: reattaching a dangling connector to a new item clears the dangling flag and restores normal rendering.
- [x] 14.8 Test: clicking within 8px of a connector path selects the connector.
- [x] 14.9 Test: clicking more than 8px from a connector path does not select the connector.
- [x] 14.10 Test: clicking an endpoint pin selects the connector (higher priority than path hit).
- [x] 14.11 Test: connectors render above overlay items and below annotation items (z-order).
- [x] 14.12 Test: Esc cancels connector creation mid-flow (after first click, before second click).
- [x] 14.13 Test: connectors do not block placement of other items (overlapRule: 'none').
- [x] 14.14 Test: creating a connector with arrowheads renders arrowhead triangles at the configured ends.
- [x] 14.15 Test: connector bounding box updates when endpoint items move (spatial index stays correct).

## 15. Spec revision

- [x] 15.1 The delta spec at `openspec/changes/connector-items/specs/semantic-layers/spec.md` is already written. After implementation, promote it to the base spec at `openspec/specs/semantic-layers/spec.md`:
  - Add "Connector Kind Registration" requirement
  - Add "Connector Non-Participation in Non-Overlap" requirement
  - Update the "Four fixed semantic layer kinds" requirement to reference the registry-driven model (if not already done by `layer-registry`)
- [x] 15.2 The new capability spec at `openspec/changes/connector-items/specs/connector-items/spec.md` should be promoted to `openspec/specs/connector-items/spec.md` after implementation.
- [x] 15.3 Update `openspec/specs/board-core/spec.md` "Item type registry" requirement (lines 140-157) to mention `connector` as a registered type.
- [x] 15.4 Update `openspec/specs/board-core/spec.md` "Layer model" requirement (lines 159-181) to include `connector` as a fifth layer kind (if the `layer-registry` proposal hasn't already generalized this).

## 16. Documentation

- [x] 16.1 Document the `ConnectorItem` interface and `ConnectorAttrs` fields in `packages/domain/src/items/connector.ts` with JSDoc comments.
- [x] 16.2 Document the connector layer kind policies in `packages/domain/src/layers/registry.ts` (alongside other kind entries).
- [x] 16.3 Document the two-click connector creation flow in a user-facing guide (if one exists) or in code comments on `ConnectorTool`.


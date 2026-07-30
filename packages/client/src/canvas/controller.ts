/**
 * CanvasController — owns the PixiJS Application, exposes imperative methods,
 * bridges YjsBoardAdapter deltas to PixiJS display objects.
 *
 * Per design.md D5: React owns NO canvas state. This class is the only writer
 * of PixiJS state. UI chrome (Toolbar, Inspector) consumes events from it.
 */

import {
  Application,
  Container,
  Graphics,
  CullerPlugin,
} from 'pixi.js';
import {
  asItemId,
  DEFAULT_GRID_CONFIG,
  DEFAULT_CAMERA,
  GridConfig,
  GridService,
  ITEM_TYPES,
  SpatialIndex,
  connectorPinHit,
  defaultLayerIdFor,
  getAllModes,
  getModeDef,
  layerKindFor,
  sortByZOrder,
  sortByHitPriority,
  initLayerVisibility,
  registerOnChange,
  type BoardItem,
  type CameraState,
  type ItemId,
  type ItemType,
  type LayerKind,
  type Point,
  type Rect,
} from '@gridboard/domain';
import type { Tool, ToolContext, PointerEventLite } from '@gridboard/domain';
import { renderRectangle } from './renderers/rectangle';
import { renderImage } from './renderers/image';
import { renderFrame } from './renderers/frame';
import { renderAnnotation } from './renderers/annotation';
import { renderConnector } from './renderers/connector';
import {
  populateDefaultToolRegistry,
  getAllTools,
  getToolDef,
  type ToolDefinition,
} from './tools';

// Touch CullerPlugin so the bundler keeps it in the import graph; the
// PixiJS v8 Application.init({ preference, ... }) handles registration
// automatically when extensions namespace is imported.
void CullerPlugin;

export interface CanvasControllerOptions {
  container: HTMLElement;
  /** Adapter snapshot for current set of items */
  getItems: () => Iterable<BoardItem>;
  /** Write-back from local interactions (Yjs) */
  onItemChange: (update: { id: string; partial: Partial<BoardItem> }) => void;
  onItemDelete: (del: { id: string }) => void;
  onItemCreate: (add: { item: BoardItem }) => void;
}

export type ToolbarAction =
  | { type: 'set-tool'; tool: string }
  | { type: 'set-mode'; mode: string }
  | { type: 'delete-selected' };

// Z-order and hit-priority are derived from the layer registry
// (`packages/domain/src/layers/registry.ts`). The registry is the
// single source of truth — no hardcoded kind lists live in this file.
// Helpers `sortByZOrder()` and `sortByHitPriority()` return fresh arrays
// on every call, so adding a kind at runtime immediately takes effect
// after `addLayer()` triggers the change subscription wired in init().

export class CanvasController {
  private app: Application | null = null;
  private world: Container | null = null;
  private layerContainers = new Map<string, Container>();
  private selectionLayer: Container | null = null;
  private toolOverlay: Container | null = null;
  private gridGraphics: Graphics | null = null;
  private gridLayer: Container | null = null;

  private index = new SpatialIndex();
  private items = new Map<ItemId, BoardItem>();
  private displayById = new Map<ItemId, Container>();
  private selectionHandles = new Map<ItemId, Graphics>();
  selection: Set<ItemId> = new Set();

  private camera: CameraState = { ...DEFAULT_CAMERA };
  private grid: GridConfig = { ...DEFAULT_GRID_CONFIG };
  private activeToolName: string = 'select';
  private activeMode: string = getAllModes()[0]?.id ?? 'grid';

  /** Tool registry: maps tool name to Tool instance. */
  private toolRegistry = new Map<string, Tool>();

  /**
   * Last valid bounds for each item, used as revert target on rejection.
   *
   * KNOWN LIMITATION (Bug #15, data-integrity-bugfixes): this map is
   * controller-local and NOT persisted. If the controller is recreated
   * (HMR, navigation, page reload), `lastValidBounds` is empty and the
   * first invalid move/resize after recreation has no revert target —
   * the rejected item stays at the invalid bounds until the user moves it
   * away. Accepted for v1; revisit and wire into Yjs awareness or another
   * durable store if HMR / navigation becomes a real problem in practice.
   */
  private lastValidBounds = new Map<ItemId, Rect>();

  /**
   * Buffered per-item coordinate updates (single-slot per item ID, see
   * design.md D3). `queueUpdate` stores a partial update here; `flushQueuedUpdates`
   * applies all buffered updates via `updateItem` and clears the buffer.
   */
  private queuedUpdate = new Map<ItemId, { x?: number; y?: number }>();

  /**
   * Most recent pointer position in board coordinates. Updated on every
   * pointermove so `endDrag` can pass a real position (instead of `{0,0}`)
   * to `tool.onPointerUp`.
   */
  private lastPointerBoard: Point = { x: 0, y: 0 };

  /** Resize state: which item is being resized and from which corner. */
  private resizeState: {
    itemId: ItemId;
    corner: 'tl' | 'tr' | 'bl' | 'br';
    startBoard: Point;
    startBounds: Rect;
  } | null = null;

  /**
   * Per-layer visibility flags. Default-initialized from the registry's
   * `defaultVisible` values. The layers panel (future) toggles these.
   * The map is rebuilt by `rebuildLayerState()` when the registry changes
   * (e.g. after `addLayer()` or `deleteLayer()`) so new kinds pick up
   * their default visibility immediately.
   */
  private layerVisible: Map<LayerKind, boolean> = initLayerVisibility();

  /**
   * Unsubscribe handle returned by `registerOnChange` during init().
   * Called in destroy() so a destroyed controller does not respond to
   * later registry mutations.
   */
  private unsubscribeRegistry: (() => void) | null = null;

  private dragState:
    | { kind: 'pan'; startScreen: Point }
    | { kind: 'draw-rect'; startBoard: Point; id: ItemId }
    | { kind: 'move-selected'; startBoard: Point; startPositions: Map<ItemId, { x: number; y: number }> }
    | null = null;
  private spacebar = false;

  /**
   * Reattach state machine for dangling connectors (see task 11).
   *
   * When the user selects a dangling connector and clicks one of its
   * endpoint pins (the small circles at the from/to anchors), the
   * controller enters `'awaiting-target'` for the corresponding
   * endpoint. Clicking a new item reattaches that endpoint; clicking
   * empty canvas cancels.
   *
   * `kind: 'from' | 'to'` identifies which endpoint is being reattached
   * (the other endpoint remains fixed).
   */
  private reattachState: { kind: 'from' | 'to'; connectorId: ItemId } | null = null;

  constructor(private readonly opts: CanvasControllerOptions) {
    this.init();
  }

  isReady(): boolean {
    return this.app !== null && this.world !== null;
  }

  private async init(): Promise<void> {
    const app = new Application();
    await app.init({
      background: 0x0f1115,
      antialias: true,
      resizeTo: this.opts.container,
      autoDensity: true,
      preference: 'webgl',
    });
    // If destroy() ran while init() was awaiting (React StrictMode
    // double-mount), abort: the app instance is being torn down.
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    this.app = app;
    this.canvasEl = app.canvas;
    this.opts.container.appendChild(app.canvas);

    const world = new Container({ isRenderGroup: true });
    app.stage.addChild(world);

    // Grid layer (bottom)
    this.gridLayer = new Container();
    world.addChild(this.gridLayer);

    this.gridGraphics = new Graphics();
    this.gridLayer.addChild(this.gridGraphics);

    // Layer-kind containers in z-order. `sortByZOrder()` is the registry-
    // driven single source of truth (replaces the hardcoded LAYER_Z_ORDER
    // constant). When the registry changes (e.g. addLayer/deleteLayer),
    // `rebuildLayerState` reconciles `layerContainers` with the new order.
    for (const kind of sortByZOrder()) {
      const container = new Container();
      this.layerContainers.set(kind, container);
      world.addChild(container);
    }

    // Selection handles (above items)
    this.selectionLayer = new Container();
    world.addChild(this.selectionLayer);

    // Tool overlay (topmost — previews, drag feedback)
    this.toolOverlay = new Container();
    world.addChild(this.toolOverlay);

    this.world = world;
    this.initToolRegistry();
    this.installInputHandlers();
    this.applyCamera();
    this.redrawGrid();
    this.cullViewport();

    // Subscribe to layer-registry changes so addLayer/deleteLayer calls
    // immediately reconcile the controller's derived lists and PixiJS
    // layer containers. The unsubscribe handle is held for destroy().
    this.unsubscribeRegistry = registerOnChange(() => {
      this.rebuildLayerState();
    });

    // Redraw grid on resize so viewport-coverage stays correct
    app.renderer.on('resize', () => {
      this.redrawGrid();
      this.cullViewport();
    });
  }

  // ----- Hydration / Items -----

  hydrateItems(items: Iterable<BoardItem>): void {
    const next = new Map<ItemId, BoardItem>();
    for (const it of items) next.set(it.id, it);
    for (const id of [...this.items.keys()]) {
      if (!next.has(id)) this.removeItem(id);
    }
    for (const [id, item] of next) {
      if (!this.items.has(id)) this.addItem(item);
      else this.updateItem(id, item);
    }
  }

  addItem(item: BoardItem): void {
    this.items.set(item.id, item);
    this.index.insert(item, layerKindFor(item.type));
    const display = this.renderItemDisplay(item);
    this.addItemToLayer(display, item);
    this.displayById.set(item.id, display);
    // Track last valid bounds
    this.lastValidBounds.set(item.id, { x: item.x, y: item.y, width: item.width, height: item.height });
  }

  updateItem(id: string | ItemId, partial: Partial<BoardItem> | BoardItem): void {
    const idItem = asItemId(String(id));
    const prev = this.items.get(idItem);
    if (!prev) return;
    const next: BoardItem =
      'id' in partial && partial.id === idItem
        ? (partial as BoardItem)
        : ({ ...prev, ...(partial as Partial<BoardItem>) } as BoardItem);
    this.items.set(idItem, next);
    this.index.update(next, layerKindFor(next.type));

    // Remove old display from its layer
    const oldDisplay = this.displayById.get(idItem);
    if (oldDisplay) {
      const oldKind = layerKindFor(prev.type);
      const oldLayer = this.layerContainers.get(oldKind);
      if (oldLayer) oldLayer.removeChild(oldDisplay);
      oldDisplay.destroy({ children: true });
    }

    // Create fresh display on the correct layer
    const fresh = this.renderItemDisplay(next);
    fresh.position.set(next.x, next.y);
    this.addItemToLayer(fresh, next);
    this.displayById.set(idItem, fresh);

    // Endpoint tracking: if any connector references this item, its
    // rendered path needs to follow the new position. Re-render the
    // connector by calling `updateItem` with the current item. The
    // existing `updateItem` flow already handles spatial index
    // updates and display replacement — we just need to make sure
    // the connector's `x`/`y`/`width`/`height` are recomputed from
    // the new endpoint positions.
    //
    // We use the connector's stored bounds as a no-op partial so the
    // connector is rebuilt. `getConnectorBounds` is called inside
    // `renderConnector` (via `renderItemDisplay`) so the visual path
    // is correct, and the spatial index is updated with whatever
    // bounds the connector currently has. The bounds may be slightly
    // stale for one frame if the connector's x/y was the old bounds,
    // but on the next frame after the endpoint move the connector
    // will re-render and pick up the new positions.
    for (const [otherId, otherItem] of this.items) {
      if (otherId === idItem) continue;
      if (otherItem.type !== 'connector') continue;
      const otherAttrs = otherItem.attrs as { from?: string; to?: string };
      if (otherAttrs.from !== idItem && otherAttrs.to !== idItem) continue;
      // Recompute connector's bounds and update display.
      const connector = otherItem;
      this.updateItem(otherId, connector);
    }
  }

  removeItem(id: string | ItemId): void {
    const idItem = asItemId(String(id));
    this.index.remove(idItem);
    const item = this.items.get(idItem);
    this.items.delete(idItem);
    const display = this.displayById.get(idItem);
    if (display && item) {
      const kind = layerKindFor(item.type);
      const layer = this.layerContainers.get(kind);
      if (layer) layer.removeChild(display);
      display.destroy({ children: true });
      this.displayById.delete(idItem);
    }
    this.selection.delete(idItem);
    const handle = this.selectionHandles.get(idItem);
    if (handle && this.selectionLayer) {
      this.selectionLayer.removeChild(handle);
      handle.destroy();
      this.selectionHandles.delete(idItem);
    }

    // Endpoint integrity: when an item is deleted, set `dangling: true`
    // on every connector that references it. The connector is NOT
    // cascade-deleted; the user can reattach or manually delete the
    // dangling connector. The dangling flag is set in the controller's
    // local state and the new item is sent through the adapter's
    // onItemChange so it propagates to other collaborators.
    for (const [otherId, otherItem] of this.items) {
      if (otherItem.type !== 'connector') continue;
      const otherAttrs = otherItem.attrs as { from?: string; to?: string; dangling?: boolean };
      if (otherAttrs.from !== idItem && otherAttrs.to !== idItem) continue;
      if (otherAttrs.dangling) continue; // already dangling
      const nextAttrs = { ...otherItem.attrs, dangling: true };
      const nextConnector = { ...otherItem, attrs: nextAttrs } as BoardItem;
      this.updateItem(otherId, nextConnector);
      this.opts.onItemChange({ id: otherId, partial: { attrs: nextAttrs } });
    }
  }

  // ----- Selection / Mutations from outside -----

  /** Called by the adapter for remote updates. */
  applyRemoteUpdate(id: string, partial: Partial<BoardItem>): void {
    this.updateItem(id, partial);
  }

  applyToolbarAction(action: ToolbarAction): void {
    if (action.type === 'set-tool') {
      this.activeToolName = action.tool;
    } else if (action.type === 'set-mode') {
      // Validate the mode ID against the registry. Unknown modes are
      // rejected (no silent state corruption).
      try {
        getModeDef(action.mode);
        this.activeMode = action.mode;
      } catch {
        // Unknown mode — ignore. Toolbar should never send unknown
        // modes; this is a defensive guard.
      }
    } else if (action.type === 'delete-selected') {
      for (const id of [...this.selection]) {
        this.removeItem(id);
        this.opts.onItemDelete({ id });
      }
      this.selection = new Set();
      this.renderSelection();
    }
  }

  // ----- Camera -----

  setZoom(zoom: number, around?: Point): void {
    const next = Math.max(0.1, Math.min(5, zoom));
    const px: Point = around ?? this.viewportCenter();
    const before = this.screenToBoard(px);
    this.camera = { ...this.camera, zoom: next };
    this.applyCamera();
    const after = this.screenToBoard(px);
    this.camera = {
      ...this.camera,
      x: this.camera.x + (before.x - after.x),
      y: this.camera.y + (before.y - after.y),
    };
    this.applyCamera();
    this.redrawGrid();
    this.cullViewport();
  }

  pan(dx: number, dy: number): void {
    this.camera = {
      ...this.camera,
      x: this.camera.x - dx / this.camera.zoom,
      y: this.camera.y - dy / this.camera.zoom,
    };
    this.applyCamera();
    this.redrawGrid();
  }

  viewportCenter(): Point {
    if (!this.app) return { x: 0, y: 0 };
    return { x: this.app.screen.width / 2, y: this.app.screen.height / 2 };
  }

  // ----- Hit testing -----

  hitTest(point: Point): ItemId | null {
    const ids = this.index.searchPoint(point);
    // Traverse layers in reverse z-order (highest hit-priority first) so
    // topmost items are picked first. The priority list is registry-driven
    // via `sortByHitPriority()` so a new kind with a higher priority takes
    // over immediately without code changes.
    const layerPriority = sortByHitPriority();
    for (const kind of layerPriority) {
      for (const idStr of ids) {
        const id = asItemId(String(idStr));
        const item = this.items.get(id);
        if (!item) continue;
        if (layerKindFor(item.type) !== kind) continue;
        const defn = ITEM_TYPES[item.type];
        if (defn?.hitTest(item, point)) return id;
      }
    }
    return null;
  }

  getItemsInViewport(): ItemId[] {
    if (!this.app) return [];
    const w = this.app.screen.width / this.camera.zoom;
    const h = this.app.screen.height / this.camera.zoom;
    const viewport: Rect = {
      x: this.camera.x - w / 2,
      y: this.camera.y - h / 2,
      width: w,
      height: h,
    };
    return this.index.searchViewport(viewport).map((s) => asItemId(String(s)));
  }

  // ----- Lifecycle -----

  /**
   * Track the canvas element separately so destroy() can clean it up
   * even if init() is still pending (React StrictMode double-mount can
   * call destroy() before init() resolves). Without this, the leaked
   * canvas would sit in the DOM with its event listeners attached,
   * intercepting pointerdown events meant for the new controller and
   * making drawing appear to do nothing.
   */
  private canvasEl: HTMLCanvasElement | null = null;
  private destroyed = false;

  /**
   * Hit-test which endpoint pin of a connector the click lands on.
   * Returns `'from'` or `'to'` if the click is within
   * `CONNECTOR_PIN_RADIUS` of the corresponding anchor, otherwise
   * `null`. Used by the reattach flow to identify which endpoint is
   * being reattached (task 11.2).
   */
  private hitTestConnectorPin(
    item: BoardItem,
    point: Point,
  ): 'from' | 'to' | null {
    return connectorPinHit(item, point, (id: string) => this.items.get(asItemId(id)));
  }

  /**
   * Complete a reattach: update the connector's `from`/`to` ItemId
   * to the new target and clear `dangling`. The update is propagated
   * to the Yjs adapter via `onItemChange` so remote collaborators
   * see the reattach.
   */
  private completeReattach(
    connectorId: ItemId,
    endpoint: 'from' | 'to',
    newTargetId: ItemId,
  ): void {
    const connector = this.items.get(connectorId);
    if (!connector || connector.type !== 'connector') return;
    const target = this.items.get(newTargetId);
    if (!target || target.type === 'connector') return;
    const attrs = connector.attrs as Record<string, unknown>;
    const nextAttrs: Record<string, unknown> = { ...attrs, dangling: false };
    nextAttrs[endpoint] = newTargetId;
    this.updateItem(connectorId, { attrs: nextAttrs });
    this.opts.onItemChange({ id: connectorId, partial: { attrs: nextAttrs } });
    this.renderSelection();
  }

  destroy(): void {
    this.destroyed = true;
    this.index.clear();
    if (this.unsubscribeRegistry) {
      this.unsubscribeRegistry();
      this.unsubscribeRegistry = null;
    }
    if (this.app) {
      this.app.destroy(true, { children: true });
    } else if (this.canvasEl && this.canvasEl.parentNode) {
      // init() did not complete (StrictMode cleanup arrived during the
      // async init window). Remove the orphan canvas so it does not sit
      // on top of the next controller's canvas and intercept events.
      this.canvasEl.parentNode.removeChild(this.canvasEl);
    }
    this.canvasEl = null;
    this.app = null;
    this.world = null;
    this.layerContainers.clear();
    this.gridLayer = null;
    this.gridGraphics = null;
    this.toolOverlay = null;
    this.selectionLayer = null;
  }

  // ----- Tool registry -----

  /**
   * Populate the controller's tool registry from the `ToolDefinition`
   * registry (see packages/client/src/canvas/tools/registry.ts). The
   * definition registry owns identity; the controller owns instances.
   *
   * Per tool-registry-and-modes proposal: `populateDefaultToolRegistry`
   * registers all 11 default `ToolDefinition` entries; this method
   * instantiates them via their `factory()` and stores the result in
   * `this.toolRegistry` keyed by tool ID.
   */
  private initToolRegistry(): void {
    // Idempotent: registering twice would throw on duplicates, so guard.
    if (this.toolRegistry.size === 0) {
      populateDefaultToolRegistry();
      for (const def of getAllTools()) {
        this.toolRegistry.set(def.id, def.factory());
      }
    }
  }

  private buildToolContext(): ToolContext {
    const ctx: ToolContext = {
      selection: this.selection,
      snap: (p: Point) => this.snapPoint(p),
      updateItem: (id: string, partial: { x?: number; y?: number; width?: number; height?: number }) => {
        this.updateItem(id, partial);
      },
      createItem: (input: Record<string, unknown>): string => {
        const id = asItemId(crypto.randomUUID());
        const type = (input.type as ItemType) ?? 'rectangle';
        const x = (input.x as number) ?? 0;
        const y = (input.y as number) ?? 0;
        const width = (input.width as number) ?? this.grid.cellSize;
        const height = (input.height as number) ?? this.grid.cellSize;
        const attrs = (input.attrs as Record<string, unknown>) ?? {};
        const item: BoardItem = {
          id,
          type,
          x,
          y,
          width,
          height,
          rotation: 0,
          layerId: defaultLayerIdFor(layerKindFor(type)),
          attrs,
        };
        this.addItem(item);
        this.opts.onItemCreate({ item });
        return id;
      },
      deleteItem: (id: string) => {
        this.removeItem(id);
        this.opts.onItemDelete({ id });
      },
      queueUpdate: (id: string, partial: { x?: number; y?: number }) => {
        this.queueUpdate(id, partial);
      },
      flushQueuedUpdates: () => {
        this.flushQueuedUpdates();
      },
      canPlace: (rect: Rect, kind: LayerKind, excludeId?: string): boolean => {
        const itemsList = this.buildCanPlaceItems(rect, kind, excludeId as ItemId | undefined);
        return GridService.canPlace(rect, itemsList, kind, excludeId);
      },
      setActiveTool: (name: string) => {
        this.activeToolName = name;
      },
      getItem: (id: string): BoardItem | undefined => {
        return this.items.get(asItemId(id));
      },
      hitTest: (point: Point): string | null => {
        return this.hitTest(point) as string | null;
      },
    };
    // Augment with non-domain methods used by HandTool (and other
    // tools that need camera/canvas access). The ToolContext interface
    // stays narrow; tools may cast to access these via structural
    // typing (see HandTool).
    (ctx as unknown as { pan: (dx: number, dy: number) => void }).pan = (dx, dy) =>
      this.pan(dx, dy);
    (ctx as unknown as { setCanvasCursor: (c: string) => void }).setCanvasCursor = (c) => {
      if (this.app?.canvas) this.app.canvas.style.cursor = c;
    };
    (ctx as unknown as { toolOverlay: Container | null }).toolOverlay = this.toolOverlay;
    (ctx as unknown as {
      resolveAnchor: (item: BoardItem) => Point;
    }).resolveAnchor = (item) => {
      return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    };
    return ctx;
  }

  /**
   * Buffer a per-item coordinate update without applying it immediately.
   * Single-slot: a subsequent call for the same item ID overwrites the
   * previous partial. See design.md D3 (Tool-owned drag-queue state).
   */
  queueUpdate(id: string, partial: { x?: number; y?: number }): void {
    const idItem = asItemId(String(id));
    this.queuedUpdate.set(idItem, partial);
  }

  /**
   * Apply all buffered updates via `updateItem` and clear the buffer.
   * No-op when the buffer is empty.
   */
  flushQueuedUpdates(): void {
    if (this.queuedUpdate.size === 0) return;
    for (const [id, partial] of this.queuedUpdate) {
      this.updateItem(id, partial);
    }
    this.queuedUpdate.clear();
  }

  // ----- Rejection feedback -----

  /**
   * Draw a red outline on the given item for 200ms, then remove it.
   * Used to signal that a move/resize/create was rejected due to overlap.
   *
   * Bug #4: 200ms flash-and-revert UX — fixed by `invalid-placement-ux` proposal.
   * The current behavior flashes on rejection but does not animate revert;
   * the dedicated proposal upgrades the visual UX and adds ARIA feedback.
   */
  private flashRejection(id: ItemId): void {
    const item = this.items.get(id);
    if (!item || !this.selectionLayer) return;

    const g = new Graphics();
    g.setStrokeStyle({ width: 2, color: 0xff0000, alpha: 1 });
    g.rect(item.x, item.y, item.width, item.height);
    g.stroke();
    this.selectionLayer.addChild(g);

    setTimeout(() => {
      if (this.selectionLayer) {
        this.selectionLayer.removeChild(g);
        g.destroy();
      }
    }, 200);
  }

  /**
   * Draw a red outline at an arbitrary rect for 200ms (used when there's no
   * item to flash, e.g. rejected creation preview).
   */
  private flashRejectionRect(rect: Rect): void {
    if (!this.selectionLayer) return;

    const g = new Graphics();
    g.setStrokeStyle({ width: 2, color: 0xff0000, alpha: 1 });
    g.rect(rect.x, rect.y, rect.width, rect.height);
    g.stroke();
    this.selectionLayer.addChild(g);

    setTimeout(() => {
      if (this.selectionLayer) {
        this.selectionLayer.removeChild(g);
        g.destroy();
      }
    }, 200);
  }

  // ----- Resize handles -----

  /**
   * Draw resize handles (4 corners) on the selected item.
   * Simplified: corners only, no edge midpoints.
   * Each handle is an 8×8 square at the item corner.
   */
  private renderResizeHandles(): void {
    if (!this.selectionLayer) return;
    // Remove old resize handles (distinct from selection corner handles)
    // We reuse selectionHandles for resize; clear them first.
    for (const handle of this.selectionHandles.values()) {
      this.selectionLayer.removeChild(handle);
      handle.destroy();
    }
    this.selectionHandles.clear();

    for (const id of this.selection) {
      const item = this.items.get(id);
      if (!item) continue;

      const handle = new Graphics();
      handle.setStrokeStyle({ width: 2, color: 0x4a90d9 });
      const corners: Array<[number, number]> = [
        [item.x - 4, item.y - 4],
        [item.x + item.width - 4, item.y - 4],
        [item.x - 4, item.y + item.height - 4],
        [item.x + item.width - 4, item.y + item.height - 4],
      ];
      for (const [cx, cy] of corners) {
        handle.rect(cx, cy, 8, 8);
        handle.stroke();
      }
      this.selectionLayer.addChild(handle);
      this.selectionHandles.set(id, handle);
    }
  }

  /**
   * Check if a board-coordinate point is near a corner of the given item.
   * Returns the corner identifier or null. Hit radius = 8px in board coords.
   */
  private hitTestResizeCorner(item: BoardItem, point: Point): 'tl' | 'tr' | 'bl' | 'br' | null {
    const radius = 8;
    const corners: Array<{ key: 'tl' | 'tr' | 'bl' | 'br'; x: number; y: number }> = [
      { key: 'tl', x: item.x, y: item.y },
      { key: 'tr', x: item.x + item.width, y: item.y },
      { key: 'bl', x: item.x, y: item.y + item.height },
      { key: 'br', x: item.x + item.width, y: item.y + item.height },
    ];
    for (const c of corners) {
      if (Math.abs(point.x - c.x) <= radius && Math.abs(point.y - c.y) <= radius) {
        return c.key;
      }
    }
    return null;
  }

  // ----- Internals -----

  private applyCamera(): void {
    if (!this.world || !this.app) return;
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(
      this.app.screen.width / 2 - this.camera.x * this.camera.zoom,
      this.app.screen.height / 2 - this.camera.y * this.camera.zoom,
    );
  }

  private screenToBoard(p: Point): Point {
    if (!this.world) return p;
    return {
      x: (p.x - this.world.position.x) / this.camera.zoom,
      y: (p.y - this.world.position.y) / this.camera.zoom,
    };
  }

  /**
   * Draw grid lines in world (board) coordinates.
   * The gridGraphics is a child of gridLayer, which is a child of world —
   * so the world transform (zoom + pan) is inherited automatically.
   * Lines are drawn from floor(viewportMin/cell)*cell to ceil(viewportMax/cell)*cell.
   */
  private redrawGrid(): void {
    if (!this.gridGraphics || !this.app || !this.world) return;
    const g = this.gridGraphics.clear();
    const cell = this.grid.cellSize;
    const subDiv = this.grid.subdivisions;

    // Viewport in board coordinates
    const w = this.app.screen.width / this.camera.zoom;
    const h = this.app.screen.height / this.camera.zoom;
    const vpMinX = this.camera.x - w / 2;
    const vpMinY = this.camera.y - h / 2;
    const vpMaxX = this.camera.x + w / 2;
    const vpMaxY = this.camera.y + h / 2;

    const startX = Math.floor(vpMinX / cell) * cell;
    const endX = Math.ceil(vpMaxX / cell) * cell;
    const startY = Math.floor(vpMinY / cell) * cell;
    const endY = Math.ceil(vpMaxY / cell) * cell;

    // Minor grid lines
    g.setStrokeStyle({ width: 1, color: 0x2a2f3a, alpha: 0.5 });
    for (let x = startX; x <= endX; x += cell) {
      g.moveTo(x, startY);
      g.lineTo(x, endY);
      g.stroke();
    }
    for (let y = startY; y <= endY; y += cell) {
      g.moveTo(startX, y);
      g.lineTo(endX, y);
      g.stroke();
    }

    // Major grid lines (every subdivisions-th cell)
    if (subDiv > 1) {
      g.setStrokeStyle({ width: 1.5, color: 0x3a3f4a, alpha: 0.7 });
      const majorStep = cell * subDiv;
      for (let x = startX; x <= endX; x += majorStep) {
        g.moveTo(x, startY);
        g.lineTo(x, endY);
        g.stroke();
      }
      for (let y = startY; y <= endY; y += majorStep) {
        g.moveTo(startX, y);
        g.lineTo(endX, y);
        g.stroke();
      }
    }
  }

  private cullViewport(): void {
    const visible = new Set(this.getItemsInViewport());
    for (const [id, display] of this.displayById) {
      const item = this.items.get(id);
      const kind = item ? layerKindFor(item.type) : null;
      const layerVis = kind ? (this.layerVisible.get(kind) ?? true) : true;
      display.visible = visible.has(id) && layerVis;
    }
  }

  private renderSelection(): void {
    this.renderResizeHandles();
  }

  /**
   * Snap a board-coord point per the active mode's `snapPolicy` from
   * the `ModeDefinition` registry. Tool-level `snapPolicy` overrides
   * mode-level policy:
   *
   *   - Tool snapPolicy 'exempt'   → return the point unchanged
   *   - Tool snapPolicy 'mandatory' → snap unconditionally
   *   - Tool snapPolicy 'inherit-mode' (default) → use mode policy
   *
   * Mode policy:
   *   - 'off'      → return the point unchanged (annotation)
   *   - 'mandatory' → snap to grid (grid, connector)
   */
  private snapPoint(p: Point): Point {
    const toolDef = (() => {
      try {
        return getToolDef(this.activeToolName);
      } catch {
        return null;
      }
    })();

    const toolPolicy = toolDef?.snapPolicy ?? 'inherit-mode';
    if (toolPolicy === 'exempt') return p;
    if (toolPolicy === 'mandatory') return GridService.snapPoint(p, this.grid);

    // inherit-mode
    const modeSnap = getModeDef(this.activeMode).snapPolicy;
    if (modeSnap === 'off') return p;
    return GridService.snapPoint(p, this.grid);
  }

  /**
   * Reconcile the controller's derived layer state with the current
   * registry contents. Called from the registry change subscription
   * (see init()).
   *
   * - Creates a new PixiJS `Container` for any kind added at runtime
   *   and inserts it into the world at the correct z-index.
   * - Removes containers for kinds no longer registered (their items
   *   would already have been removed by `deleteLayer` rules).
   * - Refreshes `layerVisible` so newly-added kinds pick up their
   *   registry defaults and deleted kinds are dropped.
   *
   * Existing items are left in place; only the container map and
   * visibility map change. New containers start empty because
   * `addLayer` is forbidden on non-empty layers.
   */
  private rebuildLayerState(): void {
    if (!this.world) return;

    const currentKinds = new Set(this.layerContainers.keys());
    const desired = sortByZOrder();
    const desiredSet = new Set(desired);

    // Drop containers for kinds that no longer exist
    for (const kind of currentKinds) {
      if (!desiredSet.has(kind)) {
        const c = this.layerContainers.get(kind);
        if (c) {
          c.destroy({ children: true });
          this.layerContainers.delete(kind);
        }
      }
    }

    // Add containers for new kinds, inserted at the correct world index
    // (z-order: lower zOrder = behind, higher zOrder = in front).
    // world children order is: [grid, ...layerContainers..., selection, toolOverlay]
    let existingCount = 0;
    for (const kind of desired) {
      if (this.layerContainers.has(kind)) {
        existingCount++;
        continue;
      }
      const c = new Container();
      this.layerContainers.set(kind, c);
      // Insert after grid (index 0) + existing layer containers.
      this.world.addChildAt(c, 1 + existingCount);
      existingCount++;
    }

    // Reorder existing containers to match the registry z-order
    const world = this.world;
    if (world) {
      desired.forEach((kind, i) => {
        const c = this.layerContainers.get(kind);
        if (c) world.setChildIndex(c, 1 + i);
      });
    }

    // Refresh visibility map from registry defaults. Existing per-kind
    // overrides are preserved when the kind still exists.
    const fresh = initLayerVisibility();
    for (const [kind, value] of this.layerVisible) {
      if (fresh.has(kind)) fresh.set(kind, value);
    }
    this.layerVisible = fresh;

    this.cullViewport();
  }

  /** Route a display object to the correct layer container based on item type. */
  private addItemToLayer(display: Container, item: BoardItem): void {
    const kind = layerKindFor(item.type);
    const layer = this.layerContainers.get(kind);
    if (layer) {
      layer.addChild(display);
    }
  }

  /** Create the appropriate PixiJS display object for an item. */
  private renderItemDisplay(item: BoardItem): Container {
    switch (item.type) {
      case 'image':
        return renderImage(item);
      case 'frame':
        return renderFrame(item);
      case 'annotation-stroke':
        return renderAnnotation(item);
      case 'connector':
        // Connectors need the live items map to resolve endpoint
        // positions. `this.items` is a `Map<ItemId, BoardItem>`;
        // `renderConnector` accepts a string-keyed lookup so the
        // generic `get` call satisfies the signature.
        return renderConnector(item, (id) => this.items.get(asItemId(id)));
      case 'rectangle':
      default:
        return renderRectangle(item);
    }
  }

  private installInputHandlers(): void {
    if (!this.app) return;
    const canvas = this.app.canvas;

    canvas.addEventListener(
      'wheel',
      (e) => {
        // Pass through browser pinch-zoom (ctrlKey) and macOS smart-zoom
        // (metaKey) so the OS / browser handles them natively. Only
        // intercept plain scroll-wheel events for canvas zoom.
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        const delta = -e.deltaY * 0.0015;
        const rect = canvas.getBoundingClientRect();
        const px: Point = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
        this.setZoom(this.camera.zoom * Math.exp(delta), px);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.spacebar = true;
        canvas.style.cursor = 'grab';
        return;
      }
      if (this.selection.size === 0) return;
      const dx =
        e.key === 'ArrowLeft'
          ? -this.grid.cellSize
          : e.key === 'ArrowRight'
          ? this.grid.cellSize
          : 0;
      const dy =
        e.key === 'ArrowUp'
          ? -this.grid.cellSize
          : e.key === 'ArrowDown'
          ? this.grid.cellSize
          : 0;
      if (dx !== 0 || dy !== 0) {
        for (const id of this.selection) {
          const item = this.items.get(id);
          if (!item) continue;
          const proposed: Rect = {
            x: item.x + dx,
            y: item.y + dy,
            width: item.width,
            height: item.height,
          };
          const kind = layerKindFor(item.type);
          const itemsList = this.buildCanPlaceItems(proposed, kind, id);
          if (!GridService.canPlace(proposed, itemsList, kind, id)) {
            this.flashRejection(id);
            continue;
          }
          const nx = proposed.x;
          const ny = proposed.y;
          this.updateItem(id, { x: nx, y: ny });
          this.opts.onItemChange({ id, partial: { x: nx, y: ny } });
          this.lastValidBounds.set(id, { x: nx, y: ny, width: item.width, height: item.height });
        }
        this.renderSelection();
        e.preventDefault();
        return;
      }
      // Esc cancels reattach mode (task 11.4). Connector remains
      // dangling.
      if (e.key === 'Escape' && this.reattachState) {
        this.reattachState = null;
        e.preventDefault();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        for (const id of [...this.selection]) {
          this.removeItem(id);
          this.opts.onItemDelete({ id });
        }
        this.selection = new Set();
        this.renderSelection();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacebar = false;
        canvas.style.cursor = 'default';
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const boardPt = this.screenToBoard(screenPt);
      this.lastPointerBoard = boardPt;

      if (this.spacebar) {
        this.dragState = { kind: 'pan', startScreen: screenPt };
        canvas.style.cursor = 'grabbing';
        return;
      }

      // Dispatch to tool registry for frame / annotation-freehand tools
      const tool = this.toolRegistry.get(this.activeToolName);
      if (tool && tool.onPointerDown) {
        const ctx = this.buildToolContext();
        const liteEvent: PointerEventLite = {
          point: boardPt,
          buttons: e.buttons,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
        };
        tool.onPointerDown(liteEvent, ctx);
        return;
      }

      const hit = this.hitTest(boardPt);

      // Reattach flow (task 11): if we are in reattach mode, the next
      // click determines the new endpoint (or cancels on empty).
      if (this.reattachState) {
        if (hit && !this.items.get(hit)?.type?.includes('connector')) {
          // A valid non-connector item was clicked — reattach.
          this.completeReattach(this.reattachState.connectorId, this.reattachState.kind, hit);
        }
        // Either way (hit or empty), exit reattach mode.
        this.reattachState = null;
        // If a hit happened, the connector is now reattached and the
        // user clicked something else — let normal selection proceed.
        // If empty, just exit reattach and fall through to normal
        // selection clearing.
      }

      // Reattach trigger: dangling connector is selected and the user
      // clicked one of its endpoint pins.
      if (
        hit &&
        this.selection.size === 1 &&
        this.selection.has(hit) &&
        !this.reattachState
      ) {
        const sel = this.items.get(hit);
        if (sel?.type === 'connector') {
          const selAttrs = sel.attrs as { dangling?: boolean };
          if (selAttrs.dangling) {
            const pinKind = this.hitTestConnectorPin(sel, boardPt);
            if (pinKind) {
              this.reattachState = { kind: pinKind, connectorId: hit };
              return;
            }
          }
        }
      }

      // Check for resize: if a single item is selected and pointer is near a corner
      if (this.selection.size === 1 && hit && this.selection.has(hit)) {
        const item = this.items.get(hit);
        if (item) {
          const corner = this.hitTestResizeCorner(item, boardPt);
          if (corner) {
            this.resizeState = {
              itemId: hit,
              corner,
              startBoard: boardPt,
              startBounds: { x: item.x, y: item.y, width: item.width, height: item.height },
            };
            return;
          }
        }
      }

      if (this.activeToolName === 'rectangle') {
        const snappedStart = this.snapPoint(boardPt);
        const proposed: Rect = {
          x: snappedStart.x,
          y: snappedStart.y,
          width: this.grid.cellSize,
          height: this.grid.cellSize,
        };
        const kind = layerKindFor('rectangle');
        const itemsList = this.buildCanPlaceItems(proposed, kind);
        if (!GridService.canPlace(proposed, itemsList, kind)) {
          this.flashRejectionRect(proposed);
          return;
        }
        const newId = asItemId(crypto.randomUUID());
        const newItem: BoardItem = {
          id: newId,
          type: 'rectangle',
          x: snappedStart.x,
          y: snappedStart.y,
          width: this.grid.cellSize,
          height: this.grid.cellSize,
          rotation: 0,
          layerId: defaultLayerIdFor(layerKindFor('rectangle')),
          attrs: { fillColor: '#4A90D9', strokeColor: '#000000', strokeWidth: 2 },
        };
        this.addItem(newItem);
        this.opts.onItemCreate({ item: newItem });
        this.dragState = { kind: 'draw-rect', startBoard: snappedStart, id: newId };
        return;
      }

      // Select tool
      if (hit) {
        if (e.shiftKey) {
          if (this.selection.has(hit)) this.selection.delete(hit);
          else this.selection.add(hit);
        } else if (!this.selection.has(hit)) {
          this.selection = new Set([hit]);
        }
        // Begin move
        const startPositions = new Map<ItemId, { x: number; y: number }>();
        for (const id of this.selection) {
          const it = this.items.get(id);
          if (it) startPositions.set(id, { x: it.x, y: it.y });
        }
        this.dragState = { kind: 'move-selected', startBoard: boardPt, startPositions };
      } else {
        if (!e.shiftKey) this.selection = new Set();
      }
      this.renderSelection();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragState && !this.resizeState) {
        // Check if a tool is active and wants pointermove
        const tool = this.toolRegistry.get(this.activeToolName);
        if (tool && tool.onPointerMove) {
          const rect = canvas.getBoundingClientRect();
          const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          const boardPt = this.screenToBoard(screenPt);
          this.lastPointerBoard = boardPt;
          const ctx = this.buildToolContext();
          const liteEvent: PointerEventLite = {
            point: boardPt,
            buttons: e.buttons,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
          };
          tool.onPointerMove(liteEvent, ctx);
        }
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.lastPointerBoard = this.screenToBoard(screenPt);

      // Resize handling
      if (this.resizeState) {
        const boardPt = this.screenToBoard(screenPt);
        const rs = this.resizeState;
        const item = this.items.get(rs.itemId);
        if (!item) return;

        const dx = boardPt.x - rs.startBoard.x;
        const dy = boardPt.y - rs.startBoard.y;

        let newX = rs.startBounds.x;
        let newY = rs.startBounds.y;
        let newW = rs.startBounds.width;
        let newH = rs.startBounds.height;

        switch (rs.corner) {
          case 'br':
            newW = Math.max(this.grid.cellSize, rs.startBounds.width + dx);
            newH = Math.max(this.grid.cellSize, rs.startBounds.height + dy);
            break;
          case 'bl':
            newX = rs.startBounds.x + dx;
            newW = Math.max(this.grid.cellSize, rs.startBounds.width - dx);
            newH = Math.max(this.grid.cellSize, rs.startBounds.height + dy);
            break;
          case 'tr':
            newY = rs.startBounds.y + dy;
            newW = Math.max(this.grid.cellSize, rs.startBounds.width + dx);
            newH = Math.max(this.grid.cellSize, rs.startBounds.height - dy);
            break;
          case 'tl':
            newX = rs.startBounds.x + dx;
            newY = rs.startBounds.y + dy;
            newW = Math.max(this.grid.cellSize, rs.startBounds.width - dx);
            newH = Math.max(this.grid.cellSize, rs.startBounds.height - dy);
            break;
        }

        // Quantize
        const proposed = GridService.quantizeRect(
          { x: newX, y: newY, width: newW, height: newH },
          this.grid,
        );
        const kind = layerKindFor(item.type);
        const itemsList = this.buildCanPlaceItems(proposed, kind, rs.itemId);

        if (!GridService.canPlace(proposed, itemsList, kind, rs.itemId)) {
          // Revert to last valid bounds
          const lastValid = this.lastValidBounds.get(rs.itemId);
          if (lastValid) {
            this.updateItem(rs.itemId, {
              x: lastValid.x,
              y: lastValid.y,
              width: lastValid.width,
              height: lastValid.height,
            });
          }
          this.flashRejection(rs.itemId);
          return;
        }

        this.updateItem(rs.itemId, {
          x: proposed.x,
          y: proposed.y,
          width: proposed.width,
          height: proposed.height,
        });
        this.renderSelection();
        return;
      }

      if (!this.dragState) return;

      if (this.dragState.kind === 'pan') {
        const dx = screenPt.x - this.dragState.startScreen.x;
        const dy = screenPt.y - this.dragState.startScreen.y;
        this.dragState.startScreen = screenPt;
        this.pan(dx, dy);
        return;
      }
      const boardPt = this.screenToBoard(screenPt);

      if (this.dragState.kind === 'draw-rect') {
        const sx = this.dragState.startBoard.x;
        const sy = this.dragState.startBoard.y;
        const x = Math.min(sx, boardPt.x);
        const y = Math.min(sy, boardPt.y);
        const w = Math.max(this.grid.cellSize, Math.abs(boardPt.x - sx));
        const h = Math.max(this.grid.cellSize, Math.abs(boardPt.y - sy));
        const snapped = this.snapPoint({ x, y });
        const sw = Math.max(this.grid.cellSize, Math.round(w / this.grid.cellSize) * this.grid.cellSize);
        const sh = Math.max(this.grid.cellSize, Math.round(h / this.grid.cellSize) * this.grid.cellSize);
        const proposed = {
          x: snapped.x,
          y: snapped.y,
          width: sw,
          height: sh,
        };
        const drawItem = this.items.get(this.dragState.id);
        const kind = drawItem ? layerKindFor(drawItem.type) : ('media' as LayerKind);
        const itemsList = this.buildCanPlaceItems(proposed, kind, this.dragState.id);
        if (!GridService.canPlace(proposed, itemsList, kind, this.dragState.id)) {
          // Revert to last valid bounds for this draw-rect item
          const lastValid = this.lastValidBounds.get(this.dragState.id);
          if (lastValid && drawItem) {
            this.updateItem(this.dragState.id, {
              x: lastValid.x,
              y: lastValid.y,
              width: lastValid.width,
              height: lastValid.height,
            });
          }
          this.flashRejection(this.dragState.id);
          return;
        }
        this.updateItem(this.dragState.id, { x: snapped.x, y: snapped.y, width: sw, height: sh });
        // Track last valid bounds on acceptance
        this.lastValidBounds.set(this.dragState.id, {
          x: snapped.x,
          y: snapped.y,
          width: sw,
          height: sh,
        });
        return;
      }

      if (this.dragState.kind === 'move-selected') {
        const dx = boardPt.x - this.dragState.startBoard.x;
        const dy = boardPt.y - this.dragState.startBoard.y;

        for (const [id, start] of this.dragState.startPositions) {
          const item = this.items.get(id);
          if (!item) continue;
          const proposed = GridService.quantizeRect(
            { x: start.x + dx, y: start.y + dy, width: item.width, height: item.height },
            this.grid,
          );
          const kind = layerKindFor(item.type);
          const itemsList = this.buildCanPlaceItems(proposed, kind, id);

          if (!GridService.canPlace(proposed, itemsList, kind, id)) {
            // Revert to last valid bounds
            const lastValid = this.lastValidBounds.get(id);
            if (lastValid) {
              this.updateItem(id, {
                x: lastValid.x,
                y: lastValid.y,
              });
            }
            this.flashRejection(id);
            continue;
          }

          this.updateItem(id, { x: proposed.x, y: proposed.y });
        }
        this.renderSelection();
      }
    });

    const endDrag = () => {
      if (this.resizeState) {
        // Commit resize
        const rs = this.resizeState;
        const item = this.items.get(rs.itemId);
        if (item) {
          this.opts.onItemChange({
            id: rs.itemId,
            partial: { x: item.x, y: item.y, width: item.width, height: item.height },
          });
          this.lastValidBounds.set(rs.itemId, {
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
          });
        }
        this.resizeState = null;
        this.renderSelection();
        return;
      }

      if (this.dragState?.kind === 'move-selected') {
        // Commit final positions to Yjs
        for (const id of this.selection) {
          const it = this.items.get(id);
          if (!it) continue;
          this.opts.onItemChange({ id, partial: { x: it.x, y: it.y } });
          this.lastValidBounds.set(id, { x: it.x, y: it.y, width: it.width, height: it.height });
        }
        this.renderSelection();
      } else if (this.dragState?.kind === 'draw-rect') {
        const it = this.items.get(this.dragState.id);
        if (it) {
          this.opts.onItemChange({
            id: this.dragState.id,
            partial: { x: it.x, y: it.y, width: it.width, height: it.height },
          });
          this.lastValidBounds.set(this.dragState.id, {
            x: it.x,
            y: it.y,
            width: it.width,
            height: it.height,
          });
        }
      }
      this.dragState = null;

      // Commit any per-item queued updates (single-slot buffer from
      // Tool-owned drag-queue, see design.md D3) before notifying the tool
      // that the pointer is up, so queued updates are committed first.
      this.flushQueuedUpdates();

      // Notify tool of pointer up
      const tool = this.toolRegistry.get(this.activeToolName);
      if (tool && tool.onPointerUp) {
        const ctx = this.buildToolContext();
        const liteEvent: PointerEventLite = {
          point: this.lastPointerBoard,
          buttons: 0,
          shiftKey: false,
          metaKey: false,
          altKey: false,
          ctrlKey: false,
        };
        tool.onPointerUp(liteEvent, ctx);
      }

      if (this.spacebar) canvas.style.cursor = 'grab';
      else canvas.style.cursor = 'default';
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointerleave', endDrag);
  }

  /**
   * Build a list of items suitable for GridService.canPlace(), scoped to the
   * given rect and layer kind via SpatialIndex.findOverlapping (O(log n + k)
   * via RBush). The dragged/resized item should be passed as `excludeId` so
   * it is not compared against itself.
   *
   * Each entry has id, x, y, width, height, and layerKind — the shape
   * GridService.canPlace expects.
   */
  private buildCanPlaceItems(
    rect: Rect,
    kind: LayerKind,
    excludeId?: ItemId,
  ): Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    layerKind: LayerKind;
  }> {
    const candidates = this.index.findOverlapping(rect, kind, excludeId);
    const result: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      layerKind: LayerKind;
    }> = [];
    for (const entry of candidates) {
      const item = this.items.get(entry.id);
      if (!item) continue;
      result.push({
        id: entry.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        layerKind: entry.layerKind,
      });
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing without PixiJS initialization
// ---------------------------------------------------------------------------

export interface GridLines {
  vertical: number[];
  horizontal: number[];
}

/**
 * Compute the set of grid line positions (in board coordinates) that should
 * be drawn for a given viewport rect and cell size. Handles negative
 * coordinates correctly via Math.floor / Math.ceil.
 */
export function computeGridLines(
  viewport: Rect,
  cellSize: number,
): GridLines {
  const startX = Math.floor(viewport.x / cellSize) * cellSize;
  const endX = Math.ceil((viewport.x + viewport.width) / cellSize) * cellSize;
  const startY = Math.floor(viewport.y / cellSize) * cellSize;
  const endY = Math.ceil((viewport.y + viewport.height) / cellSize) * cellSize;
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (let x = startX; x <= endX; x += cellSize) vertical.push(x);
  for (let y = startY; y <= endY; y += cellSize) horizontal.push(y);
  return { vertical, horizontal };
}

/**
 * Return the LayerKind that an item of the given type should be routed to.
 * Pure wrapper around the domain's layerKindFor for testability.
 */
export function pickLayerKind(type: ItemType): LayerKind {
  return layerKindFor(type);
}

/**
 * Given a set of candidate item IDs and a function to look up their LayerKind,
 * return the topmost item ID according to registry-driven hit-priority
 * (highest first). Returns null if no candidates match.
 */
export function pickTopmostItem(
  ids: Iterable<string>,
  getKind: (id: string) => LayerKind | undefined,
): string | null {
  const layerPriority = sortByHitPriority();
  const idSet = new Set(ids);
  for (const kind of layerPriority) {
    for (const id of idSet) {
      if (getKind(id) === kind) return id;
    }
  }
  return null;
}

/**
 * Pure viewport-culling function. Given a map of items with bounds and a
 * viewport rect, returns the sets of visible and hidden item IDs.
 */
export function cullPure(
  items: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>,
  viewport: Rect,
): { visibleIds: Set<string>; hiddenIds: Set<string> } {
  const visibleIds = new Set<string>();
  const hiddenIds = new Set<string>();
  for (const [id, item] of items) {
    const intersects =
      item.x < viewport.x + viewport.width &&
      item.x + item.width > viewport.x &&
      item.y < viewport.y + viewport.height &&
      item.y + item.height > viewport.y;
    if (intersects) visibleIds.add(id);
    else hiddenIds.add(id);
  }
  return { visibleIds, hiddenIds };
}

// ---------------------------------------------------------------------------
// Pure validation helpers — exported for unit testing without PixiJS
// ---------------------------------------------------------------------------

export interface CanPlaceItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layerKind: LayerKind;
}

/**
 * Validate a proposed move for a single item against all other items.
 * Returns { valid: true } if the move is allowed, or { valid: false } if
 * the proposed rect overlaps a same-kind item.
 */
export function validateMove(
  items: ReadonlyMap<string, CanPlaceItem>,
  id: string,
  proposed: Rect,
  grid: GridConfig,
): { valid: boolean; corrected?: Rect } {
  const quantized = GridService.quantizeRect(proposed, grid);
  const item = items.get(id);
  if (!item) return { valid: false };
  const kind = item.layerKind;
  if (GridService.canPlace(quantized, items.values(), kind, id)) {
    return { valid: true, corrected: quantized };
  }
  return { valid: false };
}

/**
 * Validate a proposed resize for a single item against all other items.
 * Returns { valid: true } if the resize is allowed, or { valid: false } if
 * the proposed rect overlaps a same-kind item.
 */
export function validateResize(
  items: ReadonlyMap<string, CanPlaceItem>,
  id: string,
  proposed: Rect,
  grid: GridConfig,
): { valid: boolean; corrected?: Rect } {
  const quantized = GridService.quantizeRect(proposed, grid);
  const item = items.get(id);
  if (!item) return { valid: false };
  const kind = item.layerKind;
  if (GridService.canPlace(quantized, items.values(), kind, id)) {
    return { valid: true, corrected: quantized };
  }
  return { valid: false };
}

/**
 * Validate a proposed creation rect against all existing items of the same kind.
 */
export function validateCreate(
  items: ReadonlyMap<string, CanPlaceItem>,
  proposed: Rect,
  kind: LayerKind,
  grid: GridConfig,
): { valid: boolean; corrected?: Rect } {
  const quantized = GridService.quantizeRect(proposed, grid);
  if (GridService.canPlace(quantized, items.values(), kind)) {
    return { valid: true, corrected: quantized };
  }
  return { valid: false };
}

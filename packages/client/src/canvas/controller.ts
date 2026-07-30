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
  extensions,
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
import {
  type PlacementState,
  createInitialPlacementState,
  updatePlacementState,
  makeInvalidPlacement,
  hasInvalidReason,
} from './placement-state';

export interface CanvasControllerOptions {
  container: HTMLElement;
  /** Adapter snapshot for current set of items */
  getItems: () => Iterable<BoardItem>;
  /** Write-back from local interactions (Yjs) */
  onItemChange: (update: { id: string; partial: Partial<BoardItem> }) => void;
  onItemDelete: (del: { id: string }) => void;
  onItemCreate: (add: { item: BoardItem }) => void;
}

/**
 * Snapshot pushed to minimap listeners after any render-affecting
 * change. Keeps the minimap decoupled from the controller's private
 * maps.
 */
export interface MinimapItemSnapshot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly type: string;
}

export interface MinimapSnapshot {
  readonly items: ReadonlyArray<MinimapItemSnapshot>;
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly viewport: { readonly width: number; readonly height: number };
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
  /**
   * Ghost preview layer (above items, below selection). Holds the
   * translucent ghost that previews an in-progress drag/nudge at the
   * proposed position. See `invalid-placement-ux` proposal D1–D2.
   */
  private ghostLayer: Container | null = null;

  private index = new SpatialIndex();
  private items = new Map<ItemId, BoardItem>();
  private displayById = new Map<ItemId, Container>();
  private selectionHandles = new Map<ItemId, Graphics>();
  selection: Set<ItemId> = new Set();

  private camera: CameraState = { ...DEFAULT_CAMERA };
  /**
   * Local grid config. Bumped from the domain default (`cellSize: 20`)
   * to `32` so a single cell comfortably holds a square image and the
   * dot grid reads at the default zoom. The domain default is the
   * canonical "1 unit" of the system; this override only widens the
   * visual cell. Snap / quantize math are unchanged.
   */
  private grid: GridConfig = { ...DEFAULT_GRID_CONFIG, cellSize: 32, subdivisions: 4 };

  /**
   * Per-render-frame listeners for the minimap. Each listener is
   * called with a snapshot of items + camera after any render
   * change. The minimap subscribes here so it does not need to read
   * the controller's internal maps.
   */
  private renderListeners = new Set<(snap: MinimapSnapshot) => void>();
  private lastEmittedSnapshot: MinimapSnapshot | null = null;
  private lastMinimapCameraX = 0;
  private lastMinimapCameraY = 0;
  private lastMinimapZoom = 1;
  private endpointIndex = new Map<ItemId, Set<ItemId>>();
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
   * Per-item in-progress placement state, controller-local ephemeral.
   * `invalid-placement-ux` proposal D1: NOT in Yjs, NOT in Zustand.
   * Created on drag/nudge start, updated every pointermove, cleared on
   * drag end. See `placement-state.ts`.
   */
  private placementStates = new Map<ItemId, PlacementState>();

  /**
   * Map of per-item ghost PixiJS containers currently rendered on the
   * `ghostLayer`. Keyed by ItemId. Cleared on drag end (clearGhost).
   */
  private ghostGraphics = new Map<ItemId, Graphics>();

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
    extensions.add(CullerPlugin);
    const app = new Application();
    await app.init({
      background: 0x0f1115,
      antialias: false,
      resizeTo: this.opts.container,
      autoDensity: true,
      preference: 'webgl',
      gcActive: true,
      gcMaxUnusedTime: 120_000,
      gcFrequency: 60_000,
      powerPreference: 'high-performance',
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

    // Ghost preview layer. Sits above items (so the ghost is visible
    // over same-layer items during drag). Children are added on demand
    // by `renderGhost`. Added BEFORE the selection layer so that
    // selection/resize handles render on top of the ghost.
    this.ghostLayer = new Container();
    world.addChild(this.ghostLayer);

    // Selection handles (above items AND above the ghost preview so
    // resize/selection handles remain visible during drag).
    this.selectionLayer = new Container();
    world.addChild(this.selectionLayer);

    // Tool overlay (topmost — previews, drag feedback)
    this.toolOverlay = new Container();
    world.addChild(this.toolOverlay);

    this.world = world;
    this.initToolRegistry();
    this.installInputHandlers();
    // Initial paint runs synchronously so the canvas isn't blank
    // before the first frame.
    this.applyCamera();
    this.redrawGrid();
    this.cullViewport();
    this.cullZoom = this.camera.zoom;
    this.cameraDirty = false;

    // Subscribe to layer-registry changes so addLayer/deleteLayer calls
    // immediately reconcile the controller's derived lists and PixiJS
    // layer containers. The unsubscribe handle is held for destroy().
    this.unsubscribeRegistry = registerOnChange(() => {
      this.rebuildLayerState();
    });

    // Redraw grid on resize so viewport-coverage stays correct.
    // Resize is rare; the synchronous path is fine.
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
    this.emitMinimap();
  }

  addItem(item: BoardItem): void {
    this.items.set(item.id, item);
    this.index.insert(item, layerKindFor(item.type));
    this.indexConnector(item.id, item);
    const display = this.renderItemDisplay(item);
    this.addItemToLayer(display, item);
    this.displayById.set(item.id, display);
    // Track last valid bounds
    this.lastValidBounds.set(item.id, { x: item.x, y: item.y, width: item.width, height: item.height });
    this.emitMinimap();
  }

  /**
   * Track the outer-most mutation call. `emitMinimap` is only
   * invoked when the depth returns to 0, so chained calls
   * (connector re-renders, dangling-flag fan-out) coalesce into a
   * single minimap push per user interaction.
   */
  private mutationDepth = 0;

  private endMutation(): void {
    this.mutationDepth--;
    if (this.mutationDepth === 0) this.emitMinimap();
  }

  private shallowAttrsEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
    }
    return true;
  }

  private indexConnector(id: ItemId, item: BoardItem): void {
    if (item.type !== 'connector') return;
    const attrs = item.attrs as { from?: string; to?: string };
    for (const ep of [attrs.from, attrs.to]) {
      if (!ep) continue;
      const epId = asItemId(ep);
      let s = this.endpointIndex.get(epId);
      if (!s) {
        s = new Set();
        this.endpointIndex.set(epId, s);
      }
      s.add(id);
    }
  }

  private unindexConnector(id: ItemId, item: BoardItem): void {
    if (item.type !== 'connector') return;
    const attrs = item.attrs as { from?: string; to?: string };
    for (const ep of [attrs.from, attrs.to]) {
      if (!ep) continue;
      const epId = asItemId(ep);
      const s = this.endpointIndex.get(epId);
      if (s) {
        s.delete(id);
        if (s.size === 0) this.endpointIndex.delete(epId);
      }
    }
  }

  updateItem(id: string | ItemId, partial: Partial<BoardItem> | BoardItem): void {
    this.mutationDepth++;
    const idItem = asItemId(String(id));
    const prev = this.items.get(idItem);
    if (!prev) {
      this.endMutation();
      return;
    }
    const next: BoardItem =
      'id' in partial && partial.id === idItem
        ? (partial as BoardItem)
        : ({ ...prev, ...(partial as Partial<BoardItem>) } as BoardItem);

    // Re-index connector endpoints if attrs changed
    if (prev.type === 'connector' || next.type === 'connector') {
      const prevAttrs = prev.attrs as { from?: string; to?: string };
      const nextAttrs = next.attrs as { from?: string; to?: string };
      if (prevAttrs.from !== nextAttrs.from || prevAttrs.to !== nextAttrs.to) {
        this.unindexConnector(idItem, prev);
        this.indexConnector(idItem, next);
      }
    }

    this.items.set(idItem, next);
    this.index.update(next, layerKindFor(next.type));

    // Detect: did anything besides x/y/width/height change?
    const isTransformOnly =
      next.type === prev.type &&
      next.layerId === prev.layerId &&
      next.rotation === prev.rotation &&
      next.zIndex === prev.zIndex &&
      this.shallowAttrsEqual(prev.attrs, next.attrs);

    const oldDisplay = this.displayById.get(idItem);
    if (isTransformOnly && oldDisplay) {
      // FAST PATH: mutate in place
      oldDisplay.position.set(next.x, next.y);
    } else {
      // SLOW PATH: full rebuild
      if (oldDisplay) {
        const oldKind = layerKindFor(prev.type);
        const oldLayer = this.layerContainers.get(oldKind);
        if (oldLayer) oldLayer.removeChild(oldDisplay);
        oldDisplay.destroy({ children: true });
      }
      const fresh = this.renderItemDisplay(next);
      fresh.position.set(next.x, next.y);
      this.addItemToLayer(fresh, next);
      this.displayById.set(idItem, fresh);
    }

    // Endpoint tracking: use the endpoint index to find connectors
    // that reference this item, and re-render them.
    const connectors = this.endpointIndex.get(idItem);
    if (connectors && connectors.size > 0) {
      for (const otherId of connectors) {
        const otherItem = this.items.get(otherId);
        if (!otherItem || otherItem.type !== 'connector') continue;
        this.updateItem(otherId, otherItem);
      }
    }
    this.endMutation();
  }

  removeItem(id: string | ItemId): void {
    this.mutationDepth++;
    const idItem = asItemId(String(id));
    this.index.remove(idItem);
    const item = this.items.get(idItem);
    if (item) {
      this.unindexConnector(idItem, item);
    }
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
    const connectors = this.endpointIndex.get(idItem);
    if (connectors && connectors.size > 0) {
      for (const otherId of connectors) {
        const otherItem = this.items.get(otherId);
        if (!otherItem || otherItem.type !== 'connector') continue;
        const otherAttrs = otherItem.attrs as { from?: string; to?: string; dangling?: boolean };
        if (otherAttrs.dangling) continue; // already dangling
        const nextAttrs = { ...otherItem.attrs, dangling: true };
        const nextConnector = { ...otherItem, attrs: nextAttrs } as BoardItem;
        this.updateItem(otherId, nextConnector);
        this.opts.onItemChange({ id: otherId, partial: { attrs: nextAttrs } });
      }
    }
    this.endMutation();
  }

  // ----- Selection / Mutations from outside -----

  /**
   * Called by the adapter for remote updates. After applying the update
   * locally, run `GridService.canPlace` and:
   *   - If valid: update `lastValidBounds` to the new bounds.
   *   - If invalid: revert the item back to its `lastValidBounds` and
   *     emit a corrected write via `opts.onItemChange`.
   *
   * Section 8.2: this auto-revert is suppressed when the user is
   * actively dragging or resizing — the local user has the "last
   * word" and the ghost preview handles their feedback.
   */
  applyRemoteUpdate(id: string, partial: Partial<BoardItem>): void {
    const idItem = asItemId(String(id));

    // Suppress auto-revert during a user drag/resize — Section 8.2.
    const userIsDragging =
      (this.dragState !== null &&
        (this.dragState.kind === 'move-selected' ||
          this.dragState.kind === 'draw-rect')) ||
      this.resizeState !== null;
    if (userIsDragging) {
      this.updateItem(id, partial);
      return;
    }

    // Apply first so we can read the resulting bounds.
    this.updateItem(id, partial);
    const updated = this.items.get(idItem);
    if (!updated) return;

    // Only the position/size dimensions matter for canPlace.
    const proposed = {
      x: updated.x,
      y: updated.y,
      width: updated.width,
      height: updated.height,
    };
    const kind = layerKindFor(updated.type);
    const itemsList = this.buildCanPlaceItems(proposed, kind, idItem);
    const placeable = GridService.canPlace(proposed, itemsList, kind, idItem);

    if (placeable) {
      // Section 8.1: valid → update lastValidBounds, no correction.
      this.lastValidBounds.set(idItem, {
        x: updated.x,
        y: updated.y,
        width: updated.width,
        height: updated.height,
      });
      return;
    }

    // Invalid overlap caused by remote write — auto-revert.
    const lastValid = this.lastValidBounds.get(idItem);
    if (!lastValid) {
      // No revert target available (controller-local map empty —
      // see Bug #15 caveat). Skip the correction; the next local
      // interaction will repopulate lastValidBounds.
      return;
    }
    this.updateItem(idItem, {
      x: lastValid.x,
      y: lastValid.y,
      width: lastValid.width,
      height: lastValid.height,
    });
    // Emit corrected write so other peers converge.
    this.opts.onItemChange({
      id,
      partial: {
        x: lastValid.x,
        y: lastValid.y,
        width: lastValid.width,
        height: lastValid.height,
      },
    });
  }

  applyToolbarAction(action: ToolbarAction): void {
    if (action.type === 'set-tool') {
      this.activeToolName = action.tool;
      // Update the cursor to match the new tool. Pan tools (Hand)
      // get 'grab'; everything else gets 'default'. The spacebar
      // path overrides this while held.
      if (this.app?.canvas) {
        this.app.canvas.style.cursor =
          action.tool === 'hand' && !this.spacebar ? 'grab' : 'default';
      }
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

  // ----- Camera (rAF-coalesced for 60 FPS pan/zoom) -----

  /**
   * Move the camera so `boardCenter` is at the visual center of the
   * viewport. Used by the minimap "navigate" callback to center on
   * a clicked position.
   */
  centerOn(boardCenter: Point): void {
    this.camera = { ...this.camera, x: boardCenter.x, y: boardCenter.y };
    this.scheduleCameraFlush({ redrawGrid: 'always' });
  }

  /** Current camera state (read-only view). */
  getCamera(): { x: number; y: number; zoom: number } {
    return { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom };
  }

  /** Current viewport size in screen pixels. */
  getViewportSize(): { width: number; height: number } {
    if (!this.app) return { width: 0, height: 0 };
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  /**
   * Compute the bounding box of all items in board coordinates.
   * Used by the minimap "fit" action and by `getMinimapSnapshot`.
   */
  getItemsBounds(): Rect | null {
    if (this.items.size === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of this.items.values()) {
      if (item.x < minX) minX = item.x;
      if (item.y < minY) minY = item.y;
      if (item.x + item.width > maxX) maxX = item.x + item.width;
      if (item.y + item.height > maxY) maxY = item.y + item.height;
    }
    if (!Number.isFinite(minX)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Center the camera on the union of all items with sensible
   * padding, then pick a zoom that fits them all in the viewport.
   */
  fitToContent(): void {
    if (!this.app) return;
    const bounds = this.getItemsBounds();
    if (!bounds) {
      this.camera = { x: 0, y: 0, zoom: 1 };
      this.scheduleCameraFlush({ redrawGrid: 'always' });
      return;
    }
    const padFactor = 0.1;
    const paddedW = bounds.width * (1 + padFactor * 2);
    const paddedH = bounds.height * (1 + padFactor * 2);
    const zoomW = this.app.screen.width / paddedW;
    const zoomH = this.app.screen.height / paddedH;
    const zoom = Math.max(0.1, Math.min(2, Math.min(zoomW, zoomH)));
    this.camera = {
      ...this.camera,
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      zoom,
    };
    this.scheduleCameraFlush({ redrawGrid: 'always' });
  }

  /**
   * Reset the camera to the default (centered at origin, zoom 1).
   */
  resetView(): void {
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.scheduleCameraFlush({ redrawGrid: 'always' });
  }

  /**
   * Subscribe to render-affecting state changes. Returns an
   * unsubscribe function.
   *
   * The minimap uses this to keep its snapshot in sync without
   * reading the controller's private maps.
   */
  onRender(listener: (snap: MinimapSnapshot) => void): () => void {
    this.renderListeners.add(listener);
    // Push the initial snapshot so the listener can render immediately.
    queueMicrotask(() => {
      if (this.renderListeners.has(listener)) listener(this.buildMinimapSnapshot());
    });
    return () => {
      this.renderListeners.delete(listener);
    };
  }

  /**
   * React-friendly minimap subscription. Uses the same renderListeners
   * set as `onRender` but the listener is called with no arguments —
   * consumers call `getMinimapSnapshot()` to read the latest snapshot.
   * Returns an unsubscribe function.
   */
  subscribeMinimap(listener: () => void): () => void {
    this.renderListeners.add(listener as unknown as (snap: MinimapSnapshot) => void);
    // Push the initial snapshot when one exists, so listeners can paint
    // immediately.
    const initial = this.lastEmittedSnapshot;
    if (initial) {
      queueMicrotask(() => {
        if (this.renderListeners.has(listener as unknown as (snap: MinimapSnapshot) => void)) {
          listener();
        }
      });
    }
    return () => {
      this.renderListeners.delete(listener as unknown as (snap: MinimapSnapshot) => void);
    };
  }

  /**
   * Return the last emitted minimap snapshot, or null if none has been
   * emitted yet. The reference is stable between emits — consumers can
   * use `Object.is` to detect changes.
   */
  getMinimapSnapshot(): MinimapSnapshot | null {
    return this.lastEmittedSnapshot;
  }

  /** Build a snapshot of items + camera for minimap consumers. */
  private buildMinimapSnapshot(): MinimapSnapshot {
    const items: MinimapItemSnapshot[] = [];
    for (const [id, item] of this.items) {
      items.push({
        id: String(id),
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        type: item.type,
      });
    }
    return {
      items,
      camera: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom },
      viewport: this.getViewportSize(),
    };
  }

  /** Push the current snapshot to all render listeners. */
  private emitMinimap(): void {
    const snap = this.buildMinimapSnapshot();
    this.lastEmittedSnapshot = snap;
    this.lastMinimapCameraX = this.camera.x;
    this.lastMinimapCameraY = this.camera.y;
    this.lastMinimapZoom = this.camera.zoom;
    for (const listener of this.renderListeners) listener(snap);
  }

  /**
   * Returns true if the minimap snapshot should be re-emitted because
   * the camera moved more than 0.5 board units or the zoom changed.
   */
  private shouldEmitMinimap(): boolean {
    if (this.camera.zoom !== this.lastMinimapZoom) return true;
    const dx = Math.abs(this.camera.x - this.lastMinimapCameraX);
    const dy = Math.abs(this.camera.y - this.lastMinimapCameraY);
    return dx + dy > 0.5;
  }

  setZoom(zoom: number, around?: Point): void {
    const next = Math.max(0.1, Math.min(5, zoom));
    const px: Point = around ?? this.viewportCenter();
    if (!this.world || !this.app) {
      this.camera = { ...this.camera, zoom: next };
      this.scheduleCameraFlush({ redrawGrid: 'always' });
      return;
    }
    // Keep the world point under the cursor fixed across the zoom.
    //
    // The world transform is:
    //   screenX = worldX * zoom + world.position.x
    // where world.position.x = screenCenterX - camera.x * zoom.
    //
    // The world point currently under the cursor is `before`. After
    // zooming to `next`, that same world point should still land at
    // `px`. Solving for the new camera.x:
    //   before.x * next + (screenCenterX - camera.x' * next) = px.x
    //   camera.x' = before.x + (screenCenterX - px.x) / next
    //
    // Old (current) camera.x satisfies the same equation with
    // `oldZoom`, so the delta is:
    //   camera.x' - camera.x = (screenCenterX - px.x) * (1/next - 1/oldZoom)
    //
    // Equivalent and simpler to read: just compute the new camera
    // position directly using the equation above.
    const before = this.screenToBoard(px);
    const screenCenterX = this.app.screen.width / 2;
    const screenCenterY = this.app.screen.height / 2;
    this.camera = {
      ...this.camera,
      zoom: next,
      x: before.x + (screenCenterX - px.x) / next,
      y: before.y + (screenCenterY - px.y) / next,
    };
    // Zoom changes the visible set, so a cull is required.
    this.scheduleCameraFlush({ redrawGrid: 'always' });
  }

  pan(dx: number, dy: number): void {
    // Pan is a pure translation; the visible set doesn't change so
    // cull can be skipped. The rAF flush will redraw the grid +
    // notify the minimap, both cheap relative to the world
    // transform that's already been applied via `applyCamera()`
    // inside the flush.
    this.camera = {
      ...this.camera,
      x: this.camera.x - dx / this.camera.zoom,
      y: this.camera.y - dy / this.camera.zoom,
    };
    this.scheduleCameraFlush({ redrawGrid: 'when-dirty' });
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
    this.ghostLayer = null;
    this.ghostGraphics.clear();
    this.placementStates.clear();
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
  // ----- PlacementState helpers (Section 1.4) -----

  /**
   * Get the current PlacementState for an item, if any.
   */
  getPlacementState(id: ItemId): PlacementState | undefined {
    return this.placementStates.get(id);
  }

  /**
   * Set / replace the PlacementState for an item. Caller is responsible
   * for triggering any ghost re-render.
   */
  setPlacementState(id: ItemId, state: PlacementState): void {
    this.placementStates.set(id, state);
  }

  /**
   * Remove any PlacementState and ghost for an item. Safe to call when
   * no state exists.
   */
  clearPlacementState(id: ItemId): void {
    this.placementStates.delete(id);
    this.clearGhost(id);
  }

  /**
   * Clear all PlacementStates and ghosts. Used on selection change and
   * in `destroy()` to ensure no stale state survives.
   */
  clearAllPlacementStates(): void {
    this.placementStates.clear();
    for (const id of [...this.ghostGraphics.keys()]) {
      this.clearGhost(id);
    }
  }

  // ----- Ghost preview rendering (Section 2) -----

  /**
   * Render a translucent ghost at the proposed bounds for the item.
   * Reads `PlacementState` from `placementStates`; if none exists the
   * call is a no-op (clears any leftover ghost).
   *
   * Style (Section 2.2 / 4.1):
   *   - valid:   outline (alpha 0.5) + fill (alpha 0.5)
   *   - invalid: red outline (#ff0000 alpha 1.0) + 30% red fill
   *     (D3 — all non-undefined reasons map to red in v1; the
   *     color-selection switch below is structured so future
   *     multi-color encoding is a one-line change.)
   */
  renderGhost(id: ItemId): void {
    const state = this.placementStates.get(id);
    if (!state || !this.ghostLayer) {
      // No active placement state — make sure any stale ghost is cleared
      this.clearGhost(id);
      return;
    }
    // The PlacementState's `proposedBounds` carries both the rect and
    // its size, so the ghost renders correctly even when the item
    // itself does not (yet) exist (e.g. the rectangle-tool creation
    // preview, which uses a synthetic id).
    const item = this.items.get(id);
    const idStr = String(id);
    if (!item && idStr.startsWith('__create-preview__')) {
      // OK: render from bounds alone.
    } else if (!item) {
      this.clearGhost(id);
      return;
    }

    // Reuse existing Graphics if present, otherwise create a new one.
    let g = this.ghostGraphics.get(id);
    if (!g) {
      g = new Graphics();
      this.ghostLayer.addChild(g);
      this.ghostGraphics.set(id, g);
    } else {
      g.clear();
    }

    const { x, y, width, height } = state.proposedBounds;

    // v1 color map: all non-undefined reasons → red (#ff0000). The
    // structure of this switch means future multi-color encoding
    // (red=overlap, amber=containment, magenta=both) is a one-line
    // change — no controller logic changes.
    const isInvalid =
      state.state === 'invalid' && hasInvalidReason(state);

    if (isInvalid) {
      // Persistent red marker (no setTimeout, see Section 4.3).
      const redFill = 0xff0000;
      const redFillAlpha = 0.3;
      const strokeAlpha = 1.0;
      g.setFillStyle({ color: redFill, alpha: redFillAlpha });
      g.rect(x, y, width, height);
      g.fill();
      g.setStrokeStyle({ width: 2, color: redFill, alpha: strokeAlpha });
      g.rect(x, y, width, height);
      g.stroke();
    } else {
      // Valid placement: translucent ghost at the proposed position.
      const fillAlpha = 0.5;
      const strokeAlpha = 0.5;
      // White fill (visible over dark and light board) at low alpha.
      g.setFillStyle({ color: 0xffffff, alpha: fillAlpha });
      g.rect(x, y, width, height);
      g.fill();
      g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: strokeAlpha });
      g.rect(x, y, width, height);
      g.stroke();
    }
  }

  /**
   * Remove the ghost graphics for an item from the ghostLayer and
   * destroy it. Safe to call when no ghost exists for the item.
   */
  clearGhost(id: ItemId): void {
    const g = this.ghostGraphics.get(id);
    if (!g) return;
    if (this.ghostLayer) this.ghostLayer.removeChild(g);
    g.destroy();
    this.ghostGraphics.delete(id);
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
    // Compute directly from the camera + screen size so the result
    // is correct even between a `pan`/`setZoom` call and the rAF
    // flush that updates `world.position`. The world transform is
    // `worldX = (screenX - (screenCenter - camera.x * zoom)) / zoom`,
    // so:
    const screenCenterX = this.app ? this.app.screen.width / 2 : 0;
    const screenCenterY = this.app ? this.app.screen.height / 2 : 0;
    const zoom = this.camera.zoom;
    return {
      x: this.camera.x + (p.x - screenCenterX) / zoom,
      y: this.camera.y + (p.y - screenCenterY) / zoom,
    };
  }

  // ----- Camera coalescing (60 FPS pan/zoom) -----

  /**
   * Camera state has changed; schedule a single rAF flush that
   * applies the transform, redraws the grid, recomputes culling
   * (only on zoom-level changes), and notifies minimap listeners.
   *
   * Per the perf brief: previously every `pointermove` during a pan
   * synchronously re-issued thousands of PixiJS draw calls (one
   * `circle + fill` per dot), re-ran viewport culling over every
   * item, and re-painted the minimap canvas. At 60 Hz that produced
   * visible jank. Now we batch all of that into one flush per
   * animation frame.
   *
   * Pan is special: the grid is a child of the `world` container,
   * so when `applyCamera` translates the world the grid moves with
   * it for free. Re-issuing hundreds of `circle + fill` calls on
   * every pan frame is pure waste — the dots already render at the
   * right screen positions because their world positions are
   * unchanged. So pan only applies the transform and updates the
   * minimap viewport indicator; zoom additionally rebuilds the
   * grid (because the visible world-space viewport changes) and
   * runs culling (because the visible item set may change).
   */
  private cameraDirty = true;
  private cameraRafScheduled = false;
  /** Track the last zoom we did a full cull for. */
  private cullZoom = -1;

  private scheduleCameraFlush(
    opts: { redrawGrid: 'always' | 'when-dirty' | 'never' } = { redrawGrid: 'never' },
  ): void {
    this.cameraDirty = true;
    if (this.cameraRafScheduled) return;
    this.cameraRafScheduled = true;
    const flush = () => {
      this.cameraRafScheduled = false;
      if (!this.cameraDirty) return;
      this.cameraDirty = false;
      this.applyCamera();
      // Decide whether to redraw the grid:
      //  - 'always'  : zoom, fit, reset, centerOn — the visible
      //                 world-space viewport or zoom changed, so
      //                 the dot field must be rebuilt.
      //  - 'when-dirty': pan — only redraw if the camera has crossed
      //                 the field boundary (i.e. panned far enough
      //                 that the existing field no longer covers
      //                 the viewport). Otherwise the world transform
      //                 is translating the field for free, and a
      //                 redraw would be wasted work.
      //  - 'never'   : not used currently, reserved for future
      //                 optimization.
      if (opts.redrawGrid === 'always') {
        this.redrawGrid();
      } else if (opts.redrawGrid === 'when-dirty') {
        const margin = this.app
          ? Math.max(this.app.screen.width, this.app.screen.height) /
            this.camera.zoom *
            CanvasController.GRID_FIELD_MARGIN
          : 0;
        const dx = Math.abs(this.camera.x - this.lastGridCameraX);
        const dy = Math.abs(this.camera.y - this.lastGridCameraY);
        if (dx > margin || dy > margin || Number.isNaN(this.lastGridCameraX)) {
          this.redrawGrid();
        }
      }
      // Cull only when zoom changed meaningfully (cull is O(N) over
      // items). Pan alone doesn't change visibility, so skipping it
      // during drags is safe.
      if (opts.redrawGrid === 'always' && this.cullZoom !== this.camera.zoom) {
        this.cullViewport();
        this.cullZoom = this.camera.zoom;
      }
      // Notify minimap only when the snapshot would actually change.
      // Pure pan: the camera x/y changed, so the viewport rect
      // moves — notify. Zoom: the zoom changed — notify. Same
      // camera state as last time: skip.
      if (this.shouldEmitMinimap()) {
        this.emitMinimap();
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(flush);
    } else {
      // Fallback: run synchronously. Used in non-browser tests.
      flush();
    }
  }

  /**
   * Draw the grid in world (board) coordinates.
   *
   * Per the redesign brief: the grid is drawn as **dots** at each cell
   * intersection (the "tile" corners). Two levels of emphasis:
   *   - Minor dot at every cell corner.
   *   - Major dot at every `subdivisions` cell corner.
   *
   * Dot radius is **counter-scaled by the current zoom** so the
   * on-screen dot size stays constant regardless of zoom level
   * (per the brief: "Zooming changes size of dots forming grids,
   * they should stay uniform"). The gridGraphics is a child of
   * gridLayer, which is a child of world — so the world transform
   * (zoom + pan) is inherited automatically.
   *
   * "Infinite" grid: the dot field is drawn with a margin of
   * `GRID_FIELD_MARGIN` viewport-widths in every direction around
   * the camera, so panning 1-2 screens in any direction never
   * exposes the edge. The cost is a fixed number of cells per
   * zoom level (proportional to the field area), independent of
   * how far the user has panned. The world transform translates
   * the field for free — the only cost during pan is rebuilding
   * the field when the camera crosses the field boundary.
   */
  private static readonly GRID_FIELD_MARGIN = 1.5;
  private lastGridCameraX = NaN;
  private lastGridCameraY = NaN;

  private redrawGrid(): void {
    if (!this.gridGraphics || !this.app || !this.world) return;
    const g = this.gridGraphics.clear();
    const cell = this.grid.cellSize;
    const subDiv = Math.max(1, this.grid.subdivisions);
    const zoom = this.camera.zoom;

    // Counter-scale radii so screen-space dot size is constant.
    // Target: ~1.6 px minor / 2.6 px major on screen.
    const targetMinorPx = 1.6;
    const targetMajorPx = 2.6;
    const minorRadius = targetMinorPx / zoom;
    const majorRadius = targetMajorPx / zoom;
    const minorColor = 0x2c313b;
    const majorColor = 0x4a5260;

    // Hide the grid when cells become microscopic — at very high
    // zoom-out the dots would overlap and turn into a solid wash.
    // We hide (don't remove) by simply skipping the draw; the next
    // flush at a more reasonable zoom restores it.
    if (cell * zoom < 4) {
      return;
    }

    // Field bounds in world coordinates: viewport plus a margin so
    // small pans don't expose the field edge. The margin is a
    // multiple of the viewport, so the field is "infinite" up to
    // the user panning several screens in one direction without
    // crossing the boundary. The world transform handles the
    // in-between panning.
    const vpW = this.app.screen.width / zoom;
    const vpH = this.app.screen.height / zoom;
    const margin = Math.max(vpW, vpH) * CanvasController.GRID_FIELD_MARGIN;
    const vpMinX = this.camera.x - vpW / 2 - margin;
    const vpMinY = this.camera.y - vpH / 2 - margin;
    const vpMaxX = this.camera.x + vpW / 2 + margin;
    const vpMaxY = this.camera.y + vpH / 2 + margin;

    const startX = Math.floor(vpMinX / cell) * cell;
    const endX = Math.ceil(vpMaxX / cell) * cell;
    const startY = Math.floor(vpMinY / cell) * cell;
    const endY = Math.ceil(vpMaxY / cell) * cell;

    this.lastGridCameraX = this.camera.x;
    this.lastGridCameraY = this.camera.y;

    // Draw every dot in one batched path so PixiJS issues a single
    // GPU draw call per (major / minor) group, not one per dot.
    // PixiJS v8 Graphics accumulates geometry; the `fill` at the
    // end commits the whole path. This is the critical perf win
    // for panning at 60 FPS.
    g.setFillStyle({ color: minorColor, alpha: 0.7 });
    for (let x = startX; x <= endX; x += cell) {
      for (let y = startY; y <= endY; y += cell) {
        g.circle(x, y, minorRadius);
      }
    }
    g.fill();

    if (subDiv > 1) {
      const majorStep = cell * subDiv;
      // Align major dots to their own world-space grid (multiples
      // of `majorStep`) so they stay anchored to fixed board
      // positions as the camera moves. If we reused `startX` /
      // `startY` (which align to `cell`), the major-dot positions
      // would be a function of the minor-dot alignment, which
      // changes as the camera scrolls sub-cell distances — making
      // the major dots appear to "jump" between minor dot
      // positions during a smooth pan.
      const majorStartX = Math.floor(vpMinX / majorStep) * majorStep;
      const majorEndX = Math.ceil(vpMaxX / majorStep) * majorStep;
      const majorStartY = Math.floor(vpMinY / majorStep) * majorStep;
      const majorEndY = Math.ceil(vpMaxY / majorStep) * majorStep;
      g.setFillStyle({ color: majorColor, alpha: 0.95 });
      for (let x = majorStartX; x <= majorEndX; x += majorStep) {
        for (let y = majorStartY; y <= majorEndY; y += majorStep) {
          g.circle(x, y, majorRadius);
        }
      }
      g.fill();
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
        return renderFrame(item, { grid: this.grid });
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
        // Use exponential mapping for smooth, multiplicative zoom
        // (one notch on a mouse wheel is ~deltaY=100, on a trackpad
        // it's much smaller; the exponential makes both feel
        // consistent and keeps the zoom step gentle).
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
            // Section 7.1: invalid nudge → do NOT move the item.
            // Create / update PlacementState with the attempted bounds
            // and render the red ghost there. The marker persists
            // until the user nudges into a valid cell or selection
            // changes (Section 7.3).
            const currentBounds: Rect = {
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
            };
            this.setPlacementState(
              id,
              makeInvalidPlacement(currentBounds, proposed, 'overlap'),
            );
            this.renderGhost(id);
            continue;
          }
          // Section 7.2: valid nudge — clear any prior nudge ghost
          // before moving.
          this.clearPlacementState(id);
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

      // Pan via spacebar OR the Hand tool — both go through the
      // same `dragState.kind === 'pan'` pointermove branch so the
      // behavior is byte-identical (same screen-space delta, same
      // rAF-coalesced flush).
      if (this.spacebar || this.activeToolName === 'hand') {
        this.dragState = { kind: 'pan', startScreen: screenPt };
        canvas.style.cursor = 'grabbing';
        // Capture the pointer so pointermove/up fire on the canvas
        // even if the user drags off the element. Without this the
        // Hand tool drops events as soon as the cursor leaves the
        // canvas, producing the chatter the user reported.
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // Some browsers throw if the pointer isn't active. Safe
          // to ignore — capture is an optimization, not required.
        }
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
            // Section 3.1: also create initial PlacementState for resize.
            this.setPlacementState(
              hit,
              createInitialPlacementState({
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
              }),
            );
            return;
          }
        }
      }

      if (this.activeToolName === 'rectangle') {
        // Clear leftover create-preview ghosts before validating a new
        // creation attempt.
        this.clearAllPlacementStates();
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
          // Section 10.3: flashRejectionRect was removed. Render a
          // persistent red ghost at the attempted creation rect so the
          // user sees the rejected position. The synthetic key keeps it
          // isolated from real item IDs; it is cleared on next pointer
          // down or selection change.
          const syntheticId = asItemId(
            `__create-preview__${snappedStart.x}_${snappedStart.y}`,
          );
          this.setPlacementState(
            syntheticId,
            makeInvalidPlacement(proposed, proposed, 'overlap'),
          );
          this.renderGhost(syntheticId);
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
        // Section 3.1: create initial PlacementState for the draw-rect item.
        this.setPlacementState(
          newId,
          createInitialPlacementState({
            x: newItem.x,
            y: newItem.y,
            width: newItem.width,
            height: newItem.height,
          }),
        );
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
        // Section 3.1: create initial PlacementState per dragged item.
        for (const id of this.selection) {
          const it = this.items.get(id);
          if (!it) continue;
          this.setPlacementState(
            id,
            createInitialPlacementState({
              x: it.x,
              y: it.y,
              width: it.width,
              height: it.height,
            }),
          );
        }
      } else {
        if (!e.shiftKey) {
          // Section 7.3: clear nudge ghosts when selection is cleared.
          this.clearAllPlacementStates();
          this.selection = new Set();
        }
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
        const placeable = GridService.canPlace(proposed, itemsList, kind, rs.itemId);

        // Section 3.3 + 5.3: do NOT revert during resize. Only update
        // PlacementState + render the ghost at the proposed rect. The
        // real item stays at its last valid bounds until `endDrag`
        // commits a valid placement.
        const prev = this.getPlacementState(rs.itemId);
        if (prev) {
          this.setPlacementState(
            rs.itemId,
            updatePlacementState(prev, proposed, placeable),
          );
          this.renderGhost(rs.itemId);
        }

        // Commit incrementally when valid so the user sees the resize
        // follow the pointer; on invalid moves we skip the update so
        // the item retains its last valid bounds.
        if (placeable) {
          this.updateItem(rs.itemId, {
            x: proposed.x,
            y: proposed.y,
            width: proposed.width,
            height: proposed.height,
          });
        }
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
        const placeable = GridService.canPlace(proposed, itemsList, kind, this.dragState.id);

        // Section 3.4: update PlacementState + render ghost. Do NOT
        // move the real item when invalid (no revert-during-drag).
        const prev = this.getPlacementState(this.dragState.id);
        if (prev) {
          this.setPlacementState(
            this.dragState.id,
            updatePlacementState(prev, proposed, placeable),
          );
          this.renderGhost(this.dragState.id);
        }
        if (placeable) {
          this.updateItem(this.dragState.id, { x: snapped.x, y: snapped.y, width: sw, height: sh });
          // Track last valid bounds on acceptance
          this.lastValidBounds.set(this.dragState.id, {
            x: snapped.x,
            y: snapped.y,
            width: sw,
            height: sh,
          });
        }
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
          const placeable = GridService.canPlace(proposed, itemsList, kind, id);

          // Section 3.2 + 5.2: do NOT revert during drag. Only update
          // PlacementState and the ghost; the real item stays at its
          // last valid bounds throughout the drag. The item actually
          // moves only when the pointerup commits in `endDrag`.
          const prev = this.getPlacementState(id);
          if (prev) {
            this.setPlacementState(
              id,
              updatePlacementState(prev, proposed, placeable),
            );
            this.renderGhost(id);
          }

          // If the placement is valid, we ALSO commit the move
          // incrementally on each pointermove so the user sees the
          // item follow the pointer (this matches the existing v0.1
          // behavior — items follow the pointer per-frame). The
          // ghost renders on top with the same bounds, so it appears
          // as a no-op for valid moves. On invalid moves, the real
          // item does NOT move because we skip the updateItem below.
          if (placeable) {
            this.updateItem(id, { x: proposed.x, y: proposed.y });
          }
        }
        this.renderSelection();
      }
    });

    const endDrag = (e?: PointerEvent) => {
      // `shiftKey` is needed by Section 9 (Shift+release affordance)
      // and is read ONLY on pointerup here (Section 9.2: do not check
      // on pointermove).
      const shiftHeld = !!e?.shiftKey;

      if (this.resizeState) {
        // Section 5.1 / 9.1: commit if valid; otherwise apply
        // Shift+release snap or revert to lastValidBounds.
        const rs = this.resizeState;
        const state = this.getPlacementState(rs.itemId);
        if (state && state.state === 'invalid') {
          const committed = this.tryShiftReleaseSnap(rs.itemId, state, shiftHeld);
          if (!committed) {
            // Revert real item to lastValidBounds (it was never moved
            // because the pointermove handler skips updateItem on
            // invalid, so this is mostly a no-op safety net).
            const lastValid = this.lastValidBounds.get(rs.itemId);
            if (lastValid) {
              this.updateItem(rs.itemId, {
                x: lastValid.x,
                y: lastValid.y,
                width: lastValid.width,
                height: lastValid.height,
              });
            }
          }
        } else if (state && state.state === 'valid') {
          // Commit valid resize to Yjs.
          const item = this.items.get(rs.itemId);
          if (item) {
            this.opts.onItemChange({
              id: rs.itemId,
              partial: {
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
              },
            });
            this.lastValidBounds.set(rs.itemId, {
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
            });
          }
        }
        this.clearPlacementState(rs.itemId);
        this.resizeState = null;
        this.renderSelection();
        return;
      }

      if (this.dragState?.kind === 'move-selected') {
        // Section 5.1 / 9.1: per-item check on commit or revert.
        for (const id of [...this.selection]) {
          const it = this.items.get(id);
          if (!it) continue;
          const state = this.getPlacementState(id);
          if (state && state.state === 'invalid') {
            // Revert: real item was never moved on invalid frames, so
            // restore to lastValidBounds if any exists. Do NOT commit.
            const lastValid = this.lastValidBounds.get(id);
            if (lastValid) {
              this.updateItem(id, {
                x: lastValid.x,
                y: lastValid.y,
              });
            }
            // Try Shift+release snap if requested.
            this.tryShiftReleaseSnap(id, state, shiftHeld);
            continue;
          }
          // Valid (or no PlacementState — backward compat): commit.
          this.opts.onItemChange({ id, partial: { x: it.x, y: it.y } });
          this.lastValidBounds.set(id, {
            x: it.x,
            y: it.y,
            width: it.width,
            height: it.height,
          });
        }
        // Clear all placement states + ghosts at drag end (Section 3.5).
        this.clearAllPlacementStates();
        this.renderSelection();
      } else if (this.dragState?.kind === 'draw-rect') {
        const it = this.items.get(this.dragState.id);
        if (it) {
          const state = this.getPlacementState(this.dragState.id);
          if (state && state.state === 'invalid') {
            // Invalid: do NOT commit the bad rect. Revert to lastValid
            // (or, if the item was never accepted, remove it entirely
            // — the user dragged into an occupied cell from the start).
            const lastValid = this.lastValidBounds.get(this.dragState.id);
            if (lastValid) {
              this.updateItem(this.dragState.id, {
                x: lastValid.x,
                y: lastValid.y,
                width: lastValid.width,
                height: lastValid.height,
              });
              this.opts.onItemChange({
                id: this.dragState.id,
                partial: {
                  x: lastValid.x,
                  y: lastValid.y,
                  width: lastValid.width,
                  height: lastValid.height,
                },
              });
            } else {
              // No valid placement was ever accepted during the drag —
              // treat the whole creation as rejected: remove the item
              // and notify the adapter.
              this.removeItem(this.dragState.id);
              this.opts.onItemDelete({ id: this.dragState.id });
            }
          } else {
            // Valid draw-rect: commit final rect.
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
        this.clearPlacementState(this.dragState.id);
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

      // Release pointer capture if we acquired it during pan. Safe
      // to call even when no capture was set.
      const ds = this.dragState as { kind: string } | null;
      if (e && ds?.kind === 'pan') {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          // Some browsers throw if the capture is no longer active.
        }
      }

      if (this.spacebar) canvas.style.cursor = 'grab';
      else if (this.activeToolName === 'hand') canvas.style.cursor = 'grab';
      else canvas.style.cursor = 'default';
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointerleave', endDrag);
  }

  // ----- Shift+release affordance (Section 9) -----

  /**
   * If the user held Shift on pointerup of an invalid drag, attempt to
   * snap the item to the nearest free cell via `GridService.findFreeCells`.
   *
   * Returns true if the snap was applied (and the item committed).
   * Returns false if Shift was not held, no candidates exist, or the
   * state is not 'invalid'.
   *
   * The real item is updated to the snap target, lastValidBounds is
   * updated, the Yjs adapter is notified, and the placement state +
   * ghost are cleared. The caller (endDrag) is then responsible for
   * the final `renderSelection()` and any remaining cleanup.
   */
  private tryShiftReleaseSnap(
    id: ItemId,
    state: PlacementState,
    shiftHeld: boolean,
  ): boolean {
    if (!shiftHeld) return false;
    if (state.state !== 'invalid') return false;
    const item = this.items.get(id);
    if (!item) return false;
    const kind = layerKindFor(item.type);
    const proposed = state.proposedBounds;
    // Build a snapshot of all other items of the same kind.
    const others: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      layerKind: string;
    }> = [];
    for (const [otherId, otherItem] of this.items) {
      if (otherId === id) continue;
      others.push({
        id: otherId,
        x: otherItem.x,
        y: otherItem.y,
        width: otherItem.width,
        height: otherItem.height,
        layerKind: layerKindFor(otherItem.type),
      });
    }
    const candidates = GridService.findFreeCells(proposed, others, kind, String(id));
    if (candidates.length === 0) return false;
    const target = candidates[0]!;
    this.updateItem(id, {
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
    });
    this.opts.onItemChange({
      id,
      partial: {
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
      },
    });
    this.lastValidBounds.set(id, {
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
    });
    this.clearPlacementState(id);
    return true;
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

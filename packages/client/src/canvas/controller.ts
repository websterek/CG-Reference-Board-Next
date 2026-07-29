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
  layerKindFor,
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
import { FrameCreateTool } from './tools/frame-tool';
import { AnnotationFreehandTool } from './tools/annotation-tool';

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
  | { type: 'set-tool'; tool: 'select' | 'rectangle' | 'frame' | 'annotation-freehand' }
  | { type: 'set-mode'; mode: 'grid' | 'annotation' }
  | { type: 'delete-selected' };

const LAYER_Z_ORDER: ReadonlyArray<LayerKind> = ['frame', 'media', 'overlay', 'annotation'];

export class CanvasController {
  private app: Application | null = null;
  private world: Container | null = null;
  private layerContainers = new Map<LayerKind, Container>();
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
  private activeMode: 'grid' | 'annotation' = 'grid';

  /** Tool registry: maps tool name to Tool instance. */
  private toolRegistry = new Map<string, Tool>();

  /** Last valid bounds for each item, used as revert target on rejection. */
  private lastValidBounds = new Map<ItemId, Rect>();

  /** Resize state: which item is being resized and from which corner. */
  private resizeState: {
    itemId: ItemId;
    corner: 'tl' | 'tr' | 'bl' | 'br';
    startBoard: Point;
    startBounds: Rect;
  } | null = null;

  /** Per-layer visibility flags. Default all-true; layers panel (future) sets these. */
  private layerVisible = new Map<LayerKind, boolean>([
    ['frame', true],
    ['media', true],
    ['overlay', true],
    ['annotation', true],
  ]);

  private dragState:
    | { kind: 'pan'; startScreen: Point }
    | { kind: 'draw-rect'; startBoard: Point; id: ItemId }
    | { kind: 'move-selected'; startBoard: Point; startPositions: Map<ItemId, { x: number; y: number }> }
    | null = null;
  private spacebar = false;

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
    this.app = app;
    this.opts.container.appendChild(app.canvas);

    const world = new Container({ isRenderGroup: true });
    app.stage.addChild(world);

    // Grid layer (bottom)
    this.gridLayer = new Container();
    world.addChild(this.gridLayer);

    this.gridGraphics = new Graphics();
    this.gridLayer.addChild(this.gridGraphics);

    // Four layer-kind containers in z-order: frame → media → overlay → annotation
    for (const kind of LAYER_Z_ORDER) {
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
      this.activeMode = action.mode;
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
    // Traverse layers in reverse z-order so topmost items are picked first
    const layerPriority: LayerKind[] = ['annotation', 'overlay', 'media', 'frame'];
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

  destroy(): void {
    this.index.clear();
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.world = null;
    this.layerContainers.clear();
    this.gridLayer = null;
    this.gridGraphics = null;
    this.toolOverlay = null;
    this.selectionLayer = null;
  }

  // ----- Tool registry -----

  private initToolRegistry(): void {
    this.toolRegistry.set('frame', new FrameCreateTool());
    this.toolRegistry.set('annotation-freehand', new AnnotationFreehandTool());
  }

  private buildToolContext(): ToolContext {
    return {
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
          layerId: 'default' as never,
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
      queueUpdate: (_id: string, _partial: { x?: number; y?: number }) => {
        // Single-slot buffer not needed for v1; delegate to updateItem.
      },
      flushQueuedUpdates: () => {
        // No-op for v1.
      },
      setActiveTool: (name: string) => {
        this.activeToolName = name;
      },
    };
  }

  // ----- Rejection feedback -----

  /**
   * Draw a red outline on the given item for 200ms, then remove it.
   * Used to signal that a move/resize/create was rejected due to overlap.
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

  private snapPoint(p: Point): Point {
    if (this.activeMode === 'annotation') return p;
    return GridService.snapPoint(p, this.grid);
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
          const itemsList = this.buildCanPlaceItems();
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
        const itemsList = this.buildCanPlaceItems();
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
          layerId: 'default' as never,
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
        const itemsList = this.buildCanPlaceItems();

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
        this.updateItem(this.dragState.id, { x: snapped.x, y: snapped.y, width: sw, height: sh });
        return;
      }

      if (this.dragState.kind === 'move-selected') {
        const dx = boardPt.x - this.dragState.startBoard.x;
        const dy = boardPt.y - this.dragState.startBoard.y;
        const itemsList = this.buildCanPlaceItems();

        for (const [id, start] of this.dragState.startPositions) {
          const item = this.items.get(id);
          if (!item) continue;
          const proposed = GridService.quantizeRect(
            { x: start.x + dx, y: start.y + dy, width: item.width, height: item.height },
            this.grid,
          );
          const kind = layerKindFor(item.type);

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

      // Notify tool of pointer up
      const tool = this.toolRegistry.get(this.activeToolName);
      if (tool && tool.onPointerUp) {
        const rect2 = canvas.getBoundingClientRect();
        const boardPt2 = this.screenToBoard({
          x: 0, // pointer position not available in endDrag; tools track their own state
          y: 0,
        });
        const ctx = this.buildToolContext();
        const liteEvent: PointerEventLite = {
          point: boardPt2,
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
   * Build a list of items suitable for GridService.canPlace().
   * Each entry has id, x, y, width, height, and layerKind.
   */
  private buildCanPlaceItems(): Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    layerKind: LayerKind;
  }> {
    const result: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      layerKind: LayerKind;
    }> = [];
    for (const [id, item] of this.items) {
      result.push({
        id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        layerKind: layerKindFor(item.type),
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
 * return the topmost item ID according to z-order (annotation > overlay >
 * media > frame). Returns null if no candidates match.
 */
export function pickTopmostItem(
  ids: Iterable<string>,
  getKind: (id: string) => LayerKind | undefined,
): string | null {
  const layerPriority: LayerKind[] = ['annotation', 'overlay', 'media', 'frame'];
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

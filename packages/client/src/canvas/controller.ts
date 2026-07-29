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
  type BoardItem,
  type CameraState,
  type ItemId,
  type Point,
  type Rect,
} from '@gridboard/domain';
import { renderRectangle } from './renderers/rectangle';

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
  | { type: 'set-tool'; tool: 'select' | 'rectangle' }
  | { type: 'delete-selected' };

export class CanvasController {
  private app: Application | null = null;
  private world: Container | null = null;
  private itemsLayer: Container | null = null;
  private selectionLayer: Container | null = null;
  private overlayLayer: Container | null = null;
  private gridGraphics: Graphics | null = null;
  private gridLayer: Container | null = null;

  private index = new SpatialIndex();
  private items = new Map<ItemId, BoardItem>();
  private displayById = new Map<ItemId, Container>();
  private selectionHandles = new Map<ItemId, Graphics>();
  selection: Set<ItemId> = new Set();

  private camera: CameraState = { ...DEFAULT_CAMERA };
  private grid: GridConfig = { ...DEFAULT_GRID_CONFIG };
  private activeToolName: 'select' | 'rectangle' = 'select';

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

    this.gridLayer = new Container();
    this.itemsLayer = new Container();
    this.selectionLayer = new Container();
    this.overlayLayer = new Container();
    world.addChild(this.gridLayer);
    world.addChild(this.itemsLayer);
    world.addChild(this.selectionLayer);
    world.addChild(this.overlayLayer);

    this.gridGraphics = new Graphics();
    this.gridLayer.addChild(this.gridGraphics);

    this.world = world;
    this.installInputHandlers();
    this.applyCamera();
    this.redrawGrid();
    this.cullViewport();
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
    this.index.insert(item);
    if (this.itemsLayer) {
      const display = renderRectangle(item);
      this.itemsLayer.addChild(display);
      this.displayById.set(item.id, display);
    }
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
    this.index.update(next);
    const display = this.displayById.get(idItem);
    if (display) display.position.set(next.x, next.y);
    // re-render rectangle (size may have changed)
    if (this.itemsLayer && display) {
      const fresh = renderRectangle(next);
      fresh.position.set(next.x, next.y);
      this.itemsLayer.removeChild(display);
      display.destroy({ children: true });
      this.itemsLayer.addChild(fresh);
      this.displayById.set(idItem, fresh);
    }
  }

  removeItem(id: string | ItemId): void {
    const idItem = asItemId(String(id));
    this.index.remove(idItem);
    this.items.delete(idItem);
    const display = this.displayById.get(idItem);
    if (display && this.itemsLayer) {
      this.itemsLayer.removeChild(display);
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
    for (const idStr of ids) {
      const id = asItemId(String(idStr));
      const item = this.items.get(id);
      if (!item) continue;
      const defn = ITEM_TYPES[item.type];
      if (defn?.hitTest(item, point)) return id;
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
    this.itemsLayer = null;
    this.gridLayer = null;
    this.gridGraphics = null;
    this.overlayLayer = null;
    this.selectionLayer = null;
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

  private redrawGrid(): void {
    if (!this.gridGraphics || !this.app || !this.world) return;
    const g = this.gridGraphics.clear();
    g.setStrokeStyle({ width: 1, color: 0x2a2f3a, alpha: 0.5 });
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cell = this.grid.cellSize * this.camera.zoom;
    if (cell < 4) return;
    const originX =
      -((this.world.position.x + this.camera.x * this.camera.zoom) % cell);
    const originY =
      -((this.world.position.y + this.camera.y * this.camera.zoom) % cell);
    for (let x = originX; x < w; x += cell) {
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = originY; y < h; y += cell) {
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  }

  private cullViewport(): void {
    const visible = new Set(this.getItemsInViewport());
    for (const [id, display] of this.displayById) {
      display.visible = visible.has(id);
    }
  }

  private renderSelection(): void {
    if (!this.selectionLayer) return;
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

  private snapPoint(p: Point): Point {
    return GridService.snapPoint(p, this.grid);
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
          const nx = item.x + dx;
          const ny = item.y + dy;
          this.updateItem(id, { x: nx, y: ny });
          this.opts.onItemChange({ id, partial: { x: nx, y: ny } });
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

      const hit = this.hitTest(boardPt);
      if (this.activeToolName === 'rectangle') {
        const snappedStart = this.snapPoint(boardPt);
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
      if (!this.dragState) return;
      const rect = canvas.getBoundingClientRect();
      const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
        for (const [id, start] of this.dragState.startPositions) {
          const nx = start.x + dx;
          const ny = start.y + dy;
          this.updateItem(id, { x: nx, y: ny });
        }
        this.renderSelection();
      }
    });

    const endDrag = () => {
      if (this.dragState?.kind === 'move-selected') {
        // Commit final positions to Yjs
        for (const id of this.selection) {
          const it = this.items.get(id);
          if (!it) continue;
          this.opts.onItemChange({ id, partial: { x: it.x, y: it.y } });
        }
        this.renderSelection();
      } else if (this.dragState?.kind === 'draw-rect') {
        const it = this.items.get(this.dragState.id);
        if (it) {
          this.opts.onItemChange({
            id: this.dragState.id,
            partial: { x: it.x, y: it.y, width: it.width, height: it.height },
          });
        }
      }
      this.dragState = null;
      if (this.spacebar) canvas.style.cursor = 'grab';
      else canvas.style.cursor = 'default';
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointerleave', endDrag);
  }
}

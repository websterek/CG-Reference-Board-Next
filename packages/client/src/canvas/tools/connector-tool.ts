/**
 * ConnectorTool — two-click graph-edge connector creation.
 *
 * State machine:
 *   - `'idle'`: waiting for the first endpoint click.
 *   - `'pending-source'`: the first endpoint is selected; a preview
 *     line follows the pointer. The user can either click a second
 *     item to complete the connector, or press Esc to cancel.
 *
 * The tool does NOT have access to the live items map directly; the
 * controller is responsible for resolving pointer hits and for
 * providing the hit-test callback through the `ToolContext`. For v1
 * we keep the tool self-contained and use a minimal hit-test approach:
 * the tool queries the active tool dispatch in the controller via
 * `ctx.hitTest` (a method we add to the ToolContext).
 *
 * The preview line is drawn on the `toolOverlay` PixiJS container via
 * the augmented `ToolContext` (see controller's `buildToolContext`).
 *
 * See connector-items spec.md "Two-Click Tool" requirement.
 */

import { Graphics } from 'pixi.js';
import type {
  Tool,
  ToolContext,
  PointerEventLite,
  KeyEventLite,
  ItemId,
} from '@gridboard/domain';

type ConnectorToolState = 'idle' | 'pending-source';

/**
 * Per-item lookup and hit-test methods added to the `ToolContext` so
 * tools can resolve which item was clicked without the controller
 * having to dispatch hit-tests itself. These are exposed via a
 * `ConnectorToolContext` extension that the controller casts to.
 */
export interface ConnectorToolContextExtensions {
  /** Look up an item by ID. */
  getItem(id: string): import('@gridboard/domain').BoardItem | undefined;
  /** Hit-test a board-coordinate point. Returns the topmost item ID or null. */
  hitTest(point: { x: number; y: number }): ItemId | null;
  /**
   * The tool overlay container — used for the preview line so it
   * sits on top of all items but is cleared when the tool
   * deactivates. Optional: if not provided, the preview line is
   * not drawn.
   */
  toolOverlay?: import('pixi.js').Container | null;
  /**
   * Resolve the default anchor position for an item ('auto' →
   * center). Returns a board-coordinate point.
   */
  resolveAnchor(item: import('@gridboard/domain').BoardItem): { x: number; y: number };
}

export class ConnectorTool implements Tool {
  readonly name = 'connector';

  private state: ConnectorToolState = 'idle';
  private sourceId: string | null = null;
  private previewG: Graphics | null = null;
  private lastPointer: { x: number; y: number } = { x: 0, y: 0 };

  onActivate(ctx: ToolContext): void {
    this.reset(ctx);
  }

  onDeactivate(ctx: ToolContext): void {
    this.reset(ctx);
  }

  onPointerDown(event: PointerEventLite, ctx: ToolContext): void {
    const ext = ctx as ToolContext & ConnectorToolContextExtensions;

    if (this.state === 'idle') {
      const hitId = ext.hitTest?.(event.point);
      if (!hitId) return; // click on empty canvas — stay idle
      const hitItem = ext.getItem?.(hitId);
      if (!hitItem) return;
      // Per spec, connectors don't connect to other connectors in v1
      // and the layer's `canBeConnectorEndpoint` policy enforces this.
      // The hit-test only returns the topmost item; the controller
      // can still surface connectors, so the tool filters them out
      // by type.
      if (hitItem.type === 'connector') return;
      this.sourceId = hitId;
      this.state = 'pending-source';
      return;
    }

    if (this.state === 'pending-source') {
      const hitId = ext.hitTest?.(event.point);
      if (!hitId || hitId === this.sourceId) return; // empty click or self-loop
      const hitItem = ext.getItem?.(hitId);
      if (!hitItem || hitItem.type === 'connector') return;
      // Create the connector with both endpoints.
      const from = this.sourceId!;
      const to = hitId!;
      // Compute the initial bounding box as the union of the two
      // endpoint bounds. The controller will route the new item to
      // the connector layer via `layerKindFor('connector')`.
      const fromBounds = {
        x: hitItem.x,
        y: hitItem.y,
        width: hitItem.width,
        height: hitItem.height,
      };
      // We don't have access to the source item here, but ctx.getItem
      // can look it up.
      const sourceItem = ext.getItem?.(from);
      let x = fromBounds.x;
      let y = fromBounds.y;
      let width = fromBounds.width;
      let height = fromBounds.height;
      if (sourceItem) {
        x = Math.min(sourceItem.x, fromBounds.x);
        y = Math.min(sourceItem.y, fromBounds.y);
        width = Math.max(sourceItem.x + sourceItem.width, fromBounds.x + fromBounds.width) - x;
        height = Math.max(sourceItem.y + sourceItem.height, fromBounds.y + fromBounds.height) - y;
      }
      ctx.createItem({
        type: 'connector',
        x,
        y,
        width,
        height,
        attrs: {
          from,
          to,
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
        },
      });
      this.reset(ctx);
    }
  }

  onPointerMove(event: PointerEventLite, ctx: ToolContext): void {
    this.lastPointer = event.point;
    if (this.state !== 'pending-source') return;
    const ext = ctx as ToolContext & ConnectorToolContextExtensions;
    if (!ext.getItem || !ext.toolOverlay) return;
    const source = ext.getItem(this.sourceId!);
    if (!source) return;
    const sourceCenter = ext.resolveAnchor(source);
    this.drawPreview(sourceCenter.x, sourceCenter.y, event.point.x, event.point.y, ext.toolOverlay);
  }

  onPointerUp(_event: PointerEventLite, _ctx: ToolContext): void {
    // No-op. The tool only commits on the second pointerdown.
  }

  onKeyDown(event: KeyEventLite, ctx: ToolContext): void {
    if (event.key === 'Escape') {
      this.reset(ctx);
    }
  }

  /**
   * Reset to the `'idle'` state and clear any preview graphics.
   */
  private reset(ctx: ToolContext): void {
    this.state = 'idle';
    this.sourceId = null;
    if (this.previewG) {
      this.previewG.parent?.removeChild(this.previewG);
      this.previewG.destroy();
      this.previewG = null;
    }
    // Suppress unused-param warning for ctx.
    void ctx;
  }

  /**
   * Draw (or redraw) the preview line from `(x1,y1)` to `(x2,y2)` on
   * the given overlay container. The previous preview Graphics (if
   * any) is destroyed first so we don't accumulate overlay children.
   */
  private drawPreview(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    overlay: import('pixi.js').Container,
  ): void {
    if (this.previewG) {
      this.previewG.destroy();
    }
    const g = new Graphics();
    g.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.7 });
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    overlay.addChild(g);
    this.previewG = g;
  }
}

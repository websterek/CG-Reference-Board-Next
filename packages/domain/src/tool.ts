/**
 * Tool — domain-owned interactive surface contract.
 * Tools are not React/Pixi-specific: they react to pointers and keys, mutate
 * domain items via the canvas controller/board adapter, and own their own
 * drag-queue (queueUpdate) state.
 *
 * See design.md §D3: queueUpdate is owned by the Tool, not the adapter.
 */

import type { Point } from './board';

export interface PointerEventLite {
  readonly point: Point;
  readonly buttons: number;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
}

export interface KeyEventLite {
  readonly key: string;
  readonly shiftKey: boolean;
}

export interface ToolContext {
  /** Selection: set of item IDs. May be read or mutated by the tool. */
  selection: ReadonlySet<string>;
  /** Snap a pointer position through the grid service. */
  snap(point: Point): Point;
  /** Commit a single item update — wraps in a Yjs transaction on pointerup. */
  updateItem(id: string, partial: { x?: number; y?: number; width?: number; height?: number }): void;
  /** Create a new item; returns the new ID. */
  createItem(input: Record<string, unknown>): string;
  /** Delete an item. */
  deleteItem(id: string): void;
  /** Push a queued pointermove update (Tool-owned single-slot buffer, see D3). */
  queueUpdate(id: string, partial: { x?: number; y?: number }): void;
  /** Flush queued updates as one transaction. Called on pointerup. */
  flushQueuedUpdates(): void;
  /** Switch the active tool (e.g. rectangle mode after first draw). */
  setActiveTool(name: string): void;
}

export interface Tool {
  readonly name: string;
  onActivate?(ctx: ToolContext): void;
  onDeactivate?(ctx: ToolContext): void;
  onPointerDown?(event: PointerEventLite, ctx: ToolContext): void;
  onPointerMove?(event: PointerEventLite, ctx: ToolContext): void;
  onPointerUp?(event: PointerEventLite, ctx: ToolContext): void;
  onKeyDown?(event: KeyEventLite, ctx: ToolContext): void;
}

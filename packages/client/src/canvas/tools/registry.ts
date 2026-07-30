/**
 * Tool registry — extensible registry of `ToolDefinition` entries.
 *
 * The registry replaces the closed `ToolName` union with a runtime
 * data structure. Adding a new tool is a single `registerTool()` call;
 * all derived lookups (`getToolDef`, `getAllTools`, `getToolsForMode`)
 * are computed from registry entries.
 *
 * Tools live in the client package (not the domain) because a
 * `ToolDefinition` includes a `factory` that constructs the concrete
 * `Tool` instance — a Pixi/React-aware object that the domain layer
 * must not import (per design.md D1 boundary).
 *
 * INVARIANT (per tool-registry-and-modes proposal D6): the `Tool`
 * interface (lifecycle hooks, pointer handlers) is not modified.
 *
 * INVARIANT: tools are stored in registration order so the toolbar can
 * iterate `getAllTools()` and render in the same order they were
 * registered.
 */

import type { Tool } from '@gridboard/domain';

/**
 * Per-tool policy and metadata record. The registry stores one entry
 * per `id` string.
 */
export interface ToolDefinition {
  /**
   * Stable identifier for the tool (e.g. `'select'`, `'rectangle'`,
   * `'frame'`, `'freehand'`). Used as the primary key in the registry
   * map and as the value of `uiStore.activeTool`.
   */
  readonly id: string;

  /**
   * Human-readable name shown in the layers panel and tooltips.
   */
  readonly displayName: string;

  /**
   * The mode IDs in which this tool is visible. Universal tools
   * (Select/Move/Hand) leave this empty AND set `alwaysAvailable:
   * true` so they appear in every mode regardless of the array.
   */
  readonly modes: readonly string[];

  /**
   * When `true`, the tool is treated as universal: it appears in
   * every mode's toolbar even if `modes` does not include that mode.
   * Reserved for Select, Move, and Hand.
   */
  readonly alwaysAvailable?: boolean;

  /**
   * The layer kind this tool places items on (e.g. `'media'`,
   * `'frame'`, `'annotation'`). Used by the controller to route new
   * items to the correct PixiJS layer container. `undefined` means
   * the tool does not create items (e.g. Select, Move, Hand).
   */
  readonly placementLayer?: string;

  /**
   * Tool-level snap policy override. `'inherit-mode'` (default) lets
   * the active mode's `snapPolicy` apply. `'exempt'` skips snap even
   * in snap-on modes (e.g. Freehand, Arrow). `'mandatory'` forces
   * snap even in snap-off modes (e.g. Connector).
   */
  readonly snapPolicy?: 'inherit-mode' | 'mandatory' | 'exempt';

  /**
   * Construct the concrete `Tool` instance on demand. Called once at
   * controller init; the result is stored in the controller's
   * `toolRegistry`.
   */
  readonly factory: () => Tool;

  /**
   * Single-glyph icon shown in the toolbar button. Plain text
   * (emoji or unicode) for v1; switch to a proper icon component in
   * a later UX proposal.
   */
  readonly icon: string;
}

// ---------------------------------------------------------------------------
// Default registry population
// ---------------------------------------------------------------------------

const registry = new Map<string, ToolDefinition>();

/**
 * Register a tool definition. Throws if a tool with the same `id` is
 * already registered — `registerTool` is append-only and refuses to
 * silently overwrite. Callers that need to replace a tool must first
 * call `unregisterTool(id)` (not yet implemented — out of scope for v1).
 */
export function registerTool(def: ToolDefinition): void {
  if (registry.has(def.id)) {
    throw new Error(`Tool already registered: ${def.id}`);
  }
  registry.set(def.id, def);
}

/**
 * Return the definition for a given tool ID. Throws if the tool is
 * unknown.
 */
export function getToolDef(id: string): ToolDefinition {
  const def = registry.get(id);
  if (!def) {
    throw new Error(`Unknown tool: ${id}`);
  }
  return def;
}

/**
 * Return all registered tool definitions in registration order. The
 * returned array is a defensive copy.
 */
export function getAllTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

/**
 * Return the tool definitions visible in the given mode: the union of
 * tools whose `modes` includes `modeId` OR whose `alwaysAvailable`
 * is `true`, in registration order.
 *
 * The caller (controller) iterates the result and calls `factory()` on
 * each entry to build the per-instance `toolRegistry`.
 */
export function getToolsForMode(modeId: string): ToolDefinition[] {
  const out: ToolDefinition[] = [];
  for (const def of registry.values()) {
    if (def.alwaysAvailable || def.modes.includes(modeId)) {
      out.push(def);
    }
  }
  return out;
}

/**
 * Reset the tool registry. Test-only: production code never needs to
 * clear the registry. Not exported from the public barrel to keep the
 * API surface narrow.
 */
export function _resetToolRegistryForTests(): void {
  registry.clear();
}
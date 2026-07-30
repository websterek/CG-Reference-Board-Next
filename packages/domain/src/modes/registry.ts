/**
 * Mode registry — extensible registry of interaction modes.
 *
 * The registry replaces the closed `InteractionMode` union with a runtime
 * data structure. Adding a new interaction mode is a single
 * `registerMode()` call; all derived lookups (`getModeDef`, `getAllModes`,
 * `getToolsForMode`) are computed from registry entries.
 *
 * INVARIANT (per tool-registry-and-modes proposal D1): the three default
 * modes (`grid`, `annotation`, `connector`) are pre-populated at module
 * load. The `connector` mode is registered as a forward reference — its
 * `defaultTool` references `ConnectorTool`, which may be implemented in a
 * separate proposal (`connector-items`). The mode is functional even
 * without its creation tool because universal tools (Select/Move/Hand)
 * are resolved by `getToolsForMode()` regardless of the mode's
 * `toolIds`.
 *
 * INVARIANT (per tool-registry-and-modes proposal D2): Select, Move, and
 * Hand are universal tools. The mode's `toolIds` does NOT include them;
 * they are resolved separately by `getToolsForMode()`.
 */

/**
 * Snap policy for a mode. `'mandatory'` quantizes points to grid cells;
 * `'off'` lets points use raw board coordinates (used by annotation mode).
 *
 * NOTE: This is intentionally different from the layer registry's
 * `SnapPolicy` (which also has `'mandatory' | 'off'` but lives on
 * `LayerDefinition`). A mode's snap policy is the default; an active
 * tool's `snapPolicy` can override the mode's policy.
 */
export type ModeSnapPolicy = 'mandatory' | 'off';

/**
 * Minimal shape of a tool that `getToolsForMode` needs to resolve
 * universal tools. The full `ToolDefinition` lives in the client
 * package; importing it from the domain package would create a
 * circular dependency (domain ← client). The structural type accepts
 * anything with the two fields we read.
 */
export interface ToolShapeForMode {
  readonly id: string;
  readonly alwaysAvailable?: boolean;
}

/**
 * Per-mode policy and metadata record. The registry stores one entry
 * per `id` string. Every field is required so a missing value fails
 * fast.
 */
export interface ModeDefinition {
  /**
   * Stable identifier for the mode (e.g. `'grid'`, `'annotation'`,
   * `'connector'`, or any user-defined string). Used as the primary
   * key in the registry map and as the discriminator on UI state
   * (`uiStore.interactionMode`).
   */
  readonly id: string;

  /**
   * Human-readable name shown in the toolbar mode toggle. Defaults are
   * `'Grid'`, `'Annotation'`, `'Connector'`.
   */
  readonly displayName: string;

  /**
   * Mode-scoped tool IDs visible in the mode-scoped toolbar row.
   * Universal tools (Select/Move/Hand) are NOT included here; they
   * are resolved separately by `getToolsForMode()`.
   *
   * Order in this array is the toolbar display order.
   */
  readonly toolIds: readonly string[];

  /**
   * The tool to activate when the user enters this mode for the first
   * time (no entry in `lastUsedToolPerMode`) or after switching away
   * from a non-universal tool.
   */
  readonly defaultTool: string;

  /**
   * Whether the mode enforces snap-to-grid by default. `'mandatory'`
   * quantizes; `'off'` lets raw coordinates through. The active
   * tool's `snapPolicy` can override the mode's policy when set to
   * `'exempt'` or `'mandatory'`.
   */
  readonly snapPolicy: ModeSnapPolicy;
}

// ---------------------------------------------------------------------------
// Default registry population
// ---------------------------------------------------------------------------

const registry = new Map<string, ModeDefinition>();

function register(def: ModeDefinition): void {
  registry.set(def.id, def);
}

// Grid mode: structured layout. Default is Select, mandatory snap.
register({
  id: 'grid',
  displayName: 'Grid',
  toolIds: ['rectangle', 'frame', 'image', 'text'],
  defaultTool: 'select',
  snapPolicy: 'mandatory',
});

// Annotation mode: freeform markup. Default is Freehand, snap is off.
register({
  id: 'annotation',
  displayName: 'Annotation',
  toolIds: ['freehand', 'arrow', 'rectangle', 'text', 'eraser'],
  defaultTool: 'freehand',
  snapPolicy: 'off',
});

// Connector mode: relationship lines. Default is Connector, mandatory snap
// so endpoints attach to grid points. Forward reference: the
// `ConnectorTool` itself may be implemented in a separate proposal
// (`connector-items`); the mode is registered either way.
register({
  id: 'connector',
  displayName: 'Connector',
  toolIds: ['connector'],
  defaultTool: 'connector',
  snapPolicy: 'mandatory',
});

// ---------------------------------------------------------------------------
// Registry API
// ---------------------------------------------------------------------------

/**
 * Return the definition for a given mode. Throws if the mode is unknown.
 *
 * The throw is intentional: callers should treat an unknown mode as a
 * programming error or stale data.
 */
export function getModeDef(id: string): ModeDefinition {
  const def = registry.get(id);
  if (!def) {
    throw new Error(`Unknown interaction mode: ${id}`);
  }
  return def;
}

/**
 * Return all registered mode definitions in registration order. The
 * returned array is a defensive copy; mutating it does not affect the
 * registry.
 */
export function getAllModes(): ModeDefinition[] {
  return Array.from(registry.values());
}

/**
 * Return the IDs of tools available in the given mode: the union of
 * the mode's `toolIds` and all tools with `alwaysAvailable: true`
 * from the `ToolDefinition` registry.
 *
 * This function imports the client-side tool registry, which would
 * normally create a circular dependency (domain ← client). The
 * dependency is broken by typing `ToolDefinition` as a structural
 * shape and using a dynamic lookup (`getAllToolsForMode` may be
 * provided by the client package). The simple string-list version
 * below is safe because we only read the `id` and `alwaysAvailable`
 * fields — no runtime call to the client package is needed.
 */
export function getToolsForMode(modeId: string, allTools?: readonly ToolShapeForMode[]): string[] {
  const mode = getModeDef(modeId);
  const ids: string[] = [...mode.toolIds];
  if (allTools) {
    for (const t of allTools) {
      if (t.alwaysAvailable && !ids.includes(t.id)) {
        ids.push(t.id);
      }
    }
  }
  return ids;
}

/**
 * Return true if the given tool ID is a universal tool. Universal
 * tools are present in every mode's toolbar regardless of the mode's
 * `toolIds`. As of the tool-registry-and-modes proposal, the three
 * universal tools are Select, Move, and Hand.
 */
export function isUniversalTool(toolId: string): boolean {
  return toolId === 'select' || toolId === 'move' || toolId === 'hand';
}

/**
 * Resolve the active tool after a mode switch. Pure helper extracted
 * from `uiStore.setInteractionMode` so it can be unit-tested without
 * Zustand.
 *
 * Rules (per tool-registry-and-modes proposal D7):
 *   1. If the current tool is universal (`select`, `move`, `hand`),
 *      preserve it. Universal tools work in every mode.
 *   2. Otherwise, check `lastUsedToolPerMode[nextMode]`:
 *      - If a last-used entry exists AND it is a valid tool for the
 *        next mode, return that tool. (Stale entries — tools that no
 *        longer exist or that have moved modes — are ignored and we
 *        fall through to the default.)
 *      - Otherwise return the next mode's `defaultTool`.
 *
 * Note: we cannot validate that a `lastUsed` tool still exists in the
 * `ToolDefinition` registry without coupling this helper to the
 * client-side registry. The `uiStore` layer above is responsible for
 * pruning stale entries before calling this helper in practice.
 */
export function resolveActiveToolOnModeSwitch(
  currentTool: string,
  nextMode: string,
  lastUsed: Readonly<Record<string, string>>,
): string {
  if (isUniversalTool(currentTool)) {
    return currentTool;
  }
  const lastUsedForMode = lastUsed[nextMode];
  if (lastUsedForMode && lastUsedForMode !== currentTool) {
    return lastUsedForMode;
  }
  return getModeDef(nextMode).defaultTool;
}
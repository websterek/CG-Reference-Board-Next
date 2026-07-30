/**
 * Layer registry — extensible registry of layer kinds.
 *
 * The registry replaces the closed `LayerKind` union with a runtime data
 * structure. Adding a new layer kind is a single `addLayer()` call; all
 * derived lists (z-order, hit-priority, schema validation, visibility) are
 * computed from registry entries.
 *
 * INVARIANT (per design.md D1, D3): the four default kinds (frame, media,
 * overlay, annotation) are pre-populated at module load. They are
 * non-deletable (`isDefaultKind`) but their policy values can change in
 * future work via `updateLayer()` (out of scope for v1).
 *
 * INVARIANT (per design.md D5): a layer that contains items cannot be
 * deleted. The caller passes the current item count to `deleteLayer()` so
 * the registry does not need to know about board state.
 */

import type { Rect } from '../board';
import type { LayerId } from '../board';

/**
 * Local brand-assertion helper. `board.ts` exposes `asLayerId` with the
 * same semantics, but importing it from here would create a circular
 * dependency (`board.ts` imports `LayerSchema` validators from this
 * module). The LayerId brand is purely structural, so a direct cast is
 * safe.
 */
const asLayerId = (s: string): LayerId => s as LayerId;

// ---------------------------------------------------------------------------
// LayerDefinition interface
// ---------------------------------------------------------------------------

/**
 * Whether the snap service should quantize an item on this layer to grid
 * cells. `'mandatory'` quantizes to the nearest cell; `'off'` lets items
 * use raw board coordinates (e.g. annotation strokes).
 */
export type SnapPolicy = 'mandatory' | 'off';

/**
 * Overlap policy for proposed placements. `'forbid-same-kind'` rejects
 * placements that overlap an existing item of the same kind (the standard
 * "non-overlap" rule for media, frame, overlay). `'none'` allows overlap
 * freely (used for annotation strokes that legitimately cross other
 * shapes). A custom function lets a kind express arbitrary overlap logic.
 */
export type OverlapRule =
  | 'forbid-same-kind'
  | 'none'
  | ((proposed: Rect, existing: Rect) => boolean);

/**
 * Whether items on this layer are allowed to be placed fully inside
 * another item of the same kind. `'no-nesting'` rejects such placements
 * (frames cannot be nested). `'none'` allows nesting freely.
 */
export type ContainmentPolicy = 'none' | 'no-nesting';

/**
 * Per-kind policy and metadata record. The registry stores one entry per
 * `kind` string. Every field is required so a missing value fails fast.
 */
export interface LayerDefinition {
  /**
   * Stable identifier for the kind (e.g. `'frame'`, `'media'`, `'overlay'`,
   * `'annotation'`, or any user-defined string). Used as the primary key
   * in the registry map and as the discriminator on `Layer.kind`.
   */
  readonly kind: string;

  /**
   * Human-readable name shown in the layers panel. Defaults are
   * `'Frames'`, `'Media'`, `'Overlay'`, `'Annotations'`.
   */
  readonly displayName: string;

  /**
   * Stable identifier for the layer container associated with this kind.
   * Mirrors the four legacy layer IDs (`'frames'`, `'media'`, `'overlay'`,
   * `'annotations'`) so existing boards remain compatible.
   */
  readonly layerId: LayerId;

  /**
   * Lower values render behind higher values. The four default kinds
   * occupy z-orders 0 (frame), 1 (media), 2 (overlay), 4 (annotation).
   * The gap at 3 leaves room for future kinds (e.g. connector).
   */
  readonly zOrder: number;

  /**
   * Whether items on this layer snap to the grid. `'off'` is used for
   * annotation strokes to preserve raw freehand coordinates.
   */
  readonly snapPolicy: SnapPolicy;

  /**
   * Overlap policy for proposed placements. See `OverlapRule` for the
   * three supported forms.
   */
  readonly overlapRule: OverlapRule;

  /**
   * Containment policy. `'no-nesting'` forbids placing an item of this
   * kind fully inside another item of the same kind.
   */
  readonly containmentPolicy: ContainmentPolicy;

  /**
   * Hit-test priority. Higher values are picked first when items on
   * multiple kinds overlap. Used to derive the `sortByHitPriority()`
   * list. Annotation has the highest priority (50) so freehand strokes
   * are clickable on top of media.
   */
  readonly hitPriority: number;

  /**
   * Whether items on this layer can be endpoints of a connector. Out of
   * scope for v1 but reserved for the upcoming `connector-items` change.
   */
  readonly canBeConnectorEndpoint: boolean;

  /**
   * Whether the layer is visible by default. The user can toggle
   * visibility at runtime; this value is the initial state.
   */
  readonly defaultVisible: boolean;

  /**
   * Whether the layer is locked by default. The user can unlock at
   * runtime; this value is the initial state.
   */
  readonly defaultLocked: boolean;
}

// ---------------------------------------------------------------------------
// Default registry population
// ---------------------------------------------------------------------------

/**
 * The five default kinds. They are non-deletable. Stored as a Set for
 * O(1) membership checks via `isDefaultKind`.
 *
 * The `connector` kind was added by the `connector-items` change and
 * is registered at module load alongside the four legacy kinds. It is
 * included here so test harnesses that snapshot the default state
 * (e.g. `layer-registry.test.ts`) preserve it across `afterEach`
 * cleanup.
 */
export const DEFAULT_KINDS: ReadonlySet<string> = new Set([
  'frame',
  'media',
  'overlay',
  'annotation',
  'connector',
]);

const registry = new Map<string, LayerDefinition>();

function register(def: LayerDefinition): void {
  registry.set(def.kind, def);
}

// Frame: back-most, no nesting, non-connector endpoint
register({
  kind: 'frame',
  displayName: 'Frames',
  layerId: asLayerId('frames'),
  zOrder: 0,
  snapPolicy: 'mandatory',
  overlapRule: 'forbid-same-kind',
  containmentPolicy: 'no-nesting',
  hitPriority: 10,
  canBeConnectorEndpoint: false,
  defaultVisible: true,
  defaultLocked: false,
});

// Media: standard content layer, can be a connector endpoint
register({
  kind: 'media',
  displayName: 'Media',
  layerId: asLayerId('media'),
  zOrder: 1,
  snapPolicy: 'mandatory',
  overlapRule: 'forbid-same-kind',
  containmentPolicy: 'none',
  hitPriority: 20,
  canBeConnectorEndpoint: true,
  defaultVisible: true,
  defaultLocked: false,
});

// Overlay: above media, can be a connector endpoint
register({
  kind: 'overlay',
  displayName: 'Overlay',
  layerId: asLayerId('overlay'),
  zOrder: 2,
  snapPolicy: 'mandatory',
  overlapRule: 'forbid-same-kind',
  containmentPolicy: 'none',
  hitPriority: 30,
  canBeConnectorEndpoint: true,
  defaultVisible: true,
  defaultLocked: false,
});

// Annotation: top-most, no snap, free overlap, non-connector endpoint.
// z-order 4 leaves a gap at 3 for future kinds (e.g. connector) so a new
// kind can be slotted in without renumbering existing entries.
register({
  kind: 'annotation',
  displayName: 'Annotations',
  layerId: asLayerId('annotations'),
  zOrder: 4,
  snapPolicy: 'off',
  overlapRule: 'none',
  containmentPolicy: 'none',
  hitPriority: 50,
  canBeConnectorEndpoint: false,
  defaultVisible: true,
  defaultLocked: false,
});

// Connector: structural edges between items. Sits between overlay (z=2)
// and annotation (z=4) so connectors render above content but below
// freehand markup. Connectors do not snap to the grid (`snapPolicy:
// 'off'`) because their endpoints follow item bounds, not raw cells,
// and do not enforce non-overlap (`overlapRule: 'none'`) because
// lines can cross freely. `canBeConnectorEndpoint: false` keeps
// connector-on-connector connections out of v1.
register({
  kind: 'connector',
  displayName: 'Connectors',
  layerId: asLayerId('connectors'),
  zOrder: 3,
  snapPolicy: 'off',
  overlapRule: 'none',
  containmentPolicy: 'none',
  hitPriority: 40,
  canBeConnectorEndpoint: false,
  defaultVisible: true,
  defaultLocked: false,
});

// ---------------------------------------------------------------------------
// Registry API
// ---------------------------------------------------------------------------

/**
 * Return the definition for a given kind. Throws if the kind is unknown.
 *
 * The throw is intentional: callers should treat an unknown kind as a
 * programming error or stale data. Callers that need to validate without
 * throwing should use `tryGetLayerDef` (exported below) or check via
 * `isKnownKind` (currently a synonym for `getLayerDef` not throwing).
 */
export function getLayerDef(kind: string): LayerDefinition {
  const def = registry.get(kind);
  if (!def) {
    throw new Error(`Unknown layer kind: ${kind}`);
  }
  return def;
}

/**
 * Non-throwing variant of `getLayerDef`. Returns `undefined` if the
 * kind is unknown. Useful for schema refinements that want to validate
 * without try/catch overhead.
 */
export function tryGetLayerDef(kind: string): LayerDefinition | undefined {
  return registry.get(kind);
}

/**
 * Return all registered layer definitions. The returned array is a
 * defensive copy; mutating it does not affect the registry.
 */
export function getAllLayers(): LayerDefinition[] {
  return Array.from(registry.values());
}

/**
 * Return the kind strings in ascending `zOrder`. Used by the canvas
 * controller to create PixiJS layer containers in the correct render
 * order (back to front).
 */
export function sortByZOrder(): string[] {
  return Array.from(registry.values())
    .sort((a, b) => a.zOrder - b.zOrder)
    .map((def) => def.kind);
}

/**
 * Return the kind strings in descending `hitPriority`. Used by hit
 * testing so the topmost (highest priority) layer is checked first.
 */
export function sortByHitPriority(): string[] {
  return Array.from(registry.values())
    .sort((a, b) => b.hitPriority - a.hitPriority)
    .map((def) => def.kind);
}

/**
 * Return the stable layer IDs derived from registered kinds. Used by
 * `BoardItemSchema.layerId` validation so the allowed list is registry-
 * driven rather than hardcoded.
 */
export function getLayerIds(): string[] {
  return Array.from(registry.values()).map((def) => def.layerId);
}

/**
 * Build the initial `layerVisible` map from registered `defaultVisible`
 * values keyed by kind. The controller uses this to seed its visibility
 * state at init.
 */
export function initLayerVisibility(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const def of registry.values()) {
    map.set(def.kind, def.defaultVisible);
  }
  return map;
}

/**
 * Add a new layer definition to the registry. Throws if the kind
 * already exists — `addLayer` is append-only.
 *
 * Adding a kind does not automatically create a PixiJS `Container` for
 * the kind; the controller subscribes to registry changes via the
 * `subscribe()` hook (see `registerOnChange`) so the new container is
 * created before any item is routed to it.
 */
export function addLayer(def: LayerDefinition): void {
  if (registry.has(def.kind)) {
    throw new Error(`Layer kind already registered: ${def.kind}`);
  }
  registry.set(def.kind, def);
  notifyChange();
}

/**
 * Delete a layer from the registry. Throws when:
 *   - The kind is unknown.
 *   - The kind is one of the four default kinds (frame, media, overlay,
 *     annotation) — they are immutable.
 *   - `itemCount` is greater than zero — non-empty layers cannot be
 *     deleted because the items would be orphaned.
 *
 * Returns `true` when a layer was removed, `false` when nothing changed.
 */
export function deleteLayer(kind: string, itemCount: number): boolean {
  if (!registry.has(kind)) {
    throw new Error(`Unknown layer kind: ${kind}`);
  }
  if (DEFAULT_KINDS.has(kind)) {
    throw new Error(`Cannot delete default layer kind: ${kind}`);
  }
  if (itemCount > 0) {
    throw new Error(
      `Cannot delete layer '${kind}' because it contains ${itemCount} item(s). ` +
        `Move or delete the items first.`,
    );
  }
  registry.delete(kind);
  notifyChange();
  return true;
}

/**
 * Returns true if the given kind is one of the four built-in defaults
 * (frame, media, overlay, annotation). These kinds cannot be deleted.
 */
export function isDefaultKind(kind: string): boolean {
  return DEFAULT_KINDS.has(kind);
}

// ---------------------------------------------------------------------------
// Change notification
// ---------------------------------------------------------------------------

/**
 * Subscription handle returned by `registerOnChange`. Call the function
 * to unsubscribe.
 */
export type RegistryUnsubscribe = () => void;

/**
 * Listener invoked after the registry mutates (add/delete). The
 * controller uses this to rebuild its derived lists and PixiJS layer
 * containers so newly-added kinds become routable immediately.
 */
export type RegistryChangeListener = () => void;

const listeners = new Set<RegistryChangeListener>();

function notifyChange(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // Swallow listener errors so a single bad subscriber does not
      // break the registry or other subscribers.
    }
  }
}

/**
 * Register a listener to be invoked after every registry mutation
 * (add/delete). Returns an unsubscribe function.
 *
 * The controller calls this once during init; the unsubscribe is called
 * during destroy().
 */
export function registerOnChange(fn: RegistryChangeListener): RegistryUnsubscribe {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

# Layer Registry

The layer registry is the single source of truth for layer kinds in
GridBoard. It replaces the legacy hardcoded `LayerKind` union with a
runtime-extensible data structure.

## Why

Adding a new layer kind used to require touching at least 6 locations
across 3 files (`board.ts`, `controller.ts`, and the Zod schemas). With
the registry, adding a kind is a single `addLayer()` call.

## LayerDefinition

Every layer kind is described by a `LayerDefinition` record:

| Field | Type | Purpose |
|---|---|---|
| `kind` | `string` | Stable identifier. Used as the primary key in the registry. |
| `displayName` | `string` | Human-readable name shown in the layers panel. |
| `layerId` | `LayerId` | Stable identifier for the layer container. Mirrors the legacy `frames`/`media`/`overlay`/`annotations` IDs. |
| `zOrder` | `number` | Lower values render behind higher values. |
| `snapPolicy` | `'mandatory' \| 'off'` | Whether items snap to grid cells. `'off'` is used for freehand strokes. |
| `overlapRule` | `'forbid-same-kind' \| 'none' \| (proposed, existing) => boolean` | Overlap policy for proposed placements. |
| `containmentPolicy` | `'none' \| 'no-nesting'` | Whether items can be fully inside another item of the same kind. |
| `hitPriority` | `number` | Higher values are picked first when items on multiple kinds overlap. |
| `canBeConnectorEndpoint` | `boolean` | Whether items on this layer can be endpoints of a connector. |
| `defaultVisible` | `boolean` | Initial visibility. |
| `defaultLocked` | `boolean` | Initial lock state. |

## Default kinds

The registry is pre-populated with four default kinds at module load:

| Kind | zOrder | hitPriority | snap | overlap | containment | layerId |
|---|---|---|---|---|---|---|
| `frame` | 0 | 10 | mandatory | forbid-same-kind | no-nesting | `frames` |
| `media` | 1 | 20 | mandatory | forbid-same-kind | none | `media` |
| `overlay` | 2 | 30 | mandatory | forbid-same-kind | none | `overlay` |
| `annotation` | 4 | 50 | off | none | none | `annotations` |

The z-order gap at 3 leaves room for future kinds (e.g. connector).

## Adding a new layer kind

```ts
import { addLayer, asLayerId } from '@gridboard/domain';

addLayer({
  kind: 'connector',
  displayName: 'Connectors',
  layerId: asLayerId('connectors'),
  zOrder: 3,
  snapPolicy: 'mandatory',
  overlapRule: 'none',
  containmentPolicy: 'none',
  hitPriority: 40,
  canBeConnectorEndpoint: false,
  defaultVisible: true,
  defaultLocked: false,
});
```

After `addLayer`:
- `sortByZOrder()` and `sortByHitPriority()` include the new kind.
- `BoardItemSchema` accepts the new `layerId`.
- The controller's `layerContainers` map gains a new PixiJS `Container`
  at the correct z-position (via the change subscription).

## Deleting a layer

`deleteLayer(kind, itemCount)` removes a layer from the registry. It
throws when:
- the kind is unknown,
- the kind is one of the four defaults (`frame`, `media`, `overlay`,
  `annotation`),
- `itemCount > 0` — non-empty layers cannot be deleted.

## Derived lists

The registry is the source of truth for every hardcoded list that
previously lived in `board.ts` and `controller.ts`:

- `sortByZOrder()` → `LAYER_Z_ORDER` (now derived)
- `sortByHitPriority()` → `layerPriority` arrays in `hitTest()` and
  `pickTopmostItem()` (now derived)
- `initLayerVisibility()` → `layerVisible` map initialization
  (now derived)
- `getLayerIds()` → `BoardItemSchema.layerId` allowed values
  (now registry-driven)
- `getLayerDef(kind).layerId` → `defaultLayerIdFor(kind)`
  (now registry-driven)

`getLayerDef` (throwing) and `tryGetLayerDef` (non-throwing) return the
definition for a kind. The throwing variant is intended for code paths
that have already validated the kind; `tryGetLayerDef` is for schema
refinements that want to fail without throwing.

## Change subscription

`registerOnChange(fn)` registers a listener invoked after every registry
mutation. The controller subscribes once during init and reconciles its
`layerContainers` map and `layerVisible` map. The returned function
unsubscribes; the controller calls it in `destroy()`.

Listener errors are swallowed so a single bad subscriber does not break
the registry or other subscribers.

## Default kind immutability

The four default kinds are immutable. `deleteLayer` rejects them. In a
future change, `updateLayer` may allow their policy values to evolve
without changing the kind identifier.

## Non-empty deletion rule

A layer that contains items cannot be deleted. The caller passes the
current item count to `deleteLayer` so the registry stays consistent
with board state. To delete a layer, the caller must first move or
delete all items on it.

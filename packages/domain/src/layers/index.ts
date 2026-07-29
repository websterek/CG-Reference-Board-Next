/**
 * Layer registry — public surface.
 *
 * Re-exports the `LayerDefinition` type and the registry helpers
 * (`getLayerDef`, `getAllLayers`, `sortByZOrder`, `sortByHitPriority`,
 * `getLayerIds`, `initLayerVisibility`, `addLayer`, `deleteLayer`,
 * `isDefaultKind`, `registerOnChange`) plus the supporting types
 * (`SnapPolicy`, `OverlapRule`, `ContainmentPolicy`).
 *
 * The `DEFAULT_KINDS` set and the `tryGetLayerDef` helper are also
 * exported for tests and any caller that needs to validate without
 * throwing.
 */

export type {
  LayerDefinition,
  SnapPolicy,
  OverlapRule,
  ContainmentPolicy,
  RegistryChangeListener,
  RegistryUnsubscribe,
} from './registry';

export {
  DEFAULT_KINDS,
  getLayerDef,
  tryGetLayerDef,
  getAllLayers,
  sortByZOrder,
  sortByHitPriority,
  getLayerIds,
  initLayerVisibility,
  addLayer,
  deleteLayer,
  isDefaultKind,
  registerOnChange,
} from './registry';

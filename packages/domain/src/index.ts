/**
 * @gridboard/domain — pure TypeScript.
 *
 * Public surface for the GridBoard domain package. Consumers are the client
 * (React/PixiJS/Yjs runtime) and the server (Fastify/Hocuspocus/Drizzle).
 *
 * INVARIANT (design.md §D1): this package MUST NOT import yjs, pixi.js,
 * react, fastify, or any external framework runtime. Domain logic is
 * framework-independent and unit-testable.
 */

export const DOMAIN_PACKAGE_VERSION = '0.1.0';

// Core types & Zod schemas
export * from './board';
export * from './grid';
export * from './tool';
export * from './collab-schema';
export * from './spatial';

// Item registry
export {
  ITEM_TYPES,
  RectangleItemDefinition,
  RectangleAttrsSchema,
  DEFAULT_RECTANGLE_ATTRS,
  isRectangleItem,
  getRectangleBounds,
  rectangleHitTest,
  layerKindFor,
  defaultLayerIdFor,
  FrameItemDefinition,
  FrameAttrsSchema,
  DEFAULT_FRAME_ATTRS,
  isFrameItem,
  AnnotationItemDefinition,
  AnnotationAttrsSchema,
  DEFAULT_ANNOTATION_ATTRS,
  isAnnotationItem,
  getAnnotationBounds,
  ConnectorItemDefinition,
  ConnectorAttrsSchema,
  DEFAULT_CONNECTOR_ATTRS,
  isConnectorItem,
  getConnectorBounds,
  connectorHitTest,
  connectorPinHit,
} from './items/registry';
export {
  ImageItemDefinition,
  ImageAttrsSchema,
  isImageItem,
  DEFAULT_IMAGE_SIZE,
} from './items/image';
export { resolveAnchor } from './items/connector';
export type { ItemTypeDefinition } from './items/index';
export type { ImageAttrs, ImageStatus } from './items/image';
export type { RectangleAttrs } from './items/rectangle';
export type { FrameAttrs } from './items/frame';
export type { AnnotationAttrs } from './items/annotation';
export type { ConnectorAttrs, ConnectorAnchor, ConnectorRouting, ConnectorStyle } from './board';

// Layer registry (replaces the closed `LayerKind` union with a runtime
// registry; see openspec/changes/layer-registry)
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
} from './layers/registry';
export type {
  LayerDefinition,
  SnapPolicy,
  OverlapRule,
  ContainmentPolicy,
  RegistryChangeListener,
  RegistryUnsubscribe,
} from './layers/registry';

// Mode registry (replaces the closed `InteractionMode` union with a
// runtime registry; see openspec/changes/tool-registry-and-modes)
export {
  getModeDef,
  getAllModes,
  getToolsForMode,
  isUniversalTool,
  resolveActiveToolOnModeSwitch,
} from './modes/registry';
export type {
  ModeDefinition,
  ModeSnapPolicy,
  ToolShapeForMode,
} from './modes/registry';

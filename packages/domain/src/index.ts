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
} from './items/registry';
export {
  ImageItemDefinition,
  ImageAttrsSchema,
  isImageItem,
  DEFAULT_IMAGE_SIZE,
} from './items/image';
export type { ItemTypeDefinition } from './items/index';
export type { ImageAttrs, ImageStatus } from './items/image';
export type { RectangleAttrs } from './items/rectangle';

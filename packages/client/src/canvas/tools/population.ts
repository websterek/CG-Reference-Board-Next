/**
 * Tool registry population — wire up the 11 default `ToolDefinition`
 * entries and call `registerTool` for each.
 *
 * This module is imported once at controller init (see
 * controller.ts `initToolRegistry`) so the registry is fully populated
 * before any lookup. The order of `registerTool` calls determines
 * toolbar display order (insertion order of the underlying Map).
 *
 * Tool factory stubs: tools that don't exist yet (Image, Text, Arrow,
 * Eraser, Connector) use minimal stub `Tool` implementations that
 * throw on pointer events. They will be replaced by real tools in
 * upcoming proposals.
 */

import type { Tool } from '@gridboard/domain';

import { registerTool } from './registry';
import { FrameCreateTool } from './frame-tool';
import { AnnotationFreehandTool } from './annotation-tool';
import { HandTool } from './hand-tool';
import { ConnectorTool } from './connector-tool';
import { ImageCreateTool } from './image-tool';

/**
 * Stub tool used for tools that aren't implemented yet (Image, Text,
 * Arrow, Eraser, Connector). It implements the `Tool` interface but
 * throws a descriptive error on pointer events so we can detect a
 * missing implementation at runtime rather than silently no-op.
 */
class StubTool implements Tool {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  private fail(): never {
    throw new Error(
      `Tool "${this.name}" is a stub; a real implementation has not been provided yet.`,
    );
  }
  onPointerDown(): never {
    this.fail();
  }
  onPointerMove(): never {
    this.fail();
  }
  onPointerUp(): never {
    this.fail();
  }
}

/**
 * Built-in Select tool. The controller's pointerdown handler dispatches
 * the select/move logic directly without going through the tool
 * registry — there is no `SelectTool` class. This factory returns a
 * no-op Tool so the registry has an entry to point to.
 */
class BuiltInSelectTool implements Tool {
  readonly name = 'select';
}

/**
 * Built-in Move tool. Same situation as Select: the controller's
 * move-selected drag state handles it. This factory returns a no-op.
 */
class BuiltInMoveTool implements Tool {
  readonly name = 'move';
}

/**
 * Populate the tool registry with the 11 default entries. Idempotent
 * within a single module load: calling twice will throw on the second
 * pass (because `registerTool` rejects duplicates). The controller
 * calls this once during init.
 */
export function populateDefaultToolRegistry(): void {
  // ---- Universal tools (alwaysAvailable: true) ----
  registerTool({
    id: 'select',
    displayName: 'Select',
    modes: [],
    alwaysAvailable: true,
    snapPolicy: 'inherit-mode',
    factory: () => new BuiltInSelectTool(),
    icon: '▦',
  });

  registerTool({
    id: 'move',
    displayName: 'Move',
    modes: [],
    alwaysAvailable: true,
    snapPolicy: 'inherit-mode',
    factory: () => new BuiltInMoveTool(),
    icon: '↕',
  });

  registerTool({
    id: 'hand',
    displayName: 'Hand',
    modes: [],
    alwaysAvailable: true,
    snapPolicy: 'exempt',
    factory: () => new HandTool(),
    icon: '✋',
  });

  // ---- Grid-scoped tools ----
  registerTool({
    id: 'rectangle',
    displayName: 'Rectangle',
    modes: ['grid', 'annotation'],
    placementLayer: 'media',
    snapPolicy: 'inherit-mode',
    factory: () => new StubTool('rectangle'),
    icon: '▭',
  });

  registerTool({
    id: 'frame',
    displayName: 'Frame',
    modes: ['grid'],
    placementLayer: 'frame',
    snapPolicy: 'inherit-mode',
    factory: () => new FrameCreateTool(),
    icon: '⊞',
  });

  registerTool({
    id: 'image',
    displayName: 'Image',
    modes: ['grid'],
    placementLayer: 'media',
    snapPolicy: 'inherit-mode',
    factory: () => new ImageCreateTool(),
    icon: '🖼',
  });

  registerTool({
    id: 'text',
    displayName: 'Text',
    modes: ['grid', 'annotation'],
    placementLayer: 'overlay',
    snapPolicy: 'inherit-mode',
    factory: () => new StubTool('text'),
    icon: 'T',
  });

  // ---- Annotation-scoped tools ----
  registerTool({
    id: 'freehand',
    displayName: 'Freehand',
    modes: ['annotation'],
    placementLayer: 'annotation',
    snapPolicy: 'exempt',
    factory: () => new AnnotationFreehandTool(),
    icon: '✎',
  });

  registerTool({
    id: 'arrow',
    displayName: 'Arrow',
    modes: ['annotation'],
    placementLayer: 'annotation',
    snapPolicy: 'exempt',
    factory: () => new StubTool('arrow'),
    icon: '→',
  });

  registerTool({
    id: 'eraser',
    displayName: 'Eraser',
    modes: ['annotation'],
    snapPolicy: 'exempt',
    factory: () => new StubTool('eraser'),
    icon: '⌫',
  });

  // ---- Connector-scoped tool ----
  // Real implementation (see packages/client/src/canvas/tools/
  // connector-tool.ts). Replaces the v1 stub now that the
  // `connector-items` change is in place. The tool lives in the
  // `connector` mode; its two-click state machine creates
  // `ConnectorItem` instances.
  registerTool({
    id: 'connector',
    displayName: 'Connector',
    modes: ['connector'],
    placementLayer: 'overlay',
    snapPolicy: 'mandatory',
    factory: () => new ConnectorTool(),
    icon: '🔗',
  });
}
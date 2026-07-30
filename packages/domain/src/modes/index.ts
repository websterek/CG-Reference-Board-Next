/**
 * Modes barrel — public surface for the mode registry.
 *
 * Re-exports `ModeDefinition`, `ModeSnapPolicy`, and the registry
 * helpers so consumers can import them from a single path.
 */

export type { ModeDefinition, ModeSnapPolicy, ToolShapeForMode } from './registry';
export {
  getModeDef,
  getAllModes,
  getToolsForMode,
  isUniversalTool,
  resolveActiveToolOnModeSwitch,
} from './registry';
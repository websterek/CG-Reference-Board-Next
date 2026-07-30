/**
 * UI chrome state — Zustand-only.
 *
 * Canvas state lives in the CanvasController + Yjs document, NEVER in Zustand
 * (React re-renders are poison for 60 FPS canvas interaction, see design.md D5).
 * Zustand holds tool selection, panel visibility, and a summary of the current
 * selection count for the inspector panel.
 *
 * Per tool-registry-and-modes: `ToolName` and `InteractionMode` are now plain
 * `string` aliases — the closed unions have been replaced by the `ModeDefinition`
 * and `ToolDefinition` registries. `setInteractionMode` performs the
 * mode-switch logic that preserves universal active tools and remembers the
 * last-used tool per mode.
 */

import { create } from 'zustand';
import { getModeDef, resolveActiveToolOnModeSwitch } from '@gridboard/domain';

export type ToolName = string;
export type InteractionMode = string;

export interface UIState {
  activeTool: ToolName;
  setActiveTool: (tool: ToolName) => void;

  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;

  /**
   * Per-mode memory of the last tool the user picked. When entering a
   * mode, if the current tool is not universal, the system looks here
   * for the most recent tool the user chose in that mode. See
   * `resolveActiveToolOnModeSwitch` for the resolution rules.
   */
  lastUsedToolPerMode: Record<string, string>;
  setLastUsedTool: (modeId: string, toolId: string) => void;

  selectionCount: number;
  setSelectionCount: (n: number) => void;

  inspectorOpen: boolean;
  toggleInspector: () => void;
}

const INITIAL_MODE = 'grid';

export const useUIStore = create<UIState>((set) => ({
  activeTool: getModeDef(INITIAL_MODE).defaultTool,
  setActiveTool: (tool) =>
    set((s) => {
      // Remember the last-used tool for the current mode so a return
      // to this mode restores the tool the user had picked.
      const map = { ...s.lastUsedToolPerMode };
      map[s.interactionMode] = tool;
      return { activeTool: tool, lastUsedToolPerMode: map };
    }),

  interactionMode: INITIAL_MODE,
  setInteractionMode: (mode) =>
    set((s) => {
      // Resolve the new active tool per tool-registry-and-modes
      // proposal D7.
      const newTool = resolveActiveToolOnModeSwitch(
        s.activeTool,
        mode,
        s.lastUsedToolPerMode,
      );
      return { interactionMode: mode, activeTool: newTool };
    }),

  lastUsedToolPerMode: {},
  setLastUsedTool: (modeId, toolId) =>
    set((s) => ({ lastUsedToolPerMode: { ...s.lastUsedToolPerMode, [modeId]: toolId } })),

  selectionCount: 0,
  setSelectionCount: (n) => set({ selectionCount: n }),

  inspectorOpen: false,
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
}));
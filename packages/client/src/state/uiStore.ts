/**
 * UI chrome state — Zustand-only.
 *
 * Canvas state lives in the CanvasController + Yjs document, NEVER in Zustand
 * (React re-renders are poison for 60 FPS canvas interaction, see design.md D5).
 * Zustand holds tool selection, panel visibility, and a summary of the current
 * selection count for the inspector panel.
 */

import { create } from 'zustand';

export type ToolName = 'select' | 'rectangle' | 'frame' | 'annotation-freehand';

export type InteractionMode = 'grid' | 'annotation';

export interface UIState {
  activeTool: ToolName;
  setActiveTool: (tool: ToolName) => void;

  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;

  selectionCount: number;
  setSelectionCount: (n: number) => void;

  inspectorOpen: boolean;
  toggleInspector: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),

  interactionMode: 'grid' as const,
  setInteractionMode: (mode) => set({ interactionMode: mode }),

  selectionCount: 0,
  setSelectionCount: (n) => set({ selectionCount: n }),

  inspectorOpen: false,
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
}));

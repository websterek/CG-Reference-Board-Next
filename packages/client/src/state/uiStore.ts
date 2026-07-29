/**
 * UI chrome state — Zustand-only.
 *
 * Canvas state lives in the CanvasController + Yjs document, NEVER in Zustand
 * (React re-renders are poison for 60 FPS canvas interaction, see design.md D5).
 * Zustand holds tool selection, panel visibility, and a summary of the current
 * selection count for the inspector panel.
 */

import { create } from 'zustand';

export type ToolName = 'select' | 'rectangle';

export interface UIState {
  activeTool: ToolName;
  setActiveTool: (tool: ToolName) => void;

  selectionCount: number;
  setSelectionCount: (n: number) => void;

  inspectorOpen: boolean;
  toggleInspector: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),

  selectionCount: 0,
  setSelectionCount: (n) => set({ selectionCount: n }),

  inspectorOpen: false,
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
}));

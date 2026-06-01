// Workspace UI state (panel visibility, zoom) — separate from the document model.
import { create } from "zustand";

interface UiState {
  aiPanelOpen: boolean;
  objectBarOpen: boolean;
  zoom: number; // 0.25 – 2
  /** Editor view mode for the canvas (applies to all frames). */
  viewMode: "edit" | "preview";
  /** Phonetic Roman→Urdu typing. */
  phonetic: boolean;
  /** Print dialog open. */
  printOpen: boolean;
  setPrintOpen: (v: boolean) => void;
  /** Keyboard-reference overlay open. */
  keyboardHelpOpen: boolean;
  setKeyboardHelpOpen: (v: boolean) => void;
  toggleAiPanel: () => void;
  setAiPanel: (open: boolean) => void;
  toggleObjectBar: () => void;
  setViewMode: (m: "edit" | "preview") => void;
  togglePhonetic: () => void;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitZoom: () => void;
}

const clampZoom = (z: number) => Math.max(0.25, Math.min(2, Math.round(z * 100) / 100));

export const useUi = create<UiState>((set) => ({
  aiPanelOpen: true,
  objectBarOpen: false,
  zoom: 1,
  viewMode: "edit",
  phonetic: true,
  printOpen: false,
  setPrintOpen: (v) => set({ printOpen: v }),
  keyboardHelpOpen: false,
  setKeyboardHelpOpen: (v) => set({ keyboardHelpOpen: v }),
  toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  setAiPanel: (open) => set({ aiPanelOpen: open }),
  toggleObjectBar: () => set((s) => ({ objectBarOpen: !s.objectBarOpen })),
  setViewMode: (m) => set({ viewMode: m }),
  togglePhonetic: () => set((s) => ({ phonetic: !s.phonetic })),
  setZoom: (z) => set({ zoom: clampZoom(z) }),
  zoomIn: () => set((s) => ({ zoom: clampZoom(s.zoom + 0.1) })),
  zoomOut: () => set((s) => ({ zoom: clampZoom(s.zoom - 0.1) })),
  fitZoom: () => set({ zoom: 0.65 }),
}));

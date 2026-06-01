// Inline AI suggestion state (qalam.ai-style non-destructive proofreading).
//
// Suggestions are tied to a frame and a character span. The editor highlights the
// span; the user accepts (apply the replacement) or rejects (dismiss) each one.
import { create } from "zustand";
import { Correction } from "./tauri";

export interface Suggestion extends Correction {
  id: string;
  frameId: string;
  /** Character offset where `original` starts in the frame text. */
  start: number;
  end: number;
}

interface SuggestionState {
  /** Suggestions for the currently-proofread frame. */
  items: Suggestion[];
  activeId: string | null;
  loading: boolean;

  setLoading: (v: boolean) => void;
  setForFrame: (frameId: string, text: string, corrections: Correction[]) => void;
  clearFrame: (frameId: string) => void;
  setActive: (id: string | null) => void;
  remove: (id: string) => void;
  /** Re-resolve remaining suggestions' spans against updated text. */
  relocate: (frameId: string, text: string) => void;
}

let sid = 1;

/** Resolve each correction to its first character span in the text. */
function locate(frameId: string, text: string, corrections: Correction[]): Suggestion[] {
  const out: Suggestion[] = [];
  for (const c of corrections) {
    const start = text.indexOf(c.original);
    if (start === -1) continue;
    out.push({
      ...c,
      id: `sug-${sid++}`,
      frameId,
      start,
      end: start + c.original.length,
    });
  }
  // Sort by position so highlights render in order.
  return out.sort((a, b) => a.start - b.start);
}

export const useSuggestions = create<SuggestionState>((set) => ({
  items: [],
  activeId: null,
  loading: false,

  setLoading: (v) => set({ loading: v }),

  setForFrame: (frameId, text, corrections) =>
    set({ items: locate(frameId, text, corrections), activeId: null }),

  clearFrame: (frameId) =>
    set((s) => ({
      items: s.items.filter((i) => i.frameId !== frameId),
      activeId: null,
    })),

  setActive: (id) => set({ activeId: id }),

  remove: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    })),

  relocate: (frameId, text) =>
    set((s) => ({
      items: s.items
        .map((i) => {
          if (i.frameId !== frameId) return i;
          const start = text.indexOf(i.original);
          return start === -1 ? null : { ...i, start, end: start + i.original.length };
        })
        .filter((i): i is Suggestion => i !== null),
    })),
}));

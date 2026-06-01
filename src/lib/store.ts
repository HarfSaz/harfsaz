// Document model + UI state for the DTP editor.
//
// A Qalam document is pages -> text frames. Frames hold Urdu text. This is the
// skeleton of a real page-layout model (the InPage-defining feature: text frames
// you place and, later, link so overflow flows frame->frame).
import { useMemo } from "react";
import { create } from "zustand";
import { LangCode, Dir, DEFAULT_LANG } from "./languages";

export interface TextFrame {
  id: string;
  /** Position/size on the page, in px (page coordinate space). */
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  /** Rich-text HTML (inline spans for per-selection bold/italic/color). When
   *  empty, falls back to `text` rendered with the frame-level styles. */
  html?: string;
  fontSize: number;
  /** Font registry key (see lib/font.ts). */
  fontKey: string;
  /** Language/keyboard for this frame (see lib/languages.ts). */
  lang: LangCode;
  /** Text direction, derived from the language. */
  dir: Dir;
  // ── text styling ──
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "right" | "center" | "left" | "justify";
  color: string;
  /** Line height multiplier. */
  lineHeight: number;
  /** Letter spacing in px (kashida-ish stretch placeholder). */
  letterSpacing: number;
  // ── frame box ──
  /** Background fill (transparent by default). */
  fill: string;
  /** Border width in px (0 = none). */
  borderWidth: number;
  borderColor: string;
  /** True for the main page-filling writing frame (seamless, no chrome). */
  isPageFrame?: boolean;
  /** Next frame id text overflows into (frame-linking — wired later). */
  linkedTo?: string;
}

export interface Page {
  id: string;
  /** Page size in px at 96dpi. A4 portrait ≈ 794 x 1123. */
  width: number;
  height: number;
  frames: TextFrame[];
}

export type Tool = "select" | "text" | "image" | "shape";

/** Serializable document payload written to a .qalam file. */
export interface DocFile {
  version: 1;
  pages: Page[];
}

interface DocState {
  pages: Page[];
  activePageId: string;
  selectedFrameId: string | null;
  activeTool: Tool;

  // ── persistence / history ──
  filePath: string | null; // absolute path of the open .qalam file
  fileName: string; // display name (e.g. "Untitled")
  dirty: boolean; // unsaved changes
  past: Page[][]; // undo stack (snapshots of pages)
  future: Page[][]; // redo stack

  setTool: (tool: Tool) => void;
  addPage: () => void;
  addFrame: (pageId: string) => void;
  updateFrame: (pageId: string, frameId: string, patch: Partial<TextFrame>) => void;
  selectFrame: (frameId: string | null) => void;
  setActivePage: (pageId: string) => void;
  flowOverflow: (pageId: string, frameId: string, keepText: string, overflowText: string) => void;
  getSelectedFrame: () => { page: Page; frame: TextFrame } | null;

  // ── persistence / history actions ──
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  newDocument: () => void;
  loadDocument: (doc: DocFile, path: string | null, name: string) => void;
  toDocFile: () => DocFile;
  markSaved: (path: string, name: string) => void;
}

const A4 = { width: 794, height: 1123 };

let idCounter = 1;
const newId = (prefix: string) => `${prefix}-${idCounter++}`;

const MARGIN = 40;

function makeFrame(opts?: { fillPage?: boolean }): TextFrame {
  const fill = opts?.fillPage ?? false;
  return {
    id: newId("frame"),
    x: fill ? MARGIN : 100,
    y: fill ? MARGIN : 100,
    width: fill ? A4.width - MARGIN * 2 : 500,
    height: fill ? A4.height - MARGIN * 2 : 240,
    text: "یہاں اردو متن لکھیں…", // "Write Urdu text here…"
    fontSize: 32,
    fontKey: "noto-nastaliq",
    lang: DEFAULT_LANG,
    dir: "rtl",
    bold: false,
    italic: false,
    underline: false,
    align: "right",
    color: "#1a1714",
    lineHeight: 1.7,
    letterSpacing: 0,
    fill: "transparent",
    borderWidth: 0,
    borderColor: "#e3dccf",
    isPageFrame: fill,
  };
}

function makePage(): Page {
  // The default page is one big writing area filling the sheet (with margins).
  return { id: newId("page"), width: A4.width, height: A4.height, frames: [makeFrame({ fillPage: true })] };
}

const firstPage = makePage();

const HISTORY_LIMIT = 100;

export const useDoc = create<DocState>((set, get) => {
  // Push the current pages onto the undo stack and mark dirty. Call BEFORE a
  // mutation. Coalescing of rapid edits (typing) is handled by the caller via
  // updateFrame's text-only fast path below.
  const snapshot = (s: DocState): Partial<DocState> => ({
    past: [...s.past, s.pages].slice(-HISTORY_LIMIT),
    future: [],
    dirty: true,
  });

  return {
  pages: [firstPage],
  activePageId: firstPage.id,
  selectedFrameId: firstPage.frames[0].id,
  activeTool: "select",

  filePath: null,
  fileName: "Untitled",
  dirty: false,
  past: [],
  future: [],

  setTool: (tool) => set({ activeTool: tool }),

  addPage: () =>
    set((s) => {
      const p = makePage();
      return {
        ...snapshot(s),
        pages: [...s.pages, p],
        activePageId: p.id,
        selectedFrameId: p.frames[0].id,
      };
    }),

  addFrame: (pageId) =>
    set((s) => {
      const f = makeFrame();
      return {
        ...snapshot(s),
        pages: s.pages.map((p) =>
          p.id === pageId ? { ...p, frames: [...p.frames, f] } : p
        ),
        selectedFrameId: f.id,
      };
    }),

  updateFrame: (pageId, frameId, patch) =>
    set((s) => {
      // Coalesce consecutive text/html-only edits (typing) into one history
      // entry: only snapshot when the previous undo entry isn't already a
      // content edit on this same frame. Cheap heuristic: snapshot unless the
      // patch is purely text/html (typing) and we're already dirty.
      const isContentOnly =
        Object.keys(patch).every((k) => k === "text" || k === "html");
      const base = isContentOnly && s.dirty ? { dirty: true } : snapshot(s);
      return {
        ...base,
        pages: s.pages.map((p) =>
          p.id !== pageId
            ? p
            : {
                ...p,
                frames: p.frames.map((f) => (f.id === frameId ? { ...f, ...patch } : f)),
              }
        ),
      };
    }),

  selectFrame: (frameId) => set({ selectedFrameId: frameId }),

  setActivePage: (pageId) => set({ activePageId: pageId }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {};
      const previous = s.past[s.past.length - 1];
      return {
        pages: previous,
        past: s.past.slice(0, -1),
        future: [s.pages, ...s.future].slice(0, HISTORY_LIMIT),
        dirty: true,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      const next = s.future[0];
      return {
        pages: next,
        past: [...s.past, s.pages].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        dirty: true,
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  newDocument: () => {
    const p = makePage();
    set({
      pages: [p],
      activePageId: p.id,
      selectedFrameId: p.frames[0].id,
      filePath: null,
      fileName: "Untitled",
      dirty: false,
      past: [],
      future: [],
    });
  },

  loadDocument: (doc, path, name) =>
    set({
      pages: doc.pages,
      activePageId: doc.pages[0]?.id ?? "",
      selectedFrameId: doc.pages[0]?.frames[0]?.id ?? null,
      filePath: path,
      fileName: name,
      dirty: false,
      past: [],
      future: [],
    }),

  toDocFile: () => ({ version: 1, pages: get().pages }),

  markSaved: (path, name) => set({ filePath: path, fileName: name, dirty: false }),

  /**
   * Move the trailing `overflowText` off `frameId` into a (new if needed) next
   * page, so content flows page→page instead of growing one page. Keeps the
   * current frame's text as `keepText`. Returns nothing; selection follows.
   */
  flowOverflow: (pageId, frameId, keepText, overflowText) =>
    set((s) => {
      const pageIdx = s.pages.findIndex((p) => p.id === pageId);
      if (pageIdx === -1) return {};
      const pages = s.pages.map((p) =>
        p.id !== pageId
          ? p
          : { ...p, frames: p.frames.map((f) => (f.id === frameId ? { ...f, text: keepText } : f)) }
      );

      // Find or create the next page.
      let nextPage = pages[pageIdx + 1];
      if (!nextPage) {
        nextPage = makePage();
        nextPage.frames[0].text = "";
        pages.push(nextPage);
      }
      // Prepend the overflow into the next page's first frame.
      const nf = nextPage.frames[0];
      nextPage.frames = [{ ...nf, text: overflowText + nf.text }, ...nextPage.frames.slice(1)];

      return {
        ...snapshot(s),
        pages,
        activePageId: nextPage.id,
        selectedFrameId: nextPage.frames[0].id,
      };
    }),

  getSelectedFrame: () => {
    const s = get();
    if (!s.selectedFrameId) return null;
    for (const page of s.pages) {
      const frame = page.frames.find((f) => f.id === s.selectedFrameId);
      if (frame) return { page, frame };
    }
    return null;
  },
  };
});

/**
 * Derive the selected {page, frame} for use in render. We subscribe only to the
 * primitive `pages` and `selectedFrameId` and memoize the derived object, so the
 * component never sees a fresh object identity every render (which would loop).
 */
export function useSelectedFrame(): { page: Page; frame: TextFrame } | null {
  const pages = useDoc((s) => s.pages);
  const selectedFrameId = useDoc((s) => s.selectedFrameId);
  return useMemo(() => {
    if (!selectedFrameId) return null;
    for (const page of pages) {
      const frame = page.frames.find((f) => f.id === selectedFrameId);
      if (frame) return { page, frame };
    }
    return null;
  }, [pages, selectedFrameId]);
}

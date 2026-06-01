// Document model + UI state for the DTP editor.
//
// A Qalam document is pages -> text frames. Frames hold Urdu text. This is the
// skeleton of a real page-layout model (the InPage-defining feature: text frames
// you place and, later, link so overflow flows frame->frame).
import { useMemo } from "react";
import { create } from "zustand";
import { LangCode, Dir, DEFAULT_LANG } from "./languages";

export type FrameKind = "text" | "image" | "shape";
export type ShapeKind =
  | "rect"
  | "rounded"
  | "ellipse"
  | "line"
  | "triangle"
  | "arrow"
  | "star";

export interface TextFrame {
  id: string;
  /** What this frame holds. Defaults to "text" for back-compat. */
  kind?: FrameKind;
  /** Position/size on the page, in px (page coordinate space). */
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  // ── image frame ──
  /** Data URL of the placed image (image frames). */
  src?: string;
  /** object-fit for the image. */
  fit?: "cover" | "contain";
  // ── shape frame ──
  shape?: ShapeKind;
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
  /** Bumped on undo/redo/load so editors force-reseed their DOM even if focused. */
  revision: number;

  setTool: (tool: Tool) => void;
  addPage: () => void;
  addFrame: (pageId: string) => void;
  /** Insert a frame of `kind` at an explicit rect (from draw-to-create). */
  addFrameAt: (
    pageId: string,
    kind: FrameKind,
    rect: { x: number; y: number; width: number; height: number },
    extra?: Partial<TextFrame>
  ) => void;
  removeFrame: (pageId: string, frameId: string) => void;
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
    kind: "text",
  };
}

/** Build a frame of a given kind at an explicit rect (draw-to-create). */
function makeFrameAt(
  kind: FrameKind,
  rect: { x: number; y: number; width: number; height: number },
  extra?: Partial<TextFrame>
): TextFrame {
  const base = makeFrame();
  const f: TextFrame = {
    ...base,
    kind,
    x: rect.x,
    y: rect.y,
    width: Math.max(24, rect.width),
    height: Math.max(24, rect.height),
    isPageFrame: false,
  };
  if (kind === "text") {
    f.text = "";
  } else if (kind === "image") {
    f.text = "";
    f.fit = "cover";
    f.borderWidth = 0;
  } else if (kind === "shape") {
    f.text = "";
    f.shape = "rect";
    f.fill = "#9a6b3f";
    f.borderWidth = 0;
  }
  return { ...f, ...extra };
}

function makePage(): Page {
  // The default page is one big writing area filling the sheet (with margins).
  return { id: newId("page"), width: A4.width, height: A4.height, frames: [makeFrame({ fillPage: true })] };
}

const firstPage = makePage();

const HISTORY_LIMIT = 100;

// ── Typing-undo coalescing state ────────────────────────────────────────────
// We checkpoint history at WORD boundaries so ⌘Z undoes a word at a time (like
// Word), not the whole typing session. The rule: a keystroke starts a NEW undo
// group (snapshot) when it begins a new word — i.e. the previous text ended at a
// word boundary (space/newline/punctuation) — or when the frame changed, or
// after a typing pause. Otherwise the keystroke coalesces into the current word.
const COALESCE_PAUSE_MS = 1200;
const SEP = /[\s.,،؛؟!?:؛\n]/;
let lastEditFrame: string | null = null;
let lastEditAt = 0;

/** Whether `text` currently ends at a word boundary (so the next char = new word). */
function endsAtWordBoundary(text: string): boolean {
  if (text.length === 0) return true;
  return SEP.test(text.slice(-1));
}

/** Cheap structural equality for two page snapshots (skips redundant undo steps). */
function samePages(a: Page[], b: Page[]): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export const useDoc = create<DocState>((set, get) => {
  // Push the current pages onto the undo stack and mark dirty. Call BEFORE a
  // mutation.
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
  revision: 0,

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

  addFrameAt: (pageId, kind, rect, extra) =>
    set((s) => {
      const f = makeFrameAt(kind, rect, extra);
      return {
        ...snapshot(s),
        pages: s.pages.map((p) =>
          p.id === pageId ? { ...p, frames: [...p.frames, f] } : p
        ),
        selectedFrameId: f.id,
        activeTool: "select", // return to select after placing
      };
    }),

  removeFrame: (pageId, frameId) =>
    set((s) => ({
      ...snapshot(s),
      pages: s.pages.map((p) =>
        p.id === pageId ? { ...p, frames: p.frames.filter((fr) => fr.id !== frameId) } : p
      ),
      selectedFrameId: s.selectedFrameId === frameId ? null : s.selectedFrameId,
    })),

  updateFrame: (pageId, frameId, patch) =>
    set((s) => {
      // Typing (text/html-only edits) coalesces into WORD-sized undo steps; any
      // other change (move, style, font, …) always snapshots.
      const isContentOnly =
        Object.keys(patch).every((k) => k === "text" || k === "html");

      const prevFrame = s.pages
        .find((p) => p.id === pageId)
        ?.frames.find((f) => f.id === frameId);
      const prevText = prevFrame?.text ?? "";
      const prevHtml = prevFrame?.html ?? "";

      let base: Partial<DocState>;
      if (!isContentOnly) {
        base = snapshot(s); // moves, styling, etc. always checkpoint
      } else {
        // No real change? (e.g. an emit that didn't alter content) → don't push
        // an empty undo step.
        const nextText = (patch.text as string | undefined) ?? prevText;
        const nextHtml = (patch.html as string | undefined) ?? prevHtml;
        if (nextText === prevText && nextHtml === prevHtml) {
          return {}; // no-op
        }

        const now = Date.now();
        // Start a new undo group when this keystroke begins a new word (the text
        // BEFORE it ended at a boundary), or the frame changed, or after a pause.
        const frameChanged = lastEditFrame !== frameId;
        const paused = now - lastEditAt > COALESCE_PAUSE_MS;
        const startsNewWord = endsAtWordBoundary(prevText);
        const newGroup = frameChanged || paused || startsNewWord;

        // Snapshot to open a new group, OR on the very first edit; else coalesce.
        base = newGroup || !s.dirty ? snapshot(s) : { dirty: true };

        lastEditFrame = frameId;
        lastEditAt = now;
      }
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
      let past = s.past;
      const current = s.pages;
      // Pop any snapshots that are identical to the current state so ONE undo
      // always produces a visible change (no "press twice" from redundant steps).
      let previous = past[past.length - 1];
      while (past.length > 0 && samePages(previous, current)) {
        past = past.slice(0, -1);
        previous = past[past.length - 1];
      }
      if (past.length === 0) return {};
      return {
        pages: previous,
        past: past.slice(0, -1),
        future: [current, ...s.future].slice(0, HISTORY_LIMIT),
        dirty: true,
        revision: s.revision + 1, // force editors to reseed from restored html
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
        revision: s.revision + 1,
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

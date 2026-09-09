// Find & replace across the whole document.
//
// Search runs over the store's plain `text` per frame (not the rich HTML), so a
// match's index is meaningful regardless of how the text is marked up. Replacing
// rewrites `text` and rebuilds `html` via the store's setFrameContent, which
// already handles history + forcing focused editors to reseed.
//
// ── Why Urdu/Arabic needs its own matching ──────────────────────────────────
// The same Urdu word is routinely spelled several valid ways, so a naive
// substring search misses most of what a writer is looking for:
//
//   • Hamza/ya variants:  ی (Farsi ya) vs ي (Arabic ya), ک vs ك, ہ vs ه vs ة
//   • Diacritics (harakat) are optional: کِتاب and کتاب are the same word
//   • Tatweel/kashida (ـ) is pure visual elongation and carries no meaning
//   • Arabic-Indic digits ۰۱۲ / ٠١٢ vs ASCII 012
//
// So we offer a "flexible" mode (default ON) that normalizes both needle and
// haystack before comparing, while still reporting offsets in the ORIGINAL
// string so replacement stays byte-accurate.

import { create } from "zustand";
import { useDoc } from "./store";

export interface Match {
  pageId: string;
  frameId: string;
  /** Offset into the frame's plain text. */
  start: number;
  end: number;
  /** The matched substring, verbatim from the source. */
  text: string;
}

// ── Normalization ───────────────────────────────────────────────────────────

/** Combining marks: harakat/aerab, plus the superscript alef. */
const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
/** Letters that are visually/semantically interchangeable across Urdu & Arabic. */
const LETTER_FOLD: Record<string, string> = {
  // ya forms → Farsi/Urdu ya
  "ي": "ی", // ي Arabic ya
  "ى": "ی", // ى alef maqsura
  "ے": "ی", // ے bari ye
  "ۓ": "ی", // ۓ bari ye with hamza
  // kaf forms → Urdu kaf
  "ك": "ک", // ك Arabic kaf
  // ha forms → Urdu ha
  "ه": "ہ", // ه Arabic ha
  "ۃ": "ہ", // ۃ ta marbuta goal
  "ة": "ہ", // ة ta marbuta
  // alef forms → bare alef
  "آ": "ا", // آ
  "أ": "ا", // أ
  "إ": "ا", // إ
  "ٱ": "ا", // ٱ
  // hamza carriers → bare hamza
  "ؤ": "ء", // ؤ
  "ئ": "ء", // ئ
};

/** Arabic-Indic and extended Arabic-Indic digits → ASCII. */
function foldDigits(ch: string): string | null {
  const c = ch.codePointAt(0)!;
  if (c >= 0x0660 && c <= 0x0669) return String(c - 0x0660); // ٠-٩
  if (c >= 0x06f0 && c <= 0x06f9) return String(c - 0x06f0); // ۰-۹
  return null;
}

/**
 * Normalize one character for flexible matching.
 * Returns "" for characters that should be ignored entirely (diacritics, kashida).
 */
function foldChar(ch: string): string {
  if (DIACRITICS.test(ch)) {
    DIACRITICS.lastIndex = 0;
    return "";
  }
  DIACRITICS.lastIndex = 0;
  if (ch === "ـ") return ""; // tatweel
  const digit = foldDigits(ch);
  if (digit !== null) return digit;
  return LETTER_FOLD[ch] ?? ch;
}

/**
 * Build a folded string plus a map from each folded index back to the index in
 * the original string. The map is what lets us report real offsets even though
 * we matched against a string of a different length.
 */
function fold(text: string, flexible: boolean): { folded: string; map: number[] } {
  if (!flexible) {
    // Identity map — every folded index is its own source index.
    return { folded: text, map: text.split("").map((_, i) => i) };
  }
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const out = foldChar(text[i]);
    for (let k = 0; k < out.length; k++) {
      folded += out[k];
      map.push(i);
    }
  }
  // Sentinel so a match ending at the very end resolves to text.length.
  map.push(text.length);
  return { folded, map };
}

export interface SearchOptions {
  /** Ignore diacritics, kashida, and fold ya/kaf/ha/alef variants + digits. */
  flexible: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export const DEFAULT_OPTIONS: SearchOptions = {
  flexible: true,
  caseSensitive: false,
  wholeWord: false,
};

/** Word-ish character test that treats Arabic-script letters as word chars. */
function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[\p{L}\p{N}؀-ۿݐ-ݿ]/u.test(ch);
}

/** Find every occurrence of `needle` in `haystack`, returning source offsets. */
export function findInText(
  haystack: string,
  needle: string,
  opts: SearchOptions
): Array<{ start: number; end: number }> {
  if (!needle) return [];

  const h = fold(haystack, opts.flexible);
  const n = fold(needle, opts.flexible);
  let hay = h.folded;
  let pin = n.folded;
  if (!pin) return [];
  if (!opts.caseSensitive) {
    hay = hay.toLowerCase();
    pin = pin.toLowerCase();
  }

  const out: Array<{ start: number; end: number }> = [];
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(pin, from);
    if (idx === -1) break;

    const start = h.map[idx];
    const end = h.map[idx + pin.length];

    if (opts.wholeWord) {
      const before = start > 0 ? haystack[start - 1] : undefined;
      const after = end < haystack.length ? haystack[end] : undefined;
      if (isWordChar(before) || isWordChar(after)) {
        from = idx + 1;
        continue;
      }
    }

    out.push({ start, end });
    // Advance past this match; +1 guards against a zero-width fold result.
    from = idx + Math.max(1, pin.length);
  }
  return out;
}

/** Search every frame of every page, in document order. */
export function findAll(query: string, opts: SearchOptions): Match[] {
  if (!query) return [];
  const { pages } = useDoc.getState();
  const matches: Match[] = [];
  for (const page of pages) {
    for (const frame of page.frames) {
      if (frame.kind && frame.kind !== "text") continue;
      for (const m of findInText(frame.text, query, opts)) {
        matches.push({
          pageId: page.id,
          frameId: frame.id,
          start: m.start,
          end: m.end,
          text: frame.text.slice(m.start, m.end),
        });
      }
    }
  }
  return matches;
}

/** Replace a single match with `replacement`. Returns true if it applied. */
export function replaceOne(match: Match, replacement: string): boolean {
  const { pages, setFrameContent } = useDoc.getState();
  const frame = pages
    .find((p) => p.id === match.pageId)
    ?.frames.find((f) => f.id === match.frameId);
  if (!frame) return false;
  // Guard against a stale match (the text changed since the search ran).
  if (frame.text.slice(match.start, match.end) !== match.text) return false;

  const next =
    frame.text.slice(0, match.start) + replacement + frame.text.slice(match.end);
  setFrameContent(match.pageId, match.frameId, next, "replace");
  return true;
}

/**
 * Replace every occurrence across the document.
 *
 * Frames are processed one at a time and matches within a frame are applied
 * right-to-left, so earlier offsets stay valid as the string length changes.
 * Returns the number of replacements made.
 */
export function replaceAll(query: string, replacement: string, opts: SearchOptions): number {
  if (!query) return 0;
  const { pages, setFrameContent } = useDoc.getState();
  let count = 0;

  for (const page of pages) {
    for (const frame of page.frames) {
      if (frame.kind && frame.kind !== "text") continue;
      const hits = findInText(frame.text, query, opts);
      if (hits.length === 0) continue;

      let text = frame.text;
      for (let i = hits.length - 1; i >= 0; i--) {
        const { start, end } = hits[i];
        text = text.slice(0, start) + replacement + text.slice(end);
      }
      setFrameContent(page.id, frame.id, text, "replace");
      count += hits.length;
    }
  }
  return count;
}

// ── UI state ────────────────────────────────────────────────────────────────

interface SearchState {
  open: boolean;
  query: string;
  replacement: string;
  options: SearchOptions;
  matches: Match[];
  /** Index into `matches` of the currently highlighted hit. */
  current: number;

  setOpen: (v: boolean) => void;
  setQuery: (q: string) => void;
  setReplacement: (r: string) => void;
  setOption: <K extends keyof SearchOptions>(key: K, value: SearchOptions[K]) => void;
  /** Re-run the search against current document state. */
  refresh: () => void;
  next: () => void;
  prev: () => void;
}

export const useSearch = create<SearchState>((set, get) => {
  /** Re-run the search, keeping the cursor near where it was. */
  const recompute = (query: string, options: SearchOptions, keepIndex = 0) => {
    const matches = findAll(query, options);
    const current = matches.length === 0 ? 0 : Math.min(keepIndex, matches.length - 1);
    // Selecting the frame lets the user see where the hit is.
    const hit = matches[current];
    if (hit) {
      useDoc.getState().setActivePage(hit.pageId);
      useDoc.getState().selectFrame(hit.frameId);
    }
    set({ matches, current });
  };

  return {
    open: false,
    query: "",
    replacement: "",
    options: DEFAULT_OPTIONS,
    matches: [],
    current: 0,

    setOpen: (v) => {
      set({ open: v });
      if (v) recompute(get().query, get().options, get().current);
      else set({ matches: [] });
    },
    setQuery: (q) => {
      set({ query: q });
      recompute(q, get().options, 0);
    },
    setReplacement: (r) => set({ replacement: r }),
    setOption: (key, value) => {
      const options = { ...get().options, [key]: value };
      set({ options });
      recompute(get().query, options, 0);
    },
    refresh: () => recompute(get().query, get().options, get().current),

    next: () => {
      const { matches, current } = get();
      if (matches.length === 0) return;
      const idx = (current + 1) % matches.length;
      const hit = matches[idx];
      useDoc.getState().setActivePage(hit.pageId);
      useDoc.getState().selectFrame(hit.frameId);
      set({ current: idx });
    },
    prev: () => {
      const { matches, current } = get();
      if (matches.length === 0) return;
      const idx = (current - 1 + matches.length) % matches.length;
      const hit = matches[idx];
      useDoc.getState().setActivePage(hit.pageId);
      useDoc.getState().selectFrame(hit.frameId);
      set({ current: idx });
    },
  };
});

// PDF import: turn a PDF's text layer into Qalam pages of positioned text frames.
//
// Each PDF page becomes a Qalam page of the same size, and each paragraph-like
// block of text becomes a text frame at its original position, size and
// (approximate) font size — so a book keeps its page structure without needing
// page-to-page text flow. Pages with no text layer (scans) are placed as a
// full-page image frame and counted, so the UI can suggest OCR.
//
// ── Why Arabic-script PDFs need care ────────────────────────────────────────
// PDF stores glyphs, not text. Arabic/Urdu PDFs commonly map glyphs back to the
// Unicode *Presentation Forms* blocks (U+FB50–FDFF, U+FE70–FEFF): contextual
// shapes like ﺑ rather than the letter ب. Left as-is, search, AI and shaping all
// break, so every string is NFKC-normalised back to the base U+06xx letters.
// Glyph order is another trap: content streams are visual (left-to-right on the
// page). pdf.js runs the bidi algorithm per item to give logical order, but the
// ORDER OF ITEMS within a line is still visual, so RTL lines are assembled from
// the rightmost item to the leftmost.

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Page, TextFrame } from "./store";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** PDF points → CSS px at 96 dpi (Qalam's page unit). */
const PT_TO_PX = 96 / 72;

export interface PdfImportResult {
  pages: Page[];
  /** Pages that had no text layer and were imported as images. */
  scannedPages: number;
  textPages: number;
}

export interface PdfImportOptions {
  onProgress?: (done: number, total: number) => void;
  /** Rasterise text-less pages as images (default true). */
  rasterizeScans?: boolean;
}

interface Item {
  str: string;
  x: number; // left, px
  y: number; // baseline from top, px
  w: number;
  size: number; // font size px
  rtl: boolean;
}

interface Line {
  items: Item[];
  y: number;
  size: number;
  left: number;
  right: number;
  text: string;
  rtl: boolean;
}

/** Fold presentation forms (and compatibility ligatures) to base letters. */
function normalizeArabic(s: string): string {
  // NFKC maps ﺑ→ب, ﻻ→لا, ﷲ→الله etc. Zero-width joiners left by some
  // producers are noise for us.
  return s.normalize("NFKC").replace(/[​-‏‪-‮⁦-⁩]/g, "");
}

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
/** Letters that only exist in Urdu (not Arabic): ے ٹ ڈ ڑ ں ھ ہ گ ک(ک is shared with Persian) */
const URDU_RE = /[ےٹڈڑںھہ]/;
const PERSIAN_RE = /[پچژگ]/; // پ چ ژ گ

/**
 * Fold Arabic-only letter forms into their Urdu/Persian equivalents.
 *
 * PDF producers routinely emit the medial/initial forms of Farsi yeh (ی) and
 * keheh (ک) using the *Arabic* yeh/kaf glyphs — they look identical in those
 * positions — so after NFKC the text reads ٹيسٹ instead of ٹیسٹ. Neither ي nor
 * ك exists in Urdu or Persian orthography, so for blocks classified as those
 * languages the fold is lossless; Arabic blocks are left untouched.
 */
function foldToUrduLetters(s: string): string {
  return s.replace(/\u064A/g, "\u06CC").replace(/\u0643/g, "\u06A9");
}

/** Pick language + font for a block from its letters. */
function classify(text: string): { lang: TextFrame["lang"]; fontKey: string; dir: "rtl" | "ltr" } {
  if (!ARABIC_RE.test(text)) return { lang: "en", fontKey: "rubik", dir: "ltr" };
  if (URDU_RE.test(text)) return { lang: "ur", fontKey: "noto-nastaliq", dir: "rtl" };
  if (PERSIAN_RE.test(text)) return { lang: "fa", fontKey: "vazirmatn", dir: "rtl" };
  return { lang: "ar", fontKey: "noto-naskh", dir: "rtl" };
}

/** Group positioned items into lines by baseline, then lines into blocks. */
function buildLines(items: Item[]): Line[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    // Same line if the baselines are within half a font size of each other.
    if (last && Math.abs(last.y - it.y) <= Math.max(last.size, it.size) * 0.5) {
      last.items.push(it);
      last.size = Math.max(last.size, it.size);
    } else {
      lines.push({ items: [it], y: it.y, size: it.size, left: 0, right: 0, text: "", rtl: false });
    }
  }
  for (const ln of lines) {
    const rtlCount = ln.items.filter((i) => i.rtl).length;
    ln.rtl = rtlCount * 2 >= ln.items.length;
    // Visual → logical: RTL lines read from the rightmost item leftwards.
    ln.items.sort((a, b) => (ln.rtl ? b.x + b.w - (a.x + a.w) : a.x - b.x));
    ln.left = Math.min(...ln.items.map((i) => i.x));
    ln.right = Math.max(...ln.items.map((i) => i.x + i.w));
    ln.text = ln.items
      .map((i) => i.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return lines.filter((l) => l.text.length > 0);
}

interface Block {
  lines: Line[];
}

/** Merge consecutive lines into paragraph blocks by vertical gap + overlap. */
function buildBlocks(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  for (const ln of lines) {
    const b = blocks[blocks.length - 1];
    const prev = b?.lines[b.lines.length - 1];
    if (prev) {
      const gap = ln.y - prev.y;
      const overlap = Math.min(prev.right, ln.right) - Math.max(prev.left, ln.left);
      const sameBlock = gap > 0 && gap <= Math.max(prev.size, ln.size) * 2.1 && overlap > 0;
      if (sameBlock) {
        b.lines.push(ln);
        continue;
      }
    }
    blocks.push({ lines: [ln] });
  }
  return blocks;
}

let idSeq = 0;
const nid = (p: string) => `${p}-imp-${++idSeq}`;

function frameFromBlock(block: Block, pageW: number): TextFrame {
  const lines = block.lines;
  const size = median(lines.map((l) => l.size));
  const left = Math.min(...lines.map((l) => l.left));
  const right = Math.max(...lines.map((l) => l.right));
  // Ascent ≈ 0.8em above the baseline; leave room below the last baseline too.
  const top = lines[0].y - size * 1.0;
  const bottom = lines[lines.length - 1].y + size * 0.6;
  let text = lines.map((l) => l.text).join("\n");
  const cls = classify(text);
  if (cls.lang === "ur" || cls.lang === "fa") text = foldToUrduLetters(text);
  // Nastaliq needs generous leading; keep the frame tall enough for it.
  const lineHeight = cls.lang === "ur" ? 1.7 : 1.5;
  const naturalHeight = lines.length * size * lineHeight + size;

  return {
    id: nid("frame"),
    kind: "text",
    x: Math.max(0, left - 12),
    y: Math.max(0, top),
    width: Math.min(pageW, right - left + 24),
    height: Math.max(bottom - top, naturalHeight),
    text,
    html: "",
    fontSize: Math.max(8, Math.round(size)),
    fontKey: cls.fontKey,
    lang: cls.lang,
    dir: cls.dir,
    bold: false,
    italic: false,
    underline: false,
    align: cls.dir === "rtl" ? "right" : "left",
    color: "#1a1714",
    lineHeight,
    letterSpacing: 0,
    fill: "transparent",
    borderWidth: 0,
    borderColor: "#e3dccf",
    isPageFrame: false,
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 16;
}

function imageFrame(src: string, w: number, h: number): TextFrame {
  return {
    id: nid("frame"),
    kind: "image",
    x: 0,
    y: 0,
    width: w,
    height: h,
    text: "",
    src,
    fit: "contain",
    fontSize: 32,
    fontKey: "noto-nastaliq",
    lang: "ur",
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
    isPageFrame: false,
  };
}

/** Import a PDF's bytes into Qalam pages. */
export async function importPdfBytes(
  data: Uint8Array,
  opts: PdfImportOptions = {}
): Promise<PdfImportResult> {
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const pdf = await task.promise;
  const pages: Page[] = [];
  let scannedPages = 0;
  let textPages = 0;

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: PT_TO_PX });
    const pageW = Math.round(vp.width);
    const pageH = Math.round(vp.height);

    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const [a, b, c, d, e, f] = raw.transform as number[];
      // Font size = vertical scale of the text matrix (handles rotation loosely).
      const size = Math.hypot(c, d) * PT_TO_PX || Math.hypot(a, b) * PT_TO_PX;
      const x = e * PT_TO_PX;
      const y = pageH - f * PT_TO_PX; // PDF is y-up; Qalam is y-down
      items.push({
        str: normalizeArabic(raw.str),
        x,
        y,
        w: (raw.width || 0) * PT_TO_PX,
        size: size || 16,
        rtl: raw.dir === "rtl",
      });
    }

    const frames: TextFrame[] = [];
    if (items.length > 0) {
      textPages++;
      const blocks = buildBlocks(buildLines(items));
      for (const bl of blocks) frames.push(frameFromBlock(bl, pageW));
    } else {
      scannedPages++;
      if (opts.rasterizeScans !== false) {
        const canvas = document.createElement("canvas");
        canvas.width = pageW;
        canvas.height = pageH;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          frames.push(imageFrame(canvas.toDataURL("image/jpeg", 0.82), pageW, pageH));
        }
      }
    }

    pages.push({ id: nid("page"), width: pageW, height: pageH, frames });
    page.cleanup();
    opts.onProgress?.(n, pdf.numPages);
  }

  await task.destroy();
  return { pages, scannedPages, textPages };
}

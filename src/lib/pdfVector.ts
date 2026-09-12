// True vector PDF export.
//
// The raster path (see pdf.ts) screenshots each page with html2canvas and embeds
// a JPEG, which loses selectable text, scales badly, and bloats the file. This
// module instead asks the Rust shaper for the real glyph outlines and draws them
// into the PDF as filled paths, so the output is resolution-independent —
// what a printer or publisher actually needs.
//
// ── Why outlines rather than embedded fonts + text ──────────────────────────
// The "proper" alternative is embedding the TTF and emitting text-showing
// operators. For Nastaliq that requires writing the shaped GLYPH IDS (not the
// characters) with a correct CID mapping, because the whole point of the shaper
// is that one character maps to a context-dependent glyph. jsPDF cannot express
// that. Outlines sidestep it entirely and are exactly what the page will look
// like. The trade-off — the text is no longer selectable in a PDF reader — is
// noted in the caller's UI.

import jsPDF from "jspdf";
import { writeFile } from "@tauri-apps/plugin-fs";
import { tempDir, join } from "@tauri-apps/api/path";
import { layoutText, RenderLayout } from "./tauri";
import { loadFontBytes } from "./font";
import { useDoc, Page, TextFrame } from "./store";

/** 1px @96dpi = 0.75pt. */
const PX_TO_PT = 0.75;

/** One parsed SVG path command with absolute coordinates. */
type PathOp =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "Q"; x1: number; y1: number; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

/**
 * Parse the SVG path subset our Rust `SvgOutline` emits: absolute M, L, Q, C, Z
 * with space-separated numbers. Deliberately not a general SVG parser — it only
 * has to read what shaping.rs writes.
 */
export function parsePath(d: string): PathOp[] {
  const ops: PathOp[] = [];
  // Split into command chunks: a letter followed by its numbers.
  const re = /([MLQCZ])([^MLQCZ]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1].toUpperCase();
    if (cmd === "Z") {
      ops.push({ op: "Z" });
      continue;
    }
    const nums = m[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (nums.some((n) => !Number.isFinite(n))) continue;

    if (cmd === "M" || cmd === "L") {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        ops.push({ op: cmd, x: nums[i], y: nums[i + 1] });
      }
    } else if (cmd === "Q") {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        ops.push({ op: "Q", x1: nums[i], y1: nums[i + 1], x: nums[i + 2], y: nums[i + 3] });
      }
    } else if (cmd === "C") {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        ops.push({
          op: "C",
          x1: nums[i], y1: nums[i + 1],
          x2: nums[i + 2], y2: nums[i + 3],
          x: nums[i + 4], y: nums[i + 5],
        });
      }
    }
  }
  return ops;
}

/** Convert a quadratic Bézier to the cubic form jsPDF's path API takes. */
function quadToCubic(
  px: number, py: number,
  x1: number, y1: number,
  x: number, y: number
): { x1: number; y1: number; x2: number; y2: number; x: number; y: number } {
  return {
    x1: px + (2 / 3) * (x1 - px),
    y1: py + (2 / 3) * (y1 - py),
    x2: x + (2 / 3) * (x1 - x),
    y2: y + (2 / 3) * (y1 - y),
    x, y,
  };
}

/**
 * Draw one glyph outline into the PDF at (offsetX, offsetY) page-pt.
 *
 * Coordinates arrive in page px with y already flipped for screen (y-down), and
 * jsPDF's default user space is also y-down from the top-left, so we only scale.
 */
function drawGlyphPath(
  doc: jsPDF,
  d: string,
  offsetXPt: number,
  offsetYPt: number
): void {
  const ops = parsePath(d);
  if (ops.length === 0) return;

  const X = (v: number) => offsetXPt + v * PX_TO_PT;
  const Y = (v: number) => offsetYPt + v * PX_TO_PT;

  // Current point, tracked in SOURCE px (needed to convert quadratics).
  let cx = 0;
  let cy = 0;
  let started = false;

  for (const o of ops) {
    switch (o.op) {
      case "M":
        // jsPDF's path builder: moveTo starts a new subpath.
        doc.moveTo(X(o.x), Y(o.y));
        cx = o.x; cy = o.y;
        started = true;
        break;
      case "L":
        if (!started) break;
        doc.lineTo(X(o.x), Y(o.y));
        cx = o.x; cy = o.y;
        break;
      case "Q": {
        if (!started) break;
        const c = quadToCubic(cx, cy, o.x1, o.y1, o.x, o.y);
        doc.curveTo(X(c.x1), Y(c.y1), X(c.x2), Y(c.y2), X(c.x), Y(c.y));
        cx = o.x; cy = o.y;
        break;
      }
      case "C":
        if (!started) break;
        doc.curveTo(X(o.x1), Y(o.y1), X(o.x2), Y(o.y2), X(o.x), Y(o.y));
        cx = o.x; cy = o.y;
        break;
      case "Z":
        doc.close();
        break;
    }
  }
}

/** Parse a CSS hex/rgb colour into 0-255 components; falls back to black. */
function parseColor(c: string | undefined): [number, number, number] {
  if (!c) return [0, 0, 0];
  const hex = c.trim();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (m3) {
    return [
      parseInt(m3[1] + m3[1], 16),
      parseInt(m3[2] + m3[2], 16),
      parseInt(m3[3] + m3[3], 16),
    ];
  }
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m6) {
    return [parseInt(m6[1], 16), parseInt(m6[2], 16), parseInt(m6[3], 16)];
  }
  const rgb = /rgba?\(([^)]+)\)/i.exec(hex);
  if (rgb) {
    const parts = rgb[1].split(",").map((p) => parseFloat(p.trim()));
    if (parts.length >= 3 && parts.every((p) => Number.isFinite(p))) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  return [0, 0, 0];
}

/** Draw a shape frame (rect/ellipse/line/…) into the PDF. */
function drawShape(doc: jsPDF, frame: TextFrame): void {
  const x = frame.x * PX_TO_PT;
  const y = frame.y * PX_TO_PT;
  const w = frame.width * PX_TO_PT;
  const h = frame.height * PX_TO_PT;

  const hasFill = !!frame.fill && frame.fill !== "transparent";
  const hasStroke = frame.borderWidth > 0;
  if (!hasFill && !hasStroke) return;

  if (hasFill) doc.setFillColor(...parseColor(frame.fill));
  if (hasStroke) {
    doc.setDrawColor(...parseColor(frame.borderColor));
    doc.setLineWidth(frame.borderWidth * PX_TO_PT);
  }
  const style = hasFill && hasStroke ? "FD" : hasFill ? "F" : "S";

  switch (frame.shape) {
    case "ellipse":
      doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, style);
      break;
    case "line":
      doc.setDrawColor(...parseColor(hasFill ? frame.fill : frame.borderColor));
      doc.setLineWidth(Math.max(frame.borderWidth, 1) * PX_TO_PT);
      doc.line(x, y + h / 2, x + w, y + h / 2);
      break;
    case "rounded":
      doc.roundedRect(x, y, w, h, 6 * PX_TO_PT, 6 * PX_TO_PT, style);
      break;
    case "triangle":
      doc.triangle(x + w / 2, y, x, y + h, x + w, y + h, style);
      break;
    default:
      doc.rect(x, y, w, h, style);
      break;
  }
}

/** Draw an image frame from its data URL. */
function drawImage(doc: jsPDF, frame: TextFrame): void {
  if (!frame.src) return;
  const fmt = /^data:image\/(png|jpe?g|webp)/i.exec(frame.src)?.[1]?.toUpperCase();
  if (!fmt) return; // unsupported embedded format — skip rather than corrupt
  try {
    doc.addImage(
      frame.src,
      fmt === "JPG" ? "JPEG" : fmt,
      frame.x * PX_TO_PT,
      frame.y * PX_TO_PT,
      frame.width * PX_TO_PT,
      frame.height * PX_TO_PT
    );
  } catch {
    // A single bad image must not abort the whole export.
  }
}

/** Lay out one text frame via the Rust shaper and draw its glyph outlines. */
async function drawTextFrame(doc: jsPDF, frame: TextFrame): Promise<void> {
  if (!frame.text.trim()) return;

  let layout: RenderLayout;
  try {
    const font = await loadFontBytes(frame.fontKey);
    layout = await layoutText(frame.text, font, frame.fontSize, frame.width, frame.align);
  } catch {
    return; // shaping failed for this frame — leave it blank rather than fail all
  }

  doc.setFillColor(...parseColor(frame.color));

  // Glyph paths are in frame-local px; offset by the frame's page position.
  const offX = frame.x * PX_TO_PT;
  const offY = frame.y * PX_TO_PT;

  for (const line of layout.lines) {
    for (const g of line.glyphs) {
      if (!g.path) continue;
      drawGlyphPath(doc, g.path, offX, offY);
      // Fill with the non-zero winding rule; glyph contours rely on it for
      // counters (the holes in ہ, ط, ص) to come out white rather than filled.
      doc.fill();
    }
  }
}

/** Draw every frame of a page in document order. */
async function drawPage(doc: jsPDF, page: Page): Promise<void> {
  for (const frame of page.frames) {
    const kind = frame.kind ?? "text";
    // Frame background/border, for text frames that have one.
    if (kind === "text") {
      const hasFill = !!frame.fill && frame.fill !== "transparent";
      const hasStroke = frame.borderWidth > 0;
      if (hasFill || hasStroke) {
        if (hasFill) doc.setFillColor(...parseColor(frame.fill));
        if (hasStroke) {
          doc.setDrawColor(...parseColor(frame.borderColor));
          doc.setLineWidth(frame.borderWidth * PX_TO_PT);
        }
        doc.rect(
          frame.x * PX_TO_PT,
          frame.y * PX_TO_PT,
          frame.width * PX_TO_PT,
          frame.height * PX_TO_PT,
          hasFill && hasStroke ? "FD" : hasFill ? "F" : "S"
        );
      }
      await drawTextFrame(doc, frame);
    } else if (kind === "image") {
      drawImage(doc, frame);
    } else if (kind === "shape") {
      drawShape(doc, frame);
    }
  }
}

/**
 * Render the whole document to a true-vector PDF and write it to a temp file.
 * Returns the absolute path.
 */
export async function renderPagesToVectorPdf(): Promise<string> {
  const { pages } = useDoc.getState();
  if (pages.length === 0) throw new Error("No pages to export.");

  const first = pages[0];
  const wPt = first.width * PX_TO_PT;
  const hPt = first.height * PX_TO_PT;

  const doc = new jsPDF({
    orientation: wPt > hPt ? "landscape" : "portrait",
    unit: "pt",
    format: [wPt, hPt],
  });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (i > 0) {
      const pw = page.width * PX_TO_PT;
      const ph = page.height * PX_TO_PT;
      doc.addPage([pw, ph], pw > ph ? "landscape" : "portrait");
    }
    await drawPage(doc, page);
  }

  const bytes = doc.output("arraybuffer");
  const dir = await tempDir();
  const path = await join(dir, `harfsaz-vector-${Date.now()}.pdf`);
  await writeFile(path, new Uint8Array(bytes));
  return path;
}

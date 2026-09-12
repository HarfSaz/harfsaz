// File ▸ Import: bring PDF and InPage documents into Harfsaz.
//
// Both importers produce a fresh Harfsaz document (they never merge into the
// open one), guard unsaved changes like Open does, and report what they could
// and could not recover — import is lossy by nature and the user should know
// which kind of lossy.

import { open as openDialog, message } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useDoc, DocFile, Page, TextFrame } from "./store";
import { isTauri, importInpage } from "./tauri";
import { importPdfBytes } from "./importPdf";
import { pickFile } from "./download";

const A4 = { width: 794, height: 1123 };
const MARGIN = 40;

function baseName(path: string): string {
  const parts = path.split(/[/\\]/);
  return (parts[parts.length - 1] || "Imported").replace(/\.[^.]+$/, "");
}

function confirmDiscard(): boolean {
  const { dirty } = useDoc.getState();
  return !dirty || confirm("Discard unsaved changes and import a new document?");
}

let seq = 0;
const nid = (p: string) => `${p}-imp-${++seq}`;

/** A page-filling text frame, matching the store's default writing frame. */
function pageFrame(text: string, lang: TextFrame["lang"], fontKey: string, fontSize: number): TextFrame {
  return {
    id: nid("frame"),
    kind: "text",
    x: MARGIN,
    y: MARGIN,
    width: A4.width - MARGIN * 2,
    height: A4.height - MARGIN * 2,
    text,
    html: "",
    fontSize,
    fontKey,
    lang,
    dir: lang === "en" ? "ltr" : "rtl",
    bold: false,
    italic: false,
    underline: false,
    align: lang === "en" ? "left" : "right",
    color: "#1a1714",
    lineHeight: 1.7,
    letterSpacing: 0,
    fill: "transparent",
    borderWidth: 0,
    borderColor: "#e3dccf",
    isPageFrame: true,
  };
}

/**
 * Split paragraphs into A4 pages by a character budget.
 *
 * Harfsaz has no page-to-page text flow yet, so a long text must be paginated
 * at import time. The budget is derived from the default frame geometry at the
 * given font size (≈ lines × chars-per-line for Nastaliq metrics); it is an
 * approximation — pages may run slightly short or long until real flow lands.
 */
export function paginate(paragraphs: string[], fontSize: number): string[] {
  const frameW = A4.width - MARGIN * 2;
  const frameH = A4.height - MARGIN * 2;
  const lines = Math.floor(frameH / (fontSize * 1.7));
  const charsPerLine = Math.floor(frameW / (fontSize * 0.55));
  const budget = Math.max(200, lines * charsPerLine);

  const pages: string[] = [];
  let cur: string[] = [];
  let used = 0;

  const flush = () => {
    if (cur.length) pages.push(cur.join("\n"));
    cur = [];
    used = 0;
  };

  for (const p of paragraphs) {
    // Each paragraph costs its characters plus a partial line for the break.
    let para = p;
    while (para.length > budget) {
      // Split an over-long paragraph at a sentence end (۔ . ؟ !) near the budget.
      const cut = findCut(para, budget - used > 200 ? budget - used : budget);
      const head = para.slice(0, cut).trim();
      if (head) cur.push(head);
      flush();
      para = para.slice(cut).trim();
    }
    const cost = para.length + charsPerLine / 2;
    if (used + cost > budget && cur.length) flush();
    cur.push(para);
    used += cost;
  }
  flush();
  return pages.length ? pages : [""];
}

function findCut(s: string, at: number): number {
  const window = s.slice(0, Math.min(s.length, at));
  const m = Math.max(window.lastIndexOf("۔"), window.lastIndexOf("."), window.lastIndexOf("؟"), window.lastIndexOf("!"));
  if (m > at * 0.5) return m + 1;
  const sp = window.lastIndexOf(" ");
  return sp > at * 0.5 ? sp + 1 : at;
}

function load(pages: Page[], name: string) {
  const doc: DocFile = { version: 1, pages };
  useDoc.getState().loadDocument(doc, null, name);
  // It is unsaved new content: treat it as dirty so the close guard protects it.
  useDoc.setState({ dirty: true });
}

// ── InPage ──────────────────────────────────────────────────────────────────

/** Import an InPage .inp file into a new document. */
export async function importInpageDocument(): Promise<boolean> {
  if (!isTauri()) {
    alert("InPage (.inp) import runs in the desktop app — its Rust decoder reads the InPage record format. Download it from harfsaz.com/download.");
    return false;
  }
  if (!confirmDiscard()) return false;

  const picked = await openDialog({
    filters: [{ name: "InPage Document", extensions: ["inp"] }],
    multiple: false,
  });
  if (!picked || Array.isArray(picked)) return false;

  let result: { paragraphs: string[]; legacy_format: boolean };
  try {
    result = await importInpage(picked);
  } catch (e) {
    await message(String(e), { title: "Could not import InPage file", kind: "error" });
    return false;
  }

  const fontSize = 28;
  const texts = paginate(result.paragraphs, fontSize);
  const pages: Page[] = texts.map((t) => ({
    id: nid("page"),
    width: A4.width,
    height: A4.height,
    frames: [pageFrame(t, "ur", "noto-nastaliq", fontSize)],
  }));
  load(pages, baseName(picked));

  const words = result.paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  await message(
    `Imported ${result.paragraphs.length} paragraphs (${words.toLocaleString()} words) onto ${pages.length} pages.\n\n` +
      (result.legacy_format
        ? "Text was recovered from the InPage record format. Fonts, frames and page layout are not stored in a readable form and were not imported — the text has been paginated onto A4 pages."
        : "This file uses the newer InPage format, which can only be read heuristically; check the text carefully for missing passages."),
    { title: "InPage import", kind: "info" }
  );
  return true;
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/** Import a PDF into a new document (text layer → positioned frames). */
export async function importPdfDocument(
  onProgress?: (done: number, total: number) => void
): Promise<boolean> {
  if (!confirmDiscard()) return false;

  let picked: string;
  let bytes: Uint8Array;
  if (isTauri()) {
    const chosen = await openDialog({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      multiple: false,
    });
    if (!chosen || Array.isArray(chosen)) return false;
    picked = chosen;
    try {
      bytes = await readFile(picked);
    } catch (e) {
      await notify(`Could not read that file.\n\n${e}`, "Import PDF", "error");
      return false;
    }
  } else {
    // Browser: pdf.js runs client-side, so PDF import works in the web editor too.
    const file = await pickFile("application/pdf,.pdf");
    if (!file) return false;
    picked = file.name;
    bytes = new Uint8Array(await file.arrayBuffer());
  }

  let res;
  try {
    res = await importPdfBytes(bytes, { onProgress });
  } catch (e) {
    await notify(`Could not parse this PDF.\n\n${e}`, "Import PDF", "error");
    return false;
  }
  if (res.pages.length === 0) {
    await notify("The PDF has no pages.", "Import PDF", "warning");
    return false;
  }

  load(res.pages, baseName(picked));

  const parts = [`Imported ${res.pages.length} pages.`];
  if (res.textPages) parts.push(`${res.textPages} pages had a text layer and were placed as editable frames.`);
  if (res.scannedPages)
    parts.push(
      `${res.scannedPages} pages had no text (scanned images). They were placed as images — use Scan handwriting (OCR) on those pages to make the text editable.`
    );
  parts.push("Images and vector graphics inside text pages are not imported yet; fonts are approximated by script.");
  await notify(parts.join("\n\n"), "PDF import", "info");
  return true;
}

/** Native message box on desktop; alert() in the browser. */
async function notify(text: string, title: string, kind: "info" | "warning" | "error"): Promise<void> {
  if (isTauri()) await message(text, { title, kind });
  else alert(`${title}\n\n${text}`);
}

// Render the document's pages to a PDF and save to a temp file (for printing or
// export). We rasterize each .page element with html2canvas-pro (which supports
// modern color functions) and place it into a jsPDF page at the right size.
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { writeFile } from "@tauri-apps/plugin-fs";
import { tempDir, join } from "@tauri-apps/api/path";
import { ensureAllDocumentFonts } from "./font";
import { useDoc } from "./store";
import { isTauri } from "./tauri";
import { downloadBytes } from "./download";

/** Generate a PDF from all .page elements and write it to a temp file.
 *  Returns the absolute file path — or, in the browser, downloads it and
 *  returns the file name. */
export async function renderPagesToPdfFile(opts: {
  pageWidthPx: number;
  pageHeightPx: number;
  orientation: "portrait" | "landscape";
}): Promise<string> {
  const pageEls = Array.from(document.querySelectorAll<HTMLElement>(".page"));
  if (pageEls.length === 0) throw new Error("No pages to print.");

  // html2canvas clones the DOM and paints immediately, so any @font-face that is
  // not already loaded rasterizes as fallback serif — losing Nastaliq entirely
  // while the export still "succeeds". A font only gets registered when a frame
  // using it mounts, so changing the font in the toolbar and exporting straight
  // away would previously produce a generic-looking PDF. Register and await
  // every font the document actually uses before capturing.
  await ensureAllDocumentFonts(
    useDoc.getState().pages.flatMap((p) => p.frames.map((f) => f.fontKey))
  );

  // Editing chrome lives INSIDE .page (selection outline, resize grips, the move
  // grip, the ✕ delete button, the dashed margin guide), so html2canvas would
  // rasterize whatever happened to be selected straight into the PDF. Flag the
  // document as exporting for the duration of the capture; `.harfsaz-exporting`
  // hides all of it in CSS. Restored in `finally` so an error mid-render can
  // never leave the editor with its chrome permanently hidden.
  document.body.classList.add("harfsaz-exporting");
  let bytes: Uint8Array;
  try {
    bytes = await rasterizePages(pageEls, opts);
  } finally {
    document.body.classList.remove("harfsaz-exporting");
  }

  if (!isTauri()) {
    const name = `${useDoc.getState().fileName || "Untitled"}.pdf`;
    downloadBytes(name, bytes, "application/pdf");
    return name;
  }
  const dir = await tempDir();
  const path = await join(dir, `harfsaz-print-${Date.now()}.pdf`);
  await writeFile(path, bytes);
  return path;
}

/** Rasterize the given page elements into PDF bytes. */
async function rasterizePages(
  pageEls: HTMLElement[],
  opts: { pageWidthPx: number; pageHeightPx: number; orientation: "portrait" | "landscape" }
): Promise<Uint8Array> {

  // jsPDF works in pt; 1px @96dpi = 0.75pt.
  const pxToPt = (px: number) => px * 0.75;
  const wPt = pxToPt(opts.pageWidthPx);
  const hPt = pxToPt(opts.pageHeightPx);

  const doc = new jsPDF({
    orientation: opts.orientation,
    unit: "pt",
    format: [wPt, hPt],
  });

  for (let i = 0; i < pageEls.length; i++) {
    const canvas = await html2canvas(pageEls[i], {
      scale: 2, // crisp Nastaliq
      backgroundColor: "#ffffff",
      logging: false,
    });
    const img = canvas.toDataURL("image/jpeg", 0.95);
    if (i > 0) doc.addPage([wPt, hPt], opts.orientation);
    doc.addImage(img, "JPEG", 0, 0, wPt, hPt);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

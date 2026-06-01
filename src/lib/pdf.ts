// Render the document's pages to a PDF and save to a temp file (for printing or
// export). We rasterize each .page element with html2canvas-pro (which supports
// modern color functions) and place it into a jsPDF page at the right size.
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { writeFile } from "@tauri-apps/plugin-fs";
import { tempDir, join } from "@tauri-apps/api/path";

/** Generate a PDF from all .page elements and write it to a temp file.
 *  Returns the absolute file path. */
export async function renderPagesToPdfFile(opts: {
  pageWidthPx: number;
  pageHeightPx: number;
  orientation: "portrait" | "landscape";
}): Promise<string> {
  const pageEls = Array.from(document.querySelectorAll<HTMLElement>(".page"));
  if (pageEls.length === 0) throw new Error("No pages to print.");

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

  const bytes = doc.output("arraybuffer");
  const dir = await tempDir();
  const path = await join(dir, `qalam-print-${Date.now()}.pdf`);
  await writeFile(path, new Uint8Array(bytes));
  return path;
}

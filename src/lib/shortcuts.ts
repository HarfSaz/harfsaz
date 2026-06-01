// Global keyboard shortcuts + auto-save. Mounted once from App.
import { useEffect } from "react";
import { useDoc } from "./store";
import { useUi } from "./ui";
import { saveDocument, saveDocumentAs, openDocument, autoSave } from "./documents";

const AUTOSAVE_MS = 30_000;

/**
 * Wires application keyboard shortcuts (⌘/Ctrl based) and a periodic auto-save.
 *
 * Shortcuts:
 *   ⌘S save · ⇧⌘S save as · ⌘O open · ⌘N new page · ⌘P print
 *   ⌘Z undo · ⇧⌘Z / ⌘Y redo · ⌘+ / ⌘- / ⌘0 zoom in/out/fit
 *
 * Editing shortcuts (bold/italic/underline) are left to the contentEditable's
 * native handling so they apply to the selection.
 */
export function useShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const doc = useDoc.getState();
      const ui = useUi.getState();
      const key = e.key.toLowerCase();

      switch (key) {
        case "s":
          e.preventDefault();
          if (e.shiftKey) saveDocumentAs();
          else saveDocument();
          break;
        case "o":
          e.preventDefault();
          openDocument();
          break;
        case "n":
          e.preventDefault();
          doc.addPage();
          break;
        case "p":
          e.preventDefault();
          ui.setPrintOpen(true);
          break;
        case "z":
          e.preventDefault();
          if (e.shiftKey) doc.redo();
          else doc.undo();
          break;
        case "y":
          e.preventDefault();
          doc.redo();
          break;
        case "=":
        case "+":
          e.preventDefault();
          ui.zoomIn();
          break;
        case "-":
          e.preventDefault();
          ui.zoomOut();
          break;
        case "0":
          e.preventDefault();
          ui.fitZoom();
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Periodic auto-save (only writes when a file exists and there are changes).
  useEffect(() => {
    const id = setInterval(() => {
      autoSave().catch(() => {});
    }, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, []);
}

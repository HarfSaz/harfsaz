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
      const doc = useDoc.getState();
      const ui = useUi.getState();

      // Delete / Backspace removes the selected image/shape frame. We only block
      // it when the user is actively typing — i.e. focus is in an input/textarea,
      // or in a *text* frame's editor. Image/shape frames have no text editor, so
      // selecting one and pressing Delete always removes it (even though the page
      // frame's editor may still hold focus in the background).
      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = doc.getSelectedFrame();
        if (!sel || sel.frame.isPageFrame) return;

        const ae = document.activeElement as HTMLElement | null;
        const typingInForm = !!ae?.closest?.("input, textarea");
        // Editing THIS text frame? (only relevant for text frames)
        const editingThisText =
          sel.frame.kind === "text" && !!ae?.closest?.(".text-frame-edit");
        if (typingInForm || editingThisText) return;

        e.preventDefault();
        doc.removeFrame(sel.page.id, sel.frame.id);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
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
    // Capture phase so our undo/redo wins over the contentEditable's native undo
    // (which would otherwise revert DOM text out of sync with our history).
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Periodic auto-save (only writes when a file exists and there are changes).
  useEffect(() => {
    const id = setInterval(() => {
      autoSave().catch(() => {});
    }, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, []);
}

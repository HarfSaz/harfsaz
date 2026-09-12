// Global keyboard shortcuts + auto-save. Mounted once from App.
import { useEffect } from "react";
import { useDoc } from "./store";
import { useUi } from "./ui";
import { useSearch } from "./search";
import { ensureAllDocumentFonts } from "./font";
import {
  saveDocument,
  saveDocumentAs,
  openDocument,
  autoSave,
  newDocumentGuarded,
  installCloseGuard,
  writeRecovery,
  offerRecovery,
} from "./documents";

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
        case "f":
          // ⌘F opens find & replace. Handled here (capture phase) so it wins
          // over the webview's own find behaviour.
          e.preventDefault();
          useSearch.getState().setOpen(true);
          break;
        case "g":
          // ⌘G / ⇧⌘G steps through matches, matching platform convention.
          e.preventDefault();
          if (e.shiftKey) useSearch.getState().prev();
          else useSearch.getState().next();
          break;
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
          // ⌘⇧N is New document in the File menu; without the shift branch it
          // fell through and added a page instead.
          e.preventDefault();
          if (e.shiftKey) newDocumentGuarded();
          else doc.addPage();
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
  // autoSave records its own failures on the store (surfaced in the status bar),
  // so the catch here is only for unexpected throws, not for write errors.
  useEffect(() => {
    const id = setInterval(() => {
      autoSave().catch(() => {});
      // Mirror never-saved documents to the recovery file on the same tick;
      // it no-ops once the document has a real path.
      writeRecovery().catch(() => {});
    }, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, []);

  // Offer to restore work left behind by a crash. Runs once, on mount.
  useEffect(() => {
    offerRecovery().catch(() => {});
  }, []);

  // Keep every font the document references registered as a CSS @font-face.
  //
  // Faces were previously registered only by the frame that used them, when it
  // mounted. That left two holes: a font chosen from the toolbar was not
  // registered until a re-render, and opening a .harfsaz file whose frames use
  // fonts this session has never shown left them unregistered — in both cases
  // CSS silently falls back to serif, so Nastaliq is lost with no error.
  // Subscribing here covers the whole document, including after undo/redo/open.
  useEffect(() => {
    const sync = (pages: ReturnType<typeof useDoc.getState>["pages"]) => {
      ensureAllDocumentFonts(pages.flatMap((p) => p.frames.map((f) => f.fontKey))).catch(
        () => {}
      );
    };
    sync(useDoc.getState().pages);
    return useDoc.subscribe((s, prev) => {
      if (s.pages !== prev.pages) sync(s.pages);
    });
  }, []);

  // Confirm before the window closes over unsaved changes.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    installCloseGuard().then((fn) => {
      // The effect may have torn down while the listener was being installed.
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}

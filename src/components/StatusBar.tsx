import { ZoomIn, ZoomOut, Fit, Frame } from "./ui/icons";
import { useDoc, useSelectedFrame } from "../lib/store";
import { useUi } from "../lib/ui";
import { getLanguage } from "../lib/languages";

/** Bottom status bar — word count, page navigation, zoom (InPage-style). */
export function StatusBar() {
  const pages = useDoc((s) => s.pages);
  const activePageId = useDoc((s) => s.activePageId);
  const activeIndex = Math.max(0, pages.findIndex((p) => p.id === activePageId));

  // Save state — so a failed (or pending) write is never invisible.
  const dirty = useDoc((s) => s.dirty);
  const saveError = useDoc((s) => s.saveError);
  const fileName = useDoc((s) => s.fileName);
  const filePath = useDoc((s) => s.filePath);

  const zoom = useUi((s) => s.zoom);
  const zoomIn = useUi((s) => s.zoomIn);
  const zoomOut = useUi((s) => s.zoomOut);
  const fitZoom = useUi((s) => s.fitZoom);
  const toggleObjectBar = useUi((s) => s.toggleObjectBar);
  const phonetic = useUi((s) => s.phonetic);
  const setKeyboardHelpOpen = useUi((s) => s.setKeyboardHelpOpen);

  // Active keyboard = the selected frame's language.
  const sel = useSelectedFrame();
  const lang = getLanguage(sel?.frame.lang ?? "ur");
  const phoneticActive = phonetic && !!lang.phoneticMap;

  const words = pages
    .flatMap((p) => p.frames)
    .map((fr) => fr.text.trim())
    .filter(Boolean)
    .reduce((sum, t) => sum + t.split(/\s+/).length, 0);

  return (
    <footer className="flex items-center justify-between border-t border-line bg-paper px-4 py-1 text-[11px] text-ink-soft">
      <div className="flex items-center gap-4">
        <SaveStatus
          dirty={dirty}
          saveError={saveError}
          fileName={fileName}
          hasPath={!!filePath}
        />
        <button
          onClick={() => setKeyboardHelpOpen(true)}
          title="Show keyboard layout reference"
          className="rounded px-1 hover:bg-paper-edge"
        >
          ⌨ Keyboard:{" "}
          <span className="font-medium text-ink">
            {lang.nativeLabel} {lang.label}
          </span>
          {phoneticActive && <span className="text-accent-deep"> · phonetic</span>}
        </button>
        <span>
          Words: <span className="font-medium text-ink">{words}</span>
        </span>
        <span>
          Frames:{" "}
          <span className="font-medium text-ink">
            {pages.reduce((n, p) => n + p.frames.length, 0)}
          </span>
        </span>
        <button
          onClick={toggleObjectBar}
          title="Toggle frame bar"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-paper-edge"
        >
          <Frame size={13} /> Frame bar
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span>
          Page <span className="font-medium text-ink">{activeIndex + 1}</span> / {pages.length}
        </span>
        <span>A4</span>

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5">
          <button onClick={zoomOut} title="Zoom out" className="rounded p-1 hover:bg-paper-edge">
            <ZoomOut size={14} />
          </button>
          <button
            onClick={fitZoom}
            title="Fit"
            className="min-w-[44px] rounded px-1 py-0.5 text-center font-medium text-ink hover:bg-paper-edge"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} title="Zoom in" className="rounded p-1 hover:bg-paper-edge">
            <ZoomIn size={14} />
          </button>
          <button onClick={fitZoom} title="Fit to view" className="rounded p-1 hover:bg-paper-edge">
            <Fit size={14} />
          </button>
        </div>
      </div>
    </footer>
  );
}

/**
 * Document save state.
 *
 * A failed auto-save used to be completely invisible — the write rejected into a
 * swallowed promise and the user kept typing into a document that was not
 * reaching disk. This makes all three states legible: saved, unsaved, failed.
 */
function SaveStatus({
  dirty,
  saveError,
  fileName,
  hasPath,
}: {
  dirty: boolean;
  saveError: string | null;
  fileName: string;
  hasPath: boolean;
}) {
  if (saveError) {
    return (
      <span
        title={`Could not save this document:\n\n${saveError}\n\nUse File ▸ Save As to write it somewhere else.`}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-danger"
        style={{ background: "rgba(180, 45, 45, 0.10)" }}
      >
        ⚠ Not saved — click File ▸ Save As
      </span>
    );
  }
  return (
    <span title={hasPath ? fileName : "This document has never been saved"}>
      <span className="font-medium text-ink">{fileName}</span>
      {dirty ? (
        <span className="text-ink-soft"> · unsaved changes</span>
      ) : (
        <span className="text-ink-soft"> · saved</span>
      )}
    </span>
  );
}

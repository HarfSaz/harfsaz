import { ZoomIn, ZoomOut, Fit, Frame } from "./ui/icons";
import { useDoc, useSelectedFrame } from "../lib/store";
import { useUi } from "../lib/ui";
import { getLanguage } from "../lib/languages";

/** Bottom status bar — word count, page navigation, zoom (InPage-style). */
export function StatusBar() {
  const pages = useDoc((s) => s.pages);
  const activePageId = useDoc((s) => s.activePageId);
  const activeIndex = Math.max(0, pages.findIndex((p) => p.id === activePageId));

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

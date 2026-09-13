import { PageSetupDialog } from "./PageSetupDialog";
import { useUi } from "../lib/ui";
import { useSelectedFrame } from "../lib/store";
import { getLanguage } from "../lib/languages";

/** Document view and input mode, kept close to the page. */
export function ViewBar() {
  const mode = useUi((s) => s.viewMode);
  const setMode = useUi((s) => s.setViewMode);
  const phonetic = useUi((s) => s.phonetic);
  const togglePhonetic = useUi((s) => s.togglePhonetic);
  const sel = useSelectedFrame();
  const lang = getLanguage(sel?.frame.lang ?? "ur");

  return (
    <div className="view-bar flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 py-2">
      <div className="flex items-center gap-4">
        <PageSetupDialog />
        <span className="workspace-label text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Workspace</span>
        <div className="view-switch flex gap-1 rounded-md p-0.5" aria-label="Document view">
          <button aria-pressed={mode === "edit"} onClick={() => setMode("edit")} data-active={mode === "edit"}>Write</button>
          <button aria-pressed={mode === "preview"} onClick={() => setMode("preview")} data-active={mode === "preview"}>Print preview</button>
        </div>
      </div>
      {mode === "edit" && !!lang.phoneticMap && (
        <button onClick={togglePhonetic} aria-pressed={phonetic} title={`Type Roman letters to write in ${lang.label}`}
          className="input-mode flex items-center gap-2 text-xs text-ink-soft">
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${phonetic ? "bg-accent" : "bg-ink-soft/40"}`} />
          {lang.label} phonetic <span className="font-medium text-ink">{phonetic ? "On" : "Off"}</span>
        </button>
      )}
    </div>
  );
}

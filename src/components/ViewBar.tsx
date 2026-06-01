import { Export } from "./ui/icons";
import { useUi } from "../lib/ui";
import { useSelectedFrame } from "../lib/store";
import { getLanguage } from "../lib/languages";

/** Slim bar above the canvas: Edit / Print preview toggle + phonetic + print. */
export function ViewBar() {
  const mode = useUi((s) => s.viewMode);
  const setMode = useUi((s) => s.setViewMode);
  const phonetic = useUi((s) => s.phonetic);
  const togglePhonetic = useUi((s) => s.togglePhonetic);
  const setPrintOpen = useUi((s) => s.setPrintOpen);

  const sel = useSelectedFrame();
  const lang = getLanguage(sel?.frame.lang ?? "ur");
  const hasMap = !!lang.phoneticMap; // English has no transliteration

  return (
    <div className="flex items-center justify-center gap-2.5 border-b border-line bg-paper/70 px-4 py-2 backdrop-blur">
      {/* Edit / Preview segmented control */}
      <div className="flex items-center gap-0.5 rounded-lg border border-line bg-paper/60 p-0.5 shadow-sm">
        <button
          onClick={() => setMode("edit")}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            mode === "edit" ? "bg-accent text-white shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          Edit
        </button>
        <button
          onClick={() => setMode("preview")}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            mode === "preview" ? "bg-accent text-white shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          Print preview
        </button>
      </div>

      {mode === "edit" && hasMap && (
        <button
          onClick={togglePhonetic}
          title={`Type Roman letters, get ${lang.label}`}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${
            phonetic
              ? "border-accent bg-accent text-white"
              : "border-line bg-paper/60 text-ink-soft hover:text-ink"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${phonetic ? "bg-white" : "bg-ink-soft/40"}`} />
          {lang.nativeLabel} phonetic
        </button>
      )}

      <button
        onClick={() => setPrintOpen(true)}
        title="Print / document setup"
        className="flex items-center gap-1.5 rounded-lg border border-line bg-paper/60 px-3 py-1.5 text-xs font-medium text-ink-soft shadow-sm transition-colors hover:bg-surface hover:text-ink"
      >
        <Export size={13} /> Print
      </button>
    </div>
  );
}

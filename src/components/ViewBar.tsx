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
    <div className="flex items-center justify-center gap-3 border-b border-line bg-paper px-4 py-1.5">
      <div className="flex items-center overflow-hidden rounded-md border border-line">
        <button
          onClick={() => setMode("edit")}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            mode === "edit" ? "bg-accent text-white" : "text-ink hover:bg-paper-edge"
          }`}
        >
          Edit
        </button>
        <button
          onClick={() => setMode("preview")}
          className={`border-l border-line px-3 py-1 text-xs font-medium transition-colors ${
            mode === "preview" ? "bg-accent text-white" : "text-ink hover:bg-paper-edge"
          }`}
        >
          Print preview
        </button>
      </div>

      {mode === "edit" && hasMap && (
        <button
          onClick={togglePhonetic}
          title={`Type Roman letters, get ${lang.label}`}
          className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
            phonetic
              ? "border-accent bg-accent text-white"
              : "border-line text-ink hover:bg-paper-edge"
          }`}
        >
          {lang.nativeLabel} phonetic {phonetic ? "ON" : "OFF"}
        </button>
      )}

      <button
        onClick={() => setPrintOpen(true)}
        title="Print / document setup"
        className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1 text-xs font-medium text-ink hover:bg-paper-edge"
      >
        <Export size={13} /> Print
      </button>
    </div>
  );
}

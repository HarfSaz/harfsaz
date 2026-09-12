import * as Dialog from "@radix-ui/react-dialog";
import { XMark } from "./ui/icons";
import { useUi } from "../lib/ui";
import { useSelectedFrame } from "../lib/store";
import { getLanguage } from "../lib/languages";

/**
 * Keyboard reference overlay: a cheat-sheet of the active language's phonetic
 * keyboard — which Roman key produces which script letter. Driven directly by
 * the language's phoneticMap, grouped into digraphs (kh, sh…) and single keys.
 */
export function KeyboardHelp() {
  const open = useUi((s) => s.keyboardHelpOpen);
  const setOpen = useUi((s) => s.setKeyboardHelpOpen);
  const sel = useSelectedFrame();
  const lang = getLanguage(sel?.frame.lang ?? "ur");
  const map = lang.phoneticMap;

  const entries = map ? Object.entries(map) : [];
  const isLetter = (k: string) => /[a-z]/i.test(k);
  const isShift = (k: string) => k.length === 1 && k !== k.toLowerCase();
  const digraphs = entries.filter(([k]) => k.length > 1 && isLetter(k));
  const base = entries.filter(([k]) => k.length === 1 && isLetter(k) && !isShift(k));
  const shift = entries.filter(([k]) => isShift(k));
  const marks = entries.filter(([k]) => !isLetter(k)); // punctuation / harakat keys

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 animate-in fade-in-0" />
        <Dialog.Content
          dir="ltr"
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[640px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-harfsaz animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <Dialog.Title className="text-base font-semibold">
              Keyboard — {lang.nativeLabel} {lang.label}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-ink-soft hover:bg-paper-edge">
              <XMark size={18} />
            </Dialog.Close>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            {!map ? (
              <p className="text-sm text-ink-soft">
                {lang.label} types directly — no phonetic keyboard (Latin input).
              </p>
            ) : (
              <>
                <p className="mb-4 text-xs text-ink-soft">
                  Type the Roman key to get the {lang.label} letter. Hold{" "}
                  <kbd className="rounded border border-line px-1">Shift</kbd> for the second
                  layer (retroflex/alternate letters). Two-letter combos (kh, sh…) match first.
                </p>

                {digraphs.length > 0 && <KeySection title="Combinations" pairs={digraphs} />}
                <KeySection title="Letters (normal keys)" pairs={base} />
                {shift.length > 0 && (
                  <KeySection title="Shift layer (hold ⇧ Shift)" pairs={shift} />
                )}
                {marks.length > 0 && <KeySection title="Marks & punctuation" pairs={marks} />}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function KeySection({
  title,
  pairs,
}: {
  title: string;
  pairs: [string, string][];
}) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{title}</h3>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {pairs.map(([key, glyph]) => (
          <div
            key={key}
            className="flex flex-col items-center rounded-md border border-line py-1.5"
            title={`${key} → ${glyph}`}
          >
            <span
              className="font-nastaliq text-xl leading-none text-ink"
              dir="rtl"
              lang="ur"
            >
              {glyph}
            </span>
            <span className="mt-1 font-mono text-[11px] text-ink-soft">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

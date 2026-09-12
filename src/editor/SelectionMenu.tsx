import { useEffect, useRef, useState } from "react";
import { aiTransform, TransformAction, isTauri } from "../lib/tauri";
import { useUi } from "../lib/ui";

type Anchor = { x: number; y: number };

interface ActiveSel {
  range: Range;
  text: string;
  anchor: Anchor;
  lang: string;
}

const ACTIONS: { action: TransformAction; label: string; replaces: boolean }[] = [
  { action: "rephrase", label: "Rephrase", replaces: true },
  { action: "grammar", label: "Fix grammar", replaces: true },
  { action: "shorten", label: "Make shorter", replaces: true },
  { action: "expand", label: "Make longer", replaces: true },
  { action: "formal", label: "Formal tone", replaces: true },
  { action: "casual", label: "Casual tone", replaces: true },
  { action: "simplify", label: "Simplify", replaces: true },
  { action: "caption", label: "Make caption", replaces: true },
  { action: "define", label: "Meaning / define", replaces: false },
  { action: "translate_en", label: "Translate → English", replaces: true },
  { action: "translate_ur", label: "Translate → Urdu", replaces: true },
];

/**
 * Floating AI menu shown when text is selected inside a frame editor — and on
 * right-click (which replaces the browser's default menu). Offers quick AI
 * actions plus a custom prompt; results replace the selected text (or show a
 * read-only result for "define").
 */
export function SelectionMenu() {
  const [sel, setSel] = useState<ActiveSel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const setUpgradeOpen = useUi((s) => s.setUpgradeOpen);

  // Capture the current selection inside an editor as an ActiveSel.
  function captureSelection(): ActiveSel | null {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) return null;
    const range = s.getRangeAt(0);
    const host = (range.commonAncestorContainer as HTMLElement).parentElement?.closest?.(
      ".text-frame-edit"
    ) ||
      (range.commonAncestorContainer as HTMLElement).closest?.(".text-frame-edit");
    if (!host) return null;
    const text = s.toString().trim();
    if (!text) return null;
    const rect = range.getBoundingClientRect();
    const lang = (host as HTMLElement).getAttribute("lang") || "ur";
    return { range: range.cloneRange(), text, anchor: { x: rect.left + rect.width / 2, y: rect.top }, lang };
  }

  // Show the menu on selection (mouseup) and on right-click.
  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      // Ignore clicks inside our own card.
      if (cardRef.current?.contains(e.target as Node)) return;
      const captured = captureSelection();
      if (captured) {
        setSel(captured);
        setResult(null);
        setError(null);
        setShowCustom(false);
      } else {
        setSel(null);
      }
    }
    function onContextMenu(e: MouseEvent) {
      const host = (e.target as HTMLElement).closest?.(".text-frame-edit");
      if (!host) return; // let the OS menu show outside editors
      e.preventDefault(); // suppress the browser default menu
      const captured = captureSelection();
      if (captured) {
        setSel({ ...captured, anchor: { x: e.clientX, y: e.clientY } });
        setResult(null);
        setError(null);
        setShowCustom(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSel(null);
    }
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function run(action: TransformAction, replaces: boolean, instruction?: string) {
    if (!sel) return;
    if (!isTauri()) {
      setError("AI runs in the desktop app.");
      return;
    }
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      const res = await aiTransform({ text: sel.text, action, instruction, lang: sel.lang });
      if (replaces) {
        applyToSelection(sel.range, res.output);
        setSel(null);
      } else {
        setResult(res.output); // e.g. "define" — show, don't replace
      }
    } catch (e) {
      const msg = String(e);
      setError(msg);
      if (/limit|quota|free/i.test(msg)) setUpgradeOpen(true);
    } finally {
      setBusy(null);
    }
  }

  if (!sel) return null;

  // Position the card near the selection, clamped to the viewport.
  const left = Math.min(Math.max(sel.anchor.x - 130, 8), window.innerWidth - 280);
  const top = Math.min(sel.anchor.y + 8, window.innerHeight - 360);

  return (
    <div
      ref={cardRef}
      className="fixed z-[60] w-[260px] rounded-xl border border-line bg-surface p-1.5 shadow-harfsaz"
      style={{ left, top }}
      dir="ltr"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-1.5 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          ✦ AI · {sel.text.length} chars
        </span>
        <button className="text-ink-soft hover:text-ink" onClick={() => setSel(null)}>✕</button>
      </div>

      {result !== null ? (
        <div className="px-1.5 pb-1.5">
          <div dir="auto" className="max-h-40 overflow-y-auto rounded-md bg-paper-edge p-2 text-sm text-ink">
            {result}
          </div>
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-paper-edge"
              onClick={() => navigator.clipboard.writeText(result)}
            >
              Copy
            </button>
            <button
              className="rounded-md bg-accent px-2.5 py-1 text-xs text-white hover:bg-accent-deep"
              onClick={() => { applyToSelection(sel.range, result); setSel(null); }}
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="max-h-64 overflow-y-auto">
            {ACTIONS.map((a) => (
              <button
                key={a.action}
                disabled={!!busy}
                onClick={() => run(a.action, a.replaces)}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-ink hover:bg-accent hover:text-white disabled:opacity-50"
              >
                {a.label}
                {busy === a.action && <span className="text-xs opacity-70">…</span>}
              </button>
            ))}
          </div>

          <div className="mt-1 border-t border-line pt-1">
            {showCustom ? (
              <div className="flex items-center gap-1 px-1 pb-1">
                <input
                  autoFocus
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && custom.trim()) run("custom", true, custom.trim());
                  }}
                  placeholder="Custom: e.g. make it a poem…"
                  className="flex-1 rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-accent"
                />
                <button
                  disabled={!custom.trim() || !!busy}
                  onClick={() => run("custom", true, custom.trim())}
                  className="rounded-md bg-accent px-2 py-1 text-xs text-white disabled:opacity-50"
                >
                  Go
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustom(true)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-accent-deep hover:bg-paper-edge"
              >
                ✏️ Custom prompt…
              </button>
            )}
          </div>
        </>
      )}

      {error && <p className="px-2 pb-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Replace the selected range's contents with `text`, then collapse the caret. */
function applyToSelection(range: Range, text: string) {
  const s = window.getSelection();
  if (!s) return;
  s.removeAllRanges();
  s.addRange(range);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  s.removeAllRanges();
  s.addRange(range);
  // Notify the editor to persist (its onInput fires on programmatic edits via
  // dispatching an input event on the host editor).
  const host =
    (node.parentElement?.closest?.(".text-frame-edit") as HTMLElement) || null;
  host?.dispatchEvent(new Event("input", { bubbles: true }));
}

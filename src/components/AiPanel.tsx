import { useEffect, useState } from "react";
import { CheckAll as CheckCheck, Sparkles } from "./ui/icons";
import { aiTask, aiKeyPresent, aiProofreadInline, aiAddDiacritics, AiTask } from "../lib/tauri";
import { useDoc, useSelectedFrame } from "../lib/store";
import { useSuggestions } from "../lib/suggestions";
import { getLanguage } from "../lib/languages";

/** Quick actions grouped by the AI capabilities (proofread is handled inline). */
const ACTIONS: { group: string; items: { label: string; task: AiTask }[] }[] = [
  {
    group: "Writing assistant",
    items: [
      { label: "Continue writing", task: { kind: "write", mode: "continue" } },
      { label: "Rephrase", task: { kind: "write", mode: "rephrase" } },
      { label: "Formal tone", task: { kind: "write", mode: "tone", tone: "formal / news" } },
      { label: "Poetic tone", task: { kind: "write", mode: "tone", tone: "poetic / literary" } },
    ],
  },
  {
    group: "Translate & transliterate",
    items: [
      { label: "English → Urdu", task: { kind: "translate", target: "urdu" } },
      { label: "Urdu → English", task: { kind: "translate", target: "english" } },
      { label: "Roman → Urdu script", task: { kind: "translate", target: "roman_to_urdu" } },
    ],
  },
  {
    group: "Layout / design",
    items: [
      { label: "Generate headline", task: { kind: "layout", mode: "headline" } },
      { label: "Generate caption", task: { kind: "layout", mode: "caption" } },
      { label: "Suggest layout", task: { kind: "layout", mode: "layout_suggest" } },
    ],
  },
];

export function AiPanel() {
  const sel = useSelectedFrame();
  const updateFrame = useDoc((s) => s.updateFrame);

  const setForFrame = useSuggestions((s) => s.setForFrame);
  const suggestionCount = useSuggestions(
    (s) => s.items.filter((i) => i.frameId === sel?.frame.id).length
  );

  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");
  const [instruction, setInstruction] = useState("");
  const [proofNote, setProofNote] = useState<string | null>(null);

  useEffect(() => {
    aiKeyPresent().then(setKeyOk).catch(() => setKeyOk(false));
  }, []);

  // Inline proofread: fetch span-level corrections and hand them to the frame
  // for non-destructive highlight + accept/reject (qalam.ai-style).
  async function proofread() {
    if (!sel) {
      setError("Select a text frame first.");
      return;
    }
    setProofBusy(true);
    setError(null);
    setProofNote(null);
    try {
      const res = await aiProofreadInline(sel.frame.text);
      setForFrame(sel.frame.id, sel.frame.text, res.corrections);
      setProofNote(
        res.corrections.length === 0
          ? "No errors found ✓"
          : `${res.corrections.length} suggestion(s) — review them in the frame.`
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setProofBusy(false);
    }
  }

  // Add diacritics/harakat (تشكيل) to the frame text via Claude. Available for
  // Arabic/Persian/Urdu (and their diacritized variants).
  const lang = sel ? getLanguage(sel.frame.lang) : null;
  const baseLang = lang ? (lang.base ?? lang.code) : "ur";
  const canDiacritize = ["ar", "fa", "ur"].includes(baseLang);

  async function addDiacritics() {
    if (!sel) {
      setError("Select a text frame first.");
      return;
    }
    setBusy(true);
    setError(null);
    setOutput("");
    try {
      const res = await aiAddDiacritics(sel.frame.text, baseLang);
      setOutput(res.output);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function run(task: AiTask) {
    if (!sel) {
      setError("Select a text frame first.");
      return;
    }
    setBusy(true);
    setError(null);
    setOutput("");
    try {
      const res = await aiTask({
        task,
        text: sel.frame.text,
        instruction: instruction.trim() || undefined,
      });
      setOutput(res.output);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function applyToFrame() {
    if (sel && output) {
      updateFrame(sel.page.id, sel.frame.id, { text: output });
    }
  }

  return (
    <aside className="ai-panel ai-panel--embedded" dir="ltr">
      <div className="ai-header pl-8">
        <h2>AI Assistant</h2>
        {keyOk === false && (
          <p className="ai-warn">
            No API key. Set <code>QALAM_ANTHROPIC_API_KEY</code> before launching.
          </p>
        )}
      </div>

      {/* Inline proofread — the marquee, non-destructive action (qalam.ai-style). */}
      <button
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-45"
        disabled={proofBusy || !sel}
        onClick={proofread}
      >
        {proofBusy ? (
          <>
            <Sparkles size={16} className="animate-pulse" /> Checking…
          </>
        ) : (
          <>
            <CheckCheck size={16} /> Proofread (inline)
          </>
        )}
      </button>
      {proofNote && (
        <p className="rounded-md bg-paper-edge px-3 py-2 text-xs text-ink-soft">
          {proofNote}
          {suggestionCount > 0 && (
            <span className="ml-1 font-medium text-accent-deep">
              {suggestionCount} pending.
            </span>
          )}
        </p>
      )}

      {/* Add diacritics / harakat (تشكيل) — Arabic/Persian/Urdu only. */}
      {canDiacritize && (
        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent px-3 py-2 text-sm font-medium text-accent-deep transition-colors hover:bg-paper-edge disabled:opacity-45"
          disabled={busy || !sel}
          onClick={addDiacritics}
          title="Add short-vowel marks for non-native readers"
        >
          Add diacritics · تشکیل
        </button>
      )}

      <textarea
        className="ai-instruction"
        placeholder="Optional instruction (e.g. 'make it shorter', 'in Punjabi')…"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={2}
      />

      <div className="ai-actions">
        {ACTIONS.map((g) => (
          <div key={g.group} className="ai-group">
            <h3>{g.group}</h3>
            <div className="ai-buttons">
              {g.items.map((it) => (
                <button
                  key={it.label}
                  disabled={busy || !sel}
                  onClick={() => run(it.task)}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {busy && <p className="ai-status">Thinking…</p>}
      {error && <p className="ai-error">{error}</p>}

      {output && (
        <div className="ai-output">
          <div className="ai-output-text" dir="rtl" lang="ur">
            {output}
          </div>
          <div className="ai-output-actions">
            <button onClick={applyToFrame}>Apply to frame</button>
            <button onClick={() => navigator.clipboard.writeText(output)}>Copy</button>
          </div>
        </div>
      )}
    </aside>
  );
}

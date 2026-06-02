import { useEffect, useState } from "react";
import { CheckAll as CheckCheck, Sparkles, Settings } from "./ui/icons";
import { aiTask, aiKeyPresent, aiProofreadInline, aiAddDiacritics, AiTask } from "../lib/tauri";
import { useDoc, useSelectedFrame } from "../lib/store";
import { useSuggestions } from "../lib/suggestions";
import { getLanguage } from "../lib/languages";
import { useUsage, FREE_DAILY_TOKENS } from "../lib/usage";
import { useUi } from "../lib/ui";

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

  // Daily free-tier meter.
  const plan = useUsage((s) => s.plan);
  const remaining = useUsage((s) => s.remaining());
  const canUse = useUsage((s) => s.canUse());
  const record = useUsage((s) => s.record);
  const rollDay = useUsage((s) => s.rollDay);
  const setUpgradeOpen = useUi((s) => s.setUpgradeOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const settingsOpen = useUi((s) => s.settingsOpen);
  useEffect(() => { rollDay(); }, [rollDay]);

  /** Gate an AI call: block at the daily cap, record tokens after success. */
  async function gated<T extends { tokens: number }>(fn: () => Promise<T>): Promise<T | null> {
    if (!canUse) {
      setUpgradeOpen(true);
      return null;
    }
    const res = await fn();
    record(res.tokens);
    return res;
  }

  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");
  const [instruction, setInstruction] = useState("");
  const [proofNote, setProofNote] = useState<string | null>(null);

  // Re-check key presence on mount AND whenever the Settings dialog closes, so
  // saving a key clears the "No API key" warning immediately (no restart).
  useEffect(() => {
    if (settingsOpen) return; // re-check once it closes
    aiKeyPresent().then(setKeyOk).catch(() => setKeyOk(false));
  }, [settingsOpen]);

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
      const res = await gated(() => aiProofreadInline(sel.frame.text));
      if (!res) return; // gated → upgrade modal shown
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
      const res = await gated(() => aiAddDiacritics(sel.frame.text, baseLang));
      if (res) setOutput(res.output);
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
      const res = await gated(() =>
        aiTask({
          task,
          text: sel.frame.text,
          instruction: instruction.trim() || undefined,
        })
      );
      if (res) setOutput(res.output);
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
        <div className="flex items-center justify-between">
          <h2>AI Assistant</h2>
          <button
            title="AI settings (provider & key)"
            className="rounded-md p-1 text-ink-soft hover:bg-paper-edge"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} />
          </button>
        </div>
        {keyOk === false && (
          <p className="ai-warn">
            No API key —{" "}
            <button className="underline" onClick={() => setSettingsOpen(true)}>
              open Settings
            </button>{" "}
            to add one.
          </p>
        )}
      </div>

      {/* Daily free-tier meter */}
      {plan === "free" ? (
        <div className="rounded-lg border border-line bg-paper px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-soft">Free AI today</span>
            <span className="font-medium text-ink">
              {remaining.toLocaleString()} / {FREE_DAILY_TOKENS.toLocaleString()} tokens
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-paper-edge">
            <div
              className={`h-full rounded-full ${remaining > 0 ? "bg-accent" : "bg-danger"}`}
              style={{ width: `${Math.max(0, Math.min(100, (remaining / FREE_DAILY_TOKENS) * 100))}%` }}
            />
          </div>
          <button
            className="mt-2 text-xs font-medium text-accent-deep hover:underline"
            onClick={() => setUpgradeOpen(true)}
          >
            {remaining > 0 ? "Upgrade for unlimited →" : "Daily limit reached — Upgrade →"}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-accent bg-paper px-3 py-1.5 text-xs font-medium text-accent-deep">
          ✦ {plan === "pro" ? "Pro — unlimited AI" : "Your own key — unlimited"}
        </div>
      )}

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

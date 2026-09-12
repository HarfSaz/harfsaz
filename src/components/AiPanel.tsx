import { useEffect, useRef, useState } from "react";
import { CheckAll as CheckCheck, Sparkles, Settings } from "./ui/icons";
import {
  aiChat,
  aiKeyPresent,
  aiProofreadInline,
  aiAddDiacritics,
  ChatMessage,
} from "../lib/tauri";
import { useDoc, useSelectedFrame } from "../lib/store";
import { useSuggestions } from "../lib/suggestions";
import { getLanguage } from "../lib/languages";
import { useUsage } from "../lib/usage";
import { useUi } from "../lib/ui";

// Quick prompts the user can fire on the selected frame's text (sent as chat).
const QUICK: { label: string; prompt: (text: string) => string }[] = [
  { label: "Continue", prompt: (t) => `Continue writing this naturally:\n\n${t}` },
  { label: "Rephrase", prompt: (t) => `Rephrase this:\n\n${t}` },
  { label: "Shorten", prompt: (t) => `Make this shorter:\n\n${t}` },
  { label: "Formal tone", prompt: (t) => `Rewrite this in a formal/news tone:\n\n${t}` },
  { label: "Poetic tone", prompt: (t) => `Rewrite this in a poetic/literary tone:\n\n${t}` },
  { label: "Headline", prompt: (t) => `Write a short, punchy headline for this:\n\n${t}` },
  { label: "Caption", prompt: (t) => `Write a concise caption for this:\n\n${t}` },
  { label: "→ English", prompt: (t) => `Translate this into natural English:\n\n${t}` },
  { label: "→ Urdu", prompt: (t) => `Translate this into natural Urdu (Nastaliq):\n\n${t}` },
];

interface UiMsg {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT =
  "You are Harfsaz's writing assistant — an expert multilingual writer and editor " +
  "for Urdu, Arabic, Persian and English. Respond in the language the user writes " +
  "in (or the language they ask for). Be concise. Return ONLY the requested text " +
  "with no preamble, no explanations, and no surrounding quotes.";

export function AiPanel() {
  const sel = useSelectedFrame();
  const setFrameContent = useDoc((s) => s.setFrameContent);

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
  const setPlan = useUsage((s) => s.setPlan);
  const setUpgradeOpen = useUi((s) => s.setUpgradeOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const setOcrOpen = useUi((s) => s.setOcrOpen);
  useEffect(() => {
    rollDay();
  }, [rollDay]);

  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [proofNote, setProofNote] = useState<string | null>(null);
  // The chat thread (conversation context). Persists for the session.
  const [messages, setMessages] = useState<UiMsg[]>([]);

  const threadRef = useRef<HTMLDivElement>(null);
  // Auto-scroll to the latest message.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Re-check key presence on mount and when Settings closes. A saved own-key
  // uncaps usage (BYOK) — the meter only protects a hosted/free tier.
  useEffect(() => {
    if (settingsOpen) return;
    aiKeyPresent()
      .then((ok) => {
        setKeyOk(ok);
        if (ok && plan === "free") setPlan("byok");
      })
      .catch(() => setKeyOk(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  /** Gate an AI call: block at the daily cap, record tokens after success. */
  async function gated<T extends { tokens: number }>(fn: () => Promise<T>): Promise<T | null> {
    if (!canUse) {
      setError("Daily free AI limit reached — upgrade or add your own key.");
      setUpgradeOpen(true);
      return null;
    }
    const res = await fn();
    record(res.tokens);
    return res;
  }

  /** Send a message (from the composer or a quick action) into the chat thread. */
  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setError(null);

    // Append the user's message and build the history we'll send.
    const history: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: prompt },
    ];
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    setBusy(true);
    try {
      const res = await gated(() => aiChat(history, SYSTEM_PROMPT));
      if (res) {
        setMessages((m) => [...m, { role: "assistant", content: res.output }]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function quick(label: (typeof QUICK)[number]) {
    if (!sel?.frame.text?.trim()) {
      setError("Select a text frame with some text first.");
      return;
    }
    send(label.prompt(sel.frame.text));
  }

  function addToFrame(content: string, mode: "replace" | "append") {
    if (sel) setFrameContent(sel.page.id, sel.frame.id, content, mode);
  }

  // Inline proofread (still operates directly on the frame).
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
      if (!res) return;
      setForFrame(sel.frame.id, sel.frame.text, res.corrections);
      setProofNote(
        res.corrections.length === 0
          ? "No errors found ✓"
          : `${res.corrections.length} suggestion(s) — review in the frame.`
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setProofBusy(false);
    }
  }

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
    try {
      const res = await gated(() => aiAddDiacritics(sel.frame.text, baseLang));
      if (res) setMessages((m) => [...m, { role: "assistant", content: res.output }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="ai-panel ai-panel--embedded flex flex-col" dir="ltr">
      {/* Header */}
      <div className="ai-header pl-8">
        <div className="flex items-center justify-between">
          <h2>AI Assistant</h2>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                title="Clear conversation"
                className="rounded-md px-1.5 py-1 text-[11px] text-ink-soft hover:bg-paper-edge"
                onClick={() => setMessages([])}
              >
                Clear
              </button>
            )}
            <button
              title="AI settings (provider & key)"
              className="rounded-md p-1 text-ink-soft hover:bg-paper-edge"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={16} />
            </button>
          </div>
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

      {/* Meter / status (compact) */}
      {plan === "free" ? (
        <button
          onClick={() => setUpgradeOpen(true)}
          className="shrink-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-left text-[11px] text-ink-soft hover:border-accent"
        >
          Free AI: <span className="font-medium text-ink">{remaining.toLocaleString()}</span> tokens
          left today · <span className="text-accent-deep">Upgrade →</span>
        </button>
      ) : (
        <div className="shrink-0 rounded-lg border border-accent/40 bg-paper px-3 py-1 text-[11px] font-medium text-accent-deep">
          ✦ Unlimited ({plan === "pro" ? "Pro" : "your key"})
        </div>
      )}

      {/* ── Chat thread (scrollable) ── */}
      <div
        ref={threadRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1"
      >
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-ink-soft">
            <Sparkles size={22} className="opacity-40" />
            <p>
              Ask anything — اردو, English, عربي.
              <br />
              e.g. “write a 2-line poem” or “ایک خبر کی سرخی لکھیں”.
            </p>
            <p className="rounded-md border border-line bg-paper/60 px-2.5 py-1.5 leading-relaxed">
              Have it on paper?{" "}
              <button className="font-medium text-accent-deep underline" onClick={() => setOcrOpen(true)}>
                Scan handwriting
              </button>{" "}
              turns a photo or PDF into editable Nastaliq text.
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-6 self-end rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-white" dir="auto">
              {m.content}
            </div>
          ) : (
            <div key={i} className="mr-2 flex flex-col gap-1">
              <div
                className="rounded-2xl rounded-bl-sm border border-line bg-paper px-3 py-2 text-sm text-ink"
                dir="auto"
                lang={sel?.frame.lang ?? "ur"}
              >
                {m.content}
              </div>
              <div className="flex flex-wrap gap-1.5 pl-1">
                <button
                  disabled={!sel}
                  onClick={() => addToFrame(m.content, "replace")}
                  className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink hover:bg-paper-edge disabled:opacity-40"
                  title="Replace the frame's text"
                >
                  ↹ Add to frame
                </button>
                <button
                  disabled={!sel}
                  onClick={() => addToFrame(m.content, "append")}
                  className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink hover:bg-paper-edge disabled:opacity-40"
                  title="Append below existing text"
                >
                  ＋ Append
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(m.content)}
                  className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-soft hover:bg-paper-edge"
                >
                  Copy
                </button>
              </div>
            </div>
          )
        )}

        {busy && (
          <div className="mr-2 flex items-center gap-2 rounded-2xl rounded-bl-sm border border-line bg-paper px-3 py-2 text-sm text-ink-soft">
            <Sparkles size={14} className="animate-pulse" /> Thinking…
          </div>
        )}
      </div>

      {error && <p className="ai-error shrink-0">{error}</p>}

      {/* ── Tools ──
          Split into two tiers: document tools that do something structural, and
          one-tap prompts that just seed the chat. Twelve identical pills in one
          run made the important actions impossible to find. */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            className="flex items-center gap-1 rounded-md border border-accent bg-accent/5 px-2 py-1 text-[11px] font-medium text-accent-deep hover:bg-accent/10"
            onClick={() => setOcrOpen(true)}
            title="Attach a photo, scan or PDF of handwriting and turn it into editable text"
          >
            <Sparkles size={13} /> Scan handwriting
          </button>
          <button
            className="flex items-center gap-1 rounded-md border border-accent px-2 py-1 text-[11px] font-medium text-accent-deep hover:bg-paper-edge disabled:opacity-40"
            disabled={proofBusy || !sel}
            onClick={proofread}
            title={sel ? "Find spelling and grammar issues in this frame" : "Select a frame first"}
          >
            <CheckCheck size={13} /> {proofBusy ? "Proofreading…" : "Proofread"}
            {suggestionCount > 0 && <span>({suggestionCount})</span>}
          </button>
          {canDiacritize && (
            <button
              className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink hover:bg-paper-edge disabled:opacity-40"
              disabled={busy || !sel}
              onClick={addDiacritics}
              title="Add short-vowel marks (aerab / harakat)"
            >
              تشکیل
            </button>
          )}
        </div>

        <details className="group" open>
          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wider text-ink-soft marker:content-none hover:text-ink">
            Quick actions on this frame
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {QUICK.map((q) => (
              <button
                key={q.label}
                disabled={busy || !sel}
                onClick={() => quick(q)}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-ink hover:border-accent/60 hover:bg-paper-edge disabled:opacity-40"
              >
                {q.label}
              </button>
            ))}
          </div>
        </details>
      </div>
      {proofNote && <p className="shrink-0 text-[11px] text-ink-soft">{proofNote}</p>}

      {/* ── Composer (pinned bottom) ── */}
      <div className="mt-1 flex shrink-0 items-end gap-2 border-t border-line pt-2">
        <textarea
          className="ai-instruction min-h-[44px] flex-1"
          dir="auto"
          placeholder="Message AI… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
        />
        <button
          className="flex h-[44px] items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-45"
          disabled={busy || !input.trim()}
          onClick={() => send(input)}
          title="Send (Enter)"
        >
          <Sparkles size={16} />
        </button>
      </div>
    </aside>
  );
}

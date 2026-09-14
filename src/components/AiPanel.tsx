import { useWorkspace } from "../lib/workspace";
import { useEffect, useRef, useState } from "react";
import { CheckAll as CheckCheck, Sparkles, Settings } from "./ui/icons";
import {
  aiChat,
  aiProofreadInline,
  aiAddDiacritics,
  ChatMessage,
  isTauri,
} from "../lib/tauri";
import { CloudError, loginUrl, openAccountPage } from "../lib/cloud";
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
  const remaining = useUsage((s) => s.remaining());
  const canUse = useUsage((s) => s.canUse());
  const record = useUsage((s) => s.record);
  const rollDay = useUsage((s) => s.rollDay);
  const cloud = useUsage((s) => s.cloud);
  const syncCloud = useUsage((s) => s.syncCloud);
  const setUpgradeOpen = useUi((s) => s.setUpgradeOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const setOcrOpen = useUi((s) => s.setOcrOpen);
  const settingsOpen = useUi((s) => s.settingsOpen);
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

  // Refresh account allowance after browser sign-in or a plan change.
  useEffect(() => {
    let active = true;
    const check = () => syncCloud().then(() => { if (active) setKeyOk(useUsage.getState().cloud?.signedIn ?? false); });
    void check();
    window.addEventListener("focus", check);
    return () => {active = false; window.removeEventListener("focus", check);};
  }, [syncCloud, settingsOpen]);

  /** Turn an AI failure into the right UI: sign-in, upgrade, or a message. */
  function handleAiError(e: unknown) {
    if (e instanceof CloudError) {
      if (e.code === "auth") {
        setKeyOk(false);
        setError("Sign in to use Harfsaz AI.");
        return;
      }
      if (e.code === "quota") {
        syncCloud();
        setError(e.message);
        setUpgradeOpen(true);
        return;
      }
    }
    setError(String(e));
  }

  /** Gate an AI call: block at the daily cap, record tokens after success. */
  async function gated<T extends { tokens: number }>(fn: () => Promise<T>): Promise<T | null> {
    if (keyOk !== true) {
      if (isTauri()) setSettingsOpen(true);
      else window.open(loginUrl(), "_blank", "noopener");
      return null;
    }
    if (!canUse) {
      setError(
        isTauri()
          ? "Your AI allowance is used up. View your plan for more details."
          : `You've used your ${cloud?.window === "month" ? "monthly" : "daily"} AI actions — upgrade for more.`
      );
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
    if (!prompt || busy || proofBusy || keyOk !== true) return;
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
      handleAiError(e);
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
      handleAiError(e);
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
      handleAiError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="ai-panel ai-panel--embedded flex flex-col" dir="ltr">
      {/* Header */}
      <div className="ai-header pl-8">
        <div className="flex items-center justify-between">
          <h2>Writing assistant</h2>
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
            <button aria-label="AI plan" title="AI plan"
              className="rounded-md p-1 text-ink-soft hover:bg-paper-edge"
              onClick={() => setUpgradeOpen(true)}><Settings size={16} /></button>
          </div>
        </div>
      </div>

      {keyOk === false && (
        <div className="ai-setup">
          <strong>A little help with your next draft.</strong>
          Sign in to write, translate, and proofread in Urdu, Persian, Arabic, or English.
          {isTauri() ? <button onClick={() => openAccountPage().catch(e => setError(String(e)))}>Your Harfsaz account →</button>
            : <a href={loginUrl()} target="_blank" rel="noopener">Sign in to Harfsaz →</a>}
        </div>
      )}
      {keyOk === null && <p role="status" className="text-xs text-ink-soft">Checking your AI allowance…</p>}
      {keyOk === true && cloud && (
        <div className="ai-setup">
          <strong>{cloud.plan === "free" ? "Harfsaz AI · Free" : "Harfsaz AI · " + (cloud.plan === "org" ? "Organization" : "Pro")}</strong>
          <span>{remaining.toLocaleString()} of {cloud.actions} actions left {cloud.window === "day" ? "today" : "this month"}.</span>
          {cloud.plan === "free" ? <button onClick={() => setUpgradeOpen(true)}>Upgrade to Pro →</button>
            : <button onClick={() => { useWorkspace.getState().setSection("billing"); }}>Manage plan →</button>}
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
            <h3 className="mt-2 text-base font-semibold text-ink">Find the right words.</h3>
            <p className="max-w-[240px] leading-relaxed">Start a draft, refine an idea, or translate a passage. Review each suggestion before adding it.</p>
            {keyOk === true && <button className="mt-3 text-xs" onClick={() => setInput("Write a short poem in Urdu about a new beginning.")}>Help me write a short poem →</button>}

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
                  Replace text
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

      {error && <p role="alert" className="ai-error shrink-0">{error}</p>}

      {/* ── Tools ──
          Split into two tiers: document tools that do something structural, and
          one-tap prompts that just seed the chat. Twelve identical pills in one
          run made the important actions impossible to find. */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-accent-deep hover:bg-paper-edge"
            onClick={() => setOcrOpen(true)}
            title="Turn a photo, scan, or PDF into editable text"
          >
            <Sparkles size={13} /> Scan handwriting
          </button>
          <button
            className="flex items-center gap-1 rounded-md border border-accent px-2 py-1 text-[11px] font-medium text-accent-deep hover:bg-paper-edge disabled:opacity-40"
            disabled={proofBusy || busy || keyOk !== true || !sel?.frame.text.trim()}
            onClick={proofread}
            title={sel ? "Find spelling and grammar issues in this frame" : "Select a frame first"}
          >
            <CheckCheck size={13} /> {proofBusy ? "Proofreading…" : "Proofread"}
            {suggestionCount > 0 && <span>({suggestionCount})</span>}
          </button>
            <button
              className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink hover:bg-paper-edge disabled:opacity-40"
              disabled={!canDiacritize || busy || proofBusy || keyOk !== true || !sel?.frame.text.trim()}
              onClick={addDiacritics}
              title={canDiacritize ? "Add short-vowel marks (aerab / harakat)" : "Available for Urdu, Arabic, and Persian text"}
            >
              Add vowel marks
            </button>
        </div>

        <details className="group" open>
          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wider text-ink-soft marker:content-none hover:text-ink">
            Rewrite current text box
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {QUICK.map((q) => (
              <button
                key={q.label}
                disabled={busy || proofBusy || keyOk !== true || !sel?.frame.text.trim()}
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
          aria-label="Message writing assistant"
          disabled={keyOk !== true}
          placeholder={keyOk === true ? "Ask your writing assistant…" : "Sign in to get started"}
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
          aria-label="Send message"
          disabled={busy || proofBusy || keyOk !== true || !input.trim()}
          onClick={() => send(input)}
          title="Send (Enter)"
        >
          <Sparkles size={16} />
        </button>
      </div>
    </aside>
  );
}

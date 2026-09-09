import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { XMark, Sparkles, ImageTool, CheckAll } from "./ui/icons";
import { Select } from "./ui/select";
import { useUi } from "../lib/ui";
import { useUsage } from "../lib/usage";
import { useDoc, useSelectedFrame, textToHtml } from "../lib/store";
import { LANGUAGES, LangCode, languagePatch, getLanguage } from "../lib/languages";
import { aiOcr, OcrMode } from "../lib/tauri";
import { DEFAULT_FONT_KEY, ensureFontFace, getFont } from "../lib/font";
import { Attachment, formatBytes, pickAttachment, readAttachment } from "../lib/image";

/**
 * "Scan handwriting" — attach a photo, scan or PDF of handwritten/printed Urdu,
 * Arabic, Persian (etc.) and have the AI transcribe it into editable text you
 * can drop straight into a frame and typeset in Nastaliq.
 *
 * The transcription lands in an editable box rather than going straight into the
 * document: handwriting OCR is never perfect, and a quick human pass before the
 * text enters the page is far cheaper than correcting it afterwards.
 */

// Only scripts the transcription prompt has real guidance for. "auto" lets the
// model identify the language itself — useful for mixed or unknown documents.
const OCR_LANGS: { value: string; label: string }[] = [
  { value: "auto", label: "Detect automatically" },
  ...LANGUAGES.filter((l) => !l.base).map((l) => ({
    value: l.code as string,
    label: `${l.nativeLabel} — ${l.label}`,
  })),
];

const MODES: { value: OcrMode; label: string }[] = [
  { value: "plain", label: "Flowing paragraphs" },
  { value: "layout", label: "Keep original line breaks" },
];

export function OcrDialog() {
  const open = useUi((s) => s.ocrOpen);
  const setOpen = useUi((s) => s.setOcrOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const setUpgradeOpen = useUi((s) => s.setUpgradeOpen);

  const sel = useSelectedFrame();
  const setFrameContent = useDoc((s) => s.setFrameContent);
  const addFrameAt = useDoc((s) => s.addFrameAt);
  const activePageId = useDoc((s) => s.activePageId);
  const pages = useDoc((s) => s.pages);

  const canUse = useUsage((s) => s.canUse());
  const record = useUsage((s) => s.record);

  const [file, setFile] = useState<Attachment | null>(null);
  // Seeded from the selected frame each time the dialog opens (see effect below).
  const [lang, setLang] = useState<string>("ur");
  const [mode, setMode] = useState<OcrMode>("plain");
  const [diacritics, setDiacritics] = useState(false);
  const [instruction, setInstruction] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const resultRef = useRef<HTMLTextAreaElement>(null);

  // Reset everything when the dialog closes so the next scan starts clean.
  useEffect(() => {
    if (open) return;
    setFile(null);
    setResult(null);
    setError(null);
    setNote(null);
    setInstruction("");
    setBusy(false);
  }, [open]);

  // Seed the options from the selected frame. Diacritized variants ("ur-h") are
  // not offered in the list — the checkbox covers that — so map them to their
  // base language, otherwise the select would show a value it has no option for.
  useEffect(() => {
    if (!open || !sel) return;
    const frameLang = getLanguage(sel.frame.lang);
    setLang(frameLang.base ?? frameLang.code);
    setDiacritics(!!frameLang.diacritized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function accept(f: File | null) {
    if (!f) return;
    setError(null);
    setNote(null);
    setResult(null);
    try {
      setFile(await readAttachment(f));
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Pasting a screenshot straight into the dialog is the fastest path from
  // "photo on my phone" / "snip of a scan" to text, so support it explicitly.
  useEffect(() => {
    if (!open) return;
    function onPaste(e: ClipboardEvent) {
      // Don't hijack paste while the user is editing the result or instruction.
      const target = e.target as HTMLElement | null;
      if (target?.closest("textarea, input")) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/")
      );
      const pasted = item?.getAsFile();
      if (pasted) {
        e.preventDefault();
        accept(pasted);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function extract() {
    if (!file || busy) return;
    if (!canUse) {
      setError("Daily free AI limit reached — upgrade or add your own key in Settings.");
      setUpgradeOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await aiOcr({
        data: file.dataUrl,
        mediaType: file.mediaType,
        lang,
        mode,
        diacritics,
        instruction: instruction.trim() || undefined,
      });
      record(res.tokens);
      setResult(res.text);
      setNote(`Transcribed with ${res.model}.`);
      // Put the caret in the result so corrections can start immediately.
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Language settings to apply to whichever frame receives the text. */
  function frameLangPatch() {
    if (lang === "auto") return {};
    return languagePatch(lang as LangCode);
  }

  function intoSelected(insertMode: "replace" | "append") {
    if (!sel || !result) return;
    // Match the frame's script to the transcription, otherwise Urdu text can
    // land in a frame still configured for Hebrew or English.
    const patch = frameLangPatch();
    if (Object.keys(patch).length) {
      useDoc.getState().updateFrame(sel.page.id, sel.frame.id, patch);
    }
    setFrameContent(sel.page.id, sel.frame.id, result, insertMode);
    setOpen(false);
  }

  function intoNewFrame() {
    if (!result) return;
    const page = pages.find((p) => p.id === activePageId) ?? pages[0];
    if (!page) return;
    const width = Math.round(page.width * 0.7);
    const height = Math.round(page.height * 0.4);
    addFrameAt(
      page.id,
      "text",
      { x: Math.round((page.width - width) / 2), y: Math.round(page.height * 0.2), width, height },
      { ...frameLangPatch(), text: result, html: textToHtml(result) }
    );
    setOpen(false);
  }

  // Preview the transcription in the script's own typeface, so what you proof
  // here looks like what lands on the page.
  const rtl = lang === "auto" ? true : getLanguage(lang).dir === "rtl";
  const previewFontKey =
    lang === "auto" ? DEFAULT_FONT_KEY : getLanguage(lang).defaultFontKey;
  const previewFamily = getFont(previewFontKey).cssFamily;

  // Register the @font-face before the result box renders in it.
  useEffect(() => {
    if (open) ensureFontFace(previewFontKey).catch(() => {});
  }, [open, previewFontKey]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 animate-in fade-in-0" />
        <Dialog.Content
          dir="ltr"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[900px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-qalam animate-in fade-in-0 zoom-in-95"
        >
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between border-b border-line px-5 py-3">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                <Sparkles size={17} className="text-accent" />
                Scan handwriting → text
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-ink-soft">
                Attach a photo, scan or PDF of handwritten or printed text — the AI
                transcribes it into editable Urdu, Arabic or Persian you can typeset.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-ink-soft hover:bg-paper-edge">
              <XMark size={18} />
            </Dialog.Close>
          </div>

          {/* Body: source on the left, options + result on the right */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto px-5 py-4 md:grid-cols-2">
            {/* ── Source ── */}
            <div className="flex min-h-0 flex-col gap-3">
              <SectionLabel>1 · Attachment</SectionLabel>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  accept(e.dataTransfer.files?.[0] ?? null);
                }}
                onClick={() => pickAttachment().then(accept)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pickAttachment().then(accept);
                  }
                }}
                className={`flex min-h-[240px] flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                  dragging
                    ? "border-accent bg-accent/5"
                    : "border-line bg-paper/60 hover:border-accent/60 hover:bg-paper-edge/50"
                }`}
              >
                {file ? (
                  file.isPdf ? (
                    <>
                      <div className="flex h-20 w-16 items-center justify-center rounded-md border border-line bg-surface text-[11px] font-semibold text-ink-soft">
                        PDF
                      </div>
                      <p className="max-w-full truncate text-xs font-medium text-ink">{file.name}</p>
                      <p className="text-[11px] text-ink-soft">{formatBytes(file.size)}</p>
                    </>
                  ) : (
                    <>
                      <img
                        src={file.dataUrl}
                        alt="Attachment preview"
                        className="max-h-[280px] max-w-full rounded-md border border-line object-contain"
                      />
                      <p className="max-w-full truncate text-xs font-medium text-ink">{file.name}</p>
                      <p className="text-[11px] text-ink-soft">
                        {formatBytes(file.size)} · click to replace
                      </p>
                    </>
                  )
                ) : (
                  <>
                    <ImageTool size={26} className="text-ink-soft opacity-50" />
                    <p className="text-sm font-medium text-ink">
                      Drop an image or PDF here
                    </p>
                    <p className="text-[11px] leading-relaxed text-ink-soft">
                      or click to browse · paste a screenshot with ⌘V
                      <br />
                      PNG, JPEG, WebP, GIF or PDF · up to 5&nbsp;MB
                    </p>
                  </>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-ink-soft">
                Best results come from a straight-on, well-lit shot cropped close to
                the writing. Faint pencil, heavy shadows and steep angles are what
                usually cost accuracy.
              </p>
            </div>

            {/* ── Options + result ── */}
            <div className="flex min-h-0 flex-col gap-3">
              <SectionLabel>2 · How to read it</SectionLabel>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Language">
                  <Select value={lang} onChange={setLang} options={OCR_LANGS} className="w-full" />
                </Field>
                <Field label="Layout">
                  <Select
                    value={mode}
                    onChange={(v) => setMode(v as OcrMode)}
                    options={MODES}
                    className="w-full"
                  />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={diacritics}
                  onChange={(e) => setDiacritics(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[color:var(--accent)]"
                />
                Add aerab / harakat (تشکیل) while transcribing
              </label>

              <Field label="Extra instruction (optional)">
                <input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g. this is a poem — keep each verse on its own line"
                  className="w-full rounded-md border border-line px-3 py-2 text-xs outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                />
              </Field>

              <button
                onClick={extract}
                disabled={!file || busy}
                className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-45"
              >
                <Sparkles size={15} className={busy ? "animate-pulse" : ""} />
                {busy ? "Reading the handwriting…" : "Extract text"}
              </button>

              {error && (
                <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
                  {error}{" "}
                  {/no api key|api key set/i.test(error) && (
                    <button className="underline" onClick={() => setSettingsOpen(true)}>
                      Open Settings
                    </button>
                  )}
                </p>
              )}

              {result !== null && (
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <SectionLabel>3 · Review &amp; correct</SectionLabel>
                  <textarea
                    ref={resultRef}
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                    dir={rtl ? "rtl" : "ltr"}
                    lang={lang === "auto" ? undefined : lang}
                    spellCheck={false}
                    rows={8}
                    style={{
                      fontFamily: `"${previewFamily}", serif`,
                      fontSize: 19,
                      lineHeight: 1.9,
                    }}
                    className="min-h-[150px] w-full flex-1 resize-none rounded-lg border border-line bg-paper/60 px-3 py-2 text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                  />
                  {note && (
                    <p className="flex items-center gap-1 text-[11px] text-ink-soft">
                      <CheckAll size={12} className="text-accent" /> {note} Check it against
                      the original before inserting.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
            {result !== null && (
              <button
                onClick={() => navigator.clipboard.writeText(result)}
                className="mr-auto rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-paper-edge"
              >
                Copy text
              </button>
            )}
            <Dialog.Close className="rounded-md border border-line px-4 py-1.5 text-sm hover:bg-paper-edge">
              Close
            </Dialog.Close>
            <button
              onClick={intoNewFrame}
              disabled={!result}
              className="rounded-md border border-line px-4 py-1.5 text-sm hover:bg-paper-edge disabled:opacity-40"
            >
              New text frame
            </button>
            <button
              onClick={() => intoSelected("append")}
              disabled={!result || !sel}
              title={sel ? "Add below the selected frame's text" : "Select a frame first"}
              className="rounded-md border border-line px-4 py-1.5 text-sm hover:bg-paper-edge disabled:opacity-40"
            >
              Append to frame
            </button>
            <button
              onClick={() => intoSelected("replace")}
              disabled={!result || !sel}
              title={sel ? "Replace the selected frame's text" : "Select a frame first"}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-deep disabled:opacity-45"
            >
              Insert into frame
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

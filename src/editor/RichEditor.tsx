import { useEffect, useRef } from "react";
import { transliterate } from "./phonetic";
import { LangCode, Dir } from "../lib/languages";

/**
 * RTL rich-text editor on a contentEditable div. Supports per-selection
 * formatting (bold/italic/underline/color) applied via the Selection API from
 * the toolbar, plus phonetic Roman→Urdu input. Emits both the HTML (rich) and
 * the plain text (for AI / word count / print shaping).
 *
 * We keep the DOM as the source of truth while focused (uncontrolled) to avoid
 * caret jumps — a controlled contentEditable fights the browser's bidi caret.
 */
export function RichEditor({
  html,
  fallbackText,
  phonetic,
  lang,
  dir,
  phoneticMap,
  style,
  onChange,
}: {
  html: string | undefined;
  fallbackText: string;
  phonetic: boolean;
  lang: LangCode;
  dir: Dir;
  phoneticMap: Record<string, string> | undefined;
  style: React.CSSProperties;
  onChange: (html: string, text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Seed the editor once (and when html is reset externally while not focused).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const isFocused = document.activeElement === el;
    if (!initialized.current || (!isFocused && el.innerHTML !== (html ?? ""))) {
      el.innerHTML = html && html.length > 0 ? html : escapeHtml(fallbackText);
      initialized.current = true;
    }
  }, [html, fallbackText]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML, el.innerText);
  }

  // Phonetic transliteration: convert the typed Roman char to the target script.
  // Skipped when phonetic is off or the language has no map (e.g. English).
  function handleBeforeInput(e: React.FormEvent<HTMLDivElement>) {
    if (!phonetic || !phoneticMap) return;
    const ie = e.nativeEvent as InputEvent;
    if (ie.inputType !== "insertText" || !ie.data) return;
    if (!/[A-Za-z.,?;']/.test(ie.data)) return;

    e.preventDefault();
    const out = transliterate(ie.data, phoneticMap);
    // Insert transliterated text at the caret.
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(out);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    emit();
  }

  return (
    <div
      ref={ref}
      className="text-frame-edit"
      contentEditable
      suppressContentEditableWarning
      dir={dir}
      lang={lang}
      spellCheck={false}
      style={style}
      onBeforeInput={handleBeforeInput}
      onInput={emit}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

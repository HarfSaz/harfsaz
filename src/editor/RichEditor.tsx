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

  // Phonetic transliteration must use a NATIVE `beforeinput` listener: React's
  // synthetic onBeforeInput does not reliably honor preventDefault() on a
  // contentEditable, so the browser would insert the raw Latin char anyway. We
  // attach the listener directly and keep phonetic/map in refs so it always
  // reads the current values without re-binding on every render.
  const phoneticRef = useRef(phonetic);
  const mapRef = useRef(phoneticMap);
  phoneticRef.current = phonetic;
  mapRef.current = phoneticMap;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onBeforeInput(e: InputEvent) {
      if (!phoneticRef.current || !mapRef.current) return;
      if (e.inputType !== "insertText" || !e.data) return;
      if (!/[A-Za-z.,?;']/.test(e.data)) return;

      e.preventDefault();
      const out = transliterate(e.data, mapRef.current);
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

    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

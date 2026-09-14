import { useEffect, useRef } from "react";
import { transliterate } from "./phonetic";
import { clipboardToLines, escapeHtml, sanitizeStoredHtml } from "./sanitize";
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
  frameId,
  readOnly = false,
  html,
  fallbackText,
  phonetic,
  lang,
  dir,
  phoneticMap,
  style,
  onChange,
  revision,
}: {
  frameId: string;
  readOnly?: boolean;
  html: string | undefined;
  fallbackText: string;
  phonetic: boolean;
  lang: LangCode;
  dir: Dir;
  phoneticMap: Record<string, string> | undefined;
  style: React.CSSProperties;
  onChange: (html: string, text: string, checkpoint?: boolean) => void;
  /** Bumped on undo/redo/load — forces a reseed even while the editor is focused. */
  revision: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const lastEmitted = useRef<string | null>(null);

  // Make Enter create block elements (<div>) per line instead of <br>. Each line
  // being its own block is what lets per-paragraph alignment (justifyRight/etc.)
  // affect a single line instead of the whole frame. Set once on mount.
  useEffect(() => {
    try {
      document.execCommand("defaultParagraphSeparator", false, "div");
    } catch {
      /* not supported in some engines — falls back to <div> anyway in Chromium */
    }
  }, []);

  // Seed the editor on mount, when html is reset externally while not focused,
  // OR whenever `revision` bumps (undo/redo/load) — the revision case force-
  // reseeds even while focused, so ⌘Z visibly reverts the text being typed.
  const lastRevision = useRef(revision);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const isFocused = document.activeElement === el;
    const revChanged = revision !== lastRevision.current;
    lastRevision.current = revision;
    if (
      !initialized.current ||
      revChanged || // undo/redo/load: always reseed
      (!isFocused && el.innerHTML !== (html ?? ""))
    ) {
      el.innerHTML = html && html.length > 0 ? (sanitizeStoredHtml(html) ?? "") : seedHtml(fallbackText);
      initialized.current = true;
      lastEmitted.current = el.innerHTML;
      // Restore caret to the end after a forced reseed so typing can continue.
      if (revChanged && isFocused) placeCaretAtEnd(el);
    }
  }, [html, fallbackText, revision]);

  // De-dupe emits: a transliterated keystroke fires our beforeinput emit AND the
  // browser's input event; emitting the same HTML twice can create a redundant
  // history step. Skip the input-event emit if the HTML hasn't changed since the
  // last emit.
  function emit(event?: Event | React.FormEvent) {
    const el = ref.current;
    if (!el) return;
    if (el.dataset.formatting === "true") return;
    const html = el.innerHTML;
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    onChange(html, el.innerText, event?.type === "harfsaz-format");
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
      // Only transliterate genuine, single-character typed input. Reject OS smart
      // substitutions (insertReplacementText — e.g. macOS "double-space → period",
      // smart quotes) and composed/IME input, which otherwise sneak punctuation
      // like `.`→`۔` in when the user only pressed space.
      if (e.inputType !== "insertText" || !e.data) return;
      if (e.data.length !== 1) return;
      if ((e as InputEvent & { isComposing?: boolean }).isComposing) return;
      // Letters, digits, and the explicit punctuation we map. Space passes through.
      if (!/[A-Za-z0-9.,?;'~]/.test(e.data)) return;

      e.preventDefault();
      const out = transliterate(e.data, mapRef.current);
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();

      // Insert into the EXISTING text node at the caret when possible, so all
      // letters of a word live in one contiguous text node. Arabic/Nastaliq
      // shaping only joins letters within the same text node — inserting a fresh
      // <text> node per keystroke left each letter isolated (un-joined).
      const startNode = range.startContainer;
      if (startNode.nodeType === Node.TEXT_NODE) {
        const textNode = startNode as Text;
        const offset = range.startOffset;
        textNode.insertData(offset, out);
        const pos = offset + out.length;
        range.setStart(textNode, pos);
        range.setEnd(textNode, pos);
      } else {
        // Empty editor / element boundary: create the first text node.
        const node = document.createTextNode(out);
        range.insertNode(node);
        range.setStart(node, out.length);
        range.setEnd(node, out.length);
      }
      sel.removeAllRanges();
      sel.addRange(range);
      emit();
    }

    // Paste adopts the FRAME's typography, like every DTP tool. Left to the
    // browser, a paste from a website/Word/InPage lands as rich HTML wrapped in
    // the source's `<font face=…>` and `font-size` — descendants that override
    // the frame font for every character, so the font/size pickers look dead
    // and the text renders in the system Urdu fallback. See sanitize.ts.
    function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      const lines = clipboardToLines(e.clipboardData);
      if (lines.length === 0) return;
      e.preventDefault();
      if (lines.length === 1) {
        document.execCommand("insertText", false, lines[0]);
      } else {
        // One block per line keeps per-paragraph alignment working (the editor
        // relies on block-per-line; a bare "\n" would not create blocks in WebKit).
        const html = lines.map((l) => `<div>${l ? escapeHtml(l) : "<br>"}</div>`).join("");
        document.execCommand("insertHTML", false, html);
      }
      emit();
    }

    el.addEventListener("harfsaz-format", emit);
    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("paste", onPaste);
    return () => {
      el.removeEventListener("harfsaz-format", emit);
      el.removeEventListener("beforeinput", onBeforeInput);
      el.removeEventListener("paste", onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className="text-frame-edit"
      data-frame-id={frameId}
      contentEditable={!readOnly}
      role={readOnly ? undefined : "textbox"}
      aria-label={readOnly ? undefined : "Document text"}
      aria-multiline={readOnly ? undefined : true}
      suppressContentEditableWarning
      dir={dir}
      lang={lang}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      // @ts-expect-error non-standard but respected by Safari/WebKit (Tauri webview)
      autocorrect="off"
      style={style}
      onInput={emit}
    />
  );
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Move the caret to the end of a contentEditable element. */
function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Seed text as one <div> block per line, so each line is an alignable paragraph
 *  (per-paragraph alignment needs block elements, not <br> separators). */
function seedHtml(text: string): string {
  const lines = text.split("\n");
  return lines.map((l) => `<div>${l.length ? escape(l) : "<br>"}</div>`).join("");
}

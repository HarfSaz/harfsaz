// Rich-text hygiene for the contentEditable frames.
//
// ── The bug this exists for ─────────────────────────────────────────────────
// Text pasted from a website, Word or InPage arrives as HTML carrying the
// SOURCE document's typography — `<font face="Nafees">`, `font-size: 25px`,
// colours, WebKit's `caret-color` / `white-space-collapse` artifacts. The frame's
// own font/size are applied to the editor ROOT, so any such descendant styling
// silently wins for every character it wraps. The font and size pickers then
// appear completely dead: the store updates, the root's computed style updates,
// and not one glyph changes. When the named font isn't installed the browser
// falls back to the system Urdu face (Noto Nastaliq Urdu on macOS), which looks
// exactly like Harfsaz's default — so the report is "it always shows the default".
//
// Policy, matching InPage and every DTP tool: pasted text adopts the frame's
// style. We keep only line structure on paste, and on load we strip typography
// from stored HTML while preserving the editor's OWN per-selection formatting
// (bold / italic / underline / colour / per-paragraph alignment).

/** Inline style properties that belong to the FRAME, never to a pasted span. */
const STRIP_STYLE_PROPS = new Set([
  "font-family",
  "font-size",
  "font",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "background-color",
  "background",
  "caret-color",
  "white-space",
  "white-space-collapse",
  "text-wrap",
  "direction",
]);

/** Elements that carry source typography and should be unwrapped (children kept). */
const UNWRAP_TAGS = new Set(["FONT", "TT", "CODE", "KBD", "SAMP", "VAR", "PRE", "SMALL", "BIG"]);

/** Elements that must be dropped along with their content. */
const DROP_TAGS = new Set(["SCRIPT", "STYLE", "META", "LINK", "HEAD", "TITLE", "TEMPLATE", "IFRAME", "OBJECT"]);

/** Quick test so the common case (clean HTML) costs a few regex checks, not a DOM parse. */
const SUSPICIOUS = /<font\b|font-family|font-size|caret-color|white-space-collapse|line-height|letter-spacing|background|<pre\b|<tt\b|<meta\b|<style\b|\sclass=|\sface=/i;

/**
 * Remove source typography from stored/edited HTML, keeping structure and the
 * editor's own formatting. Idempotent; returns the input unchanged when clean.
 */
export function sanitizeStoredHtml(html: string | undefined): string | undefined {
  if (!html || !SUSPICIOUS.test(html)) return html;
  if (typeof DOMParser === "undefined") return html; // non-browser context

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;

  // Drop dangerous/irrelevant subtrees first.
  for (const tag of DROP_TAGS) {
    body.querySelectorAll(tag).forEach((el) => el.remove());
  }

  // Walk a static list — we mutate the tree as we go.
  const all = Array.from(body.querySelectorAll("*"));
  for (const el of all) {
    if (!el.isConnected) continue;

    if (UNWRAP_TAGS.has(el.tagName)) {
      unwrap(el);
      continue;
    }

    // Pasted classes point at stylesheets we don't have; they are noise at best.
    el.removeAttribute("class");
    el.removeAttribute("id");
    el.removeAttribute("face");
    el.removeAttribute("size");
    el.removeAttribute("lang"); // the frame owns language

    const style = (el as HTMLElement).style;
    if (style && style.length) {
      for (const prop of Array.from(style)) {
        const ownParagraph = /^(DIV|P|LI|H[1-6])$/.test(el.tagName) &&
          ["body", "heading", "subheading", "caption"].includes(el.getAttribute("data-harfsaz-style") ?? "");
        const paragraphMetric = ownParagraph && (prop === "font-size" || prop === "line-height");
        if (STRIP_STYLE_PROPS.has(prop) && !paragraphMetric) style.removeProperty(prop);
      }
      if (!style.length) el.removeAttribute("style");
    }

    // A span left with no attributes is pure wrapper noise — unwrap it so
    // neighbouring letters share a text node (Nastaliq only joins within one).
    if (el.tagName === "SPAN" && el.attributes.length === 0) unwrap(el);
  }

  body.normalize();
  return body.innerHTML;
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/**
 * Reduce clipboard content to plain lines for insertion. Prefers text/plain;
 * falls back to flattening text/html (block boundaries → line breaks).
 */
export function clipboardToLines(data: DataTransfer): string[] {
  let text = data.getData("text/plain");
  if (!text) {
    const html = data.getData("text/html");
    if (html && typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      for (const tag of DROP_TAGS) doc.querySelectorAll(tag).forEach((el) => el.remove());
      // Turn block boundaries into newlines before reading innerText-ish text.
      doc.body.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
      doc.body
        .querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, tr, blockquote")
        .forEach((b) => b.append("\n"));
      text = doc.body.textContent ?? "";
    }
  }
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    // Collapse runs of blank lines to one — pasted articles are full of them.
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
}

/** Escape text for insertion as HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

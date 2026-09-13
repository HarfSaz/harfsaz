/** Paragraph formatting is stored in the document HTML, independently of script. */
export type ParagraphStyle = "body" | "heading" | "subheading" | "caption";
export const PARAGRAPH_STYLES: { value: ParagraphStyle; label: string }[] = [
  { value: "body", label: "Body" }, { value: "heading", label: "Heading" },
  { value: "subheading", label: "Subheading" }, { value: "caption", label: "Caption" },
];
export type NumeralStyle = "decimal" | "arabic-indic" | "persian";
export function defaultNumerals(lang: string): NumeralStyle {
  return lang.startsWith("ar") ? "arabic-indic" : /^(ur|fa)/.test(lang) ? "persian" : "decimal";
}

export function editorForFrame(frameId: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>(".text-frame-edit[contenteditable=true]"))
    .find((el) => el.dataset.frameId === frameId);
}
export function rangeInEditor(root: HTMLElement, range: Range): boolean {
  return root.contains(range.startContainer) && root.contains(range.endContainer);
}

/** Leaf paragraphs only: a list item's nested list is never formatted twice. */
export function selectedParagraphs(root: HTMLElement, range: Range): HTMLElement[] {
  const selector = "div,p,li,h1,h2,h3,h4,h5,h6,blockquote";
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) =>
    !Array.from(el.children).some((child) => child.matches(selector))
  );
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element : range.startContainer.parentElement;
  if (range.collapsed) {
    const block = start?.closest<HTMLElement>(selector);
    return block && block !== root && root.contains(block) ? [block] : blocks.slice(0, 1);
  }
  return blocks.filter((block) => {
    if (!range.intersectsNode(block)) return false;
    if (block.contains(range.endContainer)) {
      const prefix = document.createRange();
      prefix.selectNodeContents(block);
      prefix.setEnd(range.endContainer, range.endOffset);
      if (!prefix.toString().length) return false;
    }
    if (block.contains(range.startContainer)) {
      const suffix = document.createRange();
      suffix.selectNodeContents(block);
      suffix.setStart(range.startContainer, range.startOffset);
      if (!suffix.toString().length) return false;
    }
    // A selection ending at the start of the next paragraph excludes that paragraph.
    const content = document.createRange();
    content.selectNodeContents(block);
    const selectionStart = range.cloneRange(); selectionStart.collapse(true);
    const selectionEnd = range.cloneRange(); selectionEnd.collapse(false);
    const blockStart = content.cloneRange(); blockStart.collapse(true);
    const blockEnd = content.cloneRange(); blockEnd.collapse(false);
    return selectionEnd.compareBoundaryPoints(Range.START_TO_START, blockStart) > 0 &&
      selectionStart.compareBoundaryPoints(Range.START_TO_START, blockEnd) < 0;
  });
}

export function styleParagraph(block: HTMLElement, style: ParagraphStyle): void {
  block.dataset.harfsazStyle = style;
  block.style.fontSize = { body: "1em", heading: "1.5em", subheading: "1.2em", caption: "0.8em" }[style];
  block.style.fontWeight = style === "heading" || style === "subheading" ? "700" : "400";
  // Inherit the frame's script-appropriate leading rather than forcing Latin metrics.
  block.style.lineHeight = "inherit";
  block.style.marginBlockStart = "0px";
  block.style.marginBlockEnd = style === "body" ? "0px" : "12px";
}

export function setParagraphNumber(block: HTMLElement, property: "margin-block-start" | "margin-block-end" | "margin-inline-start" | "text-indent", value: number): void {
  if (!Number.isFinite(value)) return;
  const min = property === "text-indent" ? -120 : 0;
  block.style.setProperty(property, `${Math.max(min, Math.min(240, value))}px`);
}

export function formatList(root: HTMLElement, numerals: NumeralStyle): void {
  root.querySelectorAll<HTMLElement>("ol,ul").forEach((list) => {
    list.style.paddingInlineStart = "1.6em";
    list.style.paddingInlineEnd = "0px";
    list.style.marginBlock = "0px";
    list.style.listStylePosition = "outside";
    // Keep an explicitly chosen numbering scheme on existing lists.
    if (!list.style.listStyleType) list.style.listStyleType = list.tagName === "OL" ? numerals : "disc";
  });
}

/** The outline renderer currently cannot reproduce rich paragraph layout. */
export function needsRichLayout(html?: string): boolean {
  return !!html && /data-harfsaz-table|data-harfsaz-style|<(?:ol|ul|li|h[1-6])\b|margin-(?:inline|block)|text-indent|list-style|(?:^|[;\s"\'])color\s*:|<font\b[^>]*color=/i.test(html);
}

// Selection formatting for the contentEditable rich editor.
//
// We use document.execCommand — deprecated in spec but still fully supported in
// Chromium/WKWebView (Tauri), and by far the simplest reliable way to toggle
// inline formatting on a selection without a heavyweight editor framework.

/** Apply/toggle a style on the current selection. Returns true if it ran. */
export function applyFormat(
  command: "bold" | "italic" | "underline" | "foreColor",
  value?: string
): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  // styleWithCSS makes color/format produce inline styles (portable HTML).
  document.execCommand("styleWithCSS", false, "true");
  return document.execCommand(command, false, value);
}

/** Whether the current selection has a given inline format active. */
export function queryFormat(command: "bold" | "italic" | "underline"): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

/** Apply paragraph alignment to the current line/selection (not the whole frame).
 *  execCommand justify* sets text-align on the containing block(s), so each
 *  paragraph keeps its own alignment and new lines don't inherit it wrongly. */
export function applyAlign(align: "right" | "center" | "left" | "justify"): boolean {
  const cmd =
    align === "right"
      ? "justifyRight"
      : align === "center"
      ? "justifyCenter"
      : align === "left"
      ? "justifyLeft"
      : "justifyFull";
  document.execCommand("styleWithCSS", false, "true");
  return document.execCommand(cmd, false);
}

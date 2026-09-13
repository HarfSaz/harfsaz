/** Freeze the intended text range before a color dialog takes keyboard focus. */
export interface ColorSelection { host: HTMLElement; range: Range }
export function captureColorSelection(frameId: string): ColorSelection | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const host = Array.from(document.querySelectorAll<HTMLElement>('.text-frame-edit[contenteditable="true"]'))
    .find(el => el.dataset.frameId === frameId);
  if (!host || !host.contains(range.startContainer) || !host.contains(range.endContainer)) return null;
  return { host, range: range.cloneRange() };
}
export function applySelectionColor(target: ColorSelection, color: string): boolean {
  const { host, range } = target;
  if (!host.isConnected || !host.contains(range.startContainer) || !host.contains(range.endContainer) || range.collapsed) return false;
  host.focus();
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges(); selection.addRange(range);
  host.dataset.formatting = "true";
  let applied = false;
  try {
    document.execCommand("styleWithCSS", false, "true");
    applied = document.execCommand("foreColor", false, color);
  } finally {
    delete host.dataset.formatting;
    host.dispatchEvent(new Event("harfsaz-format"));
  }
  return applied;
}

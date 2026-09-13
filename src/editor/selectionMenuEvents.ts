/** Selection-card visibility follows editor gestures, never toolbar mouseups. */
export interface MenuSelection {
  range: Range;
  text: string;
  host: HTMLElement;
}

function identity(selection: MenuSelection): string {
  const prefix = document.createRange();
  prefix.selectNodeContents(selection.host);
  prefix.setEnd(selection.range.startContainer, selection.range.startOffset);
  const start = prefix.toString().length;
  prefix.setEnd(selection.range.endContainer, selection.range.endOffset);
  // Character offsets survive spans being wrapped/unwrapped by formatting.
  return `${start}:${prefix.toString().length}:${selection.text}`;
}

export function installSelectionMenuEvents<T extends MenuSelection>({ capture, open, close, card }: {
  capture: () => T | null;
  open: (selection: T, contextEvent?: MouseEvent) => void;
  close: () => void;
  card: () => HTMLElement | null;
}) {
  let origin: HTMLElement | null = null;
  let active: T | null = null;
  let dismissed: { host: HTMLElement; key: string } | null = null;
  const editorAt = (target: EventTarget | null) => target instanceof Element
    ? target.closest<HTMLElement>('.text-frame-edit[contenteditable="true"]') : null;
  function dismiss() {
    if (active && active.host.contains(active.range.startContainer) && active.host.contains(active.range.endContainer)) {
      dismissed = { host: active.host, key: identity(active) };
    }
    active = null;
    close();
  }
  function onMouseDown(event: MouseEvent) {
    if (card()?.contains(event.target as Node)) return;
    origin = event.button === 0 ? editorAt(event.target) : null;
  }
  function onMouseUp(event: MouseEvent) {
    if (card()?.contains(event.target as Node)) return;
    const startedIn = origin;
    origin = null;
    if (event.button !== 0) return;
    if (!startedIn) { dismiss(); return; }
    const selection = capture();
    if (!selection || selection.host !== startedIn) {
      active = null;
      dismissed = null;
      close();
      return;
    }
    if (dismissed?.host === selection.host && dismissed.key === identity(selection)) return;
    dismissed = null;
    active = selection;
    open(selection);
  }
  function onContextMenu(event: MouseEvent) {
    const host = editorAt(event.target);
    if (!host) return;
    const selection = capture();
    if (!selection || selection.host !== host) return;
    event.preventDefault();
    dismissed = null;
    active = selection;
    open(selection, event);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") dismiss();
  }
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("keydown", onKeyDown);
  return {
    dismiss,
    dispose() {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    },
  };
}

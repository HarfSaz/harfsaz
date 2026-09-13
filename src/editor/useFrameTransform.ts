import { useRef } from "react";
import { useDoc } from "../lib/store";
import { useUi } from "../lib/ui";

type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

/**
 * Drag-to-move and resize for a frame. Returns handlers:
 *  - `moveProps` — spread onto the frame body to drag-move it.
 *  - `startResize(handle)` — pointerdown handler for a resize grip.
 *
 * Coordinates are page-space px; we divide screen deltas by the live zoom so
 * dragging tracks the cursor regardless of canvas scale. Mutations go through
 * updateFrame (which snapshots history).
 */
export function useFrameTransform(pageId: string, frameId: string) {
  const updateFrame = useDoc((s) => s.updateFrame);
  const start = useRef<{
    px: number;
    py: number;
    x: number;
    y: number;
    w: number;
    h: number;
    handle?: Handle;
  } | null>(null);

  function zoom(): number {
    return useUi.getState().zoom || 1;
  }

  function begin(e: React.PointerEvent, handle?: Handle) {
    const fr = current(pageId, frameId);
    if (!fr || e.button !== 0) return;
    // Pointer cancellation suppresses the later mousedown; select here first.
    useDoc.getState().setActivePage(pageId);
    useDoc.getState().selectFrame(frameId);
    e.preventDefault();
    e.stopPropagation();
    start.current = { px: e.clientX, py: e.clientY, x: fr.x, y: fr.y, w: fr.width, h: fr.height, handle };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function onMove(e: PointerEvent) {
    const s = start.current;
    if (!s) return;
    const z = zoom();
    const dx = (e.clientX - s.px) / z;
    const dy = (e.clientY - s.py) / z;

    if (!s.handle) {
      updateFrame(pageId, frameId, { x: Math.round(s.x + dx), y: Math.round(s.y + dy) });
      return;
    }
    let { x, y, w, h } = s;
    const min = 24;
    if (s.handle.includes("e")) w = Math.max(min, s.w + dx);
    if (s.handle.includes("s")) h = Math.max(min, s.h + dy);
    if (s.handle.includes("w")) {
      w = Math.max(min, s.w - dx);
      x = s.x + (s.w - w);
    }
    if (s.handle.includes("n")) {
      h = Math.max(min, s.h - dy);
      y = s.y + (s.h - h);
    }
    updateFrame(pageId, frameId, {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
    });
  }

  function onUp() {
    start.current = null;
    window.removeEventListener("pointermove", onMove);
  }

  return {
    moveProps: { onPointerDown: (e: React.PointerEvent) => begin(e) },
    startResize: (handle: Handle) => (e: React.PointerEvent) => begin(e, handle),
  };
}

function current(pageId: string, frameId: string) {
  const page = useDoc.getState().pages.find((p) => p.id === pageId);
  return page?.frames.find((f) => f.id === frameId) ?? null;
}

import { pageNumber } from "./publishing";
import { useRef, useState } from "react";
import { Page, useDoc } from "../lib/store";
import { TextFrameView } from "./TextFrameView";

/** Renders a single DTP page (A4) with its frames. When a creation tool
 *  (text/image/shape) is active, dragging on the page draws a new frame. */
export function PageCanvas({ page }: { page: Page }) {
  const activeTool = useDoc((s) => s.activeTool);
  const addFrameAt = useDoc((s) => s.addFrameAt);
  const pageRef = useRef<HTMLDivElement>(null);

  // Marquee being drawn (page-space px) while the pointer is down.
  const [draw, setDraw] = useState<null | { x0: number; y0: number; x: number; y: number }>(null);

  // Image is placed via the toolbox (pick-first); only text/shape draw here.
  const creating = activeTool === "text" || activeTool === "shape";

  function toPagePoint(e: React.PointerEvent) {
    const r = pageRef.current!.getBoundingClientRect();
    const scaleX = page.width / r.width;
    const scaleY = page.height / r.height;
    return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!creating) return;
    // Only start on the page background, not on an existing frame.
    if ((e.target as HTMLElement).closest(".text-frame")) return;
    const p = toPagePoint(e);
    setDraw({ x0: p.x, y0: p.y, x: p.x, y: p.y });
    pageRef.current!.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draw) return;
    const p = toPagePoint(e);
    setDraw({ ...draw, x: p.x, y: p.y });
  }

  function onPointerUp() {
    if (!draw) return;
    const rect = {
      x: Math.min(draw.x0, draw.x),
      y: Math.min(draw.y0, draw.y),
      width: Math.abs(draw.x - draw.x0),
      height: Math.abs(draw.y - draw.y0),
    };
    setDraw(null);

    // Tiny drag = treat as a click with a default-sized frame.
    if (rect.width < 12 || rect.height < 12) {
      rect.width = activeTool === "shape" ? 160 : 320;
      rect.height = activeTool === "shape" ? 120 : 180;
    }

    if (activeTool === "shape") {
      addFrameAt(page.id, "shape", rect);
    } else if (activeTool === "text") {
      addFrameAt(page.id, "text", rect);
    }
  }

  const marquee =
    draw && {
      left: Math.min(draw.x0, draw.x),
      top: Math.min(draw.y0, draw.y),
      width: Math.abs(draw.x - draw.x0),
      height: Math.abs(draw.y - draw.y0),
    };

  return (
    <div className="page-scroll">
      <div
        ref={pageRef}
        className="page"
        style={{ width: page.width, height: page.height, cursor: creating ? "crosshair" : "default" }}
        data-page-id={page.id}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Margin guide for the main writing area (InPage-style). */}
        {page.frames
          .filter((f) => f.isPageFrame)
          .map((f) => (
            <div
              key={`guide-${f.id}`}
              className="margin-guide"
              style={{ left: f.x, top: f.y, width: f.width, height: f.height }}
            />
          ))}
        {page.frames.map((frame) => (
          <TextFrameView key={frame.id} pageId={page.id} frame={frame} />
        ))}

        {page.pageNumber && <div aria-label="Page number" style={{ position: "absolute", bottom: 4, left: 0, width: "100%", textAlign: "center", fontSize: 16, lineHeight: "20px", color: "#1a1714", pointerEvents: "none" }}>
          {pageNumber(page.pageNumber.value, page.pageNumber.style)}
        </div>}
        {/* Draw-to-create marquee */}
        {marquee && (
          <div
            className="pointer-events-none absolute rounded-sm border-2 border-dashed border-accent bg-accent/10"
            style={marquee}
          />
        )}
      </div>
    </div>
  );
}

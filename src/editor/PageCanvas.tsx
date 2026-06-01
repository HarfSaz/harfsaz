import { Page } from "../lib/store";
import { TextFrameView } from "./TextFrameView";

/** Renders a single DTP page (A4) with its text frames positioned absolutely. */
export function PageCanvas({ page }: { page: Page }) {
  return (
    <div className="page-scroll">
      <div
        className="page"
        style={{ width: page.width, height: page.height }}
        data-page-id={page.id}
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
      </div>
    </div>
  );
}

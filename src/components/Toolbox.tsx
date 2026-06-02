import { useState } from "react";
import { Cursor, TextTool, ImageTool, ShapeTool } from "./ui/icons";
import { useDoc, ShapeKind } from "../lib/store";
import { IconTip } from "./ui/tooltip";
import { pickImageFile, fitWithin } from "../lib/image";
import { SHAPES, Shape } from "../editor/shapes";

/** Left vertical tool rail — InPage's toolbox, modernized with labels. */
export function Toolbox() {
  const activeTool = useDoc((s) => s.activeTool);
  const setTool = useDoc((s) => s.setTool);
  const addFrameAt = useDoc((s) => s.addFrameAt);
  const activePageId = useDoc((s) => s.activePageId);
  const pages = useDoc((s) => s.pages);

  const [shapeOpen, setShapeOpen] = useState(false);
  const page = () => pages.find((p) => p.id === activePageId) ?? pages[0];

  // Insert centered on the page at a default size, then user moves/resizes.
  function insertCentered(kind: "image" | "shape", w: number, h: number, extra?: any) {
    const pg = page();
    addFrameAt(
      activePageId,
      kind,
      { x: (pg.width - w) / 2, y: (pg.height - h) / 2, width: w, height: h },
      extra
    );
  }

  async function insertImage() {
    const picked = await pickImageFile();
    if (!picked) return;
    const pg = page();
    const { width, height } = fitWithin(picked.w, picked.h, pg.width * 0.6, pg.height * 0.5);
    insertCentered("image", width, height, { src: picked.src });
  }

  function insertShape(kind: ShapeKind) {
    const isLine = kind === "line" || kind === "arrow";
    insertCentered("shape", 220, isLine ? 80 : 160, { shape: kind });
  }

  const tileCls = (active: boolean) =>
    `flex w-14 flex-col items-center gap-1 rounded-md py-2 transition-colors ${
      active ? "bg-accent text-white" : "text-ink-soft hover:bg-paper-edge"
    }`;

  return (
    <aside className="flex w-16 flex-col items-center gap-1 border-r border-line bg-surface py-2">
      {/* Select */}
      <IconTip label="Select (V)">
        <button data-active={activeTool === "select"} onClick={() => setTool("select")} className={tileCls(activeTool === "select")}>
          <Cursor size={18} />
          <span className="text-[10px] font-medium">Select</span>
        </button>
      </IconTip>

      {/* Text — arm draw-to-create */}
      <IconTip label="Text frame (T)">
        <button data-active={activeTool === "text"} onClick={() => setTool("text")} className={tileCls(activeTool === "text")}>
          <TextTool size={18} />
          <span className="text-[10px] font-medium">Text</span>
        </button>
      </IconTip>

      {/* Image — pick first, place centered */}
      <IconTip label="Insert image (I)">
        <button onClick={insertImage} className={tileCls(false)}>
          <ImageTool size={18} />
          <span className="text-[10px] font-medium">Image</span>
        </button>
      </IconTip>

      {/* Shape — popover grid of shapes */}
      {/* Shape — plain state-toggled popover (reliable onClick) */}
      <div className="relative">
        <IconTip label="Insert shape (S)">
          <button className={tileCls(shapeOpen)} onClick={() => setShapeOpen((o) => !o)}>
            <ShapeTool size={18} />
            <span className="text-[10px] font-medium">Shape</span>
          </button>
        </IconTip>
        {shapeOpen && (
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setShapeOpen(false)} />
            <div className="absolute left-full top-0 z-50 ml-2 w-44 rounded-xl border border-line bg-surface p-2 shadow-qalam">
              <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
                Insert shape
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {SHAPES.map((s) => (
                  <button
                    key={s.kind}
                    title={s.label}
                    onClick={() => {
                      insertShape(s.kind);
                      setShapeOpen(false);
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-lg border border-line transition-colors hover:border-accent hover:bg-paper-edge"
                  >
                    <div className="h-6 w-7">
                      <Shape kind={s.kind} width={28} height={24} fill="#9a6b3f" borderWidth={0} borderColor="#9a6b3f" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {activeTool === "text" && (
        <p className="mt-1 px-1 text-center text-[9px] leading-tight text-ink-soft">
          Drag on the page to draw a text box
        </p>
      )}
    </aside>
  );
}

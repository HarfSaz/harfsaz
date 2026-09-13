import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { isOpenShape } from "../editor/shapeGeometry";
import { Cursor, TextTool, ImageTool, ShapeTool, Sparkles } from "./ui/icons";
import { useDoc, ShapeKind } from "../lib/store";
import { useUi } from "../lib/ui";
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
  const setOcrOpen = useUi((s) => s.setOcrOpen);

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
    const open = isOpenShape(kind);
    insertCentered("shape", kind === "line-vertical" ? 40 : 220,
      kind === "line-vertical" ? 180 : open ? 60 : 160,
      { shape: kind, ...(open ? { borderWidth: 3, borderColor: "#87633e" } : {}) });
  }

  const tileCls = (active: boolean) =>
    `flex w-14 flex-col items-center gap-1 rounded-md py-2 transition-colors ${
      active ? "bg-accent/10 text-accent-deep" : "text-ink-soft hover:bg-paper-edge"
    }`;

  return (
    <aside aria-label="Insert and selection tools" className="tool-rail flex w-[72px] shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-4">
      {/* Select */}
      <IconTip label="Select (V)">
        <button aria-pressed={activeTool === "select"} data-active={activeTool === "select"} onClick={() => setTool("select")} className={tileCls(activeTool === "select")}>
          <Cursor size={18} />
          <span className="text-[10px] font-medium">Select</span>
        </button>
      </IconTip>

      {/* Text — arm draw-to-create */}
      <IconTip label="Text frame (T)">
        <button aria-pressed={activeTool === "text"} data-active={activeTool === "text"} onClick={() => setTool("text")} className={tileCls(activeTool === "text")}>
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

      <DropdownMenu.Root open={shapeOpen} onOpenChange={setShapeOpen}>
        <DropdownMenu.Trigger asChild>
          <button aria-label="Insert shape" className={tileCls(shapeOpen)}>
            <ShapeTool size={18} />
            <span className="text-[10px] font-medium">Shape</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content side="right" align="start" sideOffset={10}
            className="z-50 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-harfsaz">
            {(["Basic", "Lines & arrows", "Symbols"] as const).map((group) => (
              <DropdownMenu.Group key={group}>
                <DropdownMenu.Label className="px-1 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{group}</DropdownMenu.Label>
                <div className="grid grid-cols-3 gap-1">
                  {SHAPES.filter((s) => s.group === group).map((s) => (
                    <DropdownMenu.Item key={s.kind} onSelect={() => insertShape(s.kind)}
                      className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-md p-2 text-center text-[10px] text-ink outline-none data-[highlighted]:bg-paper-edge">
                      <div className="h-6 w-8">
                        <Shape kind={s.kind} width={32} height={24} fill="#87633e" borderWidth={isOpenShape(s.kind) ? 2 : 0} borderColor="#87633e" />
                      </div>
                      <span>{s.label}</span>
                    </DropdownMenu.Item>
                  ))}
                </div>
              </DropdownMenu.Group>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <span className="my-1 h-px w-8 bg-line" />

      {/* Scan handwriting — attachment → OCR → editable Nastaliq text */}
      <IconTip label="Scan handwriting or a printed page into editable text">
        <button onClick={() => setOcrOpen(true)} className={tileCls(false)}>
          <Sparkles size={18} />
          <span className="text-[10px] font-medium leading-tight">Scan</span>
        </button>
      </IconTip>

      {activeTool === "text" && (
        <p className="mt-1 px-1 text-center text-[9px] leading-tight text-ink-soft">
          Drag on the page to draw a text box
        </p>
      )}
    </aside>
  );
}

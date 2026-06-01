import { Cursor, TextTool, ImageTool, ShapeTool } from "./ui/icons";
import { Tool, useDoc } from "../lib/store";
import { IconTip } from "./ui/tooltip";
import { pickImageFile, fitWithin } from "../lib/image";

const TOOLS: { tool: Tool; icon: React.ReactNode; label: string; tip: string }[] = [
  { tool: "select", icon: <Cursor size={18} />, label: "Select", tip: "Select (V)" },
  { tool: "text", icon: <TextTool size={18} />, label: "Text", tip: "Text frame (T)" },
  { tool: "image", icon: <ImageTool size={18} />, label: "Image", tip: "Insert image (I)" },
  { tool: "shape", icon: <ShapeTool size={18} />, label: "Shape", tip: "Shape (S)" },
];

/** Left vertical tool rail — InPage's toolbox, modernized with labels. */
export function Toolbox() {
  const activeTool = useDoc((s) => s.activeTool);
  const setTool = useDoc((s) => s.setTool);
  const addFrameAt = useDoc((s) => s.addFrameAt);
  const activePageId = useDoc((s) => s.activePageId);
  const pages = useDoc((s) => s.pages);

  // Image is "pick first": open the file picker immediately, then drop the image
  // centered on the page at its natural aspect ratio (user then moves/resizes/fits).
  async function pickTool(tool: Tool) {
    if (tool === "image") {
      const picked = await pickImageFile();
      if (!picked) return;
      const page = pages.find((p) => p.id === activePageId) ?? pages[0];
      const { width, height } = fitWithin(picked.w, picked.h, page.width * 0.6, page.height * 0.5);
      addFrameAt(
        activePageId,
        "image",
        { x: (page.width - width) / 2, y: (page.height - height) / 2, width, height },
        { src: picked.src }
      );
      return; // addFrameAt resets tool to "select"
    }
    setTool(tool); // text / shape: armed, draw on the page
  }

  const hint =
    activeTool === "text"
      ? "Drag on the page to draw a text box"
      : activeTool === "shape"
      ? "Drag on the page to draw a shape"
      : "";

  return (
    <aside className="flex w-16 flex-col items-center gap-1 border-r border-line bg-surface py-2">
      {TOOLS.map((t) => (
        <IconTip key={t.tool} label={t.tip}>
          <button
            data-active={activeTool === t.tool}
            onClick={() => pickTool(t.tool)}
            className="flex w-14 flex-col items-center gap-1 rounded-md py-2 text-ink-soft transition-colors hover:bg-paper-edge data-[active=true]:bg-accent data-[active=true]:text-white"
          >
            {t.icon}
            <span className="text-[10px] font-medium">{t.label}</span>
          </button>
        </IconTip>
      ))}
      {hint && (
        <p className="mt-1 px-1 text-center text-[9px] leading-tight text-ink-soft">{hint}</p>
      )}
    </aside>
  );
}

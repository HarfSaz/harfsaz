import { Cursor, TextTool, ImageTool, ShapeTool } from "./ui/icons";
import { Tool, useDoc } from "../lib/store";
import { IconTip } from "./ui/tooltip";

const TOOLS: { tool: Tool; icon: React.ReactNode; label: string; tip: string }[] = [
  { tool: "select", icon: <Cursor size={18} />, label: "Select", tip: "Select (V)" },
  { tool: "text", icon: <TextTool size={18} />, label: "Text", tip: "Text frame (T)" },
  { tool: "image", icon: <ImageTool size={18} />, label: "Image", tip: "Image frame (I)" },
  { tool: "shape", icon: <ShapeTool size={18} />, label: "Shape", tip: "Shape (S)" },
];

/** Left vertical tool rail — InPage's toolbox, modernized with labels. */
export function Toolbox() {
  const activeTool = useDoc((s) => s.activeTool);
  const setTool = useDoc((s) => s.setTool);
  const addFrame = useDoc((s) => s.addFrame);
  const activePageId = useDoc((s) => s.activePageId);

  function pick(tool: Tool) {
    setTool(tool);
    if (tool === "text") addFrame(activePageId);
  }

  return (
    <aside className="flex w-16 flex-col items-center gap-1 border-r border-line bg-surface py-2">
      {TOOLS.map((t) => (
        <IconTip key={t.tool} label={t.tip}>
          <button
            data-active={activeTool === t.tool}
            onClick={() => pick(t.tool)}
            className="flex w-14 flex-col items-center gap-1 rounded-md py-2 text-ink-soft transition-colors hover:bg-paper-edge data-[active=true]:bg-accent data-[active=true]:text-white"
          >
            {t.icon}
            <span className="text-[10px] font-medium">{t.label}</span>
          </button>
        </IconTip>
      ))}
    </aside>
  );
}

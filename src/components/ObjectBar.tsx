import { Frame as Square, Move, Resize } from "./ui/icons";
import { useDoc, useSelectedFrame, TextFrame } from "../lib/store";
import { Separator } from "./ui/separator";
import { ColorButton } from "./ui/colorpicker";
import { IconTip } from "./ui/tooltip";

/** Object/frame properties bar — fill, border, and exact X/Y/W/H (InPage-style). */
export function ObjectBar() {
  const sel = useSelectedFrame();
  const updateFrame = useDoc((s) => s.updateFrame);
  const f = sel?.frame;
  const dis = !sel;

  const patch = (p: Partial<TextFrame>) =>
    sel && updateFrame(sel.page.id, sel.frame.id, p);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs text-ink-soft">
      <span className="font-semibold uppercase tracking-wider">Frame</span>

      {/* Fill */}
      <IconTip label="Fill color">
        <span className="flex items-center gap-1">
          <Square size={13} />
          <ColorButton value={f?.fill ?? "transparent"} disabled={dis} title="Fill" onChange={(v) => patch({ fill: v })} />
        </span>
      </IconTip>

      {/* Border */}
      <IconTip label="Border">
        <span className="flex items-center gap-1">
          <ColorButton value={f?.borderColor ?? "#e3dccf"} disabled={dis} title="Border color" onChange={(v) => patch({ borderColor: v })} />
          <input
            type="number"
            min={0}
            max={20}
            value={f?.borderWidth ?? 0}
            disabled={dis}
            onChange={(e) => patch({ borderWidth: Number(e.target.value) || 0 })}
            className="w-12 rounded-md border border-line bg-transparent px-1 py-1 text-center text-ink outline-none disabled:opacity-45"
          />
        </span>
      </IconTip>

      <Separator orientation="vertical" />

      {/* Position */}
      <span className="flex items-center gap-1">
        <Move size={13} />
        <NumField label="X" value={f?.x ?? 0} disabled={dis} onChange={(n) => patch({ x: n })} />
        <NumField label="Y" value={f?.y ?? 0} disabled={dis} onChange={(n) => patch({ y: n })} />
      </span>

      {/* Size */}
      <span className="flex items-center gap-1">
        <Resize size={13} />
        <NumField label="W" value={f?.width ?? 0} disabled={dis} onChange={(n) => patch({ width: Math.max(40, n) })} />
        <NumField label="H" value={f?.height ?? 0} disabled={dis} onChange={(n) => patch({ height: Math.max(40, n) })} />
      </span>
    </div>
  );
}

function NumField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-0.5">
      <span className="text-[10px] font-medium">{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-14 rounded-md border border-line bg-transparent px-1 py-1 text-center text-ink outline-none disabled:opacity-45"
      />
    </label>
  );
}

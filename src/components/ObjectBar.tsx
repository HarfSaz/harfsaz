import { SHAPES, isOpenShape, shapePaint, ShapeKind } from "../editor/shapeGeometry";
import { Move, Resize } from "./ui/icons";
import { useDoc, useSelectedFrame, TextFrame } from "../lib/store";
import { Separator } from "./ui/separator";
import { ColorButton } from "./ui/colorpicker";
import { IconTip } from "./ui/tooltip";
import { pickImageFile } from "../lib/image";

/** Object/frame properties bar — fill, border, and exact X/Y/W/H (InPage-style). */
export function ObjectBar() {
  const sel = useSelectedFrame();
  const updateFrame = useDoc((s) => s.updateFrame);
  const removeFrame = useDoc((s) => s.removeFrame);
  const f = sel?.frame;
  const dis = !sel;
  const isImage = f?.kind === "image";
  const isShape = f?.kind === "shape";
  const openShape = isShape && isOpenShape(f.shape ?? "rect");
  const paint = f ? shapePaint(f.shape ?? "rect", f.fill, f.borderWidth, f.borderColor) : null;
  const addFrameAt = useDoc((s) => s.addFrameAt);

  const patch = (p: Partial<TextFrame>) =>
    sel && updateFrame(sel.page.id, sel.frame.id, p);

  async function replaceImage() {
    const picked = await pickImageFile();
    if (picked) patch({ src: picked.src });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs text-ink-soft">
      <span className="font-semibold uppercase tracking-wider">
        {f?.kind === "image" ? "Image" : f?.kind === "shape" ? "Shape" : "Frame"}
      </span>

      {isShape && f && <>
        <select aria-label="Shape type" value={f.shape ?? "rect"}
          className="h-8 rounded-md border border-line bg-paper px-2 text-xs"
          onChange={(e) => {
            const shape = e.target.value as ShapeKind;
            patch({ shape, ...(isOpenShape(shape) && !f.borderWidth ? { borderWidth: 3, borderColor: f.fill === "transparent" ? "#87633e" : f.fill } : {}) });
          }}>
          {SHAPES.map((s) => <option key={s.kind} value={s.kind}>{s.label}</option>)}
        </select>
        <button className="rounded-md px-2 py-1 text-xs hover:bg-paper-edge" onClick={() => {
          if (!sel) return;
          const { id: _id, ...copy } = f;
          addFrameAt(sel.page.id, "shape", { x: Math.min(f.x + 20, Math.max(0, sel.page.width - f.width)),
            y: Math.min(f.y + 20, Math.max(0, sel.page.height - f.height)), width: f.width, height: f.height },
            { ...copy, x: Math.min(f.x + 20, Math.max(0, sel.page.width - f.width)), y: Math.min(f.y + 20, Math.max(0, sel.page.height - f.height)) });
        }}>Duplicate</button>
      </>}

      {/* Image controls */}
      {isImage && (
        <>
          <div className="flex items-center overflow-hidden rounded-md border border-line">
            {(["cover", "contain"] as const).map((fit) => (
              <button
                key={fit}
                onClick={() => patch({ fit })}
                className={`px-2 py-1 capitalize transition-colors ${
                  (f?.fit ?? "cover") === fit ? "bg-accent text-white" : "text-ink hover:bg-paper-edge"
                }`}
                title={fit === "cover" ? "Fill the frame (crop)" : "Fit whole image"}
              >
                {fit}
              </button>
            ))}
          </div>
          <button
            onClick={replaceImage}
            className="rounded-md border border-line px-2 py-1 text-ink hover:bg-paper-edge"
          >
            Replace…
          </button>
          <Separator orientation="vertical" />
        </>
      )}

      {!openShape && <ColorButton value={f?.fill ?? "transparent"} disabled={dis}
        title={isShape ? "Fill color" : "Background color"} allowTransparent
        onChange={(v) => patch({ fill: v,
          ...(isShape && v === "transparent" && !f?.borderWidth ? { borderWidth: 2, borderColor: f?.fill === "transparent" ? "#87633e" : f?.fill ?? "#87633e" } : {}) })} />}

      {/* Border */}
      <IconTip label={isShape ? "Shape outline" : "Border"}>
        <span className="flex items-center gap-1">
          <ColorButton value={openShape ? paint?.stroke ?? "#87633e" : f?.borderColor ?? "#e3dccf"} disabled={dis} title={isShape ? "Outline color" : "Border color"}
            onChange={(v) => patch({ borderColor: v, borderWidth: openShape ? paint?.strokeWidth ?? 3 : Math.max(1, f?.borderWidth ?? 0) })} />
          <input
            type="number"
            aria-label={isShape ? "Stroke width" : "Border width"}
            min={openShape ? 1 : 0}
            max={20}
            value={openShape ? paint?.strokeWidth ?? 3 : f?.borderWidth ?? 0}
            disabled={dis}
            onChange={(e) => patch({ borderWidth: Math.max(openShape ? 1 : 0, Math.min(20, Number(e.target.value) || 0)),
              ...(openShape && !f?.borderWidth ? { borderColor: paint?.stroke ?? "#87633e" } : {}) })}
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

      {/* Delete (not for the main page-writing frame) */}
      {f && !f.isPageFrame && (
        <>
          <Separator orientation="vertical" />
          <button
            onClick={() => sel && removeFrame(sel.page.id, sel.frame.id)}
            className="rounded-md border border-line px-2 py-1 text-danger hover:bg-danger/10"
          >
            Delete
          </button>
        </>
      )}
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

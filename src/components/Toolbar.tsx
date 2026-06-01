import { useDoc, useSelectedFrame, TextFrame } from "../lib/store";
import { Button } from "./ui/button";
import { IconTip } from "./ui/tooltip";
import { Select, SelectOption } from "./ui/select";
import { ColorButton } from "./ui/colorpicker";
import {
  Minus,
  Plus,
  AlignRight,
  AlignCenter,
  AlignLeft,
  AlignJustify,
  LineHeight,
  LetterSpacing,
  TypeGlyph,
} from "./ui/icons";
import { FONTS, FONT_STYLE_ORDER } from "../lib/font";
import { LANGUAGES, languagePatch } from "../lib/languages";
import { applyFormat, applyAlign } from "../editor/format";

const FONT_OPTIONS: SelectOption[] = FONT_STYLE_ORDER.flatMap((style) =>
  FONTS.filter((f) => f.style === style).map((f) => ({
    value: f.key,
    label: f.label,
    group: style,
  }))
);

const LANG_OPTIONS: SelectOption[] = LANGUAGES.map((l) => ({
  value: l.code,
  label: `${l.nativeLabel} · ${l.label}`,
  group: l.dir === "rtl" ? "Right-to-left" : "Left-to-right",
}));

const ALIGNS: { v: TextFrame["align"]; icon: React.ReactNode; tip: string }[] = [
  { v: "right", icon: <AlignRight size={16} />, tip: "Align right" },
  { v: "center", icon: <AlignCenter size={16} />, tip: "Align center" },
  { v: "left", icon: <AlignLeft size={16} />, tip: "Align left" },
  { v: "justify", icon: <AlignJustify size={16} />, tip: "Justify" },
];

/** Main format toolbar — InPage's format ribbon, modernized into clean groups. */
export function Toolbar() {
  const sel = useSelectedFrame();
  const updateFrame = useDoc((s) => s.updateFrame);
  const f = sel?.frame;
  const dis = !sel;

  const patch = (p: Partial<TextFrame>) => sel && updateFrame(sel.page.id, sel.frame.id, p);
  const setSize = (n: number) => patch({ fontSize: Math.max(8, Math.min(400, n)) });

  // True when text is currently selected inside an editor — so format applies to
  // the selection (rich text). Otherwise we fall back to frame-level styling.
  const hasSelection = () => {
    const s = window.getSelection();
    return !!s && s.rangeCount > 0 && !s.isCollapsed;
  };

  // B/I/U: style the selection if any, else toggle the whole frame.
  const styleCmd = (
    cmd: "bold" | "italic" | "underline",
    frameKey: "bold" | "italic" | "underline"
  ) => {
    if (hasSelection() && applyFormat(cmd)) {
      // re-emit handled by editor onInput; nothing else to do
    } else {
      patch({ [frameKey]: !f?.[frameKey] } as Partial<TextFrame>);
    }
  };

  const colorCmd = (value: string) => {
    if (hasSelection()) applyFormat("foreColor", value);
    else patch({ color: value });
  };

  // Alignment is always per-paragraph in the rich editor (the caret's line);
  // fall back to frame-level only when no editor is focused.
  const alignCmd = (a: TextFrame["align"]) => {
    const inEditor = !!document.activeElement?.closest?.(".text-frame-edit");
    if (inEditor && applyAlign(a)) return;
    patch({ align: a });
  };

  // Keep the editor selection alive when pressing a toolbar control.
  const keepSelection = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="flex items-center gap-4 overflow-x-auto border-b border-line bg-surface px-4 py-2">
      {/* Language / keyboard */}
      <Group label="Language">
        <Select
          ariaLabel="Language"
          value={f?.lang ?? "ur"}
          disabled={dis}
          onChange={(code) => patch(languagePatch(code as any))}
          options={LANG_OPTIONS}
          className="w-[170px]"
        />
      </Group>

      {/* Font */}
      <Group label="Font">
        <Select
          ariaLabel="Font"
          value={f?.fontKey ?? "noto-nastaliq"}
          disabled={dis}
          onChange={(v) => patch({ fontKey: v })}
          options={FONT_OPTIONS}
          className="w-[190px]"
        />
      </Group>

      {/* Size */}
      <Group label="Size">
        <div className="flex items-center rounded-md border border-line">
          <Button variant="ghost" size="icon-sm" disabled={dis} onClick={() => setSize((f?.fontSize ?? 32) - 2)}>
            <Minus size={14} />
          </Button>
          <input
            type="number"
            value={f?.fontSize ?? 32}
            disabled={dis}
            onChange={(e) => setSize(Number(e.target.value) || 32)}
            className="w-12 border-x border-line bg-transparent py-1.5 text-center text-sm font-medium outline-none disabled:opacity-45 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <Button variant="ghost" size="icon-sm" disabled={dis} onClick={() => setSize((f?.fontSize ?? 32) + 2)}>
            <Plus size={14} />
          </Button>
        </div>
      </Group>

      {/* Style — applies to selection if any, else the whole frame */}
      <Group label="Style">
        <div className="flex items-center gap-1" onMouseDown={keepSelection}>
          <Toggle active={!!f?.bold} disabled={dis} tip="Bold (selection or frame)" onClick={() => styleCmd("bold", "bold")}>
            <TypeGlyph letter="B" bold />
          </Toggle>
          <Toggle active={!!f?.italic} disabled={dis} tip="Italic" onClick={() => styleCmd("italic", "italic")}>
            <TypeGlyph letter="I" italic />
          </Toggle>
          <Toggle active={!!f?.underline} disabled={dis} tip="Underline" onClick={() => styleCmd("underline", "underline")}>
            <TypeGlyph letter="U" underline />
          </Toggle>
        </div>
      </Group>

      {/* Color */}
      <Group label="Color">
        <span onMouseDown={keepSelection}>
          <IconTip label="Text color (selection or frame)">
            <ColorButton value={f?.color ?? "#1a1714"} disabled={dis} title="Text color" onChange={colorCmd} />
          </IconTip>
        </span>
      </Group>

      {/* Alignment — applies to the current paragraph(s), not the whole frame */}
      <Group label="Align">
        <div
          className="flex items-center overflow-hidden rounded-md border border-line"
          onMouseDown={keepSelection}
        >
          {ALIGNS.map((a, i) => (
            <IconTip key={a.v} label={a.tip}>
              <button
                disabled={dis}
                onClick={() => alignCmd(a.v)}
                className={[
                  "flex h-8 w-9 items-center justify-center text-ink transition-colors hover:bg-paper-edge disabled:opacity-45",
                  i > 0 ? "border-l border-line" : "",
                ].join(" ")}
              >
                {a.icon}
              </button>
            </IconTip>
          ))}
        </div>
      </Group>

      {/* Spacing */}
      <Group label="Spacing">
        <div className="flex items-center gap-2">
          <IconTip label="Line spacing">
            <div className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1">
              <LineHeight size={14} className="text-ink-soft" />
              <input
                type="number"
                step={0.1}
                min={1}
                max={4}
                value={f?.lineHeight ?? 2.1}
                disabled={dis}
                onChange={(e) => patch({ lineHeight: Number(e.target.value) || 2.1 })}
                className="w-10 bg-transparent text-center text-sm outline-none disabled:opacity-45 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </IconTip>
          <IconTip label="Letter spacing (kashida)">
            <div className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1">
              <LetterSpacing size={14} className="text-ink-soft" />
              <input
                type="number"
                step={0.5}
                value={f?.letterSpacing ?? 0}
                disabled={dis}
                onChange={(e) => patch({ letterSpacing: Number(e.target.value) || 0 })}
                className="w-10 bg-transparent text-center text-sm outline-none disabled:opacity-45 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </IconTip>
        </div>
      </Group>
    </div>
  );
}

/** Labeled group with a vertical divider on the right, InPage-style. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-r border-line pr-4 last:border-r-0 last:pr-0">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-soft">{label}</span>
      <div className="flex h-9 items-center">{children}</div>
    </div>
  );
}

function Toggle({
  active,
  disabled,
  tip,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  tip: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <IconTip label={tip}>
      <Button variant="toggle" size="icon-sm" data-active={active} disabled={disabled} onClick={onClick}>
        {children}
      </Button>
    </IconTip>
  );
}

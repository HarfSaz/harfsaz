import { useEffect, useRef, useState } from "react";
import { captureColorSelection, applySelectionColor, ColorSelection } from "../editor/selectionColor";
import { useDoc, useSelectedFrame, TextFrame } from "../lib/store";
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
  const dis = !sel || (f?.kind !== undefined && f.kind !== "text");

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

  const colorSelection = useRef<ColorSelection | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  useEffect(() => {
    setSelectedColor(null);
    const track = () => {
      const target = f ? captureColorSelection(f.id) : null;
      if (!target) return;
      const node = target.range.startContainer;
      const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
      if (element) setSelectedColor(window.getComputedStyle(element).color);
    };
    document.addEventListener("selectionchange", track);
    return () => document.removeEventListener("selectionchange", track);
  }, [f?.id, f?.color]);
  const colorCmd = (value: string) => {
    if (colorSelection.current) {
      if (applySelectionColor(colorSelection.current, value)) setSelectedColor(value);
    }
    else patch({ color: value });
    colorSelection.current = null;
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
    <div aria-label="Text formatting" className="format-toolbar flex shrink-0 items-center gap-3 overflow-x-auto border-b border-line bg-surface px-5 py-3">
      {/* Language / keyboard */}
      <Group label="Language">
        <Select
          ariaLabel="Language"
          value={f?.lang ?? "ur"}
          disabled={dis}
          onChange={(code) => patch(languagePatch(code as any))}
          options={LANG_OPTIONS}
          className="w-[150px]"
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
          className="w-[170px]"
        />
      </Group>

      {/* Size */}
      <Group label="Size">
        <div className="flex h-8 items-center rounded-lg border border-line bg-paper/60">
          <button
            disabled={dis}
            aria-label="Decrease font size"
            onClick={() => setSize((f?.fontSize ?? 32) - 2)}
            className="flex h-full w-7 items-center justify-center rounded-l-lg text-ink-soft transition-colors hover:bg-paper-edge hover:text-ink disabled:opacity-45"
          >
            <Minus size={14} />
          </button>
          <input
            type="number"
            aria-label="Font size"
            value={f?.fontSize ?? 32}
            disabled={dis}
            onChange={(e) => setSize(Number(e.target.value) || 32)}
            className="h-full w-10 border-x border-line bg-transparent text-center text-[13px] font-semibold tabular-nums outline-none disabled:opacity-45 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            disabled={dis}
            aria-label="Increase font size"
            onClick={() => setSize((f?.fontSize ?? 32) + 2)}
            className="flex h-full w-7 items-center justify-center rounded-r-lg text-ink-soft transition-colors hover:bg-paper-edge hover:text-ink disabled:opacity-45"
          >
            <Plus size={14} />
          </button>
        </div>
      </Group>

      <Group label="Color">
        <ColorButton value={selectedColor ?? f?.color ?? "#262722"} disabled={dis} title="Text color"
          onOpen={() => { colorSelection.current = f ? captureColorSelection(f.id) : null; }} onChange={colorCmd} />
      </Group>

      <Divider />

      {/* Style + color — applies to selection if any, else the whole frame */}
      <Segment onMouseDown={keepSelection}>
        <Toggle active={!!f?.bold} disabled={dis} tip="Bold (selection or frame)" onClick={() => styleCmd("bold", "bold")}>
          <TypeGlyph letter="B" bold />
        </Toggle>
        <Toggle active={!!f?.italic} disabled={dis} tip="Italic" onClick={() => styleCmd("italic", "italic")}>
          <TypeGlyph letter="I" italic />
        </Toggle>
        <Toggle active={!!f?.underline} disabled={dis} tip="Underline" onClick={() => styleCmd("underline", "underline")}>
          <TypeGlyph letter="U" underline />
        </Toggle>

      </Segment>

      {/* Alignment — applies to the current paragraph(s), not the whole frame */}
      <Segment onMouseDown={keepSelection}>
        {ALIGNS.map((a) => (
          <IconTip key={a.v} label={a.tip}>
            <button
              disabled={dis}
              aria-label={a.tip}
              onClick={() => alignCmd(a.v)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink transition-colors hover:bg-paper-edge disabled:opacity-45"
            >
              {a.icon}
            </button>
          </IconTip>
        ))}
      </Segment>

      <Divider />

      <Group label="Text direction">
        <Select ariaLabel="Text direction" value={f?.dir ?? "rtl"} disabled={dis}
          onChange={(dir) => patch({ dir: dir as "rtl" | "ltr" })}
          options={[{ value: "rtl", label: "← RTL" }, { value: "ltr", label: "LTR →" }]} className="w-[88px]" />
      </Group>

      {/* Spacing */}
      <Group label="Line height">
        <Stepper
          icon={<LineHeight size={13} className="text-ink-soft" />}
          tip="Line spacing"
          value={f?.lineHeight ?? 1.7}
          step={0.1}
          min={1}
          max={4}
          disabled={dis}
          onChange={(n) => patch({ lineHeight: n || 1.7 })}
        />
      </Group>
      <Group label="Letter spacing">
        <Stepper
          icon={<LetterSpacing size={13} className="text-ink-soft" />}
          tip="Letter spacing in pixels"
          value={f?.letterSpacing ?? 0}
          step={0.5}
          disabled={dis}
          onChange={(n) => patch({ letterSpacing: n || 0 })}
        />
      </Group>
    </div>
  );
}

/** A labeled control: small caption above, control below — clean & airy. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <span className="px-0.5 text-[10px] font-medium tracking-wide text-ink-soft">{label}</span>
      <div className="flex h-8 items-center">{children}</div>
    </div>
  );
}

/** A grouped pill of icon buttons (segmented control look). */
function Segment({
  children,
  onMouseDown,
}: {
  children: React.ReactNode;
  onMouseDown?: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="mt-[18px] flex h-8 items-center gap-0.5 rounded-lg border border-line bg-paper/60 px-1" onMouseDown={onMouseDown}>
      {children}
    </div>
  );
}

function Divider() {
  return <span className="mx-1 mt-[18px] h-7 w-px self-start bg-line/70" />;
}

/** Compact icon + number stepper used for spacing controls. */
function Stepper({
  icon,
  tip,
  value,
  step,
  min,
  max,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  tip: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <IconTip label={tip}>
      <div className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-paper/60 px-2.5">
        {icon}
        <input
          type="number"
          aria-label={tip}
          step={step}
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-9 bg-transparent text-center text-[13px] font-medium tabular-nums outline-none disabled:opacity-45 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    </IconTip>
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
      <button
        aria-label={tip}
        aria-pressed={active}
        data-active={active}
        disabled={disabled}
        onClick={onClick}
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink transition-colors hover:bg-paper-edge disabled:opacity-45 data-[active=true]:bg-accent data-[active=true]:text-white"
      >
        {children}
      </button>
    </IconTip>
  );
}

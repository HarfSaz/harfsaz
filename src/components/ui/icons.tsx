// Central icon set. Heroicons for UI glyphs; styled text for type-format buttons
// (Heroicons has no Bold/Italic/Underline — text glyphs are clearer anyway).
import {
  CursorArrowRaysIcon,
  DocumentTextIcon,
  PhotoIcon,
  Squares2X2Icon,
  MinusIcon,
  PlusIcon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  SparklesIcon,
  DocumentPlusIcon,
  FolderOpenIcon,
  ArrowDownTrayIcon,
  ArrowUpOnSquareIcon,
  ChevronDownIcon,
  ChevronDoubleRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  CheckIcon,
  XMarkIcon,
  CheckCircleIcon,
  Square2StackIcon,
  ArrowsPointingInIcon,
  ViewfinderCircleIcon,
  Cog6ToothIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from "@heroicons/react/24/outline";

export type IconProps = { size?: number; className?: string };

type SvgComp = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const wrap =
  (Comp: SvgComp) =>
  ({ size = 18, className = "" }: IconProps) =>
    <Comp className={className} width={size} height={size} aria-hidden="true" />;

// Tool / UI icons
export const Cursor = wrap(CursorArrowRaysIcon);
export const TextTool = wrap(DocumentTextIcon);
export const ImageTool = wrap(PhotoIcon);
export const ShapeTool = wrap(Squares2X2Icon);
export const Minus = wrap(MinusIcon);
export const Plus = wrap(PlusIcon);
// Alignment: custom unambiguous SVGs (lines of varying length, anchored to the
// correct side) — Heroicons' generic "Bars" icons all look identical.
// Each row is [x1, x2] in a 24-wide box. Full width spans 3→21.
function alignIcon(rows: [number, number][]) {
  return ({ size = 16, className = "" }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      // Explicit, non-shrinking box — inside a flex pill the SVG was collapsing
      // to ~2px wide, making the lines look like dots.
      style={{ width: size, height: size, flexShrink: 0, display: "block" }}
      className={className}
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
    >
      {rows.map(([x1, x2], i) => (
        <line key={i} x1={x1} y1={5 + i * 4.5} x2={x2} y2={5 + i * 4.5} />
      ))}
    </svg>
  );
}
// Long rows = full width; short rows hug the correct edge.
export const AlignLeft = alignIcon([
  [3, 21], // full
  [3, 13], // short, left
  [3, 17],
  [3, 11],
]);
export const AlignRight = alignIcon([
  [3, 21], // full
  [11, 21], // short, right
  [7, 21],
  [13, 21],
]);
export const AlignCenter = alignIcon([
  [3, 21], // full
  [7, 17], // short, centered
  [5, 19],
  [8, 16],
]);
export const AlignJustify = alignIcon([
  [3, 21],
  [3, 21],
  [3, 21],
  [3, 21],
]);
export const LineHeight = wrap(ArrowsUpDownIcon);
export const LetterSpacing = wrap(ArrowsRightLeftIcon);
export const Sparkles = wrap(SparklesIcon);
export const NewPage = wrap(DocumentPlusIcon);
export const Open = wrap(FolderOpenIcon);
export const Save = wrap(ArrowDownTrayIcon);
export const Export = wrap(ArrowUpOnSquareIcon);
export const ChevronDown = wrap(ChevronDownIcon);
export const CollapseRight = wrap(ChevronDoubleRightIcon);
export const ZoomIn = wrap(MagnifyingGlassPlusIcon);
export const ZoomOut = wrap(MagnifyingGlassMinusIcon);
export const Fit = wrap(ArrowsPointingOutIcon);
export const Check = wrap(CheckIcon);
export const XMark = wrap(XMarkIcon);
export const CheckAll = wrap(CheckCircleIcon);
export const Frame = wrap(Square2StackIcon);
export const Move = wrap(ArrowsPointingInIcon);
export const Resize = wrap(ViewfinderCircleIcon);
export const Settings = wrap(Cog6ToothIcon);
export const Undo = wrap(ArrowUturnLeftIcon);
export const Redo = wrap(ArrowUturnRightIcon);

/** Styled text glyph for type-format buttons (B / I / U). */
export function TypeGlyph({
  letter,
  bold,
  italic,
  underline,
}: {
  letter: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}) {
  return (
    <span
      className="text-[15px] leading-none"
      style={{
        fontWeight: bold ? 800 : 600,
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : "none",
        fontFamily: "Georgia, serif",
      }}
    >
      {letter}
    </span>
  );
}

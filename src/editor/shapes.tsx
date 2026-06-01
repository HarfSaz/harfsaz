import { ShapeKind } from "../lib/store";

/** Catalog of shapes for the picker (key + label + a preview icon). */
export const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: "rect", label: "Rectangle" },
  { kind: "rounded", label: "Rounded" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "line", label: "Line" },
  { kind: "triangle", label: "Triangle" },
  { kind: "arrow", label: "Arrow" },
  { kind: "star", label: "Star" },
];

/** Render a shape filling a w×h box with the given fill + border. Box-like
 *  shapes (rect/rounded/ellipse) use CSS; the rest use a scalable SVG. */
export function Shape({
  kind,
  fill,
  borderWidth,
  borderColor,
}: {
  kind: ShapeKind;
  width?: number;
  height?: number;
  fill: string;
  borderWidth: number;
  borderColor: string;
}) {
  if (kind === "rect" || kind === "rounded" || kind === "ellipse") {
    return (
      <div
        className="pointer-events-none h-full w-full"
        style={{
          background: fill,
          borderRadius: kind === "ellipse" ? "50%" : kind === "rounded" ? 14 : 2,
        }}
      />
    );
  }

  // SVG shapes — drawn in a 0..100 viewBox, stretched to the frame (no aspect
  // lock so they resize freely with the box).
  const stroke = borderColor;
  const sw = Math.max(borderWidth, kind === "line" || kind === "arrow" ? 3 : 0);
  const common = { fill, stroke, strokeWidth: sw, vectorEffect: "non-scaling-stroke" as const };

  let el: React.ReactNode = null;
  switch (kind) {
    case "line":
      el = <line x1="2" y1="98" x2="98" y2="2" stroke={fill} strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
      break;
    case "triangle":
      el = <polygon points="50,4 96,96 4,96" {...common} />;
      break;
    case "arrow":
      el = (
        <g stroke={fill} fill="none" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
          <line x1="6" y1="50" x2="94" y2="50" />
          <polyline points="64,20 94,50 64,80" />
        </g>
      );
      break;
    case "star":
      el = <polygon points="50,3 61,38 98,38 68,60 79,95 50,73 21,95 32,60 2,38 39,38" {...common} />;
      break;
  }

  return (
    <svg
      className="pointer-events-none h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {el}
    </svg>
  );
}

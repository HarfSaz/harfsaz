import { ShapeKind, shapePaint, shapePath } from "./shapeGeometry";
export { SHAPES } from "./shapeGeometry";

/** Use the same outline and paint as vector export, including open arrow paths. */
export function Shape({ kind, width = 100, height = 100, fill, borderWidth, borderColor }: {
  kind: ShapeKind; width?: number; height?: number; fill: string; borderWidth: number; borderColor: string;
}) {
  const paint = shapePaint(kind, fill, borderWidth, borderColor);
  return (
    <svg className="pointer-events-none h-full w-full" aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={shapePath(kind, width, height, paint.strokeWidth)} {...paint} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

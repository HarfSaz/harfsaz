/** Shared geometry for the editor, picker, and vector PDF output. */
export const SHAPES = [
  { kind: "rect", label: "Rectangle", group: "Basic" },
  { kind: "rounded", label: "Rounded rectangle", group: "Basic" },
  { kind: "ellipse", label: "Ellipse", group: "Basic" },
  { kind: "triangle", label: "Triangle", group: "Basic" },
  { kind: "diamond", label: "Diamond", group: "Basic" },
  { kind: "pentagon", label: "Pentagon", group: "Basic" },
  { kind: "hexagon", label: "Hexagon", group: "Basic" },
  { kind: "line", label: "Diagonal line", group: "Lines & arrows" },
  { kind: "line-horizontal", label: "Horizontal line", group: "Lines & arrows" },
  { kind: "line-vertical", label: "Vertical line", group: "Lines & arrows" },
  { kind: "arrow", label: "Right arrow", group: "Lines & arrows" },
  { kind: "arrow-left", label: "Left arrow", group: "Lines & arrows" },
  { kind: "arrow-double", label: "Double arrow", group: "Lines & arrows" },
  { kind: "chevron", label: "Chevron", group: "Symbols" },
  { kind: "cross", label: "Cross / plus", group: "Symbols" },
  { kind: "callout", label: "Speech callout", group: "Symbols" },
  { kind: "star", label: "Five-point star", group: "Symbols" },
  { kind: "star-eight", label: "Eight-point star", group: "Symbols" },
] as const;
export type ShapeKind = typeof SHAPES[number]["kind"];
export function isOpenShape(kind: ShapeKind): boolean {
  return kind === "line" || kind.startsWith("line-") || kind === "arrow" || kind.startsWith("arrow-");
}
export function shapePaint(kind: ShapeKind, fill: string, borderWidth: number, borderColor: string) {
  const open = isOpenShape(kind);
  return {
    fill: open ? "none" : fill === "transparent" ? "none" : fill,
    // Older lines used fill as their stroke and had a zero border width.
    stroke: open && borderWidth <= 0 ? fill : borderColor,
    strokeWidth: open ? Math.max(1, borderWidth || 3) : Math.max(0, borderWidth),
  };
}

/** All paths use absolute pixel coordinates and fit their stroke inside the box. */
export function shapePath(kind: ShapeKind, width: number, height: number, strokeWidth = 0): string {
  const inset = Math.min(Math.max(0, strokeWidth) / 2, Math.min(width, height) / 2);
  const w = Math.max(0, width - inset * 2), h = Math.max(0, height - inset * 2);
  const x = (n: number) => +(inset + w * n / 100).toFixed(4);
  const y = (n: number) => +(inset + h * n / 100).toFixed(4);
  const point = (a: number, b: number) => `${x(a)} ${y(b)}`;
  const polygon = (points: number[][]) => points.map(([a,b], i) => `${i ? "L" : "M"} ${point(a,b)}`).join(" ") + " Z";
  switch (kind) {
    case "rect": return polygon([[0,0],[100,0],[100,100],[0,100]]);
    case "rounded": {
      const r = Math.min(14, w / 2, h / 2), k = r * 0.5522847498;
      const l = inset, t = inset, right = inset + w, b = inset + h;
      return `M ${l+r} ${t} L ${right-r} ${t} C ${right-r+k} ${t} ${right} ${t+r-k} ${right} ${t+r} L ${right} ${b-r} C ${right} ${b-r+k} ${right-r+k} ${b} ${right-r} ${b} L ${l+r} ${b} C ${l+r-k} ${b} ${l} ${b-r+k} ${l} ${b-r} L ${l} ${t+r} C ${l} ${t+r-k} ${l+r-k} ${t} ${l+r} ${t} Z`;
    }
    case "ellipse": return `M ${point(100,50)} C ${point(100,77.6142)} ${point(77.6142,100)} ${point(50,100)} C ${point(22.3858,100)} ${point(0,77.6142)} ${point(0,50)} C ${point(0,22.3858)} ${point(22.3858,0)} ${point(50,0)} C ${point(77.6142,0)} ${point(100,22.3858)} ${point(100,50)} Z`;
    case "line": return `M ${point(0,100)} L ${point(100,0)}`;
    case "line-horizontal": return `M ${point(0,50)} L ${point(100,50)}`;
    case "line-vertical": return `M ${point(50,0)} L ${point(50,100)}`;
    case "arrow": return `M ${point(0,50)} L ${point(100,50)} M ${point(72,18)} L ${point(100,50)} L ${point(72,82)}`;
    case "arrow-left": return `M ${point(100,50)} L ${point(0,50)} M ${point(28,18)} L ${point(0,50)} L ${point(28,82)}`;
    case "arrow-double": return `M ${point(0,50)} L ${point(100,50)} M ${point(28,18)} L ${point(0,50)} L ${point(28,82)} M ${point(72,18)} L ${point(100,50)} L ${point(72,82)}`;
    case "triangle": return polygon([[50,0],[100,100],[0,100]]);
    case "diamond": return polygon([[50,0],[100,50],[50,100],[0,50]]);
    case "pentagon": return polygon([[50,0],[100,38],[81,100],[19,100],[0,38]]);
    case "hexagon": return polygon([[25,0],[75,0],[100,50],[75,100],[25,100],[0,50]]);
    case "chevron": return polygon([[0,0],[60,0],[100,50],[60,100],[0,100],[40,50]]);
    case "cross": return polygon([[35,0],[65,0],[65,35],[100,35],[100,65],[65,65],[65,100],[35,100],[35,65],[0,65],[0,35],[35,35]]);
    case "callout": return polygon([[0,0],[100,0],[100,75],[40,75],[18,100],[18,75],[0,75]]);
    case "star":
    case "star-eight": {
      const count = kind === "star" ? 5 : 8;
      return polygon(Array.from({ length: count * 2 }, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI / count;
        const radius = i % 2 ? (count === 5 ? 21 : 31) : 49;
        return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius];
      }));
    }
  }
}

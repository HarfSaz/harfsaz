import { useUi } from "../lib/ui";

/**
 * Horizontal ruler above the canvas, InPage-style. Ticks every 10px (scaled),
 * with labels every 50px. Purely visual for now — a measurement reference.
 */
export function Ruler({ pageWidth }: { pageWidth: number }) {
  const zoom = useUi((s) => s.zoom);
  const step = 50; // px in page space between labels
  const ticks: number[] = [];
  for (let x = 0; x <= pageWidth; x += step) ticks.push(x);

  return (
    <div className="relative h-5 select-none border-b border-line bg-paper text-[8px] text-ink-soft">
      <div className="absolute inset-0 flex items-end" style={{ paddingLeft: 8 }}>
        {ticks.map((x) => (
          <div
            key={x}
            className="absolute bottom-0 flex flex-col items-center"
            style={{ left: x * zoom }}
          >
            <span className="leading-none">{x}</span>
            <span className="block h-1.5 w-px bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}

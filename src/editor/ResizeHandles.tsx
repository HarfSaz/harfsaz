type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const HANDLES: { h: Handle; cls: string; cursor: string }[] = [
  { h: "nw", cls: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
  { h: "ne", cls: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
  { h: "sw", cls: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
  { h: "se", cls: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
  { h: "n", cls: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "ns-resize" },
  { h: "s", cls: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "ns-resize" },
  { h: "e", cls: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { h: "w", cls: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

/** Eight resize grips shown on a selected frame. */
export function ResizeHandles({
  startResize,
}: {
  startResize: (h: Handle) => (e: React.PointerEvent) => void;
}) {
  return (
    <>
      {HANDLES.map(({ h, cls, cursor }) => (
        <span
          key={h}
          onPointerDown={startResize(h)}
          style={{ cursor }}
          className={`absolute z-10 h-2.5 w-2.5 rounded-sm border border-accent bg-surface shadow-sm ${cls}`}
        />
      ))}
    </>
  );
}

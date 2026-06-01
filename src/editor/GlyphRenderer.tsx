import { useEffect, useState } from "react";
import { layoutText, RenderLayout, isTauri } from "../lib/tauri";
import { loadFontBytes } from "../lib/font";

/**
 * Print-grade renderer: draws the exact vector glyph outlines produced by the
 * Rust HarfBuzz/rustybuzz shaper as SVG paths. This is the path that will drive
 * pixel-precise justification and PDF export — independent of the browser's own
 * text shaping.
 *
 * Only functional inside the Tauri runtime (it calls the Rust `layout_text`
 * command). In a plain browser tab it shows a hint instead.
 */
export function GlyphRenderer({
  text,
  fontSize,
  width,
  height,
  fontKey,
}: {
  text: string;
  fontSize: number;
  width: number;
  height: number;
  fontKey: string;
}) {
  const [layout, setLayout] = useState<RenderLayout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    (async () => {
      try {
        const font = await loadFontBytes(fontKey);
        const result = await layoutText(text, font, fontSize, width);
        if (alive) {
          setLayout(result);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [text, fontSize, width, fontKey]);

  if (!isTauri()) {
    return (
      <div className="render-hint">
        Print-grade vector rendering runs in the desktop app (Tauri). In the
        browser preview, use Edit mode to see Nastaliq.
      </div>
    );
  }

  if (error) return <div className="render-error">{error}</div>;
  if (!layout) return <div className="render-hint">Shaping…</div>;

  const overflow = layout.used_height > height;
  const clipId = `frame-clip-${width}x${height}`;

  return (
    <svg
      className="glyph-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Clip glyphs to the frame so nothing bleeds past its edges. */}
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {layout.lines.flatMap((line, li) =>
          line.glyphs.map(
            (g, gi) =>
              g.path && (
                <path key={`${li}-${gi}`} d={g.path} className="glyph-path" />
              )
          )
        )}
      </g>
      {overflow && (
        <rect
          x={0}
          y={height - 4}
          width={width}
          height={4}
          className="overflow-marker"
        />
      )}
    </svg>
  );
}

import { useEffect } from "react";
import { TextFrame, useDoc } from "../lib/store";
import { GlyphRenderer } from "./GlyphRenderer";
import { SuggestionLayer } from "./SuggestionLayer";
import { RichEditor } from "./RichEditor";
import { ResizeHandles } from "./ResizeHandles";
import { useFrameTransform } from "./useFrameTransform";
import { Shape } from "./shapes";
import { ensureFontFace, getFont } from "../lib/font";
import { getLanguage } from "../lib/languages";
import { useSuggestions } from "../lib/suggestions";
import { useUi } from "../lib/ui";

/**
 * A single text frame on the page.
 *
 *  - "edit"    : a native RTL <textarea> styled with Noto Nastaliq. A textarea
 *                gives correct RTL caret movement, backspace, and selection for
 *                free — a contenteditable with manual insertion fought the
 *                browser's bidi caret and produced reversed text / dead backspace.
 *  - "preview" : print-grade vector render via the Rust HarfBuzz shaper.
 *
 *  Phonetic ON: as you type Roman letters, the latest *word* is transliterated to
 *  Urdu. We convert per word boundary so the native caret/backspace keep working
 *  and the visual order stays correct.
 */
export function TextFrameView({ pageId, frame }: { pageId: string; frame: TextFrame }) {
  const selectedFrameId = useDoc((s) => s.selectedFrameId);
  const selectFrame = useDoc((s) => s.selectFrame);
  const updateFrame = useDoc((s) => s.updateFrame);

  const mode = useUi((s) => s.viewMode);
  const phonetic = useUi((s) => s.phonetic);
  const revision = useDoc((s) => s.revision);
  const selected = selectedFrameId === frame.id;
  const font = getFont(frame.fontKey);
  const fontFamily = `"${font.cssFamily}", serif`;
  const hasSuggestions = useSuggestions(
    (s) => s.items.some((i) => i.frameId === frame.id)
  );
  const relocate = useSuggestions((s) => s.relocate);
  const { moveProps, startResize } = useFrameTransform(pageId, frame.id);

  // Apply an accepted correction: splice the suggestion into the text, then
  // re-resolve the remaining suggestions' spans against the new text.
  function applyCorrection(start: number, end: number, suggestion: string) {
    const next = frame.text.slice(0, start) + suggestion + frame.text.slice(end);
    updateFrame(pageId, frame.id, { text: next, html: "" });
    relocate(frame.id, next);
  }

  // Register the @font-face so the edit layer renders this family.
  useEffect(() => {
    ensureFontFace(frame.fontKey).catch(() => {});
  }, [frame.fontKey]);

  // Rich editor change: store both the HTML (rich) and plain text (AI/count).
  function handleRichChange(html: string, text: string) {
    updateFrame(pageId, frame.id, { html, text });
  }

  // Computed text style applied to the editor/preview text.
  // Nastaliq fonts bake ~0.5em of empty space above the glyph ink, so the first
  // line looks like it floats. Pull the text block UP by that much (scaled to the
  // font size) so the ink hugs the top of the frame. The top 0.5em that's clipped
  // is empty font padding, so no glyph is lost.
  // In edit mode, alignment is per-paragraph (execCommand sets it on each line's
  // block), so the editor container must NOT force a frame-wide text-align — that
  // would override per-line alignment and make new lines inherit the wrong align.
  // In preview mode the frame-level align is the default. RTL means the natural
  // default is right-aligned without setting text-align.
  const textStyle: React.CSSProperties = {
    fontSize: frame.fontSize,
    fontFamily,
    fontWeight: frame.bold ? 700 : 400,
    fontStyle: frame.italic ? "italic" : "normal",
    textDecoration: frame.underline ? "underline" : "none",
    color: frame.color,
    lineHeight: frame.lineHeight,
    letterSpacing: frame.letterSpacing ? `${frame.letterSpacing}px` : undefined,
    marginTop: -Math.round(frame.fontSize * 0.32),
    paddingTop: 6,
  };

  // The main page-filling frame is seamless (no border/hover/selection chrome) —
  // it reads as the page's writing area, not a box floating in white space.
  // Added layout frames keep their object chrome.
  const isPage = frame.isPageFrame;

  // Image & shape frames render their own content (not the text editor).
  if (frame.kind === "image" || frame.kind === "shape") {
    return (
      <div
        className={`text-frame${selected ? " selected" : ""}`}
        style={{
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
          border: frame.borderWidth
            ? `${frame.borderWidth}px solid ${frame.borderColor}`
            : undefined,
          cursor: "move",
        }}
        onMouseDown={() => selectFrame(frame.id)}
        {...moveProps}
      >
        {frame.kind === "image" ? (
          frame.src ? (
            <img
              src={frame.src}
              alt=""
              draggable={false}
              className="pointer-events-none h-full w-full select-none"
              style={{ objectFit: frame.fit ?? "cover", borderRadius: 2 }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-paper-edge text-xs text-ink-soft">
              No image
            </div>
          )
        ) : (
          <Shape
            kind={frame.shape ?? "rect"}
            width={frame.width}
            height={frame.height}
            fill={frame.fill}
            borderWidth={frame.borderWidth}
            borderColor={frame.borderColor}
          />
        )}
        {selected && <ResizeHandles startResize={startResize} />}
      </div>
    );
  }

  return (
    <div
      className={
        isPage ? "text-frame text-frame--page" : `text-frame${selected ? " selected" : ""}`
      }
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
        background: frame.fill,
        border:
          !isPage && frame.borderWidth
            ? `${frame.borderWidth}px solid ${frame.borderColor}`
            : undefined,
      }}
      onMouseDown={() => selectFrame(frame.id)}
    >
      {mode === "edit" && hasSuggestions ? (
        // Inline review mode: highlighted spans with accept/reject popovers.
        <SuggestionLayer
          frameId={frame.id}
          text={frame.text}
          fontSize={frame.fontSize}
          fontFamily={fontFamily}
          onApply={applyCorrection}
        />
      ) : mode === "edit" ? (
        <RichEditor
          html={frame.html}
          fallbackText={frame.text}
          phonetic={phonetic}
          lang={frame.lang}
          dir={frame.dir}
          phoneticMap={getLanguage(frame.lang).phoneticMap}
          style={textStyle}
          onChange={handleRichChange}
          revision={revision}
        />
      ) : (
        <GlyphRenderer
          text={frame.text}
          fontSize={frame.fontSize}
          width={frame.width}
          height={frame.height}
          fontKey={frame.fontKey}
        />
      )}

      {/* Move grip + resize handles for selected non-page text frames. The grip
          lets you drag-move without disturbing text selection inside. */}
      {selected && !isPage && (
        <>
          <span
            {...moveProps}
            title="Drag to move"
            className="absolute -top-3 left-1/2 z-10 h-3 w-8 -translate-x-1/2 cursor-move rounded-t-md bg-accent"
          />
          <ResizeHandles startResize={startResize} />
        </>
      )}
    </div>
  );
}

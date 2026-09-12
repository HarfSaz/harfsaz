import { Check, XMark as X } from "../components/ui/icons";
import { useSuggestions } from "../lib/suggestions";

/**
 * Inline, non-destructive proofreading overlay (qalam.ai-style).
 *
 * Renders the frame's text with flagged spans highlighted. Clicking a highlight
 * opens a small popover to accept (apply the suggestion) or reject (dismiss it).
 * Shown in place of the textarea while there are pending suggestions for the
 * frame, so the user reviews changes in context rather than swapping the whole
 * frame text from the side panel.
 */
export function SuggestionLayer({
  frameId,
  text,
  fontSize,
  fontFamily,
  onApply,
}: {
  frameId: string;
  text: string;
  fontSize: number;
  fontFamily: string;
  /** Apply a single accepted correction: replace [start,end) with suggestion. */
  onApply: (start: number, end: number, suggestion: string) => void;
}) {
  const items = useSuggestions((s) => s.items.filter((i) => i.frameId === frameId));
  const activeId = useSuggestions((s) => s.activeId);
  const setActive = useSuggestions((s) => s.setActive);
  const remove = useSuggestions((s) => s.remove);

  // Build the rendered runs: alternating plain text and highlighted spans.
  const runs: React.ReactNode[] = [];
  let cursor = 0;
  for (const sug of items) {
    if (sug.start > cursor) {
      runs.push(<span key={`t-${cursor}`}>{text.slice(cursor, sug.start)}</span>);
    }
    const active = sug.id === activeId;
    runs.push(
      <span key={sug.id} className="relative inline-block">
        <mark
          className="cursor-pointer rounded-[3px] bg-[#fdf0c8] px-0.5 underline decoration-accent/60 decoration-2 underline-offset-4"
          onClick={(e) => {
            e.stopPropagation();
            setActive(active ? null : sug.id);
          }}
        >
          {text.slice(sug.start, sug.end)}
        </mark>
        {active && (
          <span
            dir="rtl"
            className="absolute right-0 top-full z-20 mt-1 flex w-max max-w-[280px] flex-col gap-2 rounded-lg border border-line bg-surface p-3 text-right shadow-harfsaz"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="flex items-center justify-between gap-3 font-ui text-[11px] text-ink-soft">
              <span className="rounded bg-paper-edge px-1.5 py-0.5">{sug.reason}</span>
              <span>تجویز</span>
            </span>
            <span className="font-nastaliq text-lg leading-relaxed text-ink">
              {sug.suggestion}
            </span>
            <span className="flex justify-end gap-2 font-ui">
              <button
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs text-white hover:bg-accent-deep"
                onClick={() => {
                  onApply(sug.start, sug.end, sug.suggestion);
                  remove(sug.id);
                }}
              >
                <Check size={13} /> قبول
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs text-ink-soft hover:bg-paper-edge"
                onClick={() => remove(sug.id)}
              >
                <X size={13} /> رد
              </button>
            </span>
          </span>
        )}
      </span>
    );
    cursor = sug.end;
  }
  if (cursor < text.length) {
    runs.push(<span key={`t-end`}>{text.slice(cursor)}</span>);
  }

  return (
    <div
      dir="rtl"
      lang="ur"
      className="h-full w-full overflow-hidden whitespace-pre-wrap break-words px-2.5 py-2 leading-[2.1]"
      style={{ fontSize, fontFamily }}
      onClick={() => setActive(null)}
    >
      {runs}
    </div>
  );
}

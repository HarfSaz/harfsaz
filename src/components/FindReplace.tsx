import { useEffect, useRef } from "react";
import { XMark } from "./ui/icons";
import { useSearch, replaceOne, replaceAll } from "../lib/search";

/**
 * Find & replace bar (⌘F).
 *
 * Docked under the toolbar rather than shown as a modal, so the user can see
 * the page and the current hit's frame while stepping through matches.
 *
 * The "flexible" toggle is the Urdu/Arabic-specific part: the same word is
 * commonly spelled with different ya/kaf/ha forms, with or without harakat, and
 * with kashida elongation — a literal search misses most real occurrences.
 */
export function FindReplace() {
  const open = useSearch((s) => s.open);
  const setOpen = useSearch((s) => s.setOpen);
  const query = useSearch((s) => s.query);
  const setQuery = useSearch((s) => s.setQuery);
  const replacement = useSearch((s) => s.replacement);
  const setReplacement = useSearch((s) => s.setReplacement);
  const options = useSearch((s) => s.options);
  const setOption = useSearch((s) => s.setOption);
  const matches = useSearch((s) => s.matches);
  const current = useSearch((s) => s.current);
  const next = useSearch((s) => s.next);
  const prev = useSearch((s) => s.prev);
  const refresh = useSearch((s) => s.refresh);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus + select the query when the bar opens, so ⌘F then typing replaces the
  // previous search the way every other editor behaves.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  if (!open) return null;

  const total = matches.length;
  const hasQuery = query.length > 0;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    }
  }

  function doReplace() {
    const hit = matches[current];
    if (!hit) return;
    if (replaceOne(hit, replacement)) {
      // The document changed underneath us — re-run so offsets stay valid.
      refresh();
    }
  }

  function doReplaceAll() {
    if (!hasQuery) return;
    replaceAll(query, replacement, options);
    refresh();
  }

  return (
    <div
      dir="ltr"
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-2 text-[12px]"
    >
      {/* Find */}
      <div className="flex items-center gap-1.5">
        <label className="text-ink-soft">Find</label>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="تلاش کریں…"
          className="w-[200px] rounded-md border border-line bg-surface px-2 py-1 text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
        />
        <span className="min-w-[70px] text-ink-soft">
          {hasQuery ? (total > 0 ? `${current + 1} of ${total}` : "No results") : ""}
        </span>
        <button
          onClick={prev}
          disabled={total === 0}
          title="Previous match (⇧Enter)"
          className="rounded px-1.5 py-0.5 hover:bg-paper-edge disabled:opacity-40"
        >
          ↑
        </button>
        <button
          onClick={next}
          disabled={total === 0}
          title="Next match (Enter)"
          className="rounded px-1.5 py-0.5 hover:bg-paper-edge disabled:opacity-40"
        >
          ↓
        </button>
      </div>

      {/* Replace */}
      <div className="flex items-center gap-1.5">
        <label className="text-ink-soft">Replace</label>
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="بدلیں…"
          className="w-[200px] rounded-md border border-line bg-surface px-2 py-1 text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
        />
        <button
          onClick={doReplace}
          disabled={total === 0}
          className="rounded-md border border-line px-2 py-1 hover:bg-paper-edge disabled:opacity-40"
        >
          Replace
        </button>
        <button
          onClick={doReplaceAll}
          disabled={total === 0}
          className="rounded-md border border-line px-2 py-1 hover:bg-paper-edge disabled:opacity-40"
        >
          All
        </button>
      </div>

      {/* Options */}
      <div className="flex items-center gap-3 text-ink-soft">
        <Toggle
          checked={options.flexible}
          onChange={(v) => setOption("flexible", v)}
          label="Urdu-flexible"
          title={
            "Match despite spelling variation — ignores harakat (زیر زبر) and kashida, " +
            "and treats ی/ي/ے, ک/ك, ہ/ه/ة and Arabic-Indic digits as equivalent."
          }
        />
        <Toggle
          checked={options.caseSensitive}
          onChange={(v) => setOption("caseSensitive", v)}
          label="Case"
          title="Case-sensitive (affects Latin text only)"
        />
        <Toggle
          checked={options.wholeWord}
          onChange={(v) => setOption("wholeWord", v)}
          label="Whole word"
          title="Match whole words only"
        />
      </div>

      <button
        onClick={() => setOpen(false)}
        title="Close (Esc)"
        className="ml-auto rounded p-1 text-ink-soft hover:bg-paper-edge"
      >
        <XMark size={16} />
      </button>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  title: string;
}) {
  return (
    <label title={title} className="flex cursor-pointer items-center gap-1 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
      {label}
    </label>
  );
}

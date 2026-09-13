import { tableHtml, editTable } from "../editor/publishing";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useSelectedFrame } from "../lib/store";
import { useUi } from "../lib/ui";
import { defaultNumerals, editorForFrame, formatList, NumeralStyle, PARAGRAPH_STYLES,
  ParagraphStyle, rangeInEditor, selectedParagraphs, setParagraphNumber, styleParagraph } from "../editor/paragraphs";

/** Keeps the text selection while keyboard focus moves into toolbar controls. */
export function ParagraphBar() {
  const sel = useSelectedFrame();
  const mode = useUi((s) => s.viewMode);
  const saved = useRef<Range | null>(null);
  const applySpacingOnClose = useRef(false);
  const [ready, setReady] = useState(false);
  const [style, setStyle] = useState("");
  const [list, setList] = useState("");
  const [tableOpen, setTableOpen] = useState(false);
  const [tableSize, setTableSize] = useState({ rows: 3, columns: 3 });
  const tableAction = useRef<"insert" | "row" | "column" | "remove-row" | "remove-column" | "remove-table">("insert");
  const [insideTable, setInsideTable] = useState(false);
  const insertTableOnClose = useRef(false);
  const [spacingOpen, setSpacingOpen] = useState(false);
  const [numbers, setNumbers] = useState({ before: 0, after: 0, indent: 0, first: 0 });
  const [numerals, setNumerals] = useState<NumeralStyle>(defaultNumerals(sel?.frame.lang ?? "ur"));
  const frameId = sel?.frame.id;
  useEffect(() => {
    saved.current = null;
    setReady(false);
    setStyle("");
    setList("");
    setNumerals(defaultNumerals(sel?.frame.lang ?? "ur"));
    const track = () => {
      const root = frameId ? editorForFrame(frameId) : undefined;
      const selection = window.getSelection();
      if (!root || !selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!rangeInEditor(root, range)) return;
      saved.current = range.cloneRange();
      const node = range.startContainer;
      setInsideTable(!!(node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)?.closest("td,th"));
      const blocks = selectedParagraphs(root, range);
      setReady(blocks.length > 0);
      const styles = new Set(blocks.map((b) => b.dataset.harfsazStyle ?? "body"));
      setStyle(styles.size === 1 ? [...styles][0] : "");
      const lists = new Set(blocks.map((b) => b.closest("ol,ul")?.tagName ?? ""));
      setList(lists.size === 1 ? [...lists][0] : "");
    };
    document.addEventListener("selectionchange", track);
    track();
    return () => document.removeEventListener("selectionchange", track);
  }, [frameId, sel?.frame.lang, mode]);
  const disabled = !ready || mode !== "edit" || !sel || (sel.frame.kind && sel.frame.kind !== "text");

  function run(action: (root: HTMLElement, blocks: HTMLElement[]) => void) {
    const root = frameId ? editorForFrame(frameId) : undefined;
    const range = saved.current;
    if (!root || !range || !rangeInEditor(root, range)) return;
    root.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    root.dataset.formatting = "true";
    try { action(root, selectedParagraphs(root, range)); }
    finally {
      delete root.dataset.formatting;
      root.dispatchEvent(new Event("harfsaz-format"));
    }
    if (selection?.rangeCount) {
      saved.current = selection.getRangeAt(0).cloneRange();
      const blocks = selectedParagraphs(root, saved.current);
      const lists = new Set(blocks.map((b) => b.closest("ol,ul")?.tagName ?? ""));
      setList(lists.size === 1 ? [...lists][0] : "");
    }
  }
  function toggleList(ordered: boolean) {
    run((root) => {
      document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList");
      formatList(root, numerals);
    });
  }
  function indent(delta: number) {
    run((_root, blocks) => blocks.forEach((b) =>
      setParagraphNumber(b, "margin-inline-start", (parseFloat(b.style.marginInlineStart) || 0) + delta)));
  }
  function openSpacing() {
    const root = frameId ? editorForFrame(frameId) : undefined;
    const block = root && saved.current ? selectedParagraphs(root, saved.current)[0] : undefined;
    if (!block) return;
    setNumbers({ before: parseFloat(block.style.marginBlockStart) || 0,
      after: parseFloat(block.style.marginBlockEnd) || 0,
      indent: parseFloat(block.style.marginInlineStart) || 0,
      first: parseFloat(block.style.textIndent) || 0 });
    setSpacingOpen(true);
  }

  return (
    <div className="paragraph-bar" aria-label="Paragraph formatting">
      <Dialog.Root open={tableOpen} onOpenChange={setTableOpen}>
        <Dialog.Trigger asChild><button disabled={!!disabled}>Table…</button></Dialog.Trigger>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/20" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(360px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-6 shadow-harfsaz"
            onCloseAutoFocus={e => { if (!insertTableOnClose.current) return; e.preventDefault(); insertTableOnClose.current = false;
              run(() => {
                const node = window.getSelection()?.anchorNode;
                const element = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement;
                const cell = element?.closest<HTMLTableCellElement>("td,th");
                if (tableAction.current !== "insert") { if (cell) editTable(cell, tableAction.current); return; }
                if (element?.closest("table")) return;
                document.execCommand("insertHTML", false, tableHtml(tableSize.rows, tableSize.columns));

              });
            }}>
            <Dialog.Title className="font-semibold">Insert table</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-ink-soft">Columns follow your text direction. Tables stay within the current text frame. Click a cell to type.</Dialog.Description>
            {insideTable && <div className="my-4 flex flex-wrap gap-2">{([ ["row", "Add row"], ["column", "Add column"], ["remove-row", "Delete row"], ["remove-column", "Delete column"], ["remove-table", "Delete table"] ] as const).map(([action, label]) => <button key={action} onClick={() => { tableAction.current = action; insertTableOnClose.current = true; setTableOpen(false); }}>{label}</button>)}</div>}
            <div className="my-5 grid grid-cols-2 gap-4">{(["rows", "columns"] as const).map(key => <label key={key} className="flex flex-col gap-2 text-xs">{key === "rows" ? "Rows" : "Columns"}<input type="number" min="1" max={key === "rows" ? 20 : 10} value={tableSize[key]} onChange={e => setTableSize({ ...tableSize, [key]: Number(e.target.value) })} /></label>)}</div>
            <div className="flex justify-end gap-2"><Dialog.Close asChild><button>Cancel</button></Dialog.Close><button className="bg-accent text-white" disabled={insideTable || !Number.isInteger(tableSize.rows) || !Number.isInteger(tableSize.columns) || tableSize.rows < 1 || tableSize.rows > 20 || tableSize.columns < 1 || tableSize.columns > 10} onClick={() => { tableAction.current = "insert"; insertTableOnClose.current = true; setTableOpen(false); }}>Insert table</button></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <span className="paragraph-caption">Paragraph</span>
      <select aria-label="Paragraph style" disabled={!!disabled} value={style} onChange={(e) => {
        const next = e.target.value as ParagraphStyle;
        run((_root, blocks) => blocks.forEach((b) => styleParagraph(b, next)));
        setStyle(next);
      }}>
        <option value="" disabled>{ready ? "Mixed styles" : "Select text"}</option>
        {PARAGRAPH_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <span className="paragraph-divider" />
      <button disabled={!!disabled} aria-pressed={list === "UL"} onClick={() => toggleList(false)}>• Bullets</button>
      <button disabled={!!disabled} aria-pressed={list === "OL"} onClick={() => toggleList(true)}>1. Numbering</button>
      <select aria-label="List numeral style" disabled={!!disabled} value={numerals} onChange={(e) => {
        const next = e.target.value as NumeralStyle;
        setNumerals(next);
        run((_root, blocks) => blocks.forEach((b) => {
          const ol = b.closest("ol");
          if (ol) ol.style.listStyleType = next;
        }));
      }}>
        <option value="decimal">123</option><option value="arabic-indic">١٢٣</option><option value="persian">۱۲۳</option>
      </select>
      <span className="paragraph-divider" />
      <button disabled={!!disabled} onClick={() => indent(-24)} title="Reduce indentation from the paragraph’s starting edge">Decrease indent</button>
      <button disabled={!!disabled} onClick={() => indent(24)} title="Indent from the right for RTL text, or the left for LTR text">Increase indent</button>
      <Dialog.Root open={spacingOpen} onOpenChange={setSpacingOpen}>
        <Dialog.Trigger asChild><button disabled={!!disabled} onClick={openSpacing}>Spacing…</button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20" />
          <Dialog.Content className="paragraph-dialog fixed left-1/2 top-1/2 z-50 w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-6 shadow-harfsaz"
            onCloseAutoFocus={(e) => {
              if (!applySpacingOnClose.current) return;
              e.preventDefault();
              applySpacingOnClose.current = false;
              run((_root, blocks) => blocks.forEach((b) => {
                setParagraphNumber(b, "margin-block-start", numbers.before);
                setParagraphNumber(b, "margin-block-end", numbers.after);
                setParagraphNumber(b, "margin-inline-start", numbers.indent);
                setParagraphNumber(b, "text-indent", numbers.first);
              }));
            }}>
            <Dialog.Title className="text-base font-semibold">Paragraph spacing</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-ink-soft">Apply to the current paragraph or selected paragraphs. Values are in pixels; start indentation follows text direction.</Dialog.Description>
            <div className="my-5 grid grid-cols-2 gap-4">
              {([{ key: "before", label: "Space before" }, { key: "after", label: "Space after" },
                { key: "indent", label: "Start indent" }, { key: "first", label: "First-line indent" }] as const).map(({ key, label }) => (
                <label key={key} className="flex flex-col gap-2 text-xs">{label}
                  <input type="number" min={key === "first" ? -120 : 0} max={240} value={numbers[key]}
                    onChange={(e) => setNumbers({ ...numbers, [key]: Number(e.target.value) })} />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild><button>Cancel</button></Dialog.Close>
              <button className="bg-accent text-white" onClick={() => {
                applySpacingOnClose.current = true;
                setSpacingOpen(false);
              }}>Apply</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <button disabled={!!disabled} title="Reset paragraph styling and clear inline formatting; retain the language and font" onClick={() => run((_root, blocks) => {
        const selection = window.getSelection();
        const original = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
        if (original?.collapsed && blocks[0]) {
          const contents = document.createRange(); contents.selectNodeContents(blocks[0]);
          selection?.removeAllRanges(); selection?.addRange(contents);
        }
        document.execCommand("removeFormat");
        blocks.forEach((b) => {
          delete b.dataset.harfsazStyle;
          ["font-size", "font-weight", "line-height", "margin-block-start", "margin-block-end", "margin-inline-start", "text-indent"].forEach((p) => b.style.removeProperty(p));
        });
        if (original?.collapsed) { selection?.removeAllRanges(); selection?.addRange(original); }
        setStyle("body");
      })}>Clear formatting</button>
      <select aria-label="Insert special character" value="" disabled={!!disabled} onChange={(e) => {
        if (e.target.value) run(() => { document.execCommand("insertText", false, e.target.value); });
      }}>
        <option value="">Symbols…</option>
        <option value="،">، Comma</option><option value="؛">؛ Semicolon</option><option value="؟">؟ Question mark</option>
        <option value="۔">۔ Urdu full stop</option><option value={"\u200c"}>Persian half-space (ZWNJ)</option>
        <option value="َ">◌َ Fatha / zabar</option><option value="ِ">◌ِ Kasra / zer</option><option value="ُ">◌ُ Damma / pesh</option>
        <option value="ّ">◌ّ Shadda</option><option value="ْ">◌ْ Sukun</option>
      </select>
    </div>
  );
}

import { Sparkles, Undo, Redo } from "./ui/icons";
import { useDoc, useSelectedFrame } from "../lib/store";
import { IconTip } from "./ui/tooltip";
import { useUi } from "../lib/ui";
import { Button } from "./ui/button";
import { Menu, MenuItem, MenuSeparator } from "./ui/menu";
import { useSearch } from "../lib/search";
import { LANGUAGES, languagePatch, LangCode } from "../lib/languages";
import {
  saveDocument,
  saveDocumentAs,
  openDocument,
  newDocumentGuarded,
} from "../lib/documents";
import { applyFormat } from "../editor/format";
import { pickImageFile, fitWithin } from "../lib/image";

/** Classic menu bar (File / Edit / View / Insert / Format / AI) + brand. */
export function MenuBar() {
  const addPage = useDoc((s) => s.addPage);
  const addFrame = useDoc((s) => s.addFrame);
  const addFrameAt = useDoc((s) => s.addFrameAt);
  const pages = useDoc((s) => s.pages);
  const activePageId = useDoc((s) => s.activePageId);
  const updateFrame = useDoc((s) => s.updateFrame);
  const undo = useDoc((s) => s.undo);
  const redo = useDoc((s) => s.redo);
  const canUndo = useDoc((s) => s.past.length > 0);
  const canRedo = useDoc((s) => s.future.length > 0);
  const fileName = useDoc((s) => s.fileName);
  const dirty = useDoc((s) => s.dirty);
  const sel = useSelectedFrame();
  const toggleAi = useUi((s) => s.toggleAiPanel);
  const toggleObjectBar = useUi((s) => s.toggleObjectBar);
  const setPrintOpen = useUi((s) => s.setPrintOpen);
  const setOcrOpen = useUi((s) => s.setOcrOpen);
  const zoomIn = useUi((s) => s.zoomIn);
  const zoomOut = useUi((s) => s.zoomOut);
  const fitZoom = useUi((s) => s.fitZoom);

  const setLang = (code: LangCode) =>
    sel && updateFrame(sel.page.id, sel.frame.id, languagePatch(code));

  const activePage = () => pages.find((p) => p.id === activePageId) ?? pages[0];

  /** Place a frame of `kind` centred on the active page. */
  function insertCentred(
    kind: "image" | "shape",
    w: number,
    h: number,
    extra?: Record<string, unknown>
  ) {
    const page = activePage();
    if (!page) return;
    addFrameAt(
      page.id,
      kind,
      { x: (page.width - w) / 2, y: (page.height - h) / 2, width: w, height: h },
      extra
    );
  }

  async function insertImage() {
    const picked = await pickImageFile();
    if (!picked) return;
    const page = activePage();
    if (!page) return;
    const { width, height } = fitWithin(picked.w, picked.h, page.width * 0.6, page.height * 0.5);
    insertCentred("image", width, height, { src: picked.src });
  }

  /** Clipboard/format menu items act on the focused editor's selection. The
   *  editor's own onInput persists the resulting HTML, so there's nothing to
   *  write back here. */
  const exec = (command: string) => () => {
    document.execCommand(command);
  };

  return (
    <header className="flex items-center justify-between border-b border-line bg-paper/80 px-3 py-1.5 backdrop-blur">
      <div className="flex items-center gap-0.5">
        {/* Brand (logo) + current file name */}
        <span className="mr-3 flex items-center gap-2.5 border-r border-line/70 pr-3">
          <img src="/logo.png" alt="Qalam" className="h-[18px] w-auto" />
          <span className="flex items-center gap-1 text-xs text-ink-soft">
            {fileName}
            {dirty && <span className="h-1.5 w-1.5 rounded-full bg-accent/70" title="Unsaved changes" />}
          </span>
        </span>

        <Menu label="File">
          <MenuItem onSelect={newDocumentGuarded} shortcut="⌘⇧N">New document</MenuItem>
          <MenuItem onSelect={addPage} shortcut="⌘N">New page</MenuItem>
          <MenuItem onSelect={() => openDocument()} shortcut="⌘O">Open…</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => saveDocument()} shortcut="⌘S">Save</MenuItem>
          <MenuItem onSelect={() => saveDocumentAs()} shortcut="⇧⌘S">Save As…</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => setPrintOpen(true)} shortcut="⌘P">Print…</MenuItem>
          <MenuItem onSelect={() => setPrintOpen(true)}>Export PDF…</MenuItem>
        </Menu>

        <Menu label="Edit">
          <MenuItem onSelect={undo} shortcut="⌘Z">Undo</MenuItem>
          <MenuItem onSelect={redo} shortcut="⇧⌘Z">Redo</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={exec("cut")} shortcut="⌘X">Cut</MenuItem>
          <MenuItem onSelect={exec("copy")} shortcut="⌘C">Copy</MenuItem>
          <MenuItem onSelect={exec("paste")} shortcut="⌘V">Paste</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => useSearch.getState().setOpen(true)} shortcut="⌘F">
            Find &amp; replace…
          </MenuItem>
        </Menu>

        <Menu label="View">
          <MenuItem onSelect={zoomIn} shortcut="⌘+">Zoom in</MenuItem>
          <MenuItem onSelect={zoomOut} shortcut="⌘−">Zoom out</MenuItem>
          <MenuItem onSelect={fitZoom} shortcut="⌘0">Fit page</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={toggleObjectBar}>Toggle frame bar</MenuItem>
          <MenuItem onSelect={toggleAi}>Toggle AI panel</MenuItem>
        </Menu>

        <Menu label="Insert">
          <MenuItem onSelect={() => addFrame(activePageId)}>Text frame</MenuItem>
          <MenuItem onSelect={() => insertImage()}>Image frame…</MenuItem>
          <MenuItem onSelect={() => insertCentred("shape", 220, 160, { shape: "rect" })}>
            Shape
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => setOcrOpen(true)}>Scan handwriting (OCR)…</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={addPage}>Page</MenuItem>
        </Menu>

        <Menu label="Format">
          <MenuItem onSelect={() => applyFormat("bold")} shortcut="⌘B">Bold</MenuItem>
          <MenuItem onSelect={() => applyFormat("italic")} shortcut="⌘I">Italic</MenuItem>
          <MenuItem onSelect={() => applyFormat("underline")} shortcut="⌘U">Underline</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={toggleObjectBar}>Frame &amp; paragraph bar…</MenuItem>
        </Menu>

        <Menu label="Language">
          {LANGUAGES.map((l) => (
            <MenuItem key={l.code} onSelect={() => setLang(l.code)} disabled={!sel}>
              {(sel?.frame.lang === l.code ? "✓  " : "    ") + `${l.nativeLabel} — ${l.label}`}
            </MenuItem>
          ))}
        </Menu>

        <Menu label="AI">
          <MenuItem onSelect={toggleAi}>Open AI panel</MenuItem>
          <MenuItem onSelect={() => setOcrOpen(true)}>Scan handwriting (OCR)…</MenuItem>
        </Menu>
      </div>

      <div className="flex items-center gap-1">
        {/* Undo / Redo */}
        <IconTip label="Undo (⌘Z)">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="rounded-md p-1.5 text-ink-soft transition-colors hover:bg-paper-edge hover:text-ink disabled:opacity-35"
          >
            <Undo size={17} />
          </button>
        </IconTip>
        <IconTip label="Redo (⇧⌘Z)">
          <button
            onClick={redo}
            disabled={!canRedo}
            className="rounded-md p-1.5 text-ink-soft transition-colors hover:bg-paper-edge hover:text-ink disabled:opacity-35"
          >
            <Redo size={17} />
          </button>
        </IconTip>

        <span className="mx-1 h-5 w-px bg-line" />

        <Button variant="primary" size="sm" className="gap-1.5" onClick={toggleAi}>
          <Sparkles size={14} /> AI
        </Button>
      </div>
    </header>
  );
}

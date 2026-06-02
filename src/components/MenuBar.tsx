import { Sparkles, Undo, Redo } from "./ui/icons";
import { useDoc, useSelectedFrame } from "../lib/store";
import { IconTip } from "./ui/tooltip";
import { useUi } from "../lib/ui";
import { Button } from "./ui/button";
import { Menu, MenuItem, MenuSeparator } from "./ui/menu";
import { LANGUAGES, languagePatch, LangCode } from "../lib/languages";
import { saveDocument, saveDocumentAs, openDocument } from "../lib/documents";

/** Classic menu bar (File / Edit / View / Insert / Format / AI) + brand. */
export function MenuBar() {
  const addPage = useDoc((s) => s.addPage);
  const addFrame = useDoc((s) => s.addFrame);
  const activePageId = useDoc((s) => s.activePageId);
  const updateFrame = useDoc((s) => s.updateFrame);
  const newDocument = useDoc((s) => s.newDocument);
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
  const zoomIn = useUi((s) => s.zoomIn);
  const zoomOut = useUi((s) => s.zoomOut);
  const fitZoom = useUi((s) => s.fitZoom);

  const soon = () => {};
  const setLang = (code: LangCode) =>
    sel && updateFrame(sel.page.id, sel.frame.id, languagePatch(code));

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
          <MenuItem onSelect={newDocument} shortcut="⌘⇧N">New document</MenuItem>
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
          <MenuItem onSelect={soon} disabled shortcut="⌘X">Cut</MenuItem>
          <MenuItem onSelect={soon} disabled shortcut="⌘C">Copy</MenuItem>
          <MenuItem onSelect={soon} disabled shortcut="⌘V">Paste</MenuItem>
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
          <MenuItem onSelect={soon} disabled>Image frame…</MenuItem>
          <MenuItem onSelect={soon} disabled>Shape</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={addPage}>Page</MenuItem>
        </Menu>

        <Menu label="Format">
          <MenuItem onSelect={soon} disabled>Bold</MenuItem>
          <MenuItem onSelect={soon} disabled>Italic</MenuItem>
          <MenuItem onSelect={soon} disabled>Underline</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={soon} disabled>Paragraph…</MenuItem>
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
          <MenuItem onSelect={soon} disabled>Proofread document</MenuItem>
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

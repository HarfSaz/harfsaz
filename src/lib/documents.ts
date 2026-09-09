// Document persistence: save/open .qalam files (JSON) via Tauri's dialog + fs.
// A .qalam file is the serialized DocFile { version, pages }.
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { useDoc, DocFile } from "./store";
import { isTauri } from "./tauri";

const FILTER = [{ name: "Qalam Document", extensions: ["qalam"] }];

function baseName(path: string): string {
  const parts = path.split(/[/\\]/);
  return (parts[parts.length - 1] || "Untitled").replace(/\.qalam$/i, "");
}

/** Suggested filename for a Save As dialog, based on the current document. */
function defaultPath(): string {
  const { fileName } = useDoc.getState();
  return `${fileName || "Untitled"}.qalam`;
}

/** Save to the current file path, or prompt for one if none (Save / ⌘S). */
export async function saveDocument(): Promise<boolean> {
  if (!isTauri()) return false;
  const { filePath, toDocFile, markSaved } = useDoc.getState();
  let path = filePath;
  if (!path) {
    const picked = await saveDialog({ filters: FILTER, defaultPath: defaultPath() });
    if (!picked) return false;
    path = picked;
  }
  try {
    await writeTextFile(path, JSON.stringify(toDocFile(), null, 2));
  } catch (e) {
    // Without this, a failed write rejected into the void: the menu click looked
    // like it worked and the document was silently left unsaved.
    alert(`Could not save the document.\n\n${e}`);
    return false;
  }
  markSaved(path, baseName(path));
  return true;
}

/** Always prompt for a new path (Save As / ⇧⌘S). */
export async function saveDocumentAs(): Promise<boolean> {
  if (!isTauri()) return false;
  const { toDocFile, markSaved } = useDoc.getState();
  const picked = await saveDialog({ filters: FILTER, defaultPath: defaultPath() });
  if (!picked) return false;
  try {
    await writeTextFile(picked, JSON.stringify(toDocFile(), null, 2));
  } catch (e) {
    alert(`Could not save the document.\n\n${e}`);
    return false;
  }
  markSaved(picked, baseName(picked));
  return true;
}

/** Prompt to open a .qalam file and load it (Open / ⌘O). */
export async function openDocument(): Promise<boolean> {
  if (!isTauri()) return false;
  const { dirty, loadDocument } = useDoc.getState();
  if (dirty && !confirm("Discard unsaved changes and open another document?")) return false;

  const picked = await openDialog({ filters: FILTER, multiple: false });
  if (!picked || Array.isArray(picked)) return false;

  let raw: string;
  try {
    raw = await readTextFile(picked);
  } catch (e) {
    alert(`Could not read that file.\n\n${e}`);
    return false;
  }

  let doc: DocFile;
  try {
    doc = JSON.parse(raw);
  } catch {
    alert("That file is not a valid Qalam document.");
    return false;
  }
  if (!doc || !Array.isArray(doc.pages) || doc.pages.length === 0) {
    alert("That file is not a valid Qalam document.");
    return false;
  }
  loadDocument(doc, picked, baseName(picked));
  return true;
}

/**
 * Start a blank document, confirming first if there are unsaved changes.
 *
 * The raw `newDocument` store action discards the current document with no
 * prompt — the File menu and ⌘⇧N should always go through this instead.
 */
export function newDocumentGuarded(): boolean {
  const { dirty, newDocument } = useDoc.getState();
  if (dirty && !confirm("Discard unsaved changes and start a new document?")) return false;
  newDocument();
  return true;
}

/** Silently re-save if a file path already exists and there are changes
 *  (used by the auto-save timer). Never prompts. */
export async function autoSave(): Promise<void> {
  if (!isTauri()) return;
  const { filePath, dirty, toDocFile } = useDoc.getState();
  if (!filePath || !dirty) return;

  const written = JSON.stringify(toDocFile());
  await writeTextFile(filePath, written);

  // Only clear the dirty flag if nothing changed while the write was in flight.
  // Marking unconditionally would drop keystrokes typed during the await — the
  // document would look saved while those edits existed only in memory.
  const after = useDoc.getState();
  if (after.filePath === filePath && JSON.stringify(after.toDocFile()) === written) {
    after.markSaved(filePath, baseName(filePath));
  }
}

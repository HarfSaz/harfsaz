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

/** Save to the current file path, or prompt for one if none (Save / ⌘S). */
export async function saveDocument(): Promise<boolean> {
  if (!isTauri()) return false;
  const { filePath, toDocFile, markSaved } = useDoc.getState();
  let path = filePath;
  if (!path) {
    const picked = await saveDialog({ filters: FILTER, defaultPath: "Untitled.qalam" });
    if (!picked) return false;
    path = picked;
  }
  await writeTextFile(path, JSON.stringify(toDocFile(), null, 2));
  markSaved(path, baseName(path));
  return true;
}

/** Always prompt for a new path (Save As / ⇧⌘S). */
export async function saveDocumentAs(): Promise<boolean> {
  if (!isTauri()) return false;
  const { toDocFile, markSaved } = useDoc.getState();
  const picked = await saveDialog({ filters: FILTER, defaultPath: "Untitled.qalam" });
  if (!picked) return false;
  await writeTextFile(picked, JSON.stringify(toDocFile(), null, 2));
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

  const raw = await readTextFile(picked);
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

/** Silently re-save if a file path already exists and there are changes
 *  (used by the auto-save timer). Never prompts. */
export async function autoSave(): Promise<void> {
  if (!isTauri()) return;
  const { filePath, dirty, toDocFile, markSaved } = useDoc.getState();
  if (!filePath || !dirty) return;
  await writeTextFile(filePath, JSON.stringify(toDocFile()));
  markSaved(filePath, baseName(filePath));
}

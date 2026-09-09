// Document persistence: save/open .qalam files (JSON) via Tauri's dialog + fs.
// A .qalam file is the serialized DocFile { version, pages }.
import { save as saveDialog, open as openDialog, ask } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile, exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
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
    useDoc.getState().setSaveError(String(e));
    alert(`Could not save the document.\n\n${e}`);
    return false;
  }
  markSaved(path, baseName(path));
  void clearRecovery(); // the document is on disk now
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
    useDoc.getState().setSaveError(String(e));
    alert(`Could not save the document.\n\n${e}`);
    return false;
  }
  markSaved(picked, baseName(picked));
  void clearRecovery();
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
  void clearRecovery();
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
  // The old document was discarded on purpose — drop its recovery mirror too,
  // or the next launch would offer to "recover" work the user chose to throw away.
  void clearRecovery();
  return true;
}

/** Silently re-save if a file path already exists and there are changes
 *  (used by the auto-save timer). Never prompts.
 *
 *  A failure here must NOT be silent. The auto-save timer is the thing users
 *  actually rely on while typing unattended, so a failed write (disk full,
 *  unmounted network volume, permissions changed) that only rejects a promise
 *  leaves the app looking healthy while nothing reaches disk. We record the
 *  error on the store instead, and the status bar shows it until a save works.
 */
export async function autoSave(): Promise<void> {
  if (!isTauri()) return;
  const { filePath, dirty, toDocFile } = useDoc.getState();
  if (!filePath || !dirty) return;

  const written = JSON.stringify(toDocFile());
  try {
    await writeTextFile(filePath, written);
  } catch (e) {
    // Leave `dirty` set — the document genuinely is unsaved — and surface it.
    useDoc.getState().setSaveError(String(e));
    return;
  }

  // Only clear the dirty flag if nothing changed while the write was in flight.
  // Marking unconditionally would drop keystrokes typed during the await — the
  // document would look saved while those edits existed only in memory.
  const after = useDoc.getState();
  if (after.filePath === filePath && JSON.stringify(after.toDocFile()) === written) {
    after.markSaved(filePath, baseName(filePath));
  } else {
    // Content moved on, but this write did land — clear any stale error so the
    // status bar doesn't keep warning about a failure that has since resolved.
    if (after.saveError) after.setSaveError(null);
  }
}

/**
 * Guard the window's close button / ⌘Q against discarding unsaved work.
 *
 * `newDocumentGuarded` and `openDocument` already confirm before throwing a
 * document away, but closing the window bypassed both — the most final action in
 * the app was the only one with no prompt. Tauri's close-request event is
 * preventable, so we intercept it, offer Save, and only then destroy the window.
 *
 * Returns an unlisten function (or a no-op outside Tauri).
 */
export async function installCloseGuard(): Promise<() => void> {
  if (!isTauri()) return () => {};

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();

  return appWindow.onCloseRequested(async (event) => {
    const { dirty, fileName } = useDoc.getState();
    if (!dirty) return; // nothing to lose — let it close

    // Hold the window open while we ask. Without this the dialog races the close.
    event.preventDefault();

    // The native dialog only offers two buttons, so we ask in two steps rather
    // than mapping "Cancel" to Discard. Destroying unsaved work must never be
    // one mis-click away: cancelling anywhere in this flow keeps the window open.
    const shouldSave = await ask(
      `“${fileName}” has unsaved changes.\n\nSave before closing?`,
      { title: "Unsaved changes", kind: "warning", okLabel: "Save", cancelLabel: "Don't save" }
    );

    if (shouldSave) {
      const saved = await saveDocument();
      // Save failed or the user cancelled the file picker — stay open rather
      // than closing over the top of work we could not write to disk.
      if (!saved) return;
    } else {
      // Second confirmation before throwing the document away, since this is
      // the one irreversible path through the flow.
      const reallyDiscard = await ask(
        `Close without saving?\n\nAll unsaved changes to “${fileName}” will be lost.`,
        { title: "Discard changes?", kind: "warning", okLabel: "Discard", cancelLabel: "Keep editing" }
      );
      if (!reallyDiscard) return; // keep editing
    }

    // Closing deliberately (saved, or discarded on purpose) is not a crash, so
    // don't greet the user with a recovery prompt next launch.
    await clearRecovery();
    await appWindow.destroy();
  });
}

// ── Crash recovery for never-saved documents ────────────────────────────────
//
// `autoSave` can only re-save a document that already has a file path, so the
// most common new-user session — open Qalam, type for an hour, never hit ⌘S —
// had no safety net at all. We additionally mirror the in-memory document to a
// recovery file in the app data dir on the same timer. It is deleted on a real
// save and on a clean close, so its presence at startup means the last session
// ended without saving.

const RECOVERY_FILE = "recovery.qalam.json";

/** Absolute path of the recovery file (creating the app data dir if needed). */
async function recoveryPath(): Promise<string> {
  const dir = await appLocalDataDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return join(dir, RECOVERY_FILE);
}

/** Mirror the current document to the recovery file (unsaved docs only). */
export async function writeRecovery(): Promise<void> {
  if (!isTauri()) return;
  const { dirty, filePath, toDocFile, fileName } = useDoc.getState();
  // Documents WITH a path are already covered by autoSave writing the real file.
  if (!dirty || filePath) return;
  try {
    const path = await recoveryPath();
    await writeTextFile(
      path,
      JSON.stringify({ savedAt: Date.now(), fileName, doc: toDocFile() })
    );
  } catch {
    // Recovery is best-effort: never let it interrupt editing. The status-bar
    // "unsaved changes" indicator is the user's primary signal regardless.
  }
}

/** Delete the recovery file — the document is safely on disk (or discarded). */
export async function clearRecovery(): Promise<void> {
  if (!isTauri()) return;
  try {
    const path = await recoveryPath();
    if (await exists(path)) await remove(path);
  } catch {
    /* best-effort */
  }
}

/**
 * On startup, offer to restore a document left behind by a crash.
 *
 * Call once when the app mounts. Returns true if a document was restored.
 */
let recoveryOffered = false;

export async function offerRecovery(): Promise<boolean> {
  if (!isTauri()) return false;
  // React StrictMode mounts effects twice in dev, which would show this dialog
  // twice. The prompt is once-per-launch regardless, so latch it.
  if (recoveryOffered) return false;
  recoveryOffered = true;

  let payload: { savedAt: number; fileName: string; doc: DocFile };
  try {
    const path = await recoveryPath();
    if (!(await exists(path))) return false;
    payload = JSON.parse(await readTextFile(path));
  } catch {
    return false; // unreadable/corrupt recovery file — nothing to offer
  }

  if (!payload?.doc || !Array.isArray(payload.doc.pages) || payload.doc.pages.length === 0) {
    await clearRecovery();
    return false;
  }

  const when = new Date(payload.savedAt || Date.now()).toLocaleString();
  const restore = await ask(
    `Qalam closed unexpectedly with unsaved work.\n\n“${payload.fileName || "Untitled"}” — last auto-saved ${when}.\n\nRestore it?`,
    { title: "Recover document", kind: "warning", okLabel: "Restore", cancelLabel: "Discard" }
  );

  if (!restore) {
    await clearRecovery();
    return false;
  }

  // Load with a null path so it still behaves as an unsaved document — the user
  // must choose where it lives, exactly as before the crash.
  useDoc.getState().loadDocument(payload.doc, null, payload.fileName || "Recovered");
  // It IS unsaved work, so mark it dirty and keep the recovery file until a real
  // save. loadDocument resets `dirty` to false, which would otherwise let the
  // window close guard wave the restored document straight back out.
  useDoc.setState({ dirty: true });
  return true;
}

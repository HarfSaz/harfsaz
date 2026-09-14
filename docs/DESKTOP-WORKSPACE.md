# Desktop workspace

The desktop app opens with account sign-in. It pairs through the browser so Google, password, email-link and signup verification stay on the account website. The user explicitly approves the matching short code; a separate secret held only in native code is required to collect the desktop token.

After sign-in the workspace provides:

- New Urdu, Arabic and Persian documents with appropriate font and direction.
- Open existing `.harfsaz` / `.qalam` files.
- Search and reopen the latest 24 documents per account on this computer.
- Continue the current document without discarding it.
- Account identity, plan, account/billing link and sign-out.

Recent entries contain local paths and metadata, not document copies. Removing an entry does not delete the file. Unsaved-change confirmation still runs before opening another document, creating a new one, or signing out. Recovery files are account-scoped; the previous desktop recovery file is adopted once on upgrade. Authenticated users can reopen local documents offline using cached account details.

## Running locally

Start `harfsaz-cloud` on port 3030 and apply its migrations. Then launch the desktop process with:

```sh
HARFSAZ_SITE_URL=http://localhost:3030 pnpm app:dev
```

The release app defaults to `https://harfsaz.com`. The new `/device` page and device API changes must be deployed there before the release app's sign-in can work. This work does not deploy the backend.

Bearer tokens are handled by Rust and saved in the app's private data directory (`desktop-account.json`, mode 0600 on Unix); they are not placed in JavaScript localStorage. The file is not OS-keychain encrypted. Signing out removes the local token and attempts server revocation; when offline, use the website's connected-device controls to revoke it remotely.

## macOS icon

The ICNS contains the existing artwork at 81.25% of the canvas, with transparent margins. Windows artwork is unchanged. Rebuild from the original unpadded source, not the already padded ICNS:

```sh
swift -module-cache-path /tmp/harfsaz-swift-cache scripts/build-macos-icon.swift src-tauri/icons/icon.png /tmp/harfsaz.iconset
iconutil -c icns /tmp/harfsaz.iconset -o src-tauri/icons/icon.icns
```

Install/relaunch a newly built app to see the packaged icon. An already running/installed copy can retain its old Dock icon.

## Account-managed AI

Desktop and web AI now use `/api/v1/ai` and the server's account quota. The
native `desktop_ai` command adds the paired bearer credential; the webview
never receives it. Provider settings are replaced by account/plan controls.
Existing locally stored provider keys are no longer used by editor AI actions.
Set `ANTHROPIC_API_KEY` on the cloud server to enable hosted inference. Billing
still requires the server's Stripe configuration and webhook setup.

## Web workspace

`/app` opens an account workspace with new Urdu/Arabic/Persian documents,
recent online documents, import, rename and delete. Default web sign-in now
returns here; explicit destinations such as desktop pairing remain intact.
Web Save writes account-owned `CloudDocument` rows in Postgres. Save a copy
creates another online document; Download .harfsaz exports without marking
unsaved online edits as saved. After the first save, dirty documents autosave
on the existing 30-second timer. Recovery copies are scoped to account IDs.

The server limits documents to 10 MB each, 100 documents and 100 MB per
account. Optimistic revisions reject stale saves/deletes; users can save a
copy when a conflict occurs. The API requires authentication and checks
ownership on every document operation. This does not add desktop cloud sync.

Plan and billing controls now live under the workspace's **Plan & billing**
section. `/app?section=billing` opens this section directly, including after
Stripe checkout and portal visits. Account settings contain profile, sign-in
methods and connected devices. Web checkout opens in a separate tab so the
editor's unsaved document stays mounted. Desktop billing displays the account
plan and opens the web workspace for payment actions.

## Download and sharing

Each online document has Download and Share actions. Download exports the
saved `.harfsaz` file without replacing the current editor document. Sharing
is opt-in: the owner creates an unguessable, read-only link to the latest
saved content. Visitors can view or download a copy, not modify the original.
Turning off the link or deleting the document blocks future requests; copies
already downloaded cannot be recalled. Re-enabling creates a new link.

The shared viewer runs without workspace/account controls and sanitizes rich
HTML, CSS and embedded images before rendering. Public responses omit owner
metadata and disable caching/indexing. Shared links are local-only while the
configured site origin is localhost; public access requires deployment.

# Build Harfsaz for Windows

## GitHub Actions

Open the repository's Actions tab, choose **Windows installer**, then **Run workflow** on `main`. When it succeeds, download the `Harfsaz-Windows-x64` artifact and extract the installer `.exe`. This workflow creates a build artifact without publishing a release.

## Build on Windows

Install Node.js 22, pnpm 10, Rust stable, and Visual Studio Build Tools with the **Desktop development with C++** workload and Windows SDK. WebView2 Runtime is needed to run the app.

```powershell
git clone https://github.com/HarfSaz/harfsaz.git
cd harfsaz
pnpm install --frozen-lockfile
pnpm exec tauri build --bundles nsis
```

Installer: `src-tauri/target/release/bundle/nsis/`.

The application uses `https://harfsaz.com` by default. Production API credentials are not required to build it. Sign in to your Harfsaz account after installation.

The installer is unsigned unless Windows code signing is separately configured. macOS builds and Apple signing credentials are independent of this workflow.

The full regression suite is maintained outside this repository and is not needed for the Windows build.

<div align="center">

# Harfsaz — حرف ساز

**The first open-source, AI-native desktop editor for Nastaʿlīq & RTL scripts — Urdu · Persian · Arabic.**

Real HarfBuzz complex-script shaping + an LLM writing assistant, in one fast,
cross-platform desktop app.

<!-- Add a screenshot/GIF here before launch — Urdu shaping live + one AI action.
     This single image does more than the whole README. -->
<!-- ![Harfsaz editing Urdu Nastaʿlīq with the AI panel](docs/screenshot.png) -->

[Why](#why-harfsaz) · [Features](#features) · [Quick start](#quick-start) · [Architecture](#architecture) · [Roadmap](#roadmap) · [License](#license)

</div>

> حرف ساز — *harf-sāz*, "the letter-maker" — a typesetter, one who shapes letters into a page.

---

## Why Harfsaz

Urdu, Persian, and Arabic desktop publishing has been frozen in time. The
incumbent — InPage (1994) — is closed-source, Windows-only, and has no AI. Modern
word processors still mangle Nastaʿlīq joining and ligatures. Harfsaz rebuilds this
from scratch for 2026: AI in the writing loop from day one, on top of a **real
HarfBuzz Nastaʿlīq typesetting core**.

| | InPage (incumbent) | Harfsaz |
|---|---|---|
| Era | 1994 engine, closed source | Modern, open source (AGPL-3.0) |
| Scripts | Urdu | Urdu · Persian · Arabic · other RTL |
| Rendering | Proprietary Nastaʿlīq engine | HarfBuzz / rustybuzz (open) |
| AI | None | Write · Proofread · Translate · Layout — via Claude |
| Platform | Legacy Windows | Tauri (Rust + web) — macOS · Windows · Linux |

The hard part of RTL DTP — correct Nastaʿlīq shaping (joining, ligatures,
*bari-ye*) — is handled by **rustybuzz**, the pure-Rust port of HarfBuzz, so the
same shaping logic that powers Noto Nastaliq Urdu, Gulzar, and Amiri runs
natively, with no C toolchain to fight.

## Features

- ✍️ **AI writing assistant** — compose, continue, rephrase, change tone
- 🔤 **Proofreading** — Urdu / Arabic spelling & grammar correction
- 🌐 **Translate & transliterate** — English ↔ Urdu, Roman-Urdu → Nastaʿlīq script
- 🎨 **Layout / design AI** — headline & caption generation, layout suggestions
- 📷 **Scan handwriting (OCR)** — attach a photo, scan or PDF of handwritten or
  printed Urdu/Arabic/Persian and get editable Unicode back, ready to typeset
- 🪶 **Real Nastaʿlīq shaping** — HarfBuzz/rustybuzz, not browser-approximated
- 🖥️ **Cross-platform & tiny** — Tauri desktop binary for macOS, Windows, Linux
- 🔒 **Your key stays local** — the Claude API key is stored on your machine and
  used from the Rust backend; it is never bundled or sent to any Harfsaz server

All AI runs through **Claude (Anthropic API)** with a key you supply.

## Quick start

```bash
# 1. install deps
pnpm install

# 2. run the desktop app (Vite + Tauri)
pnpm app:dev

# 3. add your Claude API key in Settings (stored locally), or via env:
export HARFSAZ_ANTHROPIC_API_KEY=sk-ant-...

# build a distributable
pnpm app:build
```

Requires **Rust (stable)** and **Node 18+**. On first run Cargo fetches the Rust
deps. Get a Claude API key at <https://console.anthropic.com>.

## Architecture

```
harfsaz/
├─ src/                     React + TypeScript frontend
│  ├─ App.tsx               app shell (toolbar · canvas · AI panel)
│  ├─ editor/               DTP page + text-frame views
│  ├─ components/           Toolbar, AiPanel, SettingsDialog
│  ├─ lib/
│  │  ├─ store.ts           document model (pages → text frames)
│  │  └─ tauri.ts           typed bridge to Rust commands
│  └─ styles/global.css
└─ src-tauri/               Rust backend (Tauri 2)
   └─ src/
      ├─ shaping.rs         Nastaʿlīq shaping via rustybuzz/HarfBuzz
      ├─ ai.rs              Claude (Anthropic API) bridge — writing · OCR · more
      ├─ settings.rs        local, on-device settings (incl. API key)
      └─ lib.rs             Tauri command wiring
```

### Editor strategy

- **Now:** text frames are RTL `contenteditable` — the browser shapes Noto
  Nastaliq correctly, giving a usable Urdu/Arabic editor immediately.
- **Next:** the Rust HarfBuzz shaper (`shape_text`) drives a canvas/SVG
  print-grade renderer for pixel-precise justification (*kashida*) and
  frame-to-frame text overflow — the InPage-defining DTP features.

## Roadmap

- [x] Foundation: Tauri shell, document model, AI panel, Nastaʿlīq shaper wired
- [x] AI writing / proofreading / translation / layout via Claude
- [x] Selection AI menu (rephrase · grammar · caption · define · custom prompt)
- [x] Handwriting/scan OCR → editable Nastaʿlīq text (image or PDF attachment)
- [x] Document save/load (`.harfsaz` format)
- [ ] Canvas/SVG print-grade renderer driven by HarfBuzz output
- [ ] Frame linking — text overflow flows frame → frame → page
- [ ] Kashida justification (newspaper-grade)
- [ ] PDF export with embedded fonts
- [ ] Roman-Urdu live transliteration as you type
- [ ] Batch OCR — a folder of scans into one document
- [ ] First-class Persian & Arabic UI presets

> Harfsaz is at an early (v0.x) stage — the core editor and AI features work today;
> the print-grade renderer and PDF export are in progress. Contributions welcome.

## Contributing

Contributions are very welcome — especially from the Urdu / Persian / Arabic
developer and typography communities. See [CONTRIBUTING.md](CONTRIBUTING.md).
Harfsaz uses a lightweight CLA via DCO sign-off (`git commit -s`); see [CLA.md](CLA.md).

## License

Harfsaz is **dual-licensed**:

- **Open source:** [GNU AGPL-3.0](LICENSE). You may use, study, modify, and
  share Harfsaz freely. If you modify it — including offering a modified version to
  users over a network — your version must also be released under the AGPL-3.0.
- **Commercial:** if you want to use Harfsaz in a way the AGPL doesn't allow (e.g.
  a closed-source or proprietary product), a separate commercial license is
  available. Contact **billing@harfsaz.com**.

See [COPYRIGHT](COPYRIGHT). Bundled fonts are OFL-1.1 / Apache-2.0 and the shaping
libraries are MIT — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Copyright © 2024–2026 Afzaal Muhammad.

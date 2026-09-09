# Qalam — قلم

**An AI-native Urdu Nastaʿlīq desktop publishing app.**

Qalam is to Urdu publishing what InPage was — but rebuilt for 2026: a modern,
lightweight desktop app where AI is in the writing loop from day one, on top of
a real HarfBuzz Nastaʿlīq typesetting core.

> قلم — *"the pen"* — the timeless symbol of writing and calligraphy.

---

## Why Qalam

| | InPage (incumbent) | Qalam |
|---|---|---|
| Era | 1994 engine, closed source | Modern, AI-native |
| Rendering | Proprietary Nastaʿlīq engine | HarfBuzz / rustybuzz (open) |
| AI | None | Write · Proofread · Translate · Layout — via Claude |
| Stack | Legacy Windows | Tauri (Rust + web), cross-platform, tiny binary |

The hard part of Urdu DTP — correct Nastaʿlīq shaping (joining, ligatures,
bari-ye) — is handled by **rustybuzz**, the pure-Rust port of HarfBuzz, so there
is no C toolchain to fight and the same shaping logic that powers Noto Nastaliq
Urdu and Gulzar is available natively.

## Architecture

```
qalam/
├─ src/                     React + TypeScript frontend
│  ├─ App.tsx               app shell (toolbar · canvas · AI panel)
│  ├─ editor/               DTP page + text-frame views
│  ├─ components/           Toolbar, AiPanel
│  ├─ lib/
│  │  ├─ store.ts           document model (pages → text frames)
│  │  └─ tauri.ts           typed bridge to Rust commands
│  └─ styles/global.css
└─ src-tauri/               Rust backend (Tauri 2)
   └─ src/
      ├─ shaping.rs         Nastaʿlīq shaping via rustybuzz/HarfBuzz
      ├─ ai.rs              Claude (Anthropic API) bridge — 4 capabilities
      └─ lib.rs             Tauri command wiring
```

**AI capabilities (v1):**
1. **Writing assistant** — compose, continue, rephrase, change tone
2. **Proofreading** — Urdu spelling/grammar correction
3. **Translate & transliterate** — English↔Urdu, Roman-Urdu → Nastaʿlīq script
4. **Layout / design AI** — headline & caption generation, layout suggestions
5. **Scan handwriting (OCR)** — attach a photo, scan or PDF of handwritten or
   printed Urdu/Arabic/Persian and get editable Unicode back, ready to typeset

All AI runs through **Claude (Anthropic API)**. The key stays in Rust — never
shipped to the frontend.

## Editor strategy (MVP ordering)

- **Now:** text frames are RTL `contenteditable` — the browser shapes Noto
  Nastaliq correctly, giving a usable Urdu editor immediately.
- **Next:** the Rust HarfBuzz shaper (`shape_text`) drives a canvas/SVG
  print-grade renderer for pixel-precise justification (*kashida*) and
  frame-to-frame text overflow — the InPage-defining DTP features.

## Getting started

```bash
# 1. install deps
pnpm install

# 2. set your Claude API key (never committed)
cp .env.example .env        # then edit, or:
export QALAM_ANTHROPIC_API_KEY=sk-ant-...

# 3. run the desktop app (Vite + Tauri)
pnpm app:dev

# build a distributable
pnpm app:build
```

Requires Rust (stable) and Node 18+. On first run Cargo will fetch the Rust deps.

## Roadmap

- [x] Foundation: Tauri shell, document model, AI panel, Nastaʿlīq shaper wired
- [ ] Canvas/SVG print-grade renderer driven by HarfBuzz output
- [ ] Frame linking — text overflow flows frame → frame → page
- [ ] Kashida justification (newspaper-grade)
- [ ] Bundle Noto Nastaliq Urdu / Gulzar / Mehr fonts offline
- [ ] PDF export with embedded fonts
- [ ] Roman-Urdu live transliteration as you type
- [x] Document save/load (`.qalam` format)
- [x] Handwriting/scan OCR → editable Nastaʿlīq text (image or PDF attachment)
- [ ] Batch OCR — a folder of scans into one document

## License

Proprietary — © Afzaal Ahmad. All rights reserved.
Built with permissively-licensed open components (Tauri, rustybuzz/HarfBuzz,
Noto fonts) so the product itself can ship commercially.

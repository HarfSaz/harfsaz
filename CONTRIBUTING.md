# Contributing to Harfsaz

Thank you for helping build the first open-source AI-native editor for Nastaʿlīq
& RTL scripts. Contributions from the Urdu, Persian, Arabic, and typography
communities are especially welcome — native-speaker feedback on shaping,
proofreading prompts, and language presets is invaluable.

## Ways to contribute

- 🐛 **Report bugs** — open an issue with steps to reproduce, your OS, and a
  screenshot if it's a rendering/shaping problem.
- 🪶 **Improve shaping / typography** — Nastaʿlīq edge cases, kashida, font
  metrics, RTL layout.
- 🌐 **Language support** — Persian / Arabic / Pashto / Sindhi presets, better
  AI prompts for each language.
- ✨ **Features** — see the roadmap in the [README](README.md).
- 📖 **Docs & translations** — including translating docs into Urdu/Arabic.

## Development setup

```bash
pnpm install
pnpm app:dev        # Vite + Tauri dev
```

Requires **Rust (stable)** and **Node 18+**. The frontend is React + TypeScript
(`src/`); the backend is Rust + Tauri 2 (`src-tauri/`). Nastaʿlīq shaping lives in
`src-tauri/src/shaping.rs` (rustybuzz/HarfBuzz); the Claude bridge is in
`src-tauri/src/ai.rs`.

Never commit secrets. Your Claude API key is configured at runtime (Settings or
`HARFSAZ_ANTHROPIC_API_KEY`) and is git-ignored.

## Submitting changes

1. Fork and create a topic branch.
2. Keep changes focused; match the existing code style.
3. **Sign off every commit** with `git commit -s` (DCO). This certifies you wrote
   the code and agree to the project's [CLA](CLA.md) — required so the project can
   remain dual-licensed (AGPL + commercial).
4. Open a pull request describing what and why. Include before/after screenshots
   for any UI or shaping change.

## Licensing of contributions

Harfsaz is dual-licensed: **AGPL-3.0** for the community and a **commercial license**
for proprietary use. By contributing (with your DCO sign-off) you agree to the
[CLA](CLA.md), which lets the maintainer include your contribution under both
licenses while you retain the right to use your own code elsewhere. See
[COPYRIGHT](COPYRIGHT) for details.

## Code of conduct

Be respectful and constructive. This is a welcoming space for contributors of all
backgrounds and language communities.

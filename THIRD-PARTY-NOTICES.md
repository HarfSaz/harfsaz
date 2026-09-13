# Third-Party Notices

Harfsaz bundles and uses third-party components under their own open-source
licenses. Their licenses are independent of, and not superseded by, Harfsaz's
AGPL-3.0 license.

---

## Fonts

All bundled fonts in `public/fonts/` are open-licensed and freely
redistributable. They are sourced from the [Google Fonts](https://fonts.google.com)
library and are licensed under either the **SIL Open Font License 1.1 (OFL)** or
the **Apache License 2.0**, as noted by each project.

> The SIL OFL permits bundling, modification, and redistribution provided the
> license is included and the Reserved Font Names (if any) are respected. The
> Apache-2.0 fonts permit the same with attribution.

### SIL Open Font License 1.1
Noto Nastaliq Urdu, Noto Naskh Arabic, Noto Sans Arabic, Noto Kufi Arabic,
Noto Sans Hebrew, Noto Serif Hebrew, Amiri, Amiri Quran, Scheherazade New,
Lateef, Harmattan, Alkalami, Ruwudu, Aref Ruqaa, Gulzar, Mirza, Markazi Text,
Reem Kufi, Qahiri, Katibeh, Jomhuria, Lalezar, Rakkas, Vibes, Mada, El Messiri,
Vazirmatn, Vazir, Sahel, Samim, Shabnam, Estedad, Marhey, Kufam, Lemonada,
Frank Ruhl Libre, David Libre, Heebo, Rubik, Assistant, Alef, Bellefair,
Secular One, Suez One, Readex Pro, IBM Plex Sans Arabic, HarfsazKufi.

### Apache License 2.0
Cairo, Tajawal, Changa, Almarai, Baloo Bhaijaan 2.

> Full OFL and Apache-2.0 license texts are included in `public/fonts/licenses/`.
> Each font's authoritative license and Reserved Font Names are available on its
> Google Fonts page and upstream repository.

If you redistribute Harfsaz, keep this file and the `public/fonts/licenses/`
directory intact.

---

## Libraries

Harfsaz's Nastaʿlīq / Arabic complex-text shaping is powered by:

- **rustybuzz** — a pure-Rust port of HarfBuzz (MIT). https://github.com/harfbuzz/rustybuzz
- **ttf-parser** (MIT/Apache-2.0). https://github.com/harfbuzz/ttf-parser

Other dependencies are listed in `package.json`, `pnpm-lock.yaml`, and
`src-tauri/Cargo.toml`, each under its own OSI-approved license.

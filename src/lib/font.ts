// Font registry. The Rust shaper needs raw .ttf bytes; the edit-layer textarea
// needs a CSS @font-face. All fonts are OFL-licensed (free for commercial use)
// and bundled under /public/fonts. Grouped by script style for the dropdown.

export type FontStyle =
  | "Nastaliq"
  | "Naskh"
  | "Kufi"
  | "Sans"
  | "Persian"
  | "Display"
  | "Hebrew";

export interface QalamFont {
  key: string;
  label: string;
  cssFamily: string;
  url: string;
  style: FontStyle;
}

// label === cssFamily for clarity; key is kebab-case; url under /public/fonts.
const F = (key: string, label: string, file: string, style: FontStyle): QalamFont => ({
  key,
  label,
  cssFamily: label,
  url: `/fonts/${file}`,
  style,
});

export const FONTS: QalamFont[] = [
  // ── Nastaliq (the Urdu calligraphic style) ──
  F("noto-nastaliq", "Noto Nastaliq Urdu", "NotoNastaliqUrdu-Regular.ttf", "Nastaliq"),
  F("gulzar", "Gulzar", "Gulzar-Regular.ttf", "Nastaliq"),
  F("mirza", "Mirza", "Mirza-Regular.ttf", "Nastaliq"),

  // ── Naskh (clean book/body Arabic-script; cover Urdu/Arabic/Persian/Sindhi/Pashto) ──
  F("noto-naskh", "Noto Naskh Arabic", "NotoNaskhArabic-Regular.ttf", "Naskh"),
  F("amiri", "Amiri", "Amiri-Regular.ttf", "Naskh"),
  F("amiri-quran", "Amiri Quran", "AmiriQuran-Regular.ttf", "Naskh"),
  F("scheherazade", "Scheherazade New", "ScheherazadeNew-Regular.ttf", "Naskh"),
  F("lateef", "Lateef", "Lateef-Regular.ttf", "Naskh"),
  F("harmattan", "Harmattan", "Harmattan-Regular.ttf", "Naskh"),
  F("markazi", "Markazi Text", "Markazi-Regular.ttf", "Naskh"),
  F("alkalami", "Alkalami", "Alkalami-Regular.ttf", "Naskh"), // SIL, West-African/Naskh
  F("ruwudu", "Ruwudu", "Ruwudu-Regular.ttf", "Naskh"), // SIL, traditional Naskh

  // ── Kufi (geometric/headline) ──
  F("qalam-kufi", "Qalam Kufi ✦", "QalamKufi-Regular.ttf", "Kufi"), // Qalam's own original face
  F("noto-kufi", "Noto Kufi Arabic", "NotoKufiArabic-Regular.ttf", "Kufi"),
  F("reem-kufi", "Reem Kufi", "ReemKufi-Regular.ttf", "Kufi"),
  F("el-messiri", "El Messiri", "ElMessiri-Regular.ttf", "Kufi"),
  F("kufam", "Kufam", "Kufam-Regular.ttf", "Kufi"),
  F("qahiri", "Qahiri", "Qahiri-Regular.ttf", "Kufi"), // geometric Kufi display

  // ── Sans (modern UI/body) ──
  F("noto-sans-arabic", "Noto Sans Arabic", "NotoSansArabic-Regular.ttf", "Sans"),
  F("ibm-plex-arabic", "IBM Plex Sans Arabic", "IBMPlexSansArabic-Regular.ttf", "Sans"),
  F("cairo", "Cairo", "Cairo-Regular.ttf", "Sans"),
  F("tajawal", "Tajawal", "Tajawal-Regular.ttf", "Sans"),
  F("almarai", "Almarai", "Almarai-Regular.ttf", "Sans"),
  F("changa", "Changa", "Changa-Regular.ttf", "Sans"),
  F("mada", "Mada", "Mada-Regular.ttf", "Sans"),
  F("rubik", "Rubik", "Rubik-Regular.ttf", "Sans"),
  F("readex", "Readex Pro", "ReadexPro-Regular.ttf", "Sans"),
  F("baloo-bhaijaan", "Baloo Bhaijaan 2", "BalooBhaijaan2-Regular.ttf", "Sans"), // rounded

  // ── Persian (Persian-tuned; some lack Urdu ہ/ے, ideal for Farsi/Arabic) ──
  F("vazirmatn", "Vazirmatn", "Vazirmatn-Regular.ttf", "Persian"),
  F("vazir", "Vazir", "Vazir-Regular.ttf", "Persian"),
  F("estedad", "Estedad", "Estedad-Regular.ttf", "Persian"),
  F("sahel", "Sahel", "Sahel-Regular.ttf", "Persian"),
  F("samim", "Samim", "Samim-Regular.ttf", "Persian"),
  F("shabnam", "Shabnam", "Shabnam-Regular.ttf", "Persian"),

  // ── Display / decorative ──
  F("aref-ruqaa", "Aref Ruqaa", "Aref-Ruqaa-Regular.ttf", "Display"),
  F("lalezar", "Lalezar", "Lalezar-Regular.ttf", "Display"),
  F("rakkas", "Rakkas", "Rakkas-Regular.ttf", "Display"),
  F("jomhuria", "Jomhuria", "Jomhuria-Regular.ttf", "Display"),
  F("katibeh", "Katibeh", "Katibeh-Regular.ttf", "Display"),
  F("vibes", "Vibes", "Vibes-Regular.ttf", "Display"),
  F("lemonada", "Lemonada", "Lemonada-Regular.ttf", "Display"), // rounded display
  F("marhey", "Marhey", "Marhey-Regular.ttf", "Display"), // playful display

  // ── Hebrew ──
  F("frank-ruhl", "Frank Ruhl Libre", "FrankRuhlLibre-Regular.ttf", "Hebrew"),
  F("noto-hebrew", "Noto Sans Hebrew", "NotoSansHebrew-Regular.ttf", "Hebrew"),
  F("noto-serif-hebrew", "Noto Serif Hebrew", "NotoSerifHebrew-Regular.ttf", "Hebrew"),
  F("heebo", "Heebo", "Heebo-Regular.ttf", "Hebrew"),
  F("assistant", "Assistant", "Assistant-Regular.ttf", "Hebrew"),
  F("david-libre", "David Libre", "DavidLibre-Regular.ttf", "Hebrew"),
  F("suez-one", "Suez One", "SuezOne-Regular.ttf", "Hebrew"),
  F("alef", "Alef", "Alef-Regular.ttf", "Hebrew"),
  F("secular-one", "Secular One", "SecularOne-Regular.ttf", "Hebrew"),
  F("bellefair", "Bellefair", "Bellefair-Regular.ttf", "Hebrew"),
];

export const FONT_STYLE_ORDER: FontStyle[] = [
  "Nastaliq",
  "Naskh",
  "Kufi",
  "Sans",
  "Persian",
  "Display",
  "Hebrew",
];

export const DEFAULT_FONT_KEY = "noto-nastaliq";

export function getFont(key: string): QalamFont {
  return FONTS.find((f) => f.key === key) ?? FONTS[0];
}

const byteCache = new Map<string, Uint8Array>();
const faceLoaded = new Set<string>();

/** Fetch (and cache) the raw font bytes for the Rust shaper. */
export async function loadFontBytes(key: string): Promise<Uint8Array> {
  if (byteCache.has(key)) return byteCache.get(key)!;
  const font = getFont(key);
  const res = await fetch(font.url);
  if (!res.ok) throw new Error(`Could not load font: ${font.label}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 1000) throw new Error(`Font file too small: ${font.label}`);
  byteCache.set(key, buf);
  return buf;
}

/** Register a CSS @font-face so the edit-layer textarea renders this family. */
export async function ensureFontFace(key: string): Promise<void> {
  if (faceLoaded.has(key)) return;
  const font = getFont(key);
  const face = new FontFace(font.cssFamily, `url(${font.url})`);
  await face.load();
  (document.fonts as FontFaceSet).add(face);
  faceLoaded.add(key);
}

/** Back-compat for the old single-font helper. */
export function loadNastaliqFont(): Promise<Uint8Array> {
  return loadFontBytes(DEFAULT_FONT_KEY);
}

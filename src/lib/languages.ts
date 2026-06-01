// Language / keyboard registry. Each language has a script direction, a default
// font (key into FONTS), and a pragmatic phonetic Roman→script map so users
// without an OS keyboard for that language can type immediately.
//
// The maps are PRAGMATIC starters (common-sense letter mappings), not exhaustive
// linguistic transliterators — the AI "Roman → script" task handles serious
// conversion. Greedy longest-match: digraphs (kh, sh, …) are tried before
// singles by the transliterate() loop in editor/phonetic.ts.

// Base codes + diacritized ("-h" = with harakat/short-vowel marks) variants.
// The diacritized variants (used by Quranic/religious text and non-native /
// Asian learners) share the base script but their keyboard also emits the
// short-vowel marks, and they enable the AI "Add diacritics" action.
export type LangCode =
  | "ur" | "ar" | "fa" | "ps" | "sd" | "he" | "en"
  | "ar-h" | "fa-h" | "ur-h";
export type Dir = "rtl" | "ltr";

export interface QalamLanguage {
  code: LangCode;
  label: string; // English name
  nativeLabel: string; // name in its own script
  dir: Dir;
  defaultFontKey: string; // key into FONTS
  /** Roman→script map; undefined = no transliteration (English pass-through). */
  phoneticMap?: Record<string, string>;
  /** True for diacritized variants — enables the AI "Add diacritics" action and
   *  a harakat-emitting keyboard. */
  diacritized?: boolean;
  /** Base language code (e.g. "ar" for "ar-h") for AI prompts/grouping. */
  base?: LangCode;
}

// ── Phonetic maps ──────────────────────────────────────────────────────────

// Standard Urdu Phonetic keyboard (matches the common InPage/CRULP layout):
// lowercase = base layer, UPPERCASE = Shift layer (retroflex ٹ ڈ ڑ, alt forms
// آ ص ض ظ ث ذ غ خ ه, special ں ؤ ئ and diacritics). Digraphs (kh, sh…) are
// kept as a convenience on top, matched first by transliterate().
const URDU: Record<string, string> = {
  // convenience digraphs (tried before single keys)
  kh: "خ", gh: "غ", sh: "ش", ch: "چ", aa: "آ",
  // base layer (lowercase)
  q: "ق", w: "و", e: "ے", r: "ر", t: "ت", y: "ے", u: "ء", i: "ی", o: "ہ", p: "پ",
  a: "ا", s: "س", d: "د", f: "ف", g: "گ", h: "ح", j: "ج", k: "ک", l: "ل",
  z: "ز", x: "ش", c: "چ", v: "ط", b: "ب", n: "ن", m: "م",
  // shift layer (uppercase)
  Q: "ٌ", W: "ؤ", E: "ٰ", R: "ڑ", T: "ٹ", Y: "ٍ", U: "ئ", I: "ِ", O: "ة", P: "ٗ",
  A: "آ", S: "ص", D: "ڈ", F: "أ", G: "غ", H: "ھ", J: "ض", K: "خ", L: "ﻻ",
  Z: "ذ", X: "ژ", C: "ث", V: "ظ", B: "ٔ", N: "ں", M: "ّ",
  ".": "۔", ",": "،", "?": "؟", ";": "؛",
};

// Arabic (uses ك / ي). Base = lowercase; Shift = emphatic/alternate forms
// (ص ض ط ظ ح خ ذ ث غ) and hamza variants (أ إ ؤ ئ ء آ ة).
const ARABIC: Record<string, string> = {
  kh: "خ", gh: "غ", sh: "ش", th: "ث", dh: "ذ", aa: "آ",
  // base layer
  q: "ق", w: "و", e: "ع", r: "ر", t: "ت", y: "ي", u: "ء", i: "ي", o: "ه", p: "ث",
  a: "ا", s: "س", d: "د", f: "ف", g: "غ", h: "ه", j: "ج", k: "ك", l: "ل",
  z: "ز", x: "ش", c: "ص", v: "ط", b: "ب", n: "ن", m: "م",
  // shift layer
  Q: "ً", W: "ؤ", E: "ٰ", R: "ر", T: "ط", Y: "ٍ", U: "ئ", I: "ِ", O: "ة", P: "ُ",
  A: "آ", S: "ص", D: "ض", F: "أ", G: "إ", H: "ح", J: "ض", K: "خ", L: "لا",
  Z: "ذ", X: "ظ", C: "ث", V: "ظ", B: "ء", N: "ں", M: "ّ",
  "'": "ع",
  ".": ".", ",": "،", "?": "؟", ";": "؛",
};

// Persian/Farsi (ک گ چ ژ پ ی). Base = lowercase; Shift = alternates + hamza/marks.
const PERSIAN: Record<string, string> = {
  kh: "خ", gh: "غ", sh: "ش", ch: "چ", zh: "ژ", aa: "آ",
  // base layer
  q: "ق", w: "و", e: "ع", r: "ر", t: "ت", y: "ی", u: "ء", i: "ی", o: "ه", p: "پ",
  a: "ا", s: "س", d: "د", f: "ف", g: "گ", h: "ح", j: "ج", k: "ک", l: "ل",
  z: "ز", x: "ش", c: "چ", v: "ط", b: "ب", n: "ن", m: "م",
  // shift layer
  Q: "ً", W: "ؤ", E: "ٰ", R: "ر", T: "ط", Y: "ٍ", U: "ئ", I: "ِ", O: "ة", P: "ُ",
  A: "آ", S: "ص", D: "ذ", F: "أ", G: "غ", H: "ه", J: "ض", K: "خ", L: "لا",
  Z: "ژ", X: "ظ", C: "ث", V: "ظ", B: "ء", N: "ں", M: "ّ",
  ".": ".", ",": "،", "?": "؟", ";": "؛",
};

// Pashto: Persian base + Pashto retroflex/extra letters (ټ ډ ړ ږ ښ ګ ڼ څ ځ).
const PASHTO: Record<string, string> = {
  tt: "ټ", dd: "ډ", rr: "ړ", zz: "ږ", nn: "ڼ", ts: "څ", dz: "ځ",
  kh: "خ", gh: "غ", sh: "ش", ch: "چ", zh: "ژ", x: "ښ", aa: "آ",
  a: "ا", b: "ب", p: "پ", t: "ت", s: "س", j: "ج", d: "د", r: "ر", z: "ز",
  f: "ف", q: "ق", k: "ک", g: "ګ", l: "ل", m: "م", n: "ن", h: "ه",
  v: "و", w: "و", y: "ی", e: "ې", i: "ي", o: "و",
  ".": ".", ",": "،", "?": "؟", ";": "؛",
};

// Sindhi: Arabic/Urdu base + Sindhi implosives (ٻ ٺ ٿ ڄ ڃ ڊ ڍ ڙ ڳ ڱ ھ).
const SINDHI: Record<string, string> = {
  bb: "ٻ", tt: "ٺ", TT: "ٿ", jj: "ڄ", nj: "ڃ", dd: "ڊ", DD: "ڍ", rr: "ڙ",
  gg: "ڳ", ng: "ڱ", kh: "خ", gh: "غ", sh: "ش", ch: "چ", aa: "آ",
  a: "ا", b: "ب", p: "پ", t: "ت", s: "س", j: "ج", d: "د", r: "ر", z: "ز",
  f: "ف", q: "ق", k: "ڪ", g: "گ", l: "ل", m: "م", n: "ن", h: "ھ",
  v: "و", w: "و", y: "ي", e: "ي", i: "ي", o: "و",
  ".": "۔", ",": "،", "?": "؟", ";": "؛",
};

// Hebrew: pragmatic Latin→Hebrew (medial forms; finals skipped for v1).
const HEBREW: Record<string, string> = {
  sh: "ש", ts: "צ", tz: "צ", ch: "ח", kh: "כ",
  a: "א", b: "ב", g: "ג", d: "ד", h: "ה", v: "ו", w: "ו", z: "ז", t: "ת",
  y: "י", k: "כ", l: "ל", m: "מ", n: "נ", s: "ס", p: "פ", f: "פ", q: "ק",
  r: "ר", e: "ע", o: "ו", u: "ו", i: "י", c: "ק", j: "ג'",
};

// ── Harakat (short-vowel) marks ─────────────────────────────────────────────
// Diacritized keyboards add the vowel a/i/u/o → fatha/kasra/damma marks so a
// learner can type voweled text (e.g. kataba → كَتَبَ). The base consonant maps
// are reused; only the vowels and a sukun key differ.
const FATHA = "َ"; // ـَ
const KASRA = "ِ"; // ـِ
const DAMMA = "ُ"; // ـُ
const SUKUN = "ْ"; // ـْ  (no vowel) — typed with "x" or "0"
const SHADDA = "ّ"; // ـّ (gemination) — typed with "~"

function diacritized(base: Record<string, string>): Record<string, string> {
  return {
    ...base,
    a: FATHA,
    i: KASRA,
    e: KASRA,
    u: DAMMA,
    o: DAMMA,
    "0": SUKUN,
    "~": SHADDA,
  };
}

const ARABIC_H = diacritized(ARABIC);
const PERSIAN_H = diacritized(PERSIAN);
const URDU_H = diacritized(URDU);

// ── Registry ────────────────────────────────────────────────────────────────

export const LANGUAGES: QalamLanguage[] = [
  // Defaults chosen from research: Nastaliq for Urdu; Amiri (Naskh) for Arabic;
  // Vazirmatn (Persian-tuned, covers Urdu letters) for Persian; Scheherazade
  // (SIL, broad coverage) for Pashto/Sindhi; Frank Ruhl Libre for Hebrew.
  { code: "ur", label: "Urdu", nativeLabel: "اردو", dir: "rtl", defaultFontKey: "noto-nastaliq", phoneticMap: URDU },
  { code: "ur-h", label: "Urdu (with aerab)", nativeLabel: "اردو ﹷ", dir: "rtl", defaultFontKey: "noto-nastaliq", phoneticMap: URDU_H, diacritized: true, base: "ur" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl", defaultFontKey: "amiri", phoneticMap: ARABIC },
  { code: "ar-h", label: "Arabic (diacritized)", nativeLabel: "العربية ﹷ", dir: "rtl", defaultFontKey: "amiri", phoneticMap: ARABIC_H, diacritized: true, base: "ar" },
  { code: "fa", label: "Persian", nativeLabel: "فارسی", dir: "rtl", defaultFontKey: "vazirmatn", phoneticMap: PERSIAN },
  { code: "fa-h", label: "Persian (diacritized)", nativeLabel: "فارسی ﹷ", dir: "rtl", defaultFontKey: "vazirmatn", phoneticMap: PERSIAN_H, diacritized: true, base: "fa" },
  { code: "ps", label: "Pashto", nativeLabel: "پښتو", dir: "rtl", defaultFontKey: "scheherazade", phoneticMap: PASHTO },
  { code: "sd", label: "Sindhi", nativeLabel: "سنڌي", dir: "rtl", defaultFontKey: "lateef", phoneticMap: SINDHI },
  { code: "he", label: "Hebrew", nativeLabel: "עברית", dir: "rtl", defaultFontKey: "frank-ruhl", phoneticMap: HEBREW },
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr", defaultFontKey: "noto-sans-arabic" },
];

export const DEFAULT_LANG: LangCode = "ur";

export function getLanguage(code: LangCode | string): QalamLanguage {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** The frame patch to apply when switching a frame to a language: sets lang,
 *  direction, the language's default font, and a direction-appropriate align. */
export function languagePatch(code: LangCode) {
  const l = getLanguage(code);
  return {
    lang: l.code,
    dir: l.dir,
    fontKey: l.defaultFontKey,
    align: (l.dir === "rtl" ? "right" : "left") as "right" | "left",
  };
}

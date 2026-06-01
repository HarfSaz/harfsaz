// Language / keyboard registry. Each language has a script direction, a default
// font (key into FONTS), and a pragmatic phonetic Roman→script map so users
// without an OS keyboard for that language can type immediately.
//
// The maps are PRAGMATIC starters (common-sense letter mappings), not exhaustive
// linguistic transliterators — the AI "Roman → script" task handles serious
// conversion. Greedy longest-match: digraphs (kh, sh, …) are tried before
// singles by the transliterate() loop in editor/phonetic.ts.

export type LangCode = "ur" | "ar" | "fa" | "ps" | "sd" | "he" | "en";
export type Dir = "rtl" | "ltr";

export interface QalamLanguage {
  code: LangCode;
  label: string; // English name
  nativeLabel: string; // name in its own script
  dir: Dir;
  defaultFontKey: string; // key into FONTS
  /** Roman→script map; undefined = no transliteration (English pass-through). */
  phoneticMap?: Record<string, string>;
}

// ── Phonetic maps ──────────────────────────────────────────────────────────

const URDU: Record<string, string> = {
  kh: "خ", gh: "غ", sh: "ش", ch: "چ", th: "تھ", ph: "پھ", bh: "بھ", dh: "دھ",
  jh: "جھ", zh: "ژ", aa: "آ", ee: "ی", oo: "و",
  a: "ا", b: "ب", p: "پ", t: "ت", s: "س", j: "ج", d: "د", r: "ر", z: "ز",
  f: "ف", q: "ق", k: "ک", g: "گ", l: "ل", m: "م", n: "ن", v: "و", w: "و",
  h: "ہ", y: "ی", e: "ے", i: "ی", o: "و", u: "ُ", c: "ک", x: "کس",
  ".": "۔", ",": "،", "?": "؟", ";": "؛",
};

// Arabic uses ك / ي (not the Urdu ک / ی) and ه.
const ARABIC: Record<string, string> = {
  kh: "خ", gh: "غ", sh: "ش", th: "ث", dh: "ذ", aa: "آ",
  a: "ا", b: "ب", t: "ت", j: "ج", H: "ح", d: "د", r: "ر", z: "ز", s: "س",
  S: "ص", D: "ض", T: "ط", Z: "ظ", f: "ف", q: "ق", k: "ك", l: "ل", m: "م",
  n: "ن", h: "ه", w: "و", y: "ي", "'": "ع",
  ".": ".", ",": "،", "?": "؟", ";": "؛",
};

// Persian/Farsi: Arabic base with Persian letterforms ک گ چ ژ پ ی.
const PERSIAN: Record<string, string> = {
  kh: "خ", gh: "غ", sh: "ش", ch: "چ", zh: "ژ", aa: "آ",
  a: "ا", b: "ب", p: "پ", t: "ت", s: "س", j: "ج", d: "د", r: "ر", z: "ز",
  f: "ف", q: "ق", k: "ک", g: "گ", l: "ل", m: "م", n: "ن", h: "ه",
  v: "و", w: "و", y: "ی", e: "ه", i: "ی", o: "و",
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

// ── Registry ────────────────────────────────────────────────────────────────

export const LANGUAGES: QalamLanguage[] = [
  { code: "ur", label: "Urdu", nativeLabel: "اردو", dir: "rtl", defaultFontKey: "noto-nastaliq", phoneticMap: URDU },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl", defaultFontKey: "amiri", phoneticMap: ARABIC },
  { code: "fa", label: "Persian", nativeLabel: "فارسی", dir: "rtl", defaultFontKey: "vazirmatn", phoneticMap: PERSIAN },
  { code: "ps", label: "Pashto", nativeLabel: "پښتو", dir: "rtl", defaultFontKey: "noto-naskh", phoneticMap: PASHTO },
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

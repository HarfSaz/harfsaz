// Phonetic transliteration: convert a Roman string into a target script using a
// per-language map (see lib/languages.ts). Greedy longest-match so digraphs
// (kh, sh, ch, tt, …) win over single letters. Unmapped characters (spaces,
// digits, unknowns) pass through unchanged. A `undefined` map means no
// transliteration (e.g. English) — the input is returned as-is.

const keysCache = new WeakMap<Record<string, string>, string[]>();

function sortedKeys(map: Record<string, string>): string[] {
  let keys = keysCache.get(map);
  if (!keys) {
    keys = Object.keys(map).sort((a, b) => b.length - a.length);
    keysCache.set(map, keys);
  }
  return keys;
}

/** Transliterate `input` to the target script using `map`. */
export function transliterate(
  input: string,
  map: Record<string, string> | undefined
): string {
  if (!map) return input; // no map (English) → pass through
  const keys = sortedKeys(map);
  let out = "";
  let i = 0;
  const lower = input.toLowerCase();
  while (i < lower.length) {
    let matched = false;
    for (const key of keys) {
      // Match case-sensitively for uppercase keys (e.g. Arabic H, S, T, D, Z),
      // case-insensitively otherwise.
      const hasUpper = key !== key.toLowerCase();
      const src = hasUpper ? input : lower;
      if (src.startsWith(key, i)) {
        out += map[key];
        i += key.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += input[i];
      i += 1;
    }
  }
  return out;
}

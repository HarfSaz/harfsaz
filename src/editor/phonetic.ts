// Phonetic transliteration: convert a Roman string into a target script using a
// per-language map (see lib/languages.ts). Greedy longest-match so digraphs
// (kh, sh, ch, tt, …) win over single letters. Unmapped characters (spaces,
// digits, unknowns) pass through unchanged. A `undefined` map means no
// transliteration (e.g. English) — the input is returned as-is.

const keysCache = new WeakMap<Record<string, string>, string[]>();

function sortedKeys(map: Record<string, string>): string[] {
  let keys = keysCache.get(map);
  if (!keys) {
    // Longest first (digraphs win); within equal length, case-sensitive keys
    // that contain an uppercase letter come first so the Shift layer is matched
    // before the lowercase base layer.
    keys = Object.keys(map).sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      const aU = a !== a.toLowerCase();
      const bU = b !== b.toLowerCase();
      return aU === bU ? 0 : aU ? -1 : 1;
    });
    keysCache.set(map, keys);
  }
  return keys;
}

/** Transliterate `input` to the target script using `map`.
 *  Two layers: lowercase keys = base layer (matched case-insensitively), and
 *  keys containing an uppercase letter = Shift layer (matched only when the
 *  typed character is actually uppercase). */
export function transliterate(
  input: string,
  map: Record<string, string> | undefined
): string {
  if (!map) return input; // no map (English) → pass through
  const keys = sortedKeys(map);
  let out = "";
  let i = 0;
  while (i < input.length) {
    let matched = false;
    for (const key of keys) {
      const isShift = key !== key.toLowerCase();
      if (isShift) {
        // Shift-layer key: match the typed text exactly (case-sensitive).
        if (input.startsWith(key, i)) {
          out += map[key];
          i += key.length;
          matched = true;
          break;
        }
      } else {
        // Base-layer key: match case-insensitively against this slice.
        const slice = input.substr(i, key.length).toLowerCase();
        if (slice === key) {
          out += map[key];
          i += key.length;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      out += input[i];
      i += 1;
    }
  }
  return out;
}

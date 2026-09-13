/** Normalize saved CSS colors and user-entered hex for native color inputs. */
export function normalizeHex(value: string): string | null {
  const text = value.trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(text);
  if (short) return `#${[...short[1]].map(c => c + c).join("").toLowerCase()}`;
  const full = /^#?([0-9a-f]{6})$/i.exec(text);
  if (full) return `#${full[1].toLowerCase()}`;
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(text);
  if (rgb && rgb.slice(1).every(n => Number(n) <= 255)) {
    return `#${rgb.slice(1).map(n => Number(n).toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

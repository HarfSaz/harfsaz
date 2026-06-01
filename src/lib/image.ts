// Image helpers for image frames.

/** Open a native file picker and return the chosen image as a data URL + its
 *  natural pixel dimensions (for sizing the placed frame to the right ratio). */
export function pickImageFile(): Promise<{ src: string; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : "";
        if (!src) return resolve(null);
        const img = new Image();
        img.onload = () => resolve({ src, w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ src, w: 0, h: 0 });
        img.src = src;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

/** Fit a natural w×h into a max box, preserving aspect ratio. */
export function fitWithin(w: number, h: number, maxW: number, maxH: number) {
  if (w <= 0 || h <= 0) return { width: Math.min(maxW, 320), height: Math.min(maxH, 220) };
  const scale = Math.min(maxW / w, maxH / h, 1);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

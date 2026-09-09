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

// ── OCR attachments ─────────────────────────────────────────────────────────

/** File types the OCR backend accepts. Kept in sync with `ai::ocr` in Rust. */
export const OCR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

/** Largest attachment the API will take, in bytes (matches MAX_ATTACHMENT_BYTES). */
export const OCR_MAX_BYTES = 5 * 1024 * 1024;

export interface Attachment {
  /** Full `data:<mime>;base64,…` URL — doubles as the preview `src`. */
  dataUrl: string;
  mediaType: string;
  name: string;
  size: number;
  isPdf: boolean;
}

/** Human-readable file size, e.g. "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Read a File into an OCR attachment, or throw a message worth showing.
 *
 * Validation happens here rather than in Rust so an oversized or unsupported
 * file is rejected instantly, without a base64 round-trip through the bridge.
 */
export function readAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const mediaType = (file.type || "").toLowerCase();
    const isPdf = mediaType === "application/pdf";
    if (!OCR_ACCEPT.split(",").includes(mediaType)) {
      reject(
        new Error(
          `“${file.name}” is not a supported file type. Use a PNG, JPEG, WebP or GIF image, or a PDF.`
        )
      );
      return;
    }
    if (file.size > OCR_MAX_BYTES) {
      reject(
        new Error(
          `“${file.name}” is ${formatBytes(file.size)} — the limit is ${formatBytes(
            OCR_MAX_BYTES
          )}. Crop it, lower the resolution, or split the pages.`
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        reject(new Error("That file could not be read."));
        return;
      }
      resolve({ dataUrl, mediaType, name: file.name, size: file.size, isPdf });
    };
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

/** Open a picker limited to OCR-capable file types. Resolves null if cancelled. */
export function pickAttachment(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = OCR_ACCEPT;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** Fit a natural w×h into a max box, preserving aspect ratio. */
export function fitWithin(w: number, h: number, maxW: number, maxH: number) {
  if (w <= 0 || h <= 0) return { width: Math.min(maxW, 320), height: Math.min(maxH, 220) };
  const scale = Math.min(maxW / w, maxH / h, 1);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

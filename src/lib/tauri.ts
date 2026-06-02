// Thin typed wrappers around the Rust commands exposed in src-tauri/src/lib.rs.
import { invoke } from "@tauri-apps/api/core";

/** True when running inside the Tauri desktop runtime (vs. a plain browser tab). */
export function isTauri(): boolean {
  return typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
}

/** Guard: throw a clear, catchable error if a Rust command is called in-browser. */
function ensureTauri(feature: string): void {
  if (!isTauri()) {
    throw new Error(
      `${feature} requires the Qalam desktop app (Tauri). Run "pnpm app:dev".`
    );
  }
}

export interface ShapedGlyph {
  glyph_id: number;
  cluster: number;
  x_advance: number;
  y_advance: number;
  x_offset: number;
  y_offset: number;
}

export interface ShapedRun {
  glyphs: ShapedGlyph[];
  total_advance: number;
  rtl: boolean;
}

/** Shape Urdu text into positioned glyphs via the Rust HarfBuzz/rustybuzz core. */
export function shapeText(
  text: string,
  fontBytes: Uint8Array,
  fontSize: number
): Promise<ShapedRun> {
  ensureTauri("Shaping");
  return invoke<ShapedRun>("shape_text", {
    text,
    fontBytes: Array.from(fontBytes),
    fontSize,
  });
}

export interface RenderGlyph {
  glyph_id: number;
  cluster: number;
  pen_x: number;
  pen_y: number;
  x_offset: number;
  y_offset: number;
  path: string;
}
export interface RenderLine {
  glyphs: RenderGlyph[];
  width: number;
  baseline_y: number;
}
export interface RenderLayout {
  lines: RenderLine[];
  used_height: number;
  rtl: boolean;
}

/** Lay out text into vector glyphs (SVG paths) — the print-grade render path. */
export function layoutText(
  text: string,
  fontBytes: Uint8Array,
  fontSize: number,
  frameWidth: number
): Promise<RenderLayout> {
  ensureTauri("Print-grade rendering");
  return invoke<RenderLayout>("layout_text", {
    text,
    fontBytes: Array.from(fontBytes),
    fontSize,
    frameWidth,
  });
}

// ---- AI ----

export type AiTask =
  | { kind: "write"; mode: "compose" | "continue" | "rephrase" | "tone"; tone?: string }
  | { kind: "proofread" }
  | { kind: "translate"; target: "urdu" | "english" | "roman_to_urdu" }
  | { kind: "layout"; mode: "headline" | "caption" | "layout_suggest" };

export interface AiResponse {
  output: string;
  model: string;
  tokens: number;
}

export function aiTask(params: {
  task: AiTask;
  text: string;
  instruction?: string;
  model?: string;
}): Promise<AiResponse> {
  ensureTauri("AI features");
  return invoke<AiResponse>("ai_task", { req: params });
}

export interface Correction {
  original: string;
  suggestion: string;
  reason: string;
}
export interface ProofreadResult {
  corrections: Correction[];
  model: string;
  tokens: number;
}

/** Inline, non-destructive proofread: returns span-level corrections to apply. */
export function aiProofreadInline(text: string, model?: string): Promise<ProofreadResult> {
  ensureTauri("AI proofreading");
  return invoke<ProofreadResult>("ai_proofread_inline", { text, model });
}

/** Add diacritics/harakat (تشكيل) to RTL text. lang = base code (ar/fa/ur). */
export function aiAddDiacritics(text: string, lang: string, model?: string): Promise<AiResponse> {
  ensureTauri("AI diacritics");
  return invoke<AiResponse>("ai_add_diacritics", { text, lang, model });
}

export type TransformAction =
  | "rephrase" | "grammar" | "expand" | "shorten" | "formal" | "casual"
  | "simplify" | "caption" | "define" | "translate_en" | "translate_ur" | "custom";

/** Transform selected text per an action (or a custom instruction). */
export function aiTransform(params: {
  text: string;
  action: TransformAction;
  instruction?: string;
  lang?: string;
  model?: string;
}): Promise<AiResponse> {
  ensureTauri("AI");
  return invoke<AiResponse>("ai_transform", params);
}

export function aiKeyPresent(): Promise<boolean> {
  // Don't throw on startup in the browser — just report "not present".
  if (!isTauri()) return Promise.resolve(false);
  return invoke<boolean>("ai_key_present");
}

/** Name of the active AI provider (Claude / DeepSeek / Mistral / OpenAI / Claude CLI). */
export function aiProvider(): Promise<string> {
  if (!isTauri()) return Promise.resolve("—");
  return invoke<string>("ai_provider");
}

export interface AiSettingsView {
  provider: string;
  model: string;
  has_key: boolean;
}

/** Read saved AI settings (provider/model + whether a key is stored). */
export function getAiSettings(): Promise<AiSettingsView> {
  if (!isTauri()) return Promise.resolve({ provider: "", model: "", has_key: false });
  return invoke<AiSettingsView>("get_ai_settings");
}

/** Save AI settings locally (provider, key, model). Empty key clears it. */
export function setAiSettings(provider: string, apiKey: string, model: string): Promise<void> {
  ensureTauri("AI settings");
  return invoke<void>("set_ai_settings", { provider, apiKey, model });
}

// ---- Printing ----

export interface PrinterInfo {
  name: string;
  is_default: boolean;
}

export function listPrinters(): Promise<PrinterInfo[]> {
  if (!isTauri()) return Promise.resolve([]);
  return invoke<PrinterInfo[]>("list_printers");
}

export function printFile(params: {
  filePath: string;
  printer?: string;
  copies: number;
  range?: string;
  grayscale: boolean;
}): Promise<string> {
  ensureTauri("Printing");
  return invoke<string>("print_file", params);
}

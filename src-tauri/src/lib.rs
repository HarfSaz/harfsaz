//! Qalam — Tauri application entry. Wires the Nastaliq shaper and the Claude AI
//! bridge as invokable commands the React frontend can call.

mod ai;
mod printing;
mod shaping;

use ai::{AiRequest, AiResponse};
use shaping::{RenderLayout, ShapedRun};

/// Shape a run of (Urdu) text into positioned glyphs.
///
/// `font_bytes` is the raw font file sent from the frontend as a byte array.
#[tauri::command]
fn shape_text(text: String, font_bytes: Vec<u8>, font_size: f32) -> Result<ShapedRun, String> {
    shaping::shape_text(&text, &font_bytes, font_size)
}

/// Lay out text into a frame and return positioned vector glyphs (SVG paths) —
/// the print-grade render path.
#[tauri::command]
fn layout_text(
    text: String,
    font_bytes: Vec<u8>,
    font_size: f32,
    frame_width: f32,
) -> Result<RenderLayout, String> {
    shaping::layout_text(&text, &font_bytes, font_size, frame_width)
}

/// Run an AI task (write / proofread / translate / layout) via Claude.
#[tauri::command]
async fn ai_task(req: AiRequest) -> Result<AiResponse, String> {
    ai::run_task(req).await
}

/// Add diacritics/harakat (تشكيل) to RTL text for the given base language.
#[tauri::command]
async fn ai_add_diacritics(
    text: String,
    lang: String,
    model: Option<String>,
) -> Result<ai::AiResponse, String> {
    ai::add_diacritics(text, lang, model).await
}

/// Proofread Urdu text and return span-level corrections for inline,
/// non-destructive highlighting (accept/reject per suggestion).
#[tauri::command]
async fn ai_proofread_inline(
    text: String,
    model: Option<String>,
) -> Result<ai::ProofreadResult, String> {
    ai::proofread_inline(text, model).await
}

/// List installed system printers (CUPS via lpstat).
#[tauri::command]
fn list_printers() -> Result<Vec<printing::PrinterInfo>, String> {
    printing::list_printers()
}

/// Print a file to a chosen printer via the OS print system (lp).
#[tauri::command]
fn print_file(
    file_path: String,
    printer: Option<String>,
    copies: u32,
    range: Option<String>,
    grayscale: bool,
) -> Result<String, String> {
    printing::print_file(file_path, printer, copies, range, grayscale)
}

/// Lightweight health check the UI can call on startup to confirm the API key
/// is configured, without leaking the key itself.
#[tauri::command]
fn ai_key_present() -> bool {
    std::env::var("QALAM_ANTHROPIC_API_KEY")
        .or_else(|_| std::env::var("ANTHROPIC_API_KEY"))
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            shape_text,
            layout_text,
            ai_task,
            ai_proofread_inline,
            ai_add_diacritics,
            list_printers,
            print_file,
            ai_key_present
        ])
        .run(tauri::generate_context!())
        .expect("error while running Qalam");
}

//! Qalam — Tauri application entry. Wires the Nastaliq shaper and the Claude AI
//! bridge as invokable commands the React frontend can call.

mod ai;
mod printing;
mod settings;
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

/// Multi-turn chat with conversation context (the AI panel's chat thread).
#[tauri::command]
async fn ai_chat(
    messages: Vec<ai::ChatMessage>,
    system: String,
) -> Result<ai::AiResponse, String> {
    ai::chat(messages, system).await
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

/// Transform a selected snippet (rephrase/grammar/caption/define/expand/custom…)
/// for the selection AI menu.
#[tauri::command]
async fn ai_transform(
    text: String,
    action: String,
    instruction: Option<String>,
    lang: Option<String>,
    model: Option<String>,
) -> Result<ai::AiResponse, String> {
    ai::transform(text, action, instruction, lang, model).await
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

/// OCR an attached image/PDF (handwritten or printed) into editable text.
///
/// `data` is the file as base64 (a data URL is accepted too), `media_type` its
/// MIME type. `mode` is "plain" or "layout"; `diacritics` adds aerab.
#[tauri::command]
async fn ai_ocr(
    data: String,
    media_type: String,
    lang: String,
    mode: String,
    diacritics: bool,
    instruction: Option<String>,
    model: Option<String>,
) -> Result<ai::OcrResult, String> {
    ai::ocr(data, media_type, lang, mode, diacritics, instruction, model).await
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

/// Lightweight health check the UI can call on startup to confirm the active
/// AI provider is configured, without leaking any key.
#[tauri::command]
fn ai_key_present() -> bool {
    ai::is_configured()
}

/// Which AI provider is active (Claude / DeepSeek / Mistral / OpenAI / Claude CLI).
#[tauri::command]
fn ai_provider() -> String {
    ai::provider_name()
}

/// Read current AI settings (provider + model + whether a key is saved — never
/// returns the raw key).
#[tauri::command]
fn get_ai_settings() -> settings::AiSettingsView {
    settings::view()
}

/// Save AI settings (provider, api key, model) to local config. Takes effect
/// immediately (no restart). If `api_key` is blank the previously-saved key is
/// preserved, so the UI never has to read a key back to re-save the other
/// fields. Use `clear_ai_key` to actually remove a stored key.
#[tauri::command]
fn set_ai_settings(provider: String, api_key: String, model: String) -> Result<(), String> {
    let key = if api_key.trim().is_empty() {
        settings::load().api_key // keep existing
    } else {
        api_key
    };
    settings::save(&settings::AiSettings { provider, api_key: key, model })
}

/// Forget the stored API key (keeps provider/model). The UI's "Remove key"
/// action — previously unreachable, since saving a blank key preserves it.
#[tauri::command]
fn clear_ai_key() -> Result<(), String> {
    let current = settings::load();
    settings::save(&settings::AiSettings {
        provider: current.provider,
        api_key: String::new(),
        model: current.model,
    })
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
            ai_chat,
            ai_proofread_inline,
            ai_add_diacritics,
            ai_transform,
            ai_ocr,
            list_printers,
            print_file,
            ai_key_present,
            ai_provider,
            get_ai_settings,
            set_ai_settings,
            clear_ai_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running Qalam");
}

//! Claude (Anthropic API) bridge — the "AI-native" core of Harfsaz.
//!
//! Four capabilities, all Urdu-aware, all routed through a single typed task enum:
//!   1. Writing assistant   — compose / continue / rephrase / change tone
//!   2. Proofreading        — Urdu spelling, grammar, Nastaliq spacing
//!   3. Translate / translit — English<->Urdu, Roman-Urdu -> Nastaliq script
//!   4. Layout / design AI  — headline & caption generation, layout suggestions
//!
//! Each task carries a tailored system prompt so the model behaves like a
//! domain expert (an Urdu sub-editor), not a generic chat assistant. The API key
//! is read from the HARFSAZ_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY) env var and
//! never shipped to the frontend.

use serde::{Deserialize, Serialize};
use std::process::Command;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
// Default to the latest capable Claude model; strong multilingual incl. Urdu.
const DEFAULT_MODEL: &str = "claude-opus-5";

// ── Pluggable LLM providers ─────────────────────────────────────────────────
//
// The model backend is chosen at runtime by the HARFSAZ_AI_PROVIDER env var:
//   "anthropic" (default) | "deepseek" | "mistral" | "openai" | "claude-cli"
//
// All HTTP providers except Anthropic speak the OpenAI chat-completions format,
// so they share one code path. "claude-cli" shells out to the local `claude`
// binary (dev/personal use only — can't ship in a sold product, since each user
// would need their own Claude Code auth). The provider abstraction means the
// rest of ai.rs never cares which backend is active.

#[derive(Clone, Copy, PartialEq)]
enum Provider {
    Anthropic,
    DeepSeek,
    Mistral,
    OpenAi,
    ClaudeCli,
}

struct ProviderConfig {
    provider: Provider,
    /// Chat-completions endpoint (unused for Anthropic / claude-cli).
    base_url: String,
    api_key: Option<String>,
    /// Default model id for this provider when the caller doesn't override.
    default_model: String,
}

fn first_env(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|k| std::env::var(k).ok()).filter(|v| !v.trim().is_empty())
}

fn resolve_provider() -> ProviderConfig {
    // Saved in-app settings take precedence over environment variables, so a key
    // pasted in the Settings dialog "just works" without restarting.
    let saved = crate::settings::load();
    let saved_key = (!saved.api_key.trim().is_empty()).then(|| saved.api_key.clone());
    let saved_model = (!saved.model.trim().is_empty()).then(|| saved.model.clone());

    let name = if !saved.provider.trim().is_empty() {
        saved.provider.to_lowercase()
    } else {
        std::env::var("HARFSAZ_AI_PROVIDER").unwrap_or_default().to_lowercase()
    };

    let model_for = |default: &str| saved_model.clone().unwrap_or_else(|| env_or("HARFSAZ_AI_MODEL", default));

    match name.as_str() {
        "deepseek" => ProviderConfig {
            provider: Provider::DeepSeek,
            base_url: env_or("HARFSAZ_AI_BASE_URL", "https://api.deepseek.com/v1/chat/completions"),
            api_key: saved_key.or_else(|| first_env(&["HARFSAZ_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY", "HARFSAZ_AI_API_KEY"])),
            default_model: model_for("deepseek-chat"),
        },
        "mistral" => ProviderConfig {
            provider: Provider::Mistral,
            base_url: env_or("HARFSAZ_AI_BASE_URL", "https://api.mistral.ai/v1/chat/completions"),
            api_key: saved_key.or_else(|| first_env(&["HARFSAZ_MISTRAL_API_KEY", "MISTRAL_API_KEY", "HARFSAZ_AI_API_KEY"])),
            default_model: model_for("mistral-large-latest"),
        },
        "openai" => ProviderConfig {
            provider: Provider::OpenAi,
            base_url: env_or("HARFSAZ_AI_BASE_URL", "https://api.openai.com/v1/chat/completions"),
            api_key: saved_key.or_else(|| first_env(&["HARFSAZ_OPENAI_API_KEY", "OPENAI_API_KEY", "HARFSAZ_AI_API_KEY"])),
            default_model: model_for("gpt-4o"),
        },
        "claude-cli" | "claude_cli" => ProviderConfig {
            provider: Provider::ClaudeCli,
            base_url: String::new(),
            api_key: None, // uses the local `claude` login
            default_model: model_for(DEFAULT_MODEL),
        },
        // default: Anthropic API
        _ => ProviderConfig {
            provider: Provider::Anthropic,
            base_url: ANTHROPIC_URL.to_string(),
            api_key: saved_key.or_else(|| first_env(&["HARFSAZ_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY", "HARFSAZ_AI_API_KEY"])),
            default_model: model_for(DEFAULT_MODEL),
        },
    }
}

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty()).unwrap_or_else(|| fallback.to_string())
}

/// Whether the currently-selected provider is ready to use (has a key, or is the
/// CLI provider which uses local auth). Used by the UI's startup health check.
pub fn is_configured() -> bool {
    let cfg = resolve_provider();
    matches!(cfg.provider, Provider::ClaudeCli) || cfg.api_key.is_some()
}

/// The active provider's display name (for the UI to show which model is in use).
pub fn provider_name() -> String {
    match resolve_provider().provider {
        Provider::Anthropic => "Claude",
        Provider::DeepSeek => "DeepSeek",
        Provider::Mistral => "Mistral",
        Provider::OpenAi => "OpenAI",
        Provider::ClaudeCli => "Claude CLI",
    }
    .to_string()
}

/// Text + token usage from one LLM call. Tokens drive the daily free-tier meter.
pub struct LlmResult {
    pub text: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
}

/// The one call every AI feature routes through. `model_override` lets a caller
/// pin a specific model; otherwise the provider's default is used.
pub async fn call_llm(
    system: &str,
    user: &str,
    model_override: Option<&str>,
) -> Result<LlmResult, String> {
    let cfg = resolve_provider();
    let model = model_override.map(|m| m.to_string()).unwrap_or_else(|| cfg.default_model.clone());

    match cfg.provider {
        Provider::Anthropic => call_anthropic(&cfg, &model, system, user).await,
        Provider::ClaudeCli => call_claude_cli(&model, system, user).await,
        // DeepSeek / Mistral / OpenAI all share the OpenAI chat format.
        _ => call_openai_compatible(&cfg, &model, system, user).await,
    }
}

/// Rough token estimate when a provider doesn't report usage (~4 chars/token).
fn estimate_tokens(s: &str) -> u32 {
    ((s.chars().count() as f32) / 4.0).ceil() as u32
}

/// One chat turn from the frontend (role = "user" | "assistant").
#[derive(Deserialize, Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Multi-turn chat with conversation context. Sends the full message history so
/// the model remembers earlier turns in the session.
pub async fn chat(messages: Vec<ChatMessage>, system: String) -> Result<AiResponse, String> {
    let cfg = resolve_provider();
    let model = cfg.default_model.clone();

    // Build a provider-appropriate JSON messages array.
    let msgs: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();

    let res = match cfg.provider {
        Provider::Anthropic => chat_anthropic(&cfg, &model, &system, &msgs).await?,
        Provider::ClaudeCli => {
            // CLI is single-shot; flatten the history into one prompt.
            let flat = messages
                .iter()
                .map(|m| format!("{}: {}", m.role, m.content))
                .collect::<Vec<_>>()
                .join("\n");
            call_claude_cli(&model, &system, &flat).await?
        }
        _ => chat_openai(&cfg, &model, &system, &msgs).await?,
    };
    if res.text.trim().is_empty() {
        return Err("The model returned an empty response.".into());
    }
    Ok(AiResponse {
        output: res.text,
        model,
        tokens: res.input_tokens + res.output_tokens,
    })
}

async fn chat_anthropic(cfg: &ProviderConfig, model: &str, system: &str, msgs: &[serde_json::Value]) -> Result<LlmResult, String> {
    let api_key = cfg.api_key.clone().ok_or_else(|| "No API key set.".to_string())?;
    let body = serde_json::json!({
        "model": model, "max_tokens": 2048, "system": system, "messages": msgs
    });
    let resp = reqwest::Client::new()
        .post(&cfg.base_url)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body).send().await
        .map_err(|e| format!("Request to Claude failed: {e}"))?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("Could not parse Claude response: {e}"))?;
    if !status.is_success() {
        let msg = json.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).unwrap_or("unknown error");
        return Err(format!("Claude API error ({status}): {msg}"));
    }
    let text = json.get("content").and_then(|c| c.as_array())
        .map(|b| b.iter().filter_map(|x| x.get("text").and_then(|t| t.as_str())).collect::<Vec<_>>().join(""))
        .unwrap_or_default();
    let usage = json.get("usage");
    let it = usage.and_then(|u| u.get("input_tokens")).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let ot = usage.and_then(|u| u.get("output_tokens")).and_then(|v| v.as_u64()).unwrap_or_else(|| estimate_tokens(&text) as u64) as u32;
    Ok(LlmResult { text, input_tokens: it, output_tokens: ot })
}

async fn chat_openai(cfg: &ProviderConfig, model: &str, system: &str, msgs: &[serde_json::Value]) -> Result<LlmResult, String> {
    let api_key = cfg.api_key.clone().ok_or_else(|| "No API key set for the selected provider.".to_string())?;
    // Prepend the system message (OpenAI format).
    let mut all = vec![serde_json::json!({ "role": "system", "content": system })];
    all.extend_from_slice(msgs);
    let body = serde_json::json!({ "model": model, "max_tokens": 2048, "messages": all });
    let resp = reqwest::Client::new()
        .post(&cfg.base_url)
        .header("authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .json(&body).send().await
        .map_err(|e| format!("Request to LLM provider failed: {e}"))?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("Could not parse provider response: {e}"))?;
    if !status.is_success() {
        let msg = json.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).unwrap_or("unknown error");
        return Err(format!("LLM provider error ({status}): {msg}"));
    }
    let text = json.get("choices").and_then(|c| c.as_array()).and_then(|a| a.first())
        .and_then(|c| c.get("message")).and_then(|m| m.get("content")).and_then(|t| t.as_str())
        .unwrap_or_default().to_string();
    let usage = json.get("usage");
    let it = usage.and_then(|u| u.get("prompt_tokens")).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let ot = usage.and_then(|u| u.get("completion_tokens")).and_then(|v| v.as_u64()).unwrap_or_else(|| estimate_tokens(&text) as u64) as u32;
    Ok(LlmResult { text, input_tokens: it, output_tokens: ot })
}

async fn call_anthropic(cfg: &ProviderConfig, model: &str, system: &str, user: &str) -> Result<LlmResult, String> {
    let api_key = cfg.api_key.clone().ok_or_else(|| {
        "No API key set. Export HARFSAZ_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY).".to_string()
    })?;
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 2048,
        "system": system,
        "messages": [{ "role": "user", "content": user }]
    });
    let resp = reqwest::Client::new()
        .post(&cfg.base_url)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request to Claude failed: {e}"))?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("Could not parse Claude response: {e}"))?;
    if !status.is_success() {
        let msg = json.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).unwrap_or("unknown error");
        return Err(format!("Claude API error ({status}): {msg}"));
    }
    let text = json
        .get("content")
        .and_then(|c| c.as_array())
        .map(|blocks| blocks.iter().filter_map(|b| b.get("text").and_then(|t| t.as_str())).collect::<Vec<_>>().join(""))
        .unwrap_or_default();
    let usage = json.get("usage");
    let input_tokens = usage.and_then(|u| u.get("input_tokens")).and_then(|v| v.as_u64()).map(|v| v as u32).unwrap_or_else(|| estimate_tokens(user) + estimate_tokens(system));
    let output_tokens = usage.and_then(|u| u.get("output_tokens")).and_then(|v| v.as_u64()).map(|v| v as u32).unwrap_or_else(|| estimate_tokens(&text));
    Ok(LlmResult { text, input_tokens, output_tokens })
}

async fn call_openai_compatible(cfg: &ProviderConfig, model: &str, system: &str, user: &str) -> Result<LlmResult, String> {
    let api_key = cfg.api_key.clone().ok_or_else(|| {
        "No API key set for the selected provider. Set HARFSAZ_AI_API_KEY (or the provider-specific key).".to_string()
    })?;
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 2048,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ]
    });
    let resp = reqwest::Client::new()
        .post(&cfg.base_url)
        .header("authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request to LLM provider failed: {e}"))?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("Could not parse provider response: {e}"))?;
    if !status.is_success() {
        let msg = json.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).unwrap_or("unknown error");
        return Err(format!("LLM provider error ({status}): {msg}"));
    }
    let text = json
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
        .unwrap_or_default()
        .to_string();
    // OpenAI-format providers report usage.{prompt_tokens, completion_tokens}.
    let usage = json.get("usage");
    let input_tokens = usage.and_then(|u| u.get("prompt_tokens")).and_then(|v| v.as_u64()).map(|v| v as u32).unwrap_or_else(|| estimate_tokens(user) + estimate_tokens(system));
    let output_tokens = usage.and_then(|u| u.get("completion_tokens")).and_then(|v| v.as_u64()).map(|v| v as u32).unwrap_or_else(|| estimate_tokens(&text));
    Ok(LlmResult { text, input_tokens, output_tokens })
}

/// Shell out to the local `claude` CLI (Claude Code). DEV/PERSONAL ONLY — uses
/// the developer's own Claude login, so it cannot power a shipped/sold product.
async fn call_claude_cli(model: &str, system: &str, user: &str) -> Result<LlmResult, String> {
    let prompt = format!("{system}\n\n---\n\n{user}");
    let model = model.to_string();
    let in_est = estimate_tokens(&prompt);
    // Spawn the blocking CLI on a worker thread so we don't block the async runtime.
    let text = tokio::task::spawn_blocking(move || {
        let out = Command::new("claude")
            .arg("-p")
            .arg(&prompt)
            .arg("--model")
            .arg(&model)
            .output()
            .map_err(|e| format!("Could not run the `claude` CLI: {e}. Is Claude Code installed and logged in?"))?;
        if !out.status.success() {
            return Err(format!("claude CLI error: {}", String::from_utf8_lossy(&out.stderr)));
        }
        Ok::<String, String>(String::from_utf8_lossy(&out.stdout).trim().to_string())
    })
    .await
    .map_err(|e| format!("claude CLI task panicked: {e}"))??;
    // The CLI doesn't report usage; estimate so the meter still counts.
    let output_tokens = estimate_tokens(&text);
    Ok(LlmResult { text, input_tokens: in_est, output_tokens })
}

/// The AI capabilities exposed to the editor. `kind` selects the system prompt.
#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AiTask {
    /// Compose or transform prose. `mode` ∈ {compose, continue, rephrase, tone}
    Write { mode: String, tone: Option<String> },
    /// Proofread Urdu text: spelling, grammar, ligature/spacing notes.
    Proofread,
    /// Translate or transliterate. `target` ∈ {urdu, english, roman_to_urdu}
    Translate { target: String },
    /// Layout/design help. `mode` ∈ {headline, caption, layout_suggest}
    Layout { mode: String },
}

#[derive(Deserialize, Debug)]
pub struct AiRequest {
    pub task: AiTask,
    /// The user's selected/source text to operate on.
    pub text: String,
    /// Optional extra instruction from the user (free-form).
    pub instruction: Option<String>,
    /// Optional model override; falls back to DEFAULT_MODEL.
    pub model: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct AiResponse {
    pub output: String,
    pub model: String,
    /// Tokens this call consumed (input + output) — drives the daily meter.
    pub tokens: u32,
}

fn system_prompt(task: &AiTask) -> String {
    match task {
        AiTask::Write { mode, tone } => {
            let tone_line = tone
                .as_ref()
                .map(|t| format!(" The desired tone is: {t}."))
                .unwrap_or_default();
            format!(
                "You are an expert Urdu writer and sub-editor for a publishing house. \
                 You write fluent, natural, idiomatic Urdu in the Nastaliq tradition. \
                 The user wants you to '{mode}' the given text.{tone_line} \
                 Return ONLY the resulting Urdu text — no explanations, no English, \
                 no quotation marks around the output."
            )
        }
        AiTask::Proofread => "You are a meticulous Urdu proofreader. Correct spelling, \
             grammar, punctuation, and awkward phrasing in the given Urdu text while \
             preserving the author's meaning and voice. Pay attention to correct Urdu \
             orthography. Return ONLY the corrected Urdu text — no commentary."
            .to_string(),
        AiTask::Translate { target } => match target.as_str() {
            "urdu" => "You are a professional translator. Translate the given text into \
                 natural, fluent Urdu (Nastaliq script). Return ONLY the Urdu translation."
                .to_string(),
            "english" => "You are a professional translator. Translate the given Urdu text \
                 into clear, natural English. Return ONLY the English translation."
                .to_string(),
            "roman_to_urdu" => "You convert Roman-Urdu (Urdu written in Latin letters) into \
                 correct Urdu Nastaliq script. Preserve meaning exactly. Return ONLY the \
                 Urdu-script text."
                .to_string(),
            other => format!(
                "Translate the given text appropriately for target '{other}'. \
                 Return only the translated text."
            ),
        },
        AiTask::Layout { mode } => match mode.as_str() {
            "headline" => "You are a newspaper headline writer. Given Urdu body text, write a \
                 short, punchy Urdu headline (sub-heading optional). Return ONLY the headline."
                .to_string(),
            "caption" => "You write concise Urdu captions for images/figures based on context. \
                 Return ONLY the caption text in Urdu."
                .to_string(),
            "layout_suggest" => "You are a desktop-publishing layout advisor. Given a description \
                 of content, suggest a concise page layout (columns, frame placement, hierarchy). \
                 Answer briefly in plain language."
                .to_string(),
            other => format!("Provide layout assistance for mode '{other}'."),
        },
    }
}

/// Execute an AI task against the configured LLM provider.
pub async fn run_task(req: AiRequest) -> Result<AiResponse, String> {
    let system = system_prompt(&req.task);

    let mut user_content = req.text.clone();
    if let Some(instr) = &req.instruction {
        if !instr.trim().is_empty() {
            user_content = format!("{user_content}\n\n[Additional instruction: {instr}]");
        }
    }

    let res = call_llm(&system, &user_content, req.model.as_deref()).await?;
    if res.text.trim().is_empty() {
        return Err("The model returned an empty response.".into());
    }

    let model = req.model.clone().unwrap_or_else(|| resolve_provider().default_model);
    Ok(AiResponse { output: res.text, model, tokens: res.input_tokens + res.output_tokens })
}

// ---- Selection transform (the right-click / selection AI menu) ----

/// Transform a selected snippet of text per `action`, optionally guided by a
/// free-form `instruction` (for the "custom prompt" action). `lang` is the
/// frame's language code so the model answers in the right language/script.
///
/// Actions: rephrase · grammar · expand · shorten · formal · casual · simplify
///          · caption · define · translate_en · translate_ur · custom
pub async fn transform(
    text: String,
    action: String,
    instruction: Option<String>,
    lang: Option<String>,
    model: Option<String>,
) -> Result<AiResponse, String> {
    let lang_name = match lang.as_deref().unwrap_or("ur") {
        "ar" | "ar-h" => "Arabic",
        "fa" | "fa-h" => "Persian",
        "ps" => "Pashto",
        "sd" => "Sindhi",
        "he" => "Hebrew",
        "en" => "English",
        _ => "Urdu",
    };
    let instr = instruction.unwrap_or_default();

    // Each action gets a tailored instruction; most return ONLY the new text so
    // the editor can replace the selection directly. "define" returns a short
    // explanation (meant to be read, not necessarily replace the text).
    let directive = match action.as_str() {
        "rephrase" => format!("Rephrase the following {lang_name} text so it reads better, keeping its meaning. Return ONLY the rephrased {lang_name} text."),
        "grammar" => format!("Correct all spelling, grammar and punctuation in the following {lang_name} text. Preserve meaning and voice. Return ONLY the corrected {lang_name} text."),
        "expand" => format!("Expand the following {lang_name} text into a longer, richer version. Return ONLY the expanded {lang_name} text."),
        "shorten" => format!("Make the following {lang_name} text shorter and more concise. Return ONLY the shortened {lang_name} text."),
        "formal" => format!("Rewrite the following {lang_name} text in a formal, professional tone. Return ONLY the rewritten {lang_name} text."),
        "casual" => format!("Rewrite the following {lang_name} text in a friendly, casual tone. Return ONLY the rewritten {lang_name} text."),
        "simplify" => format!("Rewrite the following {lang_name} text in simpler, easier words. Return ONLY the simplified {lang_name} text."),
        "caption" => format!("Write a short, catchy {lang_name} caption/headline for the following text. Return ONLY the caption in {lang_name}."),
        "define" => format!("Explain the meaning of the following {lang_name} word or phrase clearly and briefly, in {lang_name}. Return ONLY the explanation."),
        "translate_en" => "Translate the following text into clear, natural English. Return ONLY the English translation.".to_string(),
        "translate_ur" => "Translate the following text into natural Urdu (Nastaliq script). Return ONLY the Urdu translation.".to_string(),
        "custom" => format!("Apply this instruction to the following {lang_name} text: \"{instr}\". Return ONLY the resulting text, no commentary."),
        other => format!("Apply the action '{other}' to the following {lang_name} text. Return ONLY the resulting text."),
    };

    let system = format!(
        "You are an expert {lang_name} writer and editor for a publishing house. {directive} \
         Do not add quotation marks around your answer or any explanations."
    );

    let res = call_llm(&system, &text, model.as_deref()).await?;
    if res.text.trim().is_empty() {
        return Err("The model returned an empty response.".into());
    }
    let model = model.unwrap_or_else(|| resolve_provider().default_model);
    Ok(AiResponse { output: res.text.trim().to_string(), model, tokens: res.input_tokens + res.output_tokens })
}

// ---- Inline (non-destructive) proofreading ----

/// A single span-level correction the editor can highlight in place.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Correction {
    /// The exact original substring as it appears in the text.
    pub original: String,
    /// The suggested replacement.
    pub suggestion: String,
    /// Short reason in Urdu (e.g. "املا" spelling, "گرامر" grammar).
    pub reason: String,
}

#[derive(Serialize, Debug)]
pub struct ProofreadResult {
    pub corrections: Vec<Correction>,
    pub model: String,
    pub tokens: u32,
}

/// Add diacritics / harakat (تشكيل) to RTL text. `lang` is the base language
/// ("ar", "fa", "ur") so the prompt names the right tradition. Returns the same
/// text fully voweled — used by non-native/learner readers and religious text.
pub async fn add_diacritics(text: String, lang: String, model: Option<String>) -> Result<AiResponse, String> {
    let (name, marks) = match lang.as_str() {
        "fa" => ("Persian", "zabar/zir/pesh and other Persian diacritics"),
        "ur" => ("Urdu", "aerab (zabar زبر, zer زیر, pesh پیش, jazm, tashdid) as used in Urdu textbooks and poetry"),
        _ => ("Arabic", "full tashkeel (fatha, kasra, damma, sukun, shadda, tanwin)"),
    };
    let system = format!(
        "You are an expert in {name} orthography. Add complete, correct diacritics — {marks} — \
         to the given {name} text so a non-native reader can pronounce it correctly. Preserve the \
         exact words and order; only add the vowel marks. Return ONLY the diacritized {name} text, \
         no explanations, no quotes."
    );
    // Pass the caller's override through (None = the active provider's default).
    // Hardcoding a Claude model id here used to break DeepSeek/Mistral/OpenAI.
    let res = call_llm(&system, &text, model.as_deref()).await?;
    if res.text.trim().is_empty() {
        return Err("The model returned an empty response.".into());
    }
    let model = model.unwrap_or_else(|| resolve_provider().default_model);
    Ok(AiResponse { output: res.text.trim().to_string(), model, tokens: res.input_tokens + res.output_tokens })
}

/// Proofread Urdu text and return span-level corrections (for inline,
/// non-destructive highlighting in the editor) instead of a rewritten blob.
pub async fn proofread_inline(text: String, model: Option<String>) -> Result<ProofreadResult, String> {
    let system = "You are a meticulous Urdu proofreader. Find spelling, grammar, and \
        punctuation errors in the given Urdu text. Respond with ONLY a JSON array (no prose, \
        no markdown fences) where each item is an object with exactly these keys: \
        \"original\" (the exact incorrect substring as it appears in the text, copied verbatim), \
        \"suggestion\" (the corrected text), and \"reason\" (a 1-2 word reason in Urdu, e.g. \
        املا or گرامر). If there are no errors, return []. Do not include corrections whose \
        original does not appear verbatim in the text.";

    // None = let the active provider pick its own default model.
    let res = call_llm(system, &text, model.as_deref()).await?;
    let raw = res.text;
    let tokens = res.input_tokens + res.output_tokens;
    let model = model.unwrap_or_else(|| resolve_provider().default_model);

    // Be tolerant: strip optional markdown fences and locate the JSON array.
    let cleaned = raw.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    let start = cleaned.find('[');
    let end = cleaned.rfind(']');
    let slice = match (start, end) {
        (Some(s), Some(e)) if e >= s => &cleaned[s..=e],
        _ => "[]",
    };

    let corrections: Vec<Correction> = serde_json::from_str(slice).map_err(|e| {
        format!("Could not parse proofread JSON: {e}. Raw: {}", &raw.chars().take(200).collect::<String>())
    })?;

    // Keep only corrections whose original actually appears in the text.
    let corrections = corrections
        .into_iter()
        .filter(|c| !c.original.is_empty() && text.contains(&c.original))
        .collect();

    Ok(ProofreadResult { corrections, model, tokens })
}

// ---- OCR: handwriting & scan → editable Urdu/Arabic text ------------------
//
// The user attaches a photo/scan/PDF of handwritten or printed RTL text and the
// vision model transcribes it into editable Unicode the editor can typeset. This
// is the "AI writes what you wrote by hand" path: phone photo of a manuscript →
// Nastaliq DTP text in one step.

/// Largest attachment we'll send, in decoded bytes. Anthropic caps a single
/// base64 image at ~5 MB; we check before the round-trip so the user gets a
/// clear message instead of an opaque 413 from the API.
const MAX_ATTACHMENT_BYTES: usize = 5 * 1024 * 1024;

/// What the OCR pass produced, plus the per-call token cost for the meter.
#[derive(Serialize, Debug)]
pub struct OcrResult {
    /// The transcribed text, ready to drop into a frame.
    pub text: String,
    pub model: String,
    pub tokens: u32,
}

/// Strip a `data:<media-type>;base64,` prefix if the frontend passed a whole
/// data URL (FileReader.readAsDataURL produces one), and drop any whitespace —
/// base64 with newlines is rejected by the API.
fn clean_b64(raw: &str) -> String {
    let body = match raw.find("base64,") {
        Some(i) => &raw[i + "base64,".len()..],
        None => raw,
    };
    body.chars().filter(|c| !c.is_whitespace()).collect()
}

/// Approximate decoded size of a base64 payload without actually decoding it.
fn b64_decoded_len(b64: &str) -> usize {
    let padding = b64.bytes().rev().take_while(|&c| c == b'=').count();
    (b64.len() / 4) * 3 - padding.min(2)
}

/// Human-readable language name + script guidance for the OCR system prompt.
fn ocr_language(lang: &str) -> (&'static str, &'static str) {
    match lang {
        "ar" | "ar-h" => ("Arabic", "Arabic script (Naskh or Ruqʿah handwriting)"),
        "fa" | "fa-h" => ("Persian", "Persian Arabic script (Nastaliq or Naskh)"),
        "ps" => ("Pashto", "Pashto Arabic script"),
        "sd" => ("Sindhi", "Sindhi Arabic script"),
        "he" => ("Hebrew", "Hebrew script"),
        "en" => ("English", "Latin script"),
        "auto" => ("the language shown in the image", "the script shown in the image"),
        _ => ("Urdu", "Urdu Nastaliq script"),
    }
}

/// Transcribe an attached image or PDF into editable text.
///
/// `data_b64` is the attachment as base64 (a full data URL is also accepted).
/// `media_type` is its MIME type (image/png, image/jpeg, image/webp, image/gif,
/// application/pdf). `mode` is "plain" (flowing text) or "layout" (keep the
/// original line and paragraph breaks). `diacritics` asks the model to add
/// aerab/harakat as it transcribes.
pub async fn ocr(
    data_b64: String,
    media_type: String,
    lang: String,
    mode: String,
    diacritics: bool,
    instruction: Option<String>,
    model: Option<String>,
) -> Result<OcrResult, String> {
    let b64 = clean_b64(&data_b64);
    if b64.is_empty() {
        return Err("The attachment was empty — pick an image or PDF and try again.".into());
    }
    if b64_decoded_len(&b64) > MAX_ATTACHMENT_BYTES {
        return Err(
            "That file is larger than 5 MB. Please crop it, lower the resolution, or split \
             the pages, then try again."
                .into(),
        );
    }

    let media_type = media_type.trim().to_lowercase();
    let is_pdf = media_type == "application/pdf";
    if !is_pdf && !matches!(media_type.as_str(), "image/png" | "image/jpeg" | "image/webp" | "image/gif") {
        return Err(format!(
            "Unsupported attachment type '{media_type}'. Use a PNG, JPEG, WebP or GIF image, or a PDF."
        ));
    }

    let (name, script) = ocr_language(&lang);
    let layout_rule = if mode == "layout" {
        "Preserve the original layout: keep every line break and paragraph break exactly where \
         it appears in the image. Do not merge lines into flowing paragraphs."
    } else {
        "Join wrapped lines back into natural flowing paragraphs. Keep a real paragraph break \
         only where the writer clearly started a new paragraph."
    };
    let diacritic_rule = if diacritics {
        " Add correct diacritics (aerab/harakat) to the transcribed text, even where the \
         handwriting omits them."
    } else {
        " Reproduce the diacritics exactly as written — add none that are not there, and drop \
         none that are."
    };

    let system = format!(
        "You are an expert palaeographer and transcriptionist for {name}, fluent in reading \
         {script} — including fast, cursive, and irregular handwriting. You transcribe images \
         of handwritten and printed documents into accurate, correctly-spelled Unicode text.\n\n\
         Rules:\n\
         - Transcribe every word you can read, in reading order (right-to-left for RTL scripts).\n\
         - {layout_rule}\n\
         - Use correct Unicode orthography for {name}: proper letter forms, hamza, and \
           punctuation. Never output Latin transliteration for {name} text.{diacritic_rule}\n\
         - If a word is genuinely illegible, write it as [؟] rather than inventing a word. Do \
           not guess at content that is not visibly present.\n\
         - Transcribe what is written even if it contains errors; do not silently correct the \
           author's spelling or grammar.\n\
         - Return ONLY the transcribed text. No preamble, no commentary, no markdown fences, \
           no description of the image, and no surrounding quotes."
    );

    let mut user_text = format!(
        "Transcribe all {name} text in this {}.",
        if is_pdf { "document" } else { "image" }
    );
    if let Some(extra) = &instruction {
        if !extra.trim().is_empty() {
            user_text.push_str(&format!("\n\nAdditional instruction: {}", extra.trim()));
        }
    }

    let cfg = resolve_provider();
    let model_id = model.clone().unwrap_or_else(|| cfg.default_model.clone());

    let res = match cfg.provider {
        Provider::Anthropic => {
            ocr_anthropic(&cfg, &model_id, &system, &user_text, &b64, &media_type, is_pdf).await?
        }
        Provider::ClaudeCli => {
            return Err(
                "The Claude CLI provider cannot read attachments. Switch to the Claude \
                 (Anthropic) provider in Settings and add an API key to use OCR."
                    .into(),
            )
        }
        // DeepSeek / Mistral / OpenAI: the OpenAI chat-completions vision shape.
        _ => {
            if is_pdf {
                return Err(
                    "PDF OCR needs the Claude (Anthropic) provider. Switch provider in Settings, \
                     or export the page as a PNG/JPEG image first."
                        .into(),
                );
            }
            ocr_openai(&cfg, &model_id, &system, &user_text, &b64, &media_type).await?
        }
    };

    let text = res.text.trim().to_string();
    if text.is_empty() {
        return Err(
            "No text was found in that attachment. Try a sharper, better-lit photo, or crop \
             it closer to the writing."
                .into(),
        );
    }

    Ok(OcrResult { text, model: model_id, tokens: res.input_tokens + res.output_tokens })
}

/// Anthropic vision request: an image (or PDF document) block followed by the
/// instruction text — the documented ordering for best extraction quality.
async fn ocr_anthropic(
    cfg: &ProviderConfig,
    model: &str,
    system: &str,
    user_text: &str,
    b64: &str,
    media_type: &str,
    is_pdf: bool,
) -> Result<LlmResult, String> {
    let api_key = cfg
        .api_key
        .clone()
        .ok_or_else(|| "No API key set. Add one in Settings, or export HARFSAZ_ANTHROPIC_API_KEY.".to_string())?;

    let attachment = if is_pdf {
        serde_json::json!({
            "type": "document",
            "source": { "type": "base64", "media_type": media_type, "data": b64 }
        })
    } else {
        serde_json::json!({
            "type": "image",
            "source": { "type": "base64", "media_type": media_type, "data": b64 }
        })
    };

    let body = serde_json::json!({
        "model": model,
        // Transcription can be long (a dense page of Nastaliq), and on models
        // where thinking is on by default max_tokens covers thinking + output —
        // so give it real headroom rather than the 2048 the text calls use.
        "max_tokens": 8192,
        "system": system,
        "messages": [{
            "role": "user",
            "content": [attachment, { "type": "text", "text": user_text }]
        }]
    });

    let resp = reqwest::Client::new()
        .post(&cfg.base_url)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request to Claude failed: {e}"))?;

    let status = resp.status();
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Could not parse Claude response: {e}"))?;
    if !status.is_success() {
        let msg = json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("unknown error");
        return Err(format!("Claude API error ({status}): {msg}"));
    }

    // Safety classifiers can decline a request; that arrives as a 200 with
    // stop_reason "refusal" and empty content, so check it before reading text.
    if json.get("stop_reason").and_then(|s| s.as_str()) == Some("refusal") {
        return Err("The model declined to transcribe that attachment.".into());
    }

    if json.get("stop_reason").and_then(|s| s.as_str()) == Some("max_tokens") {
        return Err("The scan exceeded the output limit. Scan fewer pages or crop the image and retry.".into());
    }

    let text = json
        .get("content")
        .and_then(|c| c.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();

    let usage = json.get("usage");
    let input_tokens = usage
        .and_then(|u| u.get("input_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let output_tokens = usage
        .and_then(|u| u.get("output_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| estimate_tokens(&text) as u64) as u32;

    Ok(LlmResult { text, input_tokens, output_tokens })
}

/// OpenAI-compatible vision request (OpenAI / Mistral / DeepSeek-vision): the
/// image rides as a `image_url` part carrying an inline data URL.
async fn ocr_openai(
    cfg: &ProviderConfig,
    model: &str,
    system: &str,
    user_text: &str,
    b64: &str,
    media_type: &str,
) -> Result<LlmResult, String> {
    let api_key = cfg
        .api_key
        .clone()
        .ok_or_else(|| "No API key set for the selected provider. Add one in Settings.".to_string())?;

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 8192,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": [
                { "type": "text", "text": user_text },
                { "type": "image_url", "image_url": { "url": format!("data:{media_type};base64,{b64}") } }
            ]}
        ]
    });

    let resp = reqwest::Client::new()
        .post(&cfg.base_url)
        .header("authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request to the LLM provider failed: {e}"))?;

    let status = resp.status();
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Could not parse provider response: {e}"))?;
    if !status.is_success() {
        let msg = json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("unknown error");
        return Err(format!(
            "LLM provider error ({status}): {msg}. Note that the selected model must support image input."
        ));
    }

    if json.pointer("/choices/0/finish_reason").and_then(|s| s.as_str()) == Some("length") {
        return Err("The scan exceeded the output limit. Scan fewer pages or crop the image and retry.".into());
    }

    let text = json
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
        .unwrap_or_default()
        .to_string();

    let usage = json.get("usage");
    let input_tokens = usage
        .and_then(|u| u.get("prompt_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let output_tokens = usage
        .and_then(|u| u.get("completion_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| estimate_tokens(&text) as u64) as u32;

    Ok(LlmResult { text, input_tokens, output_tokens })
}

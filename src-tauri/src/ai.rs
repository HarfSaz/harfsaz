//! Claude (Anthropic API) bridge — the "AI-native" core of Qalam.
//!
//! Four capabilities, all Urdu-aware, all routed through a single typed task enum:
//!   1. Writing assistant   — compose / continue / rephrase / change tone
//!   2. Proofreading        — Urdu spelling, grammar, Nastaliq spacing
//!   3. Translate / translit — English<->Urdu, Roman-Urdu -> Nastaliq script
//!   4. Layout / design AI  — headline & caption generation, layout suggestions
//!
//! Each task carries a tailored system prompt so the model behaves like a
//! domain expert (an Urdu sub-editor), not a generic chat assistant. The API key
//! is read from the QALAM_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY) env var and
//! never shipped to the frontend.

use serde::{Deserialize, Serialize};
use std::process::Command;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
// Default to the latest capable Claude model; strong multilingual incl. Urdu.
const DEFAULT_MODEL: &str = "claude-opus-4-8";

// ── Pluggable LLM providers ─────────────────────────────────────────────────
//
// The model backend is chosen at runtime by the QALAM_AI_PROVIDER env var:
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
        std::env::var("QALAM_AI_PROVIDER").unwrap_or_default().to_lowercase()
    };

    let model_for = |default: &str| saved_model.clone().unwrap_or_else(|| env_or("QALAM_AI_MODEL", default));

    match name.as_str() {
        "deepseek" => ProviderConfig {
            provider: Provider::DeepSeek,
            base_url: env_or("QALAM_AI_BASE_URL", "https://api.deepseek.com/v1/chat/completions"),
            api_key: saved_key.or_else(|| first_env(&["QALAM_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY", "QALAM_AI_API_KEY"])),
            default_model: model_for("deepseek-chat"),
        },
        "mistral" => ProviderConfig {
            provider: Provider::Mistral,
            base_url: env_or("QALAM_AI_BASE_URL", "https://api.mistral.ai/v1/chat/completions"),
            api_key: saved_key.or_else(|| first_env(&["QALAM_MISTRAL_API_KEY", "MISTRAL_API_KEY", "QALAM_AI_API_KEY"])),
            default_model: model_for("mistral-large-latest"),
        },
        "openai" => ProviderConfig {
            provider: Provider::OpenAi,
            base_url: env_or("QALAM_AI_BASE_URL", "https://api.openai.com/v1/chat/completions"),
            api_key: saved_key.or_else(|| first_env(&["QALAM_OPENAI_API_KEY", "OPENAI_API_KEY", "QALAM_AI_API_KEY"])),
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
            api_key: saved_key.or_else(|| first_env(&["QALAM_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY", "QALAM_AI_API_KEY"])),
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

async fn call_anthropic(cfg: &ProviderConfig, model: &str, system: &str, user: &str) -> Result<LlmResult, String> {
    let api_key = cfg.api_key.clone().ok_or_else(|| {
        "No API key set. Export QALAM_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY).".to_string()
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
        "No API key set for the selected provider. Set QALAM_AI_API_KEY (or the provider-specific key).".to_string()
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

/// Low-level call returning text + token usage, via the active provider.
async fn call_claude(model: &str, system: &str, user: &str) -> Result<LlmResult, String> {
    call_llm(system, user, Some(model)).await
}

/// Add diacritics / harakat (تشكيل) to RTL text. `lang` is the base language
/// ("ar", "fa", "ur") so the prompt names the right tradition. Returns the same
/// text fully voweled — used by non-native/learner readers and religious text.
pub async fn add_diacritics(text: String, lang: String, model: Option<String>) -> Result<AiResponse, String> {
    let model = model.unwrap_or_else(|| DEFAULT_MODEL.to_string());
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
    let res = call_claude(&model, &system, &text).await?;
    if res.text.trim().is_empty() {
        return Err("The model returned an empty response.".into());
    }
    Ok(AiResponse { output: res.text.trim().to_string(), model, tokens: res.input_tokens + res.output_tokens })
}

/// Proofread Urdu text and return span-level corrections (for inline,
/// non-destructive highlighting in the editor) instead of a rewritten blob.
pub async fn proofread_inline(text: String, model: Option<String>) -> Result<ProofreadResult, String> {
    let model = model.unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let system = "You are a meticulous Urdu proofreader. Find spelling, grammar, and \
        punctuation errors in the given Urdu text. Respond with ONLY a JSON array (no prose, \
        no markdown fences) where each item is an object with exactly these keys: \
        \"original\" (the exact incorrect substring as it appears in the text, copied verbatim), \
        \"suggestion\" (the corrected text), and \"reason\" (a 1-2 word reason in Urdu, e.g. \
        املا or گرامر). If there are no errors, return []. Do not include corrections whose \
        original does not appear verbatim in the text.";

    let res = call_claude(&model, system, &text).await?;
    let raw = res.text;
    let tokens = res.input_tokens + res.output_tokens;

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

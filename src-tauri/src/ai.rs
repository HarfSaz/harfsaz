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

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
// Default to the latest capable Claude model; strong multilingual incl. Urdu.
const DEFAULT_MODEL: &str = "claude-opus-4-8";

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

/// Execute an AI task against the Anthropic API.
pub async fn run_task(req: AiRequest) -> Result<AiResponse, String> {
    let api_key = std::env::var("QALAM_ANTHROPIC_API_KEY")
        .or_else(|_| std::env::var("ANTHROPIC_API_KEY"))
        .map_err(|_| {
            "No API key set. Export QALAM_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY).".to_string()
        })?;

    let model = req.model.clone().unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let system = system_prompt(&req.task);

    let mut user_content = req.text.clone();
    if let Some(instr) = &req.instruction {
        if !instr.trim().is_empty() {
            user_content = format!("{user_content}\n\n[Additional instruction: {instr}]");
        }
    }

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 2048,
        "system": system,
        "messages": [{ "role": "user", "content": user_content }]
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(ANTHROPIC_URL)
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

    // content is an array of blocks; concatenate text blocks.
    let output = json
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

    if output.is_empty() {
        return Err("Claude returned an empty response.".into());
    }

    Ok(AiResponse { output, model })
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
}

/// Low-level Claude call returning the concatenated text output.
async fn call_claude(model: &str, system: &str, user: &str) -> Result<String, String> {
    let api_key = std::env::var("QALAM_ANTHROPIC_API_KEY")
        .or_else(|_| std::env::var("ANTHROPIC_API_KEY"))
        .map_err(|_| {
            "No API key set. Export QALAM_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY).".to_string()
        })?;

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 2048,
        "system": system,
        "messages": [{ "role": "user", "content": user }]
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(ANTHROPIC_URL)
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

    let output = json
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

    Ok(output)
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
    let output = call_claude(&model, &system, &text).await?;
    if output.trim().is_empty() {
        return Err("Claude returned an empty response.".into());
    }
    Ok(AiResponse { output: output.trim().to_string(), model })
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

    let raw = call_claude(&model, system, &text).await?;

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

    Ok(ProofreadResult { corrections, model })
}

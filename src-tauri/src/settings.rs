//! Local AI provider settings (persisted to a config file, NOT source code).
//!
//! The user sets their provider + API key in the in-app Settings dialog; we save
//! it to `<config_dir>/qalam/ai_settings.json` so the key lives on the user's
//! machine only. `ai::resolve_provider()` reads this first, falling back to env
//! vars. This also powers the paywall's "bring-your-own-key" unlock.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AiSettings {
    /// "anthropic" | "deepseek" | "mistral" | "openai" | "claude-cli" | "" (env)
    #[serde(default)]
    pub provider: String,
    /// API key for the chosen provider. Stored locally only.
    #[serde(default)]
    pub api_key: String,
    /// Optional model id override.
    #[serde(default)]
    pub model: String,
}

/// What we return to the UI — never includes the raw key, only whether one is set.
#[derive(Serialize, Debug, Clone, Default)]
pub struct AiSettingsView {
    pub provider: String,
    pub model: String,
    pub has_key: bool,
}

fn config_path() -> Option<PathBuf> {
    // ~/Library/Application Support/qalam on macOS, %APPDATA%\qalam on Windows, etc.
    dirs_next_config_dir().map(|mut p| {
        p.push("qalam");
        p.push("ai_settings.json");
        p
    })
}

/// Minimal cross-platform config dir without pulling a new crate: prefer
/// XDG_CONFIG_HOME / APPDATA / HOME conventions.
fn dirs_next_config_dir() -> Option<PathBuf> {
    if let Ok(x) = std::env::var("XDG_CONFIG_HOME") {
        if !x.is_empty() {
            return Some(PathBuf::from(x));
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let mut p = PathBuf::from(home);
            p.push("Library");
            p.push("Application Support");
            return Some(p);
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return Some(PathBuf::from(appdata));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let mut p = PathBuf::from(home);
        p.push(".config");
        return Some(p);
    }
    None
}

/// Load persisted settings (empty default if none / unreadable).
pub fn load() -> AiSettings {
    let Some(path) = config_path() else { return AiSettings::default() };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Persist settings to the config file (creating the dir if needed).
pub fn save(settings: &AiSettings) -> Result<(), String> {
    let path = config_path().ok_or_else(|| "Could not determine a config directory".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Could not create config dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Could not write settings: {e}"))?;
    Ok(())
}

pub fn view() -> AiSettingsView {
    let s = load();
    AiSettingsView {
        provider: s.provider,
        model: s.model,
        has_key: !s.api_key.trim().is_empty(),
    }
}

//! System printing bridge.
//!
//! Tauri's macOS WKWebview does not reliably open the OS print dialog via
//! `window.print()`, so we talk to the OS print system directly: enumerate
//! printers with `lpstat`/`lpoptions` and submit jobs with `lp`. This lets the
//! user pick a printer inside Qalam's own dialog and print without leaving the app.
//!
//! Cross-platform note: `lp`/`lpstat` exist on macOS and Linux (CUPS). On
//! Windows a different path (PowerShell `Get-Printer` / `Out-Printer`) would be
//! needed; we expose the same command names and branch by target there later.

use serde::Serialize;
use std::process::Command;

#[derive(Serialize, Debug, Clone)]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

/// List installed printers via CUPS (`lpstat`). Returns the default flagged.
pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    // Printer names.
    let out = Command::new("lpstat")
        .arg("-e")
        .output()
        .map_err(|e| format!("Could not run lpstat: {e}"))?;
    if !out.status.success() {
        // No printers configured is not an error — return empty.
        return Ok(vec![]);
    }
    let names: Vec<String> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    // Default printer (`lpstat -d` → "system default destination: <name>").
    let default = Command::new("lpstat")
        .arg("-d")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .and_then(|s| s.split(':').nth(1).map(|n| n.trim().to_string()))
        .unwrap_or_default();

    Ok(names
        .into_iter()
        .map(|name| {
            let is_default = name == default;
            PrinterInfo { name, is_default }
        })
        .collect())
}

/// Submit a file (e.g. a PDF) to a printer via `lp`.
///
/// `printer` empty → system default. `copies` ≥ 1. `range` like "1-3,5" or empty.
pub fn print_file(
    file_path: String,
    printer: Option<String>,
    copies: u32,
    range: Option<String>,
    grayscale: bool,
) -> Result<String, String> {
    let mut cmd = Command::new("lp");

    if let Some(p) = printer.filter(|p| !p.trim().is_empty()) {
        cmd.arg("-d").arg(p);
    }
    if copies > 1 {
        cmd.arg("-n").arg(copies.to_string());
    }
    if let Some(r) = range.filter(|r| !r.trim().is_empty()) {
        cmd.arg("-o").arg(format!("page-ranges={r}"));
    }
    if grayscale {
        cmd.arg("-o").arg("ColorModel=Gray");
    }
    cmd.arg(&file_path);

    let out = cmd
        .output()
        .map_err(|e| format!("Could not run lp: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "Print failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

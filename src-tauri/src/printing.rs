//! System printing bridge — cross-platform.
//!
//! Tauri's webview does not reliably open the OS print dialog via
//! `window.print()`, so we talk to the OS print system directly. The frontend
//! renders the document to a PDF, then calls these commands to enumerate
//! printers and submit the job.
//!
//! - **macOS / Linux**: CUPS — `lpstat` (list) and `lp` (submit).
//! - **Windows**: PowerShell — `Get-Printer` (list) and printing the PDF via the
//!   default PDF handler / `Start-Process -Verb Print` (submit).

use serde::Serialize;
use std::process::Command;

#[derive(Serialize, Debug, Clone)]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

// ── Public API (OS-dispatch) ────────────────────────────────────────────────

pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        list_printers_windows()
    }
    #[cfg(not(target_os = "windows"))]
    {
        list_printers_cups()
    }
}

pub fn print_file(
    file_path: String,
    printer: Option<String>,
    copies: u32,
    range: Option<String>,
    grayscale: bool,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // range/grayscale not yet supported by the Windows print-verb path.
        let _ = (&range, grayscale);
        print_file_windows(file_path, printer, copies)
    }
    #[cfg(not(target_os = "windows"))]
    {
        print_file_cups(file_path, printer, copies, range, grayscale)
    }
}

// ── macOS / Linux (CUPS) ────────────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
fn list_printers_cups() -> Result<Vec<PrinterInfo>, String> {
    let out = Command::new("lpstat")
        .arg("-e")
        .output()
        .map_err(|e| format!("Could not run lpstat: {e}"))?;
    if !out.status.success() {
        return Ok(vec![]); // none configured is not an error
    }
    let names: Vec<String> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

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

#[cfg(not(target_os = "windows"))]
fn print_file_cups(
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

    let out = cmd.output().map_err(|e| format!("Could not run lp: {e}"))?;
    if !out.status.success() {
        return Err(format!("Print failed: {}", String::from_utf8_lossy(&out.stderr)));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

// ── Windows (PowerShell) ────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn powershell(script: &str) -> Result<std::process::Output, String> {
    Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|e| format!("Could not run PowerShell: {e}"))
}

#[cfg(target_os = "windows")]
fn list_printers_windows() -> Result<Vec<PrinterInfo>, String> {
    // Names of installed printers, one per line.
    let out = powershell("Get-Printer | Select-Object -ExpandProperty Name")?;
    if !out.status.success() {
        return Ok(vec![]);
    }
    let names: Vec<String> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    // Default printer name.
    let default = powershell(
        "(Get-CimInstance -Class Win32_Printer -Filter \"Default = $true\").Name",
    )
    .ok()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    .unwrap_or_default();

    Ok(names
        .into_iter()
        .map(|name| {
            let is_default = name == default;
            PrinterInfo { name, is_default }
        })
        .collect())
}

#[cfg(target_os = "windows")]
fn print_file_windows(
    file_path: String,
    printer: Option<String>,
    copies: u32,
) -> Result<String, String> {
    // Strategy: temporarily set the chosen printer as default (Windows print verb
    // targets the default printer), then print the PDF `copies` times via the
    // registered PDF handler's Print verb, then restore the previous default.
    // This works without bundling a PDF engine and respects the user's choice.
    let chosen = printer.unwrap_or_default();
    let restore = if !chosen.trim().is_empty() {
        // Capture current default, set the chosen one.
        let prev = powershell(
            "(Get-CimInstance -Class Win32_Printer -Filter \"Default = $true\").Name",
        )
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
        let set = powershell(&format!(
            "(New-Object -ComObject WScript.Network).SetDefaultPrinter('{}')",
            chosen.replace('\'', "''")
        ))?;
        if !set.status.success() {
            return Err(format!(
                "Could not select printer '{chosen}': {}",
                String::from_utf8_lossy(&set.stderr)
            ));
        }
        prev
    } else {
        String::new()
    };

    let path_escaped = file_path.replace('\'', "''");
    let n = copies.max(1);
    let mut last_err = String::new();
    for _ in 0..n {
        let out = powershell(&format!(
            "Start-Process -FilePath '{path_escaped}' -Verb Print -PassThru | Out-Null"
        ))?;
        if !out.status.success() {
            last_err = String::from_utf8_lossy(&out.stderr).to_string();
        }
    }

    // Restore previous default printer.
    if !restore.is_empty() {
        let _ = powershell(&format!(
            "(New-Object -ComObject WScript.Network).SetDefaultPrinter('{}')",
            restore.replace('\'', "''")
        ));
    }

    if !last_err.is_empty() {
        return Err(format!("Print failed: {last_err}"));
    }
    Ok(format!("Sent {n} copy(ies) to {}", if chosen.is_empty() { "default printer" } else { &chosen }))
}

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
    // Fallback chain: many users' default PDF handler is Edge, which does NOT
    // register a shell `print` verb — so `Start-Process -Verb Print` fails with
    // "No application is associated...". We try, in order:
    //   1. Shell `print` verb (works for Adobe/Foxit when set as default)
    //   2. Foxit Reader CLI (silent-ish)
    //   3. SumatraPDF CLI (truly silent — recommended)
    //   4. Adobe Acrobat Reader CLI
    //   5. Open the file with default verb so user can Ctrl+P
    let chosen = printer.unwrap_or_default();
    let chosen_trim = chosen.trim();
    let n = copies.max(1);
    let target_label = if chosen_trim.is_empty() { "default printer" } else { chosen_trim };

    // Strategy 1: shell Print verb. This requires temporarily setting the chosen
    // printer as default since the verb has no printer parameter.
    let restore = if !chosen_trim.is_empty() {
        let prev = powershell(
            "(Get-CimInstance -Class Win32_Printer -Filter \"Default = $true\").Name",
        )
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
        let set = powershell(&format!(
            "(New-Object -ComObject WScript.Network).SetDefaultPrinter('{}')",
            chosen_trim.replace('\'', "''")
        ))?;
        if !set.status.success() {
            return Err(format!(
                "Could not select printer '{chosen_trim}': {}",
                String::from_utf8_lossy(&set.stderr)
            ));
        }
        prev
    } else {
        String::new()
    };

    let path_escaped = file_path.replace('\'', "''");
    let mut shell_verb_err = String::new();
    let mut shell_verb_ok = true;
    for _ in 0..n {
        let out = powershell(&format!(
            "Start-Process -FilePath '{path_escaped}' -Verb Print -PassThru | Out-Null"
        ))?;
        if !out.status.success() {
            shell_verb_err = String::from_utf8_lossy(&out.stderr).to_string();
            shell_verb_ok = false;
            break;
        }
    }

    // Restore previous default printer before deciding success/fallback.
    if !restore.is_empty() {
        let _ = powershell(&format!(
            "(New-Object -ComObject WScript.Network).SetDefaultPrinter('{}')",
            restore.replace('\'', "''")
        ));
    }

    if shell_verb_ok {
        return Ok(format!("Sent {n} copy(ies) to {target_label}"));
    }

    // Strategy 2-4: try known CLI-capable PDF viewers in order.
    let candidates = pdf_print_cli_candidates();
    for cand in &candidates {
        if !std::path::Path::new(&cand.exe).exists() {
            continue;
        }
        let mut all_ok = true;
        let mut err_buf = String::new();
        for _ in 0..n {
            let mut cmd = Command::new(&cand.exe);
            for arg in cand.build_args(&file_path, chosen_trim) {
                cmd.arg(arg);
            }
            match cmd.output() {
                Ok(out) if out.status.success() => {}
                Ok(out) => {
                    all_ok = false;
                    err_buf = String::from_utf8_lossy(&out.stderr).to_string();
                    break;
                }
                Err(e) => {
                    all_ok = false;
                    err_buf = e.to_string();
                    break;
                }
            }
        }
        if all_ok {
            return Ok(format!(
                "Sent {n} copy(ies) to {target_label} via {}",
                cand.name
            ));
        }
        // Otherwise try next candidate; remember last err for the failure path.
        if !err_buf.is_empty() {
            shell_verb_err = format!("{} failed: {err_buf}", cand.name);
        }
    }

    // Strategy 5: open the PDF so the user can print manually.
    let _ = powershell(&format!(
        "Start-Process -FilePath '{path_escaped}' | Out-Null"
    ));
    Err(format!(
        "No silent-print app found (your default PDF handler doesn't support the Print verb). \
         Opened the document — press Ctrl+P in the viewer to print. \
         Tip: install SumatraPDF or Foxit Reader for one-click silent printing. \
         Last error: {}",
        if shell_verb_err.is_empty() { "Print verb not available".to_string() } else { shell_verb_err }
    ))
}

#[cfg(target_os = "windows")]
struct PdfCli {
    name: &'static str,
    exe: String,
    // (file_path, printer_name_or_empty) -> args
    args_builder: fn(&str, &str) -> Vec<String>,
}

#[cfg(target_os = "windows")]
impl PdfCli {
    fn build_args(&self, file_path: &str, printer: &str) -> Vec<String> {
        (self.args_builder)(file_path, printer)
    }
}

#[cfg(target_os = "windows")]
fn pdf_print_cli_candidates() -> Vec<PdfCli> {
    let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
    let pf86 = std::env::var("ProgramFiles(x86)")
        .unwrap_or_else(|_| r"C:\Program Files (x86)".to_string());
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();

    let mut v = Vec::new();

    // SumatraPDF — truly silent printing. Preferred.
    for base in [&pf, &pf86, &local] {
        if base.is_empty() {
            continue;
        }
        for sub in ["SumatraPDF\\SumatraPDF.exe", "SumatraPDF.exe"] {
            v.push(PdfCli {
                name: "SumatraPDF",
                exe: format!("{base}\\{sub}"),
                args_builder: |file, printer| {
                    let mut a = vec!["-silent".to_string()];
                    if printer.is_empty() {
                        a.push("-print-to-default".to_string());
                    } else {
                        a.push("-print-to".to_string());
                        a.push(printer.to_string());
                    }
                    a.push(file.to_string());
                    a
                },
            });
        }
    }

    // Foxit PDF Reader
    for base in [&pf86, &pf] {
        v.push(PdfCli {
            name: "Foxit Reader",
            exe: format!("{base}\\Foxit Software\\Foxit PDF Reader\\FoxitPDFReader.exe"),
            args_builder: |file, printer| {
                if printer.is_empty() {
                    vec!["/p".to_string(), file.to_string()]
                } else {
                    vec!["/t".to_string(), file.to_string(), printer.to_string()]
                }
            },
        });
        v.push(PdfCli {
            name: "Foxit Reader",
            exe: format!("{base}\\Foxit Software\\Foxit Reader\\FoxitReader.exe"),
            args_builder: |file, printer| {
                if printer.is_empty() {
                    vec!["/p".to_string(), file.to_string()]
                } else {
                    vec!["/t".to_string(), file.to_string(), printer.to_string()]
                }
            },
        });
    }

    // Adobe Acrobat Reader DC
    for base in [&pf86, &pf] {
        v.push(PdfCli {
            name: "Acrobat Reader",
            exe: format!("{base}\\Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe"),
            args_builder: |file, printer| {
                if printer.is_empty() {
                    vec!["/p".to_string(), "/h".to_string(), file.to_string()]
                } else {
                    vec!["/t".to_string(), file.to_string(), printer.to_string()]
                }
            },
        });
        v.push(PdfCli {
            name: "Acrobat",
            exe: format!("{base}\\Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe"),
            args_builder: |file, printer| {
                if printer.is_empty() {
                    vec!["/p".to_string(), "/h".to_string(), file.to_string()]
                } else {
                    vec!["/t".to_string(), file.to_string(), printer.to_string()]
                }
            },
        });
    }

    v
}

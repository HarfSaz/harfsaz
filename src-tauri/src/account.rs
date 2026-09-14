//! Desktop account pairing. Bearer tokens stay in native code, never in web storage.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::OnceLock, time::Duration};
use tauri::Manager;
use tokio::sync::Mutex;

#[derive(Serialize, Deserialize)]
struct Session { origin: String, token: String, profile: Value }
struct Pairing { code: String, secret: String, url: String }
static PAIRING: OnceLock<Mutex<Option<Pairing>>> = OnceLock::new();
fn pairing() -> &'static Mutex<Option<Pairing>> { PAIRING.get_or_init(|| Mutex::new(None)) }
fn origin() -> String {
    let configured = std::env::var("HARFSAZ_SITE_URL").ok().or_else(|| option_env!("HARFSAZ_SITE_URL").map(String::from));
    configured.unwrap_or_else(|| "https://harfsaz.com".into()).trim_end_matches('/').into()
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(Duration::from_secs(15)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e| e.to_string())
}
fn session_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e|e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    Ok(dir.join("desktop-account.json"))
}
fn load(app: &tauri::AppHandle) -> Option<Session> {
    let s: Session = serde_json::from_slice(&fs::read(session_path(app).ok()?).ok()?).ok()?;
    if s.origin == origin() { Some(s) } else { None }
}
fn save(app: &tauri::AppHandle, session: &Session) -> Result<(), String> {
    use std::io::Write;
    let path = session_path(app)?;
    let mut opts = fs::OpenOptions::new(); opts.write(true).create(true).truncate(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; opts.mode(0o600); }
    let mut file = opts.open(&path).map_err(|e|e.to_string())?;
    file.write_all(&serde_json::to_vec(session).map_err(|e|e.to_string())?).map_err(|e|e.to_string())
}
fn open_browser(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|e|e.to_string())?;
    let base = reqwest::Url::parse(&origin()).map_err(|e|e.to_string())?;
    if parsed.origin() != base.origin() || !(parsed.scheme() == "https" || (parsed.scheme() == "http" && matches!(parsed.host_str(), Some("localhost" | "127.0.0.1")))) { return Err("Invalid account URL".into()); }
    #[cfg(target_os="macos")]
    let result = std::process::Command::new("open").arg(url).spawn();
    #[cfg(target_os="windows")]
    let result = std::process::Command::new("rundll32.exe").args(["url.dll,FileProtocolHandler",url]).spawn();
    #[cfg(not(any(target_os="macos",target_os="windows")))]
    let result = std::process::Command::new("xdg-open").arg(url).spawn();
    result.map(|_|()).map_err(|e|e.to_string())
}
async fn profile(token: &str) -> Result<Option<Value>, String> {
    let response = client()?.get(format!("{}/api/v1/me",origin())).bearer_auth(token).send().await.map_err(|_|"Could not reach Harfsaz. Check your connection.".to_string())?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED { return Ok(None); }
    if !response.status().is_success() { return Err("Account service is temporarily unavailable.".into()); }
    let value: Value = response.json().await.map_err(|e|e.to_string())?;
    if !value["user"]["id"].is_string() { return Err("Invalid account response".into()); }
    Ok(Some(value))
}
#[tauri::command]
pub async fn desktop_account(app: tauri::AppHandle, action: String) -> Result<Value, String> {
    // Serialize polling, account refresh and logout so late responses cannot revive a session.
    let mut pending = pairing().lock().await;
    match action.as_str() {
        "begin" => {
            let response = client()?.post(format!("{}/api/v1/auth/device",origin())).json(&json!({"name":format!("Harfsaz · {}",std::env::consts::OS)})).send().await.map_err(|_|"Could not reach Harfsaz. Check your connection.".to_string())?;
            if !response.status().is_success() { return Err("Could not start sign-in. Try again shortly.".into()); }
            let data: Value = response.json().await.map_err(|e|e.to_string())?;
            let p = Pairing { code:data["code"].as_str().ok_or("Missing pairing code")?.into(), secret:data["device_secret"].as_str().ok_or("Update the account server to support desktop pairing")?.into(), url:data["verify_url"].as_str().ok_or("Missing sign-in URL")?.into() };
            let opened = open_browser(&p.url).is_ok();
            let view=json!({"status":"pending","code":p.code,"url":p.url,"opened":opened}); *pending=Some(p); Ok(view)
        },
        "reopen" => { let p=pending.as_ref().ok_or("Start sign-in first")?; open_browser(&p.url)?; Ok(json!({"status":"pending"})) },
        "cancel" => { *pending=None; Ok(json!({"status":"signed_out"})) },
        "poll" => {
            let p=pending.as_ref().ok_or("Start sign-in first")?;
            let response=client()?.get(format!("{}/api/v1/auth/device",origin())).query(&[("code",&p.code)]).bearer_auth(&p.secret).send().await.map_err(|_|"Waiting for a connection. Try again.".to_string())?;
            if response.status() == reqwest::StatusCode::GONE { *pending=None; return Ok(json!({"status":"expired"})); }
            if !response.status().is_success() { return Err("Could not check sign-in. Try again.".into()); }
            let data:Value=response.json().await.map_err(|e|e.to_string())?;
            if data["status"] != "ok" { return Ok(json!({"status":"pending"})); }
            let token=data["token"].as_str().ok_or("Missing session token")?.to_string();
            let me=profile(&token).await?.ok_or("Sign-in expired. Start again.")?;
            save(&app,&Session {origin:origin(),token,profile:me.clone()})?; *pending=None;
            Ok(json!({"status":"signed_in","profile":me,"offline":false}))
        },
        "status" => {
            let Some(mut session)=load(&app) else {return Ok(json!({"status":"signed_out"}));};
            match profile(&session.token).await {
                Ok(Some(me))=>{session.profile=me.clone();save(&app,&session)?;Ok(json!({"status":"signed_in","profile":me,"offline":false}))},
                Ok(None)=>{let _=fs::remove_file(session_path(&app)?);Ok(json!({"status":"signed_out"}))},
                Err(_)=>Ok(json!({"status":"signed_in","profile":session.profile,"offline":true})),
            }
        },
        "logout" => {
            if let Some(session)=load(&app) { let _=client()?.delete(format!("{}/api/v1/auth/device",origin())).bearer_auth(session.token).send().await; }
            let path=session_path(&app)?;if path.exists(){fs::remove_file(path).map_err(|e|e.to_string())?;} *pending=None;Ok(json!({"status":"signed_out"}))
        },
        "pricing"=>{open_browser(&format!("{}/app?section=billing",origin()))?;Ok(json!({"ok":true}))},
        "manage"=>{open_browser(&format!("{}/account",origin()))?;Ok(json!({"ok":true}))},
        _=>Err("Unknown account action".into())
    }
}

/// Hosted AI uses the paired account; no bearer or provider key enters the webview.
#[tauri::command]
pub async fn desktop_ai(app: tauri::AppHandle, body: Value) -> Result<Value, String> {
    let Some(session) = load(&app) else {
        return Ok(json!({"status":401,"body":{"error":"Sign in to use Harfsaz AI.","code":"auth"}}));
    };
    let response = reqwest::Client::builder().timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?
        .post(format!("{}/api/v1/ai",origin())).bearer_auth(&session.token).json(&body)
        .send().await.map_err(|_|"Could not reach Harfsaz AI. Check your connection.".to_string())?;
    let status = response.status().as_u16();
    let body: Value = response.json().await.map_err(|_|"Invalid response from Harfsaz AI.".to_string())?;
    Ok(json!({"status":status,"body":body}))
}

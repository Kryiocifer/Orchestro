use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn hide_console(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn hide_console_tokio(cmd: &mut tokio::process::Command) -> &mut tokio::process::Command {
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use std::collections::HashMap;
use std::sync::Mutex;

/// Active yt-dlp PIDs keyed by job_id (for cancel)
static DOWNLOAD_PIDS: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);

fn pids() -> std::sync::MutexGuard<'static, Option<HashMap<String, u32>>> {
    let mut g = DOWNLOAD_PIDS.lock().unwrap();
    if g.is_none() {
        *g = Some(HashMap::new());
    }
    g
}

#[derive(Debug, Serialize, Clone)]
pub struct YtSearchResult {
    pub id: String,
    pub title: String,
    pub uploader: String,
    pub duration: Option<f64>,
    pub url: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SpotifyTrack {
    pub title: String,
    pub artist: String,
    pub duration: Option<f64>,
    pub id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SpotifyPlaylistResult {
    pub name: String,
    pub tracks: Vec<SpotifyTrack>,
    pub url: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct YtProgressEvent {
    pub job_id: String,
    pub percent: f64,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct YtDlpStatus {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub source: String, // "bundled" | "path" | "none"
    /// "updated" | "latest" | "installed" | "unchanged"
    pub action: Option<String>,
    pub latest_version: Option<String>,
}

fn bin_name() -> &'static str {
    if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    }
}

fn bundled_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("bin");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn bundled_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(bundled_dir(app)?.join(bin_name()))
}

/// Prefer app-data bundled binary, then PATH
fn resolve_ytdlp(app: &AppHandle) -> Result<PathBuf, String> {
    let bundled = bundled_path(app)?;
    if bundled.exists() {
        return Ok(bundled);
    }

    // Fall back to PATH
    let which = if cfg!(windows) {
        let mut c = Command::new("where");
        hide_console(&mut c);
        c.arg("yt-dlp").output()
    } else {
        Command::new("which").arg("yt-dlp").output()
    };

    if let Ok(out) = which {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !p.is_empty() && Path::new(&p).exists() {
                return Ok(PathBuf::from(p));
            }
        }
    }

    // Also try bare name (Windows may resolve .exe)
    Ok(PathBuf::from(bin_name()))
}

fn read_version(bin: &Path) -> Option<String> {
    let mut c = Command::new(bin);
    hide_console(&mut c);
    let output = c.arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let v = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

#[tauri::command]
async fn yt_dlp_status(app: AppHandle) -> YtDlpStatus {
    if let Ok(bundled) = bundled_path(&app) {
        if bundled.exists() {
            return YtDlpStatus {
                available: true,
                version: read_version(&bundled),
                path: Some(bundled.to_string_lossy().to_string()),
                source: "bundled".into(),
                action: None,
                latest_version: None,
            };
        }
    }

    if let Ok(path) = resolve_ytdlp(&app) {
        if let Some(ver) = read_version(&path) {
            let source = if path.to_string_lossy().contains("AppData")
                || path.to_string_lossy().contains("orchestro")
            {
                "bundled"
            } else {
                "path"
            };
            return YtDlpStatus {
                available: true,
                version: Some(ver),
                path: Some(path.to_string_lossy().to_string()),
                source: source.into(),
                action: None,
                latest_version: None,
            };
        }
    }

    YtDlpStatus {
        available: false,
        version: None,
        path: None,
        source: "none".into(),
        action: None,
        latest_version: None,
    }
}

#[tauri::command]
async fn yt_dlp_update(app: AppHandle) -> Result<YtDlpStatus, String> {
    let dest = bundled_path(&app)?;

    let client = reqwest::Client::builder()
        .user_agent("Orchestro/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    // 1) Resolve latest release tag from GitHub API
    let release: serde_json::Value = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Could not check latest version: {}", e))?
        .error_for_status()
        .map_err(|e| format!("GitHub API error: {}", e))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let latest = release
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .trim_start_matches('v')
        .to_string();

    if latest.is_empty() {
        return Err("Could not read latest yt-dlp version".into());
    }

    let current = if dest.exists() {
        read_version(&dest)
    } else {
        // also check whatever resolve finds
        resolve_ytdlp(&app).ok().and_then(|p| read_version(&p))
    };

    let current_norm = current
        .as_deref()
        .unwrap_or("")
        .trim()
        .trim_start_matches('v')
        .to_string();

    // 2) Already on latest → no download
    if !current_norm.is_empty() && current_norm == latest && dest.exists() {
        return Ok(YtDlpStatus {
            available: true,
            version: Some(current_norm),
            path: Some(dest.to_string_lossy().to_string()),
            source: "bundled".into(),
            action: Some("latest".into()),
            latest_version: Some(latest),
        });
    }

    let had_existing = dest.exists();

    // 3) Download latest binary
    let url = if cfg!(windows) {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
    } else {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    };

    let tmp = dest.with_extension("download");

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub returned {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let pct = (downloaded as f64 / total as f64) * 100.0;
            let _ = app.emit(
                "yt-dlp-update-progress",
                serde_json::json!({ "percent": pct }),
            );
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);

    if dest.exists() {
        let _ = std::fs::remove_file(&dest);
    }
    std::fs::rename(&tmp, &dest).map_err(|e| format!("Failed to install binary: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&dest)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&dest, perms).map_err(|e| e.to_string())?;
    }

    let _ = app.emit(
        "yt-dlp-update-progress",
        serde_json::json!({ "percent": 100.0 }),
    );

    let installed = read_version(&dest).unwrap_or(latest.clone());

    Ok(YtDlpStatus {
        available: true,
        version: Some(installed),
        path: Some(dest.to_string_lossy().to_string()),
        source: "bundled".into(),
        action: Some(if had_existing {
            "updated".into()
        } else {
            "installed".into()
        }),
        latest_version: Some(latest),
    })
}



#[tauri::command]
fn read_file_head(path: String, max_bytes: usize) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut handle = file.take(max_bytes as u64);
    let mut buf = Vec::with_capacity(max_bytes.min(64 * 1024));
    handle.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

#[tauri::command]
fn delete_file_arbitrary(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn yt_download_cancel(job_id: String) -> Result<(), String> {
    let pid = {
        let mut guard = pids();
        let map = guard.as_mut().unwrap();
        map.remove(&job_id)
    };
    if let Some(pid) = pid {
        #[cfg(windows)]
        {
            let mut c = Command::new("taskkill");
            hide_console(&mut c);
            let _ = c.args(["/PID", &pid.to_string(), "/F", "/T"]).output();
        }
        #[cfg(unix)]
        {
            let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
        }
        Ok(())
    } else {
        // Already finished or unknown — treat as ok
        Ok(())
    }
}




// --- Spotify OAuth (PKCE) + playlist import ---

use sha2::{Digest, Sha256};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use std::io::{Read as IoRead, Write as IoWrite};
use std::net::TcpListener;

const SPOTIFY_REDIRECT: &str = "http://127.0.0.1:18925/callback";
const SPOTIFY_SCOPES: &str = "playlist-read-private playlist-read-collaborative user-library-read";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SpotifyTokens {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: u64, // unix secs
    client_id: String,
    #[serde(default)]
    user_id: Option<String>,
    #[serde(default)]
    granted_scope: Option<String>,
}

fn spotify_tokens_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("spotify_tokens.json"))
}

fn load_spotify_tokens(app: &AppHandle) -> Option<SpotifyTokens> {
    let path = spotify_tokens_path(app).ok()?;
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

fn save_spotify_tokens(app: &AppHandle, tokens: &SpotifyTokens) -> Result<(), String> {
    let path = spotify_tokens_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(tokens).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

fn clear_spotify_tokens(app: &AppHandle) -> Result<(), String> {
    let path = spotify_tokens_path(app)?;
    let _ = std::fs::remove_file(path);
    Ok(())
}

fn pkce_pair() -> (String, String) {
    let mut rng = rand::thread_rng();
    use rand::Rng;
    let bytes: Vec<u8> = (0..64).map(|_| rng.gen()).collect();
    let verifier = URL_SAFE_NO_PAD.encode(&bytes);
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());
    (verifier, challenge)
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

async fn refresh_spotify_token(app: &AppHandle, tokens: &SpotifyTokens) -> Result<SpotifyTokens, String> {
    let refresh = tokens
        .refresh_token
        .as_ref()
        .ok_or_else(|| "No refresh token — connect Spotify again".to_string())?;

    let client = reqwest::Client::new();
    let body = format!(
        "grant_type=refresh_token&refresh_token={}&client_id={}",
        urlencoding::encode(refresh),
        urlencoding::encode(&tokens.client_id)
    );
    let res = client
        .post("https://accounts.spotify.com/api/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Refresh failed: {}", e))?;

    if !res.status().is_success() {
        let t = res.text().await.unwrap_or_default();
        return Err(format!("Refresh denied — connect Spotify again. {}", t));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let access = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access_token")?
        .to_string();
    let expires_in = json
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(3600);
    let new_refresh = json
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| tokens.refresh_token.clone());

    let granted_scope = json
        .get("scope")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| tokens.granted_scope.clone());

    let updated = SpotifyTokens {
        access_token: access,
        refresh_token: new_refresh,
        expires_at: now_unix() + expires_in.saturating_sub(60),
        client_id: tokens.client_id.clone(),
        user_id: tokens.user_id.clone(),
        granted_scope,
    };
    save_spotify_tokens(app, &updated)?;
    Ok(updated)
}

async fn valid_spotify_token(app: &AppHandle) -> Result<String, String> {
    let tokens = load_spotify_tokens(app)
        .ok_or_else(|| "Not connected to Spotify — click Connect Spotify".to_string())?;
    if now_unix() < tokens.expires_at {
        return Ok(tokens.access_token);
    }
    let refreshed = refresh_spotify_token(app, &tokens).await?;
    Ok(refreshed.access_token)
}

fn extract_spotify_playlist_id(url: &str) -> Option<String> {
    let url = url.trim();
    if let Some(idx) = url.find("playlist/") {
        let rest = &url[idx + "playlist/".len()..];
        let id: String = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    if let Some(idx) = url.find("playlist:") {
        let rest = &url[idx + "playlist:".len()..];
        let id: String = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    None
}


enum SpotifyLink {
    Playlist(String),
    Album(String),
    Track(String),
}

fn parse_spotify_link(url: &str) -> Option<SpotifyLink> {
    let url = url.trim();
    let markers = [
        ("playlist/", "playlist/"),
        ("album/", "album/"),
        ("track/", "track/"),
        ("spotify:playlist:", "spotify:playlist:"),
        ("spotify:album:", "spotify:album:"),
        ("spotify:track:", "spotify:track:"),
    ];
    // Prefer path-style open.spotify.com first
    for (marker, kind) in [
        ("playlist/", "playlist"),
        ("album/", "album"),
        ("track/", "track"),
        ("spotify:playlist:", "playlist"),
        ("spotify:album:", "album"),
        ("spotify:track:", "track"),
    ] {
        if let Some(idx) = url.find(marker) {
            let rest = &url[idx + marker.len()..];
            let id: String = rest
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric())
                .collect();
            if id.is_empty() {
                continue;
            }
            return Some(match kind {
                "playlist" => SpotifyLink::Playlist(id),
                "album" => SpotifyLink::Album(id),
                _ => SpotifyLink::Track(id),
            });
        }
    }
    None
}

fn parse_track_items(items: &[serde_json::Value], out: &mut Vec<SpotifyTrack>) {
    for item in items {
        let track = item.get("track").unwrap_or(item);
        if track.is_null() {
            continue;
        }
        let title = track
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if title.is_empty() {
            continue;
        }
        let artist = track
            .get("artists")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|a| a.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Artist")
            .to_string();
        let duration_ms = track
            .get("duration_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let id = track
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        out.push(SpotifyTrack {
            title,
            artist,
            duration: if duration_ms > 0 {
                Some(duration_ms as f64 / 1000.0)
            } else {
                None
            },
            id,
        });
    }
}

/// Start PKCE login — opens browser, waits for redirect on localhost:18925
#[tauri::command]
async fn spotify_connect(app: AppHandle, client_id: String) -> Result<String, String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Client ID required (from developer.spotify.com — no secret needed)".into());
    }

    let (verifier, challenge) = pkce_pair();
    let state_bytes: Vec<u8> = (0..16).map(|_| rand::random::<u8>()).collect();
    let state = URL_SAFE_NO_PAD.encode(&state_bytes);

    let auth_url = format!(
        "https://accounts.spotify.com/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&state={}&code_challenge_method=S256&code_challenge={}&show_dialog=true",
        urlencoding::encode(&client_id),
        urlencoding::encode(SPOTIFY_REDIRECT),
        urlencoding::encode(SPOTIFY_SCOPES),
        urlencoding::encode(&state),
        urlencoding::encode(&challenge)
    );

    // Bind callback server BEFORE opening browser
    let listener = TcpListener::bind("127.0.0.1:18925")
        .map_err(|e| format!("Cannot bind localhost:18925 — is it in use? {}", e))?;
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;

    open::that(&auth_url).map_err(|e| format!("Could not open browser: {}", e))?;

    // Wait for one redirect (blocking in spawn_blocking)
    let verifier2 = verifier.clone();
    let client_id2 = client_id.clone();
    let state2 = state.clone();

    let code = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let (mut stream, _) = listener
            .accept()
            .map_err(|e| format!("Auth callback wait failed: {}", e))?;
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
        let req = String::from_utf8_lossy(&buf[..n]);
        let first_line = req.lines().next().unwrap_or("");
        // GET /callback?code=...&state=... HTTP/1.1
        let path = first_line.split_whitespace().nth(1).unwrap_or("");
        let qs = path.split('?').nth(1).unwrap_or("");
        let mut code = String::new();
        let mut got_state = String::new();
        for pair in qs.split('&') {
            let mut kv = pair.splitn(2, '=');
            let k = kv.next().unwrap_or("");
            let v = kv.next().unwrap_or("");
            if k == "code" {
                code = urlencoding::decode(v).map(|s| s.to_string()).unwrap_or_else(|_| v.to_string());
            }
            if k == "state" {
                got_state = v.to_string();
            }
            if k == "error" {
                return Err(format!("Spotify auth error: {}", v));
            }
        }
        if got_state != state2 {
            return Err("State mismatch — try Connect again".into());
        }
        if code.is_empty() {
            return Err("No auth code in callback".into());
        }
        let body = b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<!DOCTYPE html><html><body style=\"font-family:sans-serif;background:#121212;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><div><h2>Connected to Orchestro</h2><p>You can close this tab.</p></div></body></html>";
        let _ = stream.write_all(body);
        Ok(code)
    })
    .await
    .map_err(|e| e.to_string())??;

    // Exchange code for tokens
    let client = reqwest::Client::new();
    let body = format!(
        "grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&code_verifier={}",
        urlencoding::encode(&code),
        urlencoding::encode(SPOTIFY_REDIRECT),
        urlencoding::encode(&client_id2),
        urlencoding::encode(&verifier2)
    );
    let res = client
        .post("https://accounts.spotify.com/api/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    if !res.status().is_success() {
        let t = res.text().await.unwrap_or_default();
        return Err(format!("Token exchange denied: {}", t));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let access = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access_token")?
        .to_string();
    let refresh = json
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let expires_in = json
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(3600);
    let granted_scope = json
        .get("scope")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Resolve Spotify user id for ownership checks
    let me_res = client
        .get("https://api.spotify.com/v1/me")
        .bearer_auth(&access)
        .send()
        .await
        .map_err(|e| format!("Failed to read profile: {}", e))?;
    let user_id = if me_res.status().is_success() {
        me_res
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|v| v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()))
    } else {
        None
    };

    let tokens = SpotifyTokens {
        access_token: access,
        refresh_token: refresh,
        expires_at: now_unix() + expires_in.saturating_sub(60),
        client_id: client_id2,
        user_id,
        granted_scope,
    };
    save_spotify_tokens(&app, &tokens)?;
    Ok("connected".into())
}

#[tauri::command]
fn spotify_debug_scope(app: AppHandle) -> Result<String, String> {
    let t = load_spotify_tokens(&app).ok_or_else(|| "Not connected".to_string())?;
    Ok(t.granted_scope.unwrap_or_else(|| "no scope field returned".into()))
}

#[tauri::command]
fn spotify_disconnect(app: AppHandle) -> Result<(), String> {
    clear_spotify_tokens(&app)
}

#[tauri::command]
fn spotify_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let connected = load_spotify_tokens(&app).is_some();
    Ok(serde_json::json!({ "connected": connected }))
}

#[derive(Debug, Serialize, Clone)]
pub struct SpotifyPlaylistInfo {
    pub id: String,
    pub name: String,
    pub tracks_total: u32,
    pub image: Option<String>,
    pub owned: bool,
}

#[tauri::command]
async fn spotify_list_playlists(app: AppHandle) -> Result<Vec<SpotifyPlaylistInfo>, String> {
    let token = valid_spotify_token(&app).await?;
    let my_id = load_spotify_tokens(&app).and_then(|t| t.user_id);
    let client = reqwest::Client::new();
    let mut out = Vec::new();
    let mut next = Some("https://api.spotify.com/v1/me/playlists?limit=50".to_string());

    while let Some(url) = next {
        let res = client
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let t = res.text().await.unwrap_or_default();
            return Err(format!("List playlists failed: {}", t));
        }
        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
            for p in items {
                let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("Playlist").to_string();
                let total = p
                    .pointer("/tracks/total")
                    .or_else(|| p.pointer("/items/total"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32;
                let image = p
                    .get("images")
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|i| i.get("url"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let owner_id = p.pointer("/owner/id").and_then(|v| v.as_str());
                let owned = match (owner_id, my_id.as_deref()) {
                    (Some(o), Some(m)) => o == m,
                    _ => false,
                };
                if !id.is_empty() {
                    out.push(SpotifyPlaylistInfo {
                        id,
                        name,
                        tracks_total: total,
                        image,
                        owned,
                    });
                }
            }
        }
        next = json
            .get("next")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
    }
    Ok(out)
}

#[tauri::command]
async fn resolve_spotify_playlist(app: AppHandle, url: String) -> Result<SpotifyPlaylistResult, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("Paste a Spotify playlist link".into());
    }
    let playlist_id = extract_spotify_playlist_id(&url)
        .ok_or_else(|| "Could not find playlist ID in that link".to_string())?;

    let token = valid_spotify_token(&app).await?;
    let client = reqwest::Client::new();

    // 1) Full playlist object (often includes first page of tracks even when /items is locked)
    let meta_res = client
        .get(format!("https://api.spotify.com/v1/playlists/{}", playlist_id))
        .bearer_auth(&token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !meta_res.status().is_success() {
        let st = meta_res.status();
        let t = meta_res.text().await.unwrap_or_default();
        return Err(format!("Playlist error ({}): {}", st, t));
    }

    let meta: serde_json::Value = meta_res.json().await.map_err(|e| e.to_string())?;
    let playlist_name = meta
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Spotify Playlist")
        .to_string();

    // Dev Mode: item lists only for owned/collaborative playlists
    let my_id = load_spotify_tokens(&app).and_then(|t| t.user_id);
    let owner_id = meta
        .pointer("/owner/id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let is_collab = meta
        .get("collaborative")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let owned_or_collab = is_collab
        || matches!((owner_id.as_deref(), my_id.as_deref()), (Some(o), Some(m)) if o == m);

    if !owned_or_collab {
        return Err(
            "Spotify blocks track access for playlists you don't own or collaborate on (Development Mode). Copy songs into a playlist you own, use Liked Songs, or paste a Text list."
                .into(),
        );
    }

    let mut tracks: Vec<SpotifyTrack> = Vec::new();

    // Embedded first page
    if let Some(items) = meta
        .pointer("/tracks/items")
        .or_else(|| meta.pointer("/items/items"))
        .and_then(|v| v.as_array())
    {
        parse_track_items(items, &mut tracks);
    }

    // 2) Paginate with several endpoint variants (Spotify renamed paths in 2026)
    let start_urls = [
        format!(
            "https://api.spotify.com/v1/playlists/{}/items?limit=100&additional_types=track",
            playlist_id
        ),
        format!(
            "https://api.spotify.com/v1/playlists/{}/tracks?limit=100&additional_types=track",
            playlist_id
        ),
    ];

    let mut next_url: Option<String> = None;
    let mut last_err = String::new();

    // If we already have tracks from embed, use tracks.next for pagination
    if let Some(n) = meta
        .pointer("/tracks/next")
        .or_else(|| meta.pointer("/items/next"))
        .and_then(|v| v.as_str())
    {
        next_url = Some(n.to_string());
    } else if tracks.is_empty() {
        // Try each start URL until one works
        for candidate in &start_urls {
            let page_res = client
                .get(candidate)
                .bearer_auth(&token)
                .header("Accept", "application/json")
                .send()
                .await
                .map_err(|e| e.to_string())?;
            if page_res.status().is_success() {
                let page: serde_json::Value = page_res.json().await.map_err(|e| e.to_string())?;
                if let Some(items) = page.get("items").and_then(|v| v.as_array()) {
                    parse_track_items(items, &mut tracks);
                }
                next_url = page
                    .get("next")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                last_err.clear();
                break;
            } else {
                last_err = format!(
                    "{} → {}",
                    candidate,
                    page_res.text().await.unwrap_or_default()
                );
            }
        }
    }

    while let Some(page_url) = next_url {
        if tracks.len() >= 500 {
            break;
        }
        let page_res = client
            .get(&page_url)
            .bearer_auth(&token)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !page_res.status().is_success() {
            break;
        }

        let page: serde_json::Value = match page_res.json().await {
            Ok(v) => v,
            Err(_) => break,
        };
        if let Some(items) = page.get("items").and_then(|v| v.as_array()) {
            parse_track_items(items, &mut tracks);
        }
        next_url = page
            .get("next")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
    }

    if tracks.is_empty() {
        return Err(format!(
            "Tracks blocked by Spotify (Development mode often returns 403 on playlist items). \
Try Text list, or ensure your account is Premium + added under User Management. {}",
            last_err
        ));
    }

    Ok(SpotifyPlaylistResult {
        name: playlist_name,
        tracks,
        url,
    })
}

#[tauri::command]
async fn resolve_spotify_playlist_by_id(
    app: AppHandle,
    playlist_id: String,
) -> Result<SpotifyPlaylistResult, String> {
    let url = format!("https://open.spotify.com/playlist/{}", playlist_id);
    resolve_spotify_playlist(app, url).await
}


#[tauri::command]
async fn spotify_liked_songs(app: AppHandle) -> Result<SpotifyPlaylistResult, String> {
    let token = valid_spotify_token(&app).await?;
    let client = reqwest::Client::new();
    let mut tracks = Vec::new();
    let mut next = Some("https://api.spotify.com/v1/me/tracks?limit=50".to_string());

    while let Some(url) = next {
        if tracks.len() >= 2000 {
            break;
        }
        let res = client
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!(
                "Liked Songs failed: {}",
                res.text().await.unwrap_or_default()
            ));
        }
        let page: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(items) = page.get("items").and_then(|v| v.as_array()) {
            parse_track_items(items, &mut tracks);
        }
        next = page
            .get("next")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
    }

    if tracks.is_empty() {
        return Err("No liked songs on this account".into());
    }

    Ok(SpotifyPlaylistResult {
        name: "Liked Songs".into(),
        tracks,
        url: String::new(),
    })
}



/// Public playlist via Spotify embed page (__NEXT_DATA__) — no ownership / Dev Mode gate
async fn resolve_spotify_playlist_embed(playlist_id: &str) -> Result<SpotifyPlaylistResult, String> {
    let embed_url = format!("https://open.spotify.com/embed/playlist/{}", playlist_id);
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let html = client
        .get(&embed_url)
        .send()
        .await
        .map_err(|e| format!("Embed fetch failed: {}", e))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    // __NEXT_DATA__ JSON
    let start_tag = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
    let start = html
        .find(start_tag)
        .ok_or_else(|| "Playlist embed has no track data (private or blocked)".to_string())?;
    let after = &html[start + start_tag.len()..];
    let end = after
        .find("</script>")
        .ok_or_else(|| "Malformed embed JSON".to_string())?;
    let json_str = &after[..end];

    let data: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| format!("Bad embed JSON: {}", e))?;

    let entity = data
        .pointer("/props/pageProps/state/data/entity")
        .cloned()
        .ok_or_else(|| "Embed missing playlist entity".to_string())?;

    let playlist_name = entity
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Spotify Playlist")
        .to_string();

    let mut tracks = Vec::new();
    if let Some(list) = entity.get("trackList").and_then(|v| v.as_array()) {
        for t in list {
            let title = t
                .get("title")
                .or_else(|| t.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if title.is_empty() {
                continue;
            }
            let artist = t
                .get("subtitle")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown Artist")
                // embed uses special spaces sometimes
                .replace('\u{00a0}', " ")
                .trim()
                .to_string();
            let id = t
                .get("uri")
                .and_then(|v| v.as_str())
                .and_then(|uri| uri.strip_prefix("spotify:track:"))
                .map(|s| s.to_string());
            tracks.push(SpotifyTrack {
                title,
                artist,
                duration: None,
                id,
            });
        }
    }

    if tracks.is_empty() {
        return Err("Embed returned no tracks (playlist may be private/empty)".into());
    }

    Ok(SpotifyPlaylistResult {
        name: playlist_name,
        tracks,
        url: format!("https://open.spotify.com/playlist/{}", playlist_id),
    })
}

#[tauri::command]
async fn resolve_spotify_album(
    app: AppHandle,
    album_id: String,
) -> Result<SpotifyPlaylistResult, String> {
    let token = valid_spotify_token(&app).await?;
    let client = reqwest::Client::new();

    let meta_res = client
        .get(format!("https://api.spotify.com/v1/albums/{}", album_id))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !meta_res.status().is_success() {
        return Err(format!(
            "Album error: {}",
            meta_res.text().await.unwrap_or_default()
        ));
    }
    let meta: serde_json::Value = meta_res.json().await.map_err(|e| e.to_string())?;
    let album_name = meta
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Album")
        .to_string();
    let album_artist = meta
        .pointer("/artists/0/name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut tracks = Vec::new();
    let mut next = Some(format!(
        "https://api.spotify.com/v1/albums/{}/tracks?limit=50",
        album_id
    ));
    while let Some(url) = next {
        let res = client
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!(
                "Album tracks failed: {}",
                res.text().await.unwrap_or_default()
            ));
        }
        let page: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(items) = page.get("items").and_then(|v| v.as_array()) {
            for t in items {
                let title = t
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if title.is_empty() {
                    continue;
                }
                let artist = t
                    .pointer("/artists/0/name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&album_artist)
                    .to_string();
                let duration_ms = t.get("duration_ms").and_then(|v| v.as_u64()).unwrap_or(0);
                let id = t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                tracks.push(SpotifyTrack {
                    title,
                    artist,
                    duration: if duration_ms > 0 {
                        Some(duration_ms as f64 / 1000.0)
                    } else {
                        None
                    },
                    id,
                });
            }
        }
        next = page
            .get("next")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
    }

    if tracks.is_empty() {
        return Err("No tracks on this album".into());
    }

    Ok(SpotifyPlaylistResult {
        name: album_name,
        tracks,
        url: String::new(),
    })
}

#[tauri::command]
async fn resolve_spotify_link(
    app: AppHandle,
    url: String,
) -> Result<SpotifyPlaylistResult, String> {
    match parse_spotify_link(&url) {
        Some(SpotifyLink::Album(id)) => resolve_spotify_album(app, id).await,
        Some(SpotifyLink::Playlist(id)) => {
            // 1) Public embed — works without ownership / often without login
            match resolve_spotify_playlist_embed(&id).await {
                Ok(r) => Ok(r),
                Err(embed_err) => {
                    // 2) Official API if user is connected (owned / collab)
                    match resolve_spotify_playlist(app, url.clone()).await {
                        Ok(r) => Ok(r),
                        Err(api_err) => Err(format!(
                            "{}
(API fallback: {})",
                            embed_err, api_err
                        )),
                    }
                }
            }
        }
        Some(SpotifyLink::Track(_)) => Err(
            "Single track links aren't supported yet — paste an album or playlist link.".into(),
        ),
        None => Err("Couldn't recognize that as a Spotify playlist or album link.".into()),
    }
}

/// Parse pasted text lines into tracks ("Artist - Title" or "Title - Artist")
#[tauri::command]
fn parse_track_list_text(text: String) -> Result<SpotifyPlaylistResult, String> {
    let mut tracks = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        // strip leading track numbers "01." "1)" etc
        let mut s = line.to_string();
        if let Some(rest) = s
            .find(|c: char| c.is_alphabetic())
            .map(|i| s[i..].to_string())
        {
            s = rest;
        }
        let (title, artist) = if let Some((a, b)) = s.split_once(" - ") {
            let a = a.trim();
            let b = b.trim();
            // Heuristic: if left side looks longer, often "Title - Artist"
            if a.len() > b.len() + 10 {
                (a.to_string(), b.to_string())
            } else {
                // prefer "Artist - Title" (common in exports)
                (b.to_string(), a.to_string())
            }
        } else if let Some((a, b)) = s.split_once(" – ") {
            (b.trim().to_string(), a.trim().to_string())
        } else {
            (s.clone(), "Unknown Artist".into())
        };
        if title.is_empty() {
            continue;
        }
        tracks.push(SpotifyTrack {
            title,
            artist,
            duration: None,
            id: None,
        });
    }
    if tracks.is_empty() {
        return Err("No tracks parsed. Use one song per line: Artist - Title".into());
    }
    Ok(SpotifyPlaylistResult {
        name: "Imported list".into(),
        tracks,
        url: String::new(),
    })
}

#[tauri::command]
async fn yt_search(app: AppHandle, query: String) -> Result<Vec<YtSearchResult>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Err("Empty search query".into());
    }

    let bin = resolve_ytdlp(&app)?;
    let search = format!("ytsearch8:{}", q);
    let mut cmd = tokio::process::Command::new(&bin);
    hide_console_tokio(&mut cmd);
    let output = cmd
        .args([
            &search,
            "--flat-playlist",
            "--print",
            "%(id)s\t%(title)s\t%(uploader,channel,creator|Unknown)s\t%(duration|0)s\t%(webpage_url,url)s",
            "--no-warnings",
            "--no-playlist",
            "--socket-timeout",
            "15",
        ])
        .output()
        .await
        .map_err(|e| {
            format!(
                "Could not run yt-dlp ({}). Use “Update yt-dlp” in the YouTube tab.",
                e
            )
        })?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp search failed: {}", err.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 5 {
            continue;
        }
        let duration = parts[3].parse::<f64>().ok().filter(|d| *d > 0.0);
        let mut url = parts[4].to_string();
        if url.is_empty() || url == "NA" {
            url = format!("https://www.youtube.com/watch?v={}", parts[0]);
        }
        results.push(YtSearchResult {
            id: parts[0].to_string(),
            title: parts[1].to_string(),
            uploader: if parts[2] == "NA" {
                "Unknown".into()
            } else {
                parts[2].to_string()
            },
            duration,
            url,
        });
    }

    Ok(results)
}

#[tauri::command]
async fn yt_download(
    app: AppHandle,
    url: String,
    output_dir: String,
    job_id: String,
) -> Result<String, String> {
    if url.trim().is_empty() {
        return Err("Empty URL".into());
    }
    if output_dir.trim().is_empty() {
        return Err("No download folder set.".into());
    }

    let bin = resolve_ytdlp(&app)?;
    let dir = PathBuf::from(&output_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create folder: {}", e))?;

    let out_template = dir
        .join("%(title).180B [%(id)s].%(ext)s")
        .to_string_lossy()
        .to_string();

    let app2 = app.clone();
    let job_id2 = job_id.clone();
    let url2 = url.clone();
    let out_template2 = out_template.clone();
    let dir2 = dir.clone();
    let bin2 = bin.clone();

    let result = tokio::task::spawn_blocking(move || {
        // Tell UI we're starting immediately
        let _ = app2.emit(
            "yt-download-progress",
            YtProgressEvent {
                job_id: job_id2.clone(),
                percent: 1.0,
                status: "downloading".into(),
                message: "Starting…".into(),
            },
        );

        let mut child_cmd = Command::new(&bin2);
        hide_console(&mut child_cmd);
        let mut child = child_cmd
            .args([
                "-x",
                "--audio-format",
                "mp3",
                "--audio-quality",
                "5", // faster encode than 0 (best)
                "--no-playlist",
                "--no-warnings",
                "--newline",
                "--socket-timeout",
                "20",
                "--retries",
                "3",
                "-o",
                &out_template2,
                "--print",
                "after_move:filepath",
                &url2,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Could not run yt-dlp: {}", e))?;

        // Track PID so the UI can cancel this job
        let child_pid = child.id();
        {
            let mut guard = pids();
            if let Some(map) = guard.as_mut() {
                map.insert(job_id2.clone(), child_pid);
            }
        }

        if let Some(stderr) = child.stderr.take() {
            let app_err = app2.clone();
            let jid = job_id2.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    let line = line.trim();
                    let mut percent = -1.0_f64;
                    let mut status = "downloading".to_string();

                    if let Some(idx) = line.find('%') {
                        let before = &line[..idx];
                        if let Some(num_str) = before
                            .split_whitespace()
                            .last()
                            .and_then(|s| s.parse::<f64>().ok())
                        {
                            percent = num_str.clamp(0.0, 100.0);
                        }
                    }
                    if line.contains("[ExtractAudio]")
                        || line.contains("Destination:")
                        || line.to_lowercase().contains("converting")
                    {
                        status = "converting".into();
                        if percent < 0.0 {
                            percent = 95.0;
                        }
                    }

                    if percent >= 0.0 || status == "converting" {
                        let _ = app_err.emit(
                            "yt-download-progress",
                            YtProgressEvent {
                                job_id: jid.clone(),
                                percent: if percent < 0.0 { 90.0 } else { percent },
                                status: status.clone(),
                                message: line.to_string(),
                            },
                        );
                    }
                }
            });
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("yt-dlp failed: {}", e))?;

        // Clear PID tracking
        {
            let mut guard = pids();
            if let Some(map) = guard.as_mut() {
                map.remove(&job_id2);
            }
        }

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            let msg = if err.trim().is_empty() {
                "Cancelled".to_string()
            } else {
                err.trim().to_string()
            };
            let status = if msg.to_lowercase().contains("cancel")
                || output.status.code() == Some(1)
                || output.status.code() == Some(15)
            {
                // taskkill often yields non-zero; prefer cancelled if stderr empty
                if err.trim().is_empty() {
                    "cancelled"
                } else {
                    "error"
                }
            } else {
                "error"
            };
            let _ = app2.emit(
                "yt-download-progress",
                YtProgressEvent {
                    job_id: job_id2.clone(),
                    percent: 0.0,
                    status: status.into(),
                    message: if status == "cancelled" {
                        "Cancelled".into()
                    } else {
                        msg.clone()
                    },
                },
            );
            if status == "cancelled" {
                return Err("Cancelled".into());
            }
            return Err(format!("Download failed: {}", msg));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let path = stdout
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .last()
            .map(|s| s.to_string());

        let final_path = if let Some(p) = path {
            if PathBuf::from(&p).exists() {
                p
            } else {
                find_newest_mp3(&dir2).ok_or_else(|| format!("File not found: {}", p))?
            }
        } else {
            find_newest_mp3(&dir2)
                .ok_or_else(|| "Download finished but file not found".to_string())?
        };

        let _ = app2.emit(
            "yt-download-progress",
            YtProgressEvent {
                job_id: job_id2,
                percent: 100.0,
                status: "done".into(),
                message: final_path.clone(),
            },
        );

        Ok(final_path)
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?;

    result
}

fn find_newest_mp3(dir: &PathBuf) -> Option<String> {
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) == Some("mp3") {
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    if newest.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
                        newest = Some((modified, p));
                    }
                }
            }
        }
    }
    newest.map(|(_, p)| p.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            yt_search,
            yt_download,
            yt_download_cancel,
            read_file_head,
            delete_file_arbitrary,
            yt_dlp_status,
            yt_dlp_update,
            spotify_connect,
            spotify_disconnect,
            spotify_debug_scope,
            spotify_status,
            spotify_list_playlists,
            resolve_spotify_playlist,
            resolve_spotify_playlist_by_id,
            spotify_liked_songs,
            resolve_spotify_album,
            resolve_spotify_link,
            parse_track_list_text
        ])
        .setup(|app| {
            let app_data = app.path().app_data_dir().expect("failed to get app data dir");
            let library_dir = app_data.join("library").join("songs");
            let bin_dir = app_data.join("bin");
            std::fs::create_dir_all(&library_dir).ok();
            std::fs::create_dir_all(&bin_dir).ok();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

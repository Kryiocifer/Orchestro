use futures_util::StreamExt;
use serde::Serialize;
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
            yt_dlp_update
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

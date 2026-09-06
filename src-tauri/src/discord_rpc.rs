use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// Official Orchestro Discord Application ID (App name: "Orchestro", asset: "orchestro")
const DEFAULT_CLIENT_ID: &str = "1546083032195403897";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityPayload {
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<f64>,
    pub current_time: Option<f64>,
    pub is_playing: bool,
    pub cover_url: Option<String>,
}

fn is_unknown_text(s: &str) -> bool {
    let lower = s.trim().to_lowercase();
    lower.is_empty()
        || lower == "unknown"
        || lower == "unknown artist"
        || lower == "unknown author"
        || lower == "unknown album"
}

enum DiscordCmd {
    UpdateActivity(ActivityPayload),
    ClearActivity,
    SetEnabled(bool),
    SetClientId(String),
}

static RPC_SENDER: Mutex<Option<Sender<DiscordCmd>>> = Mutex::new(None);

#[cfg(windows)]
fn connect_pipe() -> Option<std::fs::File> {
    for i in 0..10 {
        let path = format!(r"\\.\pipe\discord-ipc-{}", i);
        if let Ok(file) = std::fs::OpenOptions::new().read(true).write(true).open(&path) {
            return Some(file);
        }
    }
    None
}

#[cfg(unix)]
fn connect_pipe() -> Option<std::os::unix::net::UnixStream> {
    let dirs = [
        std::env::var("XDG_RUNTIME_DIR").ok(),
        std::env::var("TMPDIR").ok(),
        std::env::var("TMP").ok(),
        std::env::var("TEMP").ok(),
        Some("/tmp".to_string()),
    ];
    for dir in dirs.into_iter().flatten() {
        for i in 0..10 {
            let path = format!("{}/discord-ipc-{}", dir, i);
            if let Ok(stream) = std::os::unix::net::UnixStream::connect(&path) {
                return Some(stream);
            }
        }
    }
    None
}

struct IpcConnection {
    #[cfg(windows)]
    pipe: std::fs::File,
    #[cfg(unix)]
    pipe: std::os::unix::net::UnixStream,
}

impl IpcConnection {
    fn try_connect() -> Option<Self> {
        connect_pipe().map(|pipe| Self { pipe })
    }

    fn write_frame(&mut self, opcode: u32, payload: &str) -> std::io::Result<()> {
        let bytes = payload.as_bytes();
        let len = bytes.len() as u32;
        self.pipe.write_all(&opcode.to_le_bytes())?;
        self.pipe.write_all(&len.to_le_bytes())?;
        self.pipe.write_all(bytes)?;
        self.pipe.flush()?;
        Ok(())
    }

    fn read_frame(&mut self) -> std::io::Result<(u32, String)> {
        let mut header = [0u8; 8];
        self.pipe.read_exact(&mut header)?;
        let opcode = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
        let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
        let mut buf = vec![0u8; len];
        self.pipe.read_exact(&mut buf)?;
        let str_val = String::from_utf8_lossy(&buf).to_string();
        Ok((opcode, str_val))
    }

    fn handshake(&mut self, client_id: &str) -> bool {
        let json = serde_json::json!({
            "v": 1,
            "client_id": client_id
        })
        .to_string();

        if self.write_frame(0, &json).is_err() {
            return false;
        }

        // Read handshake response
        match self.read_frame() {
            Ok((opcode, _body)) => {
                // Opcode 1 is DISPATCH/READY
                opcode == 1
            }
            Err(_) => false,
        }
    }

    fn send_activity(&mut self, _client_id: &str, payload: &Option<ActivityPayload>) -> bool {
        let pid = std::process::id();
        let now_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let activity = match payload {
            Some(data) => {
                let mut act = serde_json::Map::new();
                let title = if data.title.trim().is_empty() {
                    "Listening to Music".to_string()
                } else {
                    data.title.trim().to_string()
                };

                let artist_clean = data.artist.as_deref().unwrap_or("").trim();
                let has_known_artist = !artist_clean.is_empty() && !is_unknown_text(artist_clean);

                let album_clean = data.album.as_deref().unwrap_or("").trim();
                let has_known_album = !album_clean.is_empty() && !is_unknown_text(album_clean);

                // If artist is unknown and music is paused, put (Paused) on title so status is visible
                let details_text = if !data.is_playing && !has_known_artist {
                    format!("{} (Paused)", title)
                } else {
                    title
                };
                act.insert("details".into(), serde_json::Value::String(details_text));

                // State line: ONLY added if author/artist is known.
                // If author is unknown, this line is completely omitted!
                if has_known_artist {
                    let state = if data.is_playing {
                        format!("by {}", artist_clean)
                    } else {
                        format!("by {} (Paused)", artist_clean)
                    };
                    act.insert("state".into(), serde_json::Value::String(state));
                }

                act.insert("type".into(), serde_json::Value::Number(2.into())); // 2 = Listening to

                // Timestamps for Discord progress bar (00:13 ————— 02:41)
                let cur = data.current_time.unwrap_or(0.0).max(0.0);
                let start_ts = now_unix.saturating_sub(cur as u64);
                let mut ts = serde_json::Map::new();
                ts.insert("start".into(), serde_json::Value::Number(start_ts.into()));

                if let Some(dur) = data.duration {
                    if dur > 0.0 {
                        let end_ts = start_ts + (dur as u64);
                        ts.insert("end".into(), serde_json::Value::Number(end_ts.into()));
                    }
                }
                act.insert("timestamps".into(), serde_json::Value::Object(ts));

                // Assets: use official registered asset 'orchestro' on application 1546083032195403897.
                let mut assets = serde_json::Map::new();
                assets.insert(
                    "large_image".into(),
                    serde_json::Value::String("orchestro".into()),
                );

                // Album line / tooltip: ONLY added if album is known.
                // If album is unknown, this line is completely omitted!
                if has_known_album {
                    let large_text = if data.is_playing {
                        album_clean.to_string()
                    } else {
                        format!("{} (Paused)", album_clean)
                    };
                    assets.insert("large_text".into(), serde_json::Value::String(large_text));
                }

                act.insert("assets".into(), serde_json::Value::Object(assets));

                serde_json::Value::Object(act)
            }
            None => serde_json::Value::Null,
        };

        let msg = serde_json::json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": pid,
                "activity": activity
            },
            "nonce": format!("{}", now_unix)
        })
        .to_string();

        if self.write_frame(1, &msg).is_err() {
            return false;
        }

        match self.read_frame() {
            Ok((1, _)) => true,
            Ok(_) => false,
            Err(_) => false,
        }
    }
}

pub fn start_discord_worker() {
    let (tx, rx) = channel::<DiscordCmd>();
    if let Ok(mut lock) = RPC_SENDER.lock() {
        *lock = Some(tx);
    }

    std::thread::spawn(move || {
        let mut enabled = true;
        let mut client_id = DEFAULT_CLIENT_ID.to_string();
        let mut connection: Option<IpcConnection> = None;
        let mut current_activity: Option<ActivityPayload> = None;
        let mut last_reconnect_attempt = SystemTime::UNIX_EPOCH;

        loop {
            // Process incoming commands from UI
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(DiscordCmd::SetEnabled(e)) => {
                    enabled = e;
                    if !enabled {
                        if let Some(mut conn) = connection.take() {
                            let _ = conn.send_activity(&client_id, &None);
                        }
                    }
                }
                Ok(DiscordCmd::SetClientId(id)) => {
                    let trimmed = id.trim().to_string();
                    let effective_id = if trimmed.is_empty() {
                        DEFAULT_CLIENT_ID.to_string()
                    } else {
                        trimmed
                    };
                    if effective_id != client_id {
                        client_id = effective_id;
                        // Force reconnect with new client_id
                        connection = None;
                    }
                }
                Ok(DiscordCmd::UpdateActivity(payload)) => {
                    current_activity = Some(payload);
                    if enabled && connection.is_some() {
                        if let Some(conn) = connection.as_mut() {
                            if !conn.send_activity(&client_id, &current_activity) {
                                connection = None;
                            }
                        }
                    }
                }
                Ok(DiscordCmd::ClearActivity) => {
                    current_activity = None;
                    if enabled && connection.is_some() {
                        if let Some(conn) = connection.as_mut() {
                            if !conn.send_activity(&client_id, &None) {
                                connection = None;
                            }
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }

            // Connection maintenance loop
            if enabled {
                if connection.is_none() {
                    let now = SystemTime::now();
                    if now
                        .duration_since(last_reconnect_attempt)
                        .unwrap_or(Duration::ZERO)
                        > Duration::from_secs(3)
                    {
                        last_reconnect_attempt = now;
                        if let Some(mut conn) = IpcConnection::try_connect() {
                            if conn.handshake(&client_id) {
                                if current_activity.is_some() {
                                    conn.send_activity(&client_id, &current_activity);
                                }
                                connection = Some(conn);
                            }
                        }
                    }
                }
            }
        }
    });
}

pub fn update_activity(payload: ActivityPayload) {
    if let Ok(guard) = RPC_SENDER.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(DiscordCmd::UpdateActivity(payload));
        }
    }
}

pub fn clear_activity() {
    if let Ok(guard) = RPC_SENDER.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(DiscordCmd::ClearActivity);
        }
    }
}

pub fn set_rpc_enabled(enabled: bool) {
    if let Ok(guard) = RPC_SENDER.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(DiscordCmd::SetEnabled(enabled));
        }
    }
}

pub fn set_client_id(client_id: String) {
    if let Ok(guard) = RPC_SENDER.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(DiscordCmd::SetClientId(client_id));
        }
    }
}

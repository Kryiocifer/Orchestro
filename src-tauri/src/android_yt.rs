use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime, Wry,
};
use reqwest;
use futures_util::StreamExt;
use std::io::Write;
use std::sync::OnceLock;

use crate::{YtSearchResult, YtDlpStatus};

const ANDROID_YTDLP_PLUGIN_IDENTIFIER: &str = "com.orchestro.desktop";
static ANDROID_YTDLP_HANDLE: OnceLock<PluginHandle<Wry>> = OnceLock::new();

pub struct AndroidYtDlp<R: Runtime> {
    handle: PluginHandle<R>,
}

#[derive(Serialize)]
struct AndroidSearchArgs {
    query: String,
}

#[derive(Deserialize)]
struct AndroidSearchResult {
    id: String,
    title: String,
    uploader: String,
    duration: Option<f64>,
    url: String,
}

impl From<AndroidSearchResult> for YtSearchResult {
    fn from(value: AndroidSearchResult) -> Self {
        Self {
            id: value.id,
            title: value.title,
            uploader: value.uploader,
            duration: value.duration,
            url: value.url,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AndroidDownloadArgs {
    url: String,
    output_dir: String,
    job_id: String,
    title: Option<String>,
    artist: Option<String>,
    cover_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AndroidDownloadResponse {
    file_path: String,
}

#[derive(Serialize)]
struct AndroidCancelArgs {
    job_id: String,
}

pub fn init_plugin() -> TauriPlugin<Wry> {
    Builder::<Wry, ()>::new("android-ytdlp")
        .setup(|app, api| {
            if let Ok(handle) =
                api.register_android_plugin(ANDROID_YTDLP_PLUGIN_IDENTIFIER, "YtDlpPlugin")
            {
                let _ = ANDROID_YTDLP_HANDLE.set(handle.clone());
                app.manage(AndroidYtDlp { handle });
            }
            Ok(())
        })
        .build()
}

fn mobile_plugin(app: &AppHandle) -> Option<PluginHandle<Wry>> {
    app.try_state::<AndroidYtDlp<Wry>>()
        .map(|state| state.handle.clone())
        .or_else(|| ANDROID_YTDLP_HANDLE.get().cloned())
}

async fn plugin_yt_search(app: &AppHandle, query: String) -> Result<Vec<YtSearchResult>, String> {
    let handle = mobile_plugin(app).ok_or_else(|| "Android yt-dlp plugin unavailable".to_string())?;
    let results: Vec<AndroidSearchResult> = handle
        .run_mobile_plugin_async("search", AndroidSearchArgs { query })
        .await
        .map_err(|e| format!("Android yt-dlp search failed: {}", e))?;
    Ok(results.into_iter().map(Into::into).collect())
}

async fn plugin_yt_download(
    app: &AppHandle,
    url: String,
    output_dir: String,
    job_id: String,
    title: Option<String>,
    artist: Option<String>,
    cover_url: Option<String>,
) -> Result<String, String> {
    let handle = mobile_plugin(app).ok_or_else(|| "Android yt-dlp plugin unavailable".to_string())?;

    let response: AndroidDownloadResponse = handle
        .run_mobile_plugin_async(
            "download",
            AndroidDownloadArgs {
                url,
                output_dir,
                job_id,
                title,
                artist,
                cover_url,
            },
        )
        .await
        .map_err(|e| format!("Android yt-dlp download failed: {}", e))?;

    Ok(response.file_path)
}


async fn plugin_yt_dlp_update(app: &AppHandle) -> Result<YtDlpStatus, String> {
    let handle = mobile_plugin(app).ok_or_else(|| "Android yt-dlp plugin unavailable".to_string())?;
    handle
        .run_mobile_plugin_async::<serde_json::Value>("update", serde_json::Value::Null)
        .await
        .map_err(|e| format!("Android yt-dlp update failed: {}", e))?;

    Ok(YtDlpStatus {
        available: true,
        version: Some("yt-dlp-android".to_string()),
        path: Some("native".to_string()),
        source: "bundled".to_string(),
        action: Some("updated".to_string()),
        latest_version: Some("yt-dlp-android".to_string()),
    })
}

const INVIDIOUS_INSTANCES: [&str; 5] = [
    "invidious.tiekoetter.com",
    "invidious.nerdvpn.de",
    "invidious.weblibre.org",
    "invidious.dhusch.de",
    "watch.thekitty.zone",
];

#[derive(Clone, Copy)]
struct InnertubeClientProfile {
    label: &'static str,
    name: &'static str,
    client_id: u32,
    version: &'static str,
    user_agent: &'static str,
    os_name: Option<&'static str>,
    os_version: Option<&'static str>,
    android_sdk_version: Option<u32>,
    device_make: Option<&'static str>,
    device_model: Option<&'static str>,
    embed_url: Option<&'static str>,
}

const INNERTUBE_CLIENTS: [InnertubeClientProfile; 5] = [
    InnertubeClientProfile {
        label: "TV_DOWNGRADED",
        name: "TVHTML5",
        client_id: 7,
        version: "5.20260707",
        user_agent: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
        os_name: None,
        os_version: None,
        android_sdk_version: None,
        device_make: None,
        device_model: None,
        embed_url: None,
    },
    InnertubeClientProfile {
        label: "TV",
        name: "TVHTML5",
        client_id: 7,
        version: "7.20260707.07.00",
        user_agent: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
        os_name: None,
        os_version: None,
        android_sdk_version: None,
        device_make: None,
        device_model: None,
        embed_url: None,
    },
    InnertubeClientProfile {
        label: "WEB_EMBEDDED",
        name: "WEB_EMBEDDED_PLAYER",
        client_id: 56,
        version: "2.20260708.00.00",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36,gzip(gfe)",
        os_name: None,
        os_version: None,
        android_sdk_version: None,
        device_make: None,
        device_model: None,
        embed_url: Some("https://www.reddit.com/"),
    },
    InnertubeClientProfile {
        label: "ANDROID",
        name: "ANDROID",
        client_id: 3,
        version: "21.26.364",
        user_agent: "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip",
        os_name: Some("Android"),
        os_version: Some("11"),
        android_sdk_version: Some(30),
        device_make: None,
        device_model: None,
        embed_url: None,
    },
    InnertubeClientProfile {
        label: "IOS",
        name: "IOS",
        client_id: 5,
        version: "21.26.4",
        user_agent: "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
        os_name: Some("iPhone"),
        os_version: Some("18.3.2.22D82"),
        android_sdk_version: None,
        device_make: Some("Apple"),
        device_model: Some("iPhone16,2"),
        embed_url: None,
    },
];

#[derive(Debug, Clone)]
struct AudioCandidate {
    url: String,
    ext: String,
    score: i64,
}

fn parse_duration_str(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        1 => parts[0].parse::<f64>().ok(),
        2 => {
            let m = parts[0].parse::<f64>().ok()?;
            let s = parts[1].parse::<f64>().ok()?;
            Some(m * 60.0 + s)
        }
        3 => {
            let h = parts[0].parse::<f64>().ok()?;
            let m = parts[1].parse::<f64>().ok()?;
            let s = parts[2].parse::<f64>().ok()?;
            Some(h * 3600.0 + m * 60.0 + s)
        }
        _ => None,
    }
}

pub fn extract_video_id(url: &str) -> Option<String> {
    let u = url.trim();
    if u.len() == 11 && !u.contains('/') && !u.contains('?') {
        return Some(u.to_string());
    }
    if let Some(pos) = u.find("v=") {
        let after = &u[pos + 2..];
        let id: String = after.chars().take_while(|c| *c != '&' && *c != '#' && *c != '/').collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    if let Some(pos) = u.find("youtu.be/") {
        let after = &u[pos + 9..];
        let id: String = after.chars().take_while(|c| *c != '?' && *c != '#' && *c != '/').collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    None
}

fn append_query_param(url: &str, key: &str, value: &str) -> String {
    let separator = if url.contains('?') { '&' } else { '?' };
    format!("{}{}{}={}", url, separator, key, urlencoding::encode(value))
}

fn decode_query_component(value: &str) -> Option<String> {
    urlencoding::decode(value).ok().map(|v| v.into_owned())
}

fn direct_url_from_cipher(cipher: &str) -> Option<String> {
    let mut base_url: Option<String> = None;
    let mut sig: Option<String> = None;
    let mut sig_param: Option<String> = None;
    let mut needs_decipher = false;

    for pair in cipher.split('&') {
        let (key, value) = pair.split_once('=')?;
        let decoded = decode_query_component(value)?;
        match key {
            "url" => base_url = Some(decoded),
            "sig" | "signature" => sig = Some(decoded),
            "sp" => sig_param = Some(decoded),
            "s" => needs_decipher = true,
            _ => {}
        }
    }

    if needs_decipher {
        return None;
    }

    let url = base_url?;
    if let Some(signature) = sig {
        Some(append_query_param(
            &url,
            sig_param.as_deref().unwrap_or("sig"),
            &signature,
        ))
    } else {
        Some(url)
    }
}

fn direct_url_from_format(fmt: &serde_json::Value) -> Option<String> {
    if let Some(url) = fmt.get("url").and_then(|u| u.as_str()) {
        return Some(url.to_string());
    }

    fmt.get("signatureCipher")
        .or_else(|| fmt.get("cipher"))
        .and_then(|v| v.as_str())
        .and_then(direct_url_from_cipher)
}

fn playable_ext_from_mime(mime: &str) -> Option<&'static str> {
    if mime.starts_with("audio/mp4") || mime.contains("mp4a") {
        Some("m4a")
    } else if mime.starts_with("audio/webm") || mime.contains("opus") || mime.contains("vorbis") {
        Some("opus")
    } else if mime.starts_with("video/mp4") {
        Some("mp4")
    } else if mime.starts_with("video/webm") {
        Some("webm")
    } else {
        None
    }
}

fn score_audio_format(fmt: &serde_json::Value, mime: &str) -> i64 {
    let itag = fmt.get("itag").and_then(|i| i.as_i64()).unwrap_or_default();
    let bitrate = fmt
        .get("averageBitrate")
        .or_else(|| fmt.get("bitrate"))
        .and_then(|b| b.as_i64())
        .unwrap_or_default();
    let quality_bonus = match fmt.get("audioQuality").and_then(|q| q.as_str()) {
        Some("AUDIO_QUALITY_HIGH") => 30_000,
        Some("AUDIO_QUALITY_MEDIUM") => 15_000,
        Some("AUDIO_QUALITY_LOW") => 5_000,
        _ => 0,
    };
    let is_audio_only = mime.starts_with("audio/");
    let container_bonus = if mime.contains("mp4") { 10_000 } else { 0 };
    let itag_bonus = if itag == 140 { 100_000 } else { 0 };
    let stream_type_bonus = if is_audio_only { 1_000_000 } else { 0 };
    let fallback_penalty = if is_audio_only { 0 } else { 250_000 };

    bitrate + quality_bonus + container_bonus + itag_bonus + stream_type_bonus - fallback_penalty
}

fn has_muxed_audio(fmt: &serde_json::Value, mime: &str) -> bool {
    mime.starts_with("video/")
        && (
            mime.contains("mp4a")
                || mime.contains("opus")
                || mime.contains("vorbis")
                || fmt.get("audioQuality").is_some()
                || fmt.get("audioSampleRate").is_some()
        )
}

fn best_audio_candidate_from_formats(
    formats: &[serde_json::Value],
    mime_key: &str,
) -> Option<AudioCandidate> {
    let mut best: Option<AudioCandidate> = None;

    for fmt in formats {
        let mime = fmt.get(mime_key).and_then(|m| m.as_str()).unwrap_or("");
        if !mime.starts_with("audio/") && !has_muxed_audio(fmt, mime) {
            continue;
        }

        let Some(ext) = playable_ext_from_mime(mime) else {
            continue;
        };

        let Some(url) = direct_url_from_format(fmt) else {
            continue;
        };

        let candidate = AudioCandidate {
            url,
            ext: ext.to_string(),
            score: score_audio_format(fmt, mime),
        };

        if best
            .as_ref()
            .map(|current| candidate.score > current.score)
            .unwrap_or(true)
        {
            best = Some(candidate);
        }
    }

    best
}

fn merge_best_audio_candidate(
    best: &mut Option<AudioCandidate>,
    next: Option<AudioCandidate>,
) {
    if let Some(candidate) = next {
        if best
            .as_ref()
            .map(|current| candidate.score > current.score)
            .unwrap_or(true)
        {
            *best = Some(candidate);
        }
    }
}

fn player_title(json: &serde_json::Value) -> Option<String> {
    json.pointer("/videoDetails/title")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

fn extract_audio_candidate_from_player(
    json: &serde_json::Value,
) -> Result<(AudioCandidate, Option<String>), String> {
    let mut best: Option<AudioCandidate> = None;

    if let Some(formats) = json
        .pointer("/streamingData/adaptiveFormats")
        .and_then(|f| f.as_array())
    {
        merge_best_audio_candidate(&mut best, best_audio_candidate_from_formats(formats, "mimeType"));
    }

    if let Some(formats) = json
        .pointer("/streamingData/formats")
        .and_then(|f| f.as_array())
    {
        merge_best_audio_candidate(&mut best, best_audio_candidate_from_formats(formats, "mimeType"));
    }

    if let Some(candidate) = best {
        return Ok((candidate, player_title(json)));
    }

    let status = json
        .pointer("/playabilityStatus/status")
        .and_then(|s| s.as_str())
        .unwrap_or("UNKNOWN");
    let reason = json
        .pointer("/playabilityStatus/reason")
        .and_then(|s| s.as_str())
        .unwrap_or("no playable audio streams");

    Err(format!("{} ({})", reason, status))
}

fn build_player_body(profile: InnertubeClientProfile, video_id: &str) -> serde_json::Value {
    let mut client = serde_json::json!({
        "clientName": profile.name,
        "clientVersion": profile.version,
        "userAgent": profile.user_agent,
        "hl": "en",
        "gl": "US",
        "clientScreen": "WATCH"
    });

    if let Some(sdk) = profile.android_sdk_version {
        client["androidSdkVersion"] = sdk.into();
    }
    if let Some(os_name) = profile.os_name {
        client["osName"] = os_name.into();
    }
    if let Some(os_version) = profile.os_version {
        client["osVersion"] = os_version.into();
    }
    if let Some(device_make) = profile.device_make {
        client["deviceMake"] = device_make.into();
    }
    if let Some(device_model) = profile.device_model {
        client["deviceModel"] = device_model.into();
    }

    let mut body = serde_json::json!({
        "context": {
            "client": client
        },
        "videoId": video_id,
        "playbackContext": {
            "contentPlaybackContext": {
                "html5Preference": "HTML5_PREF_WANTS"
            }
        },
        "contentCheckOk": true,
        "racyCheckOk": true
    });

    if let Some(embed_url) = profile.embed_url {
        body["context"]["thirdParty"] = serde_json::json!({
            "embedUrl": embed_url
        });
    }

    body
}

pub async fn yt_search(app: AppHandle, query: String) -> Result<Vec<YtSearchResult>, String> {
    match plugin_yt_search(&app, query.clone()).await {
        Ok(results) => return Ok(results),
        Err(plugin_err) => match native_yt_search(app, query).await {
            Ok(results) => Ok(results),
            Err(native_err) => Err(format!(
                "Android yt-dlp search failed: {}. Native fallback failed: {}",
                plugin_err, native_err
            )),
        },
    }
}

async fn native_yt_search(_app: AppHandle, query: String) -> Result<Vec<YtSearchResult>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Err("Empty search query".into());
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    // 1. First attempt: Direct YouTube Innertube search (official YouTube endpoint)
    let innertube_body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20240101.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "query": q,
        "params": "EgIQAQ%3D%3D"
    });

    if let Ok(resp) = client
        .post("https://www.youtube.com/youtubei/v1/search?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("Origin", "https://www.youtube.com")
        .json(&innertube_body)
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                let mut results = Vec::new();
                if let Some(sections) = json
                    .pointer("/contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/contents")
                    .and_then(|c| c.as_array())
                {
                    for section in sections {
                        if let Some(items) = section
                            .pointer("/itemSectionRenderer/contents")
                            .and_then(|i| i.as_array())
                        {
                            for item in items {
                                if let Some(video) = item.get("videoRenderer") {
                                    let id = video
                                        .get("videoId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    if id.is_empty() {
                                        continue;
                                    }

                                    let title = video
                                        .pointer("/title/runs/0/text")
                                        .or_else(|| video.pointer("/title/simpleText"))
                                        .and_then(|t| t.as_str())
                                        .unwrap_or("Untitled")
                                        .to_string();

                                    let uploader = video
                                        .pointer("/ownerText/runs/0/text")
                                        .or_else(|| video.pointer("/shortBylineText/runs/0/text"))
                                        .and_then(|u| u.as_str())
                                        .unwrap_or("Unknown Artist")
                                        .to_string();

                                    let duration_str = video
                                        .pointer("/lengthText/simpleText")
                                        .or_else(|| video.pointer("/lengthText/runs/0/text"))
                                        .and_then(|d| d.as_str());

                                    let duration = duration_str.and_then(parse_duration_str);

                                    results.push(YtSearchResult {
                                        id: id.clone(),
                                        title,
                                        uploader,
                                        duration,
                                        url: format!("https://www.youtube.com/watch?v={}", id),
                                    });
                                }
                            }
                        }
                    }
                }

                if !results.is_empty() {
                    return Ok(results);
                }
            }
        }
    }

    // 2. Second attempt: Invidious instances fallback
    let encoded_q = urlencoding::encode(q);
    let mut last_err = String::new();

    for instance in INVIDIOUS_INSTANCES {
        let url = format!(
            "https://{}/api/v1/search?q={}&type=video",
            instance, encoded_q
        );

        let response = match client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("{} error: {}", instance, e);
                continue;
            }
        };

        if !response.status().is_success() {
            last_err = format!("{} returned status {}", instance, response.status());
            continue;
        }

        let text = match response.text().await {
            Ok(t) => t,
            Err(e) => {
                last_err = format!("{} read error: {}", instance, e);
                continue;
            }
        };

        let json: serde_json::Value = match serde_json::from_str(&text) {
            Ok(j) => j,
            Err(_) => {
                last_err = format!("{} json parse error. Possibly HTML/502?", instance);
                continue;
            }
        };

        let mut results = Vec::new();

        if let Some(items) = json.as_array() {
            for item in items.iter().take(30) {
                if let (Some(id), Some(title), Some(author)) = (
                    item.get("videoId").and_then(|u| u.as_str()),
                    item.get("title").and_then(|t| t.as_str()),
                    item.get("author").and_then(|a| a.as_str()),
                ) {
                    let duration = item.get("lengthSeconds").and_then(|l| l.as_f64());

                    results.push(YtSearchResult {
                        id: id.to_string(),
                        title: title.to_string(),
                        uploader: author.to_string(),
                        duration,
                        url: format!("https://www.youtube.com/watch?v={}", id),
                    });
                }
            }
        }

        if !results.is_empty() {
            return Ok(results);
        }
    }

    Err(format!("Search failed: {}", if last_err.is_empty() { "No results found".to_string() } else { last_err }))
}

async fn get_stream_url_innertube(
    client: &reqwest::Client,
    video_id: &str,
) -> Result<(String, String, Option<String>), String> {
    let mut failures = Vec::new();

    for profile in INNERTUBE_CLIENTS {
        let body = build_player_body(profile, video_id);

        let resp = client
            .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
            .header("Content-Type", "application/json")
            .header("User-Agent", profile.user_agent)
            .header("Origin", "https://www.youtube.com")
            .header("Referer", format!("https://www.youtube.com/watch?v={}", video_id))
            .header("X-YouTube-Client-Name", profile.client_id.to_string())
            .header("X-YouTube-Client-Version", profile.version)
            .header("Accept-Language", "en-US,en;q=0.9")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("{} request failed: {}", profile.label, e));

        let resp = match resp {
            Ok(resp) => resp,
            Err(err) => {
                failures.push(err);
                continue;
            }
        };

        if !resp.status().is_success() {
            failures.push(format!("{} returned status {}", profile.label, resp.status()));
            continue;
        }

        let json: serde_json::Value = match resp.json().await {
            Ok(json) => json,
            Err(err) => {
                failures.push(format!("{} player JSON error: {}", profile.label, err));
                continue;
            }
        };

        match extract_audio_candidate_from_player(&json) {
            Ok((candidate, title)) => return Ok((candidate.url, candidate.ext, title)),
            Err(err) => failures.push(format!("{} had no usable audio: {}", profile.label, err)),
        }
    }

    Err(failures.join(" | "))
}

async fn get_stream_url_invidious(
    client: &reqwest::Client,
    video_id: &str,
) -> Result<(String, String, Option<String>), String> {
    let mut failures = Vec::new();

    for inst in INVIDIOUS_INSTANCES {
        let url = format!("https://{}/api/v1/videos/{}", inst, video_id);
        let resp = match client.get(&url).send().await {
            Ok(resp) => resp,
            Err(err) => {
                failures.push(format!("{} request failed: {}", inst, err));
                continue;
            }
        };

        if !resp.status().is_success() {
            failures.push(format!("{} returned status {}", inst, resp.status()));
            continue;
        }

        let json = match resp.json::<serde_json::Value>().await {
            Ok(json) => json,
            Err(err) => {
                failures.push(format!("{} JSON error: {}", inst, err));
                continue;
            }
        };

        let title = json
            .get("title")
            .and_then(|t| t.as_str())
            .map(|s| s.to_string());

        let mut best: Option<AudioCandidate> = None;
        if let Some(formats) = json.get("adaptiveFormats").and_then(|a| a.as_array()) {
            merge_best_audio_candidate(&mut best, best_audio_candidate_from_formats(formats, "type"));
        }
        if let Some(formats) = json.get("formatStreams").and_then(|a| a.as_array()) {
            merge_best_audio_candidate(&mut best, best_audio_candidate_from_formats(formats, "type"));
        }

        if let Some(candidate) = best {
            return Ok((candidate.url, candidate.ext, title));
        }

        failures.push(format!("{} had no usable audio streams", inst));
    }

    Err(failures.join(" | "))
}

pub async fn yt_download(
    app: AppHandle,
    url: String,
    output_dir: String,
    job_id: String,
    title: Option<String>,
    artist: Option<String>,
    cover_url: Option<String>,
) -> Result<String, String> {
    let _ = app.emit(
        "yt-download-progress",
        serde_json::json!({
            "job_id": job_id,
            "percent": 5.0,
            "status": "downloading",
            "message": "Running yt-dlp...",
        }),
    );

    match plugin_yt_download(
        &app,
        url.clone(),
        output_dir.clone(),
        job_id.clone(),
        title.clone(),
        artist.clone(),
        cover_url.clone(),
    )
    .await
    {
        Ok(path) => {
            let _ = app.emit(
                "yt-download-progress",
                serde_json::json!({
                    "job_id": job_id,
                    "percent": 100.0,
                    "status": "done",
                    "message": path.clone(),
                }),
            );
            Ok(path)
        }
        Err(plugin_err) => native_yt_download(app, url, output_dir, job_id, title, artist, cover_url)
            .await
            .map_err(|native_err| {
                format!(
                    "Android yt-dlp download failed: {}. Native fallback failed: {}",
                    plugin_err, native_err
                )
            }),
    }
}

async fn native_yt_download(
    app: AppHandle,
    url: String,
    output_dir: String,
    job_id: String,
    title: Option<String>,
    _artist: Option<String>,
    _cover_url: Option<String>,
) -> Result<String, String> {
    let video_id = extract_video_id(&url).ok_or_else(|| format!("Invalid YouTube URL: {}", url))?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let _ = app.emit(
        "yt-download-progress",
        serde_json::json!({
            "job_id": job_id,
            "percent": 1.0,
            "status": "downloading",
            "message": "Resolving stream...",
        }),
    );

    let (stream_url, ext, resolved_title) = match get_stream_url_innertube(&client, &video_id).await {
        Ok(res) => res,
        Err(innertube_err) => get_stream_url_invidious(&client, &video_id).await
            .map_err(|invidious_err| {
                format!(
                    "Failed to resolve audio stream. Innertube: {}. Invidious: {}",
                    innertube_err, invidious_err
                )
            })?,
    };

    let track_title = title
        .or(resolved_title)
        .unwrap_or_else(|| format!("YouTube Track {}", video_id));

    let safe_title = track_title
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_")
        .trim()
        .to_string();

    let out_dir_path = std::path::Path::new(&output_dir);
    if !out_dir_path.exists() {
        std::fs::create_dir_all(out_dir_path).map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let output_path = out_dir_path.join(format!("{}.{}", safe_title, ext));

    let _ = app.emit(
        "yt-download-progress",
        serde_json::json!({
            "job_id": job_id,
            "percent": 5.0,
            "status": "downloading",
            "message": "Downloading audio...",
        }),
    );

    let response = client.get(&stream_url)
        .header("User-Agent", "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip")
        .send()
        .await
        .map_err(|e| format!("Stream connection error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Stream request returned status {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut file = std::fs::File::create(&output_path).map_err(|e| format!("File creation error: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Download chunk error: {}", e))?;
        file.write_all(&chunk).map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed().as_millis() > 250 {
            let pct = if total_size > 0 {
                (downloaded as f64 / total_size as f64) * 98.0
            } else {
                50.0
            };
            let _ = app.emit(
                "yt-download-progress",
                serde_json::json!({
                    "job_id": job_id,
                    "percent": pct,
                    "status": "downloading",
                    "message": format!("{:.1}%", pct),
                }),
            );
            last_emit = std::time::Instant::now();
        }
    }

    file.flush().map_err(|e| format!("File flush error: {}", e))?;

    let _ = app.emit(
        "yt-download-progress",
        serde_json::json!({
            "job_id": job_id,
            "percent": 100.0,
            "status": "done",
            "message": "Completed",
        }),
    );

    Ok(output_path.to_string_lossy().to_string())
}

pub fn yt_download_cancel(job_id: String) -> Result<(), String> {
    if let Some(handle) = ANDROID_YTDLP_HANDLE.get().cloned() {
        handle
            .run_mobile_plugin::<serde_json::Value>("cancel", AndroidCancelArgs { job_id })
            .map_err(|e| format!("Android yt-dlp cancel failed: {}", e))?;
    }
    Ok(())
}

pub async fn yt_dlp_update(app: AppHandle) -> Result<YtDlpStatus, String> {
    match plugin_yt_dlp_update(&app).await {
        Ok(status) => Ok(status),
        Err(plugin_err) => native_yt_dlp_update(app).await.map_err(|native_err| {
            format!(
                "Android yt-dlp update failed: {}. Native fallback failed: {}",
                plugin_err, native_err
            )
        }),
    }
}

async fn native_yt_dlp_update(_app: AppHandle) -> Result<YtDlpStatus, String> {
    Ok(YtDlpStatus {
        available: true,
        version: Some("native-android".to_string()),
        path: Some("native".to_string()),
        source: "bundled".to_string(),
        action: Some("up_to_date".to_string()),
        latest_version: Some("native-android".to_string()),
    })
}

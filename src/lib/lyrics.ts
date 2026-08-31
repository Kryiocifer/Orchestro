export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface LyricsData {
  id?: number | string;
  trackName: string;
  artistName: string;
  synced: boolean;
  lines: LyricLine[];
  plain?: string;
  source: "lrclib" | "musixmatch" | "youtube" | "jiosaavn" | "cached" | "none";
}

const lyricsCache = new Map<string, LyricsData | null>();
const OFFSET_STORAGE_KEY = "orchestro_lyrics_offsets";

/**
 * Get custom sync offset (in seconds) for a specific song (e.g. +2.5s for YouTube video intros)
 */
export function getLyricOffset(songId: string): number {
  try {
    const raw = localStorage.getItem(OFFSET_STORAGE_KEY);
    if (raw) {
      const offsets = JSON.parse(raw);
      if (typeof offsets[songId] === "number") {
        return offsets[songId];
      }
    }
  } catch (e) {
    console.error("Failed to load lyric offset:", e);
  }
  return 0;
}

/**
 * Save custom sync offset (in seconds) for a specific song
 */
export function saveLyricOffset(songId: string, offset: number) {
  try {
    const raw = localStorage.getItem(OFFSET_STORAGE_KEY);
    const offsets = raw ? JSON.parse(raw) : {};
    if (offset === 0) {
      delete offsets[songId];
    } else {
      offsets[songId] = Math.round(offset * 10) / 10;
    }
    localStorage.setItem(OFFSET_STORAGE_KEY, JSON.stringify(offsets));
  } catch (e) {
    console.error("Failed to save lyric offset:", e);
  }
}

/**
 * Clean artist and track title for better search matching
 * e.g., "Song Name (Official Music Video) [feat. Artist]" -> "Song Name"
 */
export function cleanTrackTitle(title: string): string {
  let cleaned = title
    .replace(/\s*\(official\s*(music\s*)?video\)/gi, "")
    .replace(/\s*\[official\s*(music\s*)?video\]/gi, "")
    .replace(/\s*\(official\s*audio\)/gi, "")
    .replace(/\s*\[official\s*audio\]/gi, "")
    .replace(/\s*\(lyrics?\)/gi, "")
    .replace(/\s*\[lyrics?\]/gi, "")
    .replace(/\s*\(visualizer\)/gi, "")
    .replace(/\s*\[visualizer\]/gi, "")
    .replace(/\s*\(feat\..*?\)/gi, "")
    .replace(/\s*\[feat\..*?\]/gi, "")
    .replace(/\s*\(ft\..*?\)/gi, "")
    .replace(/\s*\[ft\..*?\]/gi, "")
    .replace(/\s*\(prod\..*?\)/gi, "")
    .replace(/\s*\(remastered.*?\)/gi, "")
    .replace(/\s*-\s*remastered.*?$/gi, "")
    .replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, "")
    .replace(/\s*\[[a-zA-Z0-9_-]{11}\]/g, ""); // Strip trailing YouTube ID

  // Strip common YouTube fluff
  cleaned = cleaned.replace(/\s*official\s*full\s*video\s*song\s*/gi, " ");
  cleaned = cleaned.replace(/\s*official\s*video\s*song\s*/gi, " ");
  cleaned = cleaned.replace(/\s*full\s*video\s*song\s*/gi, " ");
  cleaned = cleaned.replace(/\s*4k\s*video\s*song\s*/gi, " ");
  cleaned = cleaned.replace(/\s*video\s*song\s*/gi, " ");
  cleaned = cleaned.replace(/\s*full\s*video\s*/gi, " ");
  cleaned = cleaned.replace(/\s*lyrical\s*video\s*/gi, " ");
  cleaned = cleaned.replace(/\s*lyrical\s*song\s*/gi, " ");
  cleaned = cleaned.replace(/\s*official\s*video\s*/gi, " ");

  // Remove standalone "Song" or "Video"
  cleaned = cleaned.replace(/\bvideo\b/gi, "");
  cleaned = cleaned.replace(/\bsong\b/gi, "");
  cleaned = cleaned.replace(/\bsongs\b/gi, "");

  // Remove leading channel/artist tags like "@SaiAbhyankkar - "
  cleaned = cleaned.replace(/^@[\w\s]+\s*-\s*/, "");

  // Replace standard and fullwidth yt-dlp pipes with a space
  cleaned = cleaned.replace(/\||｜/g, " ");

  // Condense extra spaces and hyphens
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  cleaned = cleaned.replace(/\s+-\s+/g, " ");
  
  return cleaned.trim();
}

export function cleanArtistName(artist: string): string {
  if (!artist || artist.toLowerCase() === "unknown" || artist.toLowerCase() === "unknown artist") {
    return "";
  }
  return artist
    .replace(/\s*-\s*topic$/i, "")
    .replace(/,\s*feat\..*$/i, "")
    .replace(/,\s*ft\..*$/i, "")
    .trim();
}

/**
 * Parse standard LRC format:
 * [00:12.34] lyric line here
 * [01:23.456] another line
 */
export function parseLRC(lrcText: string): LyricLine[] {
  const lines = lrcText.split("\n");
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const line of lines) {
    const text = line.replace(timeRegex, "").trim();
    if (!text && line.trim().startsWith("[")) continue; // ignore metadata tags like [ti:Title]

    let match: RegExpExecArray | null;
    timeRegex.lastIndex = 0;
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millisStr = match[3] || "0";
      const millis = parseInt(millisStr.padEnd(3, "0").slice(0, 3), 10);
      const timeInSec = minutes * 60 + seconds + millis / 1000;

      if (text) {
        result.push({ time: timeInSec, text });
      }
    }
  }

  // Sort chronologically
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Unofficial Musixmatch API Fallback
 */
async function fetchMusixmatchLyrics(title: string, artist: string): Promise<LyricsData | null> {
  try {
    const cleanTitle = cleanTrackTitle(title);
    const cleanArtist = cleanArtistName(artist);

    // 1. Get or generate token
    let token = localStorage.getItem("mxm_token");
    if (!token) {
      const tokenRes = await fetch("https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0");
      if (tokenRes.ok) {
        const tokenJson = await tokenRes.json();
        const newToken = tokenJson.message?.body?.user_token;
        if (newToken && tokenJson.message?.header?.status_code === 200) {
          token = newToken;
          localStorage.setItem("mxm_token", newToken);
        }
      }
    }

    if (!token) return null;

    // 2. Fetch lyrics using token
    const url = `https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&q_track=${encodeURIComponent(cleanTitle)}&q_artist=${encodeURIComponent(cleanArtist)}&user_token=${token}&app_id=web-desktop-app-v1.0`;
    
    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    if (json.message?.header?.status_code === 401) {
      // Token expired or invalid, clear it
      localStorage.removeItem("mxm_token");
      return null;
    }

    const macroBody = json.message?.body?.macro_calls;
    if (!macroBody) return null;

    const subtitles = macroBody["track.subtitles.get"]?.message?.body?.subtitle_list;
    const plain = macroBody["track.lyrics.get"]?.message?.body?.lyrics?.lyrics_body;
    const track = macroBody["matcher.track.get"]?.message?.body?.track;

    if (subtitles && subtitles.length > 0) {
      const subtitleText = subtitles[0].subtitle.subtitle_body;
      if (subtitleText) {
        return {
          id: track?.track_id || "mxm",
          trackName: track?.track_name || cleanTitle,
          artistName: track?.artist_name || cleanArtist,
          synced: true,
          lines: parseLRC(subtitleText),
          plain: plain || undefined,
          source: "musixmatch",
        };
      }
    } else if (plain) {
      return {
        id: track?.track_id || "mxm",
        trackName: track?.track_name || cleanTitle,
        artistName: track?.artist_name || cleanArtist,
        synced: false,
        lines: [],
        plain: plain,
        source: "musixmatch",
      };
    }
  } catch (err) {
    console.warn("Musixmatch fallback failed:", err);
  }
  return null;
}

/**
 * Unofficial YouTube Music API Fallback
 */
async function fetchYouTubeMusicLyrics(title: string, artist: string): Promise<LyricsData | null> {
  try {
    const cleanTitle = cleanTrackTitle(title);
    const cleanArtist = cleanArtistName(artist);
    const query = `${cleanTitle} ${cleanArtist}`.trim();

    const clientCtx = { context: { client: { clientName: "WEB_REMIX", clientVersion: "1.20230522.01.00" } } };
    // Required headers to avoid CORS rejection in WebKit-based WebViews (Tauri)
    const ytmHeaders = {
      "Content-Type": "application/json",
      "Origin": "https://music.youtube.com",
      "Referer": "https://music.youtube.com/",
      "X-YouTube-Client-Name": "67",
      "X-YouTube-Client-Version": "1.20230522.01.00",
    };

    // 1. Search for songs
    const sRes = await fetch("https://music.youtube.com/youtubei/v1/search", {
      method: "POST",
      headers: ytmHeaders,
      body: JSON.stringify({
        ...clientCtx,
        query: query,
        params: "EgWKAQIIAWoKEAkQChAFEAMQBA==" // Filter for Songs
      })
    });
    if (!sRes.ok) return null;
    const sJson = await sRes.json();
    const results = sJson.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer?.contents;
    if (!results || results.length === 0) return null;
    const videoId = results[0]?.musicResponsiveListItemRenderer?.playlistItemData?.videoId;
    if (!videoId) return null;

    // 2. Next endpoint
    const nRes = await fetch("https://music.youtube.com/youtubei/v1/next", {
      method: "POST",
      headers: ytmHeaders,
      body: JSON.stringify({
        ...clientCtx,
        videoId: videoId
      })
    });
    if (!nRes.ok) return null;
    const nJson = await nRes.json();
    const tabs = nJson.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
    if (!tabs) return null;
    const lyricsTab = tabs.find((t: any) => t.tabRenderer?.title === "Lyrics")?.tabRenderer;
    if (!lyricsTab || !lyricsTab.endpoint) return null;
    const browseId = lyricsTab.endpoint.browseEndpoint?.browseId;
    if (!browseId) return null;

    // 3. Browse Lyrics
    const bRes = await fetch("https://music.youtube.com/youtubei/v1/browse", {
      method: "POST",
      headers: ytmHeaders,
      body: JSON.stringify({
        ...clientCtx,
        browseId: browseId
      })
    });
    if (!bRes.ok) return null;
    const bJson = await bRes.json();
    const lyrics = bJson.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer?.description?.runs?.[0]?.text;
    if (!lyrics) return null;

    return {
      id: videoId,
      trackName: cleanTitle,
      artistName: cleanArtist,
      synced: false,
      lines: [],
      plain: lyrics,
      source: "youtube",
    };
  } catch (err) {
    console.warn("YouTube Music lyrics fallback failed:", err);
  }
  return null;
}

/**
 * Fallback to Unofficial JioSaavn API for Indian songs
 */
async function fetchJioSaavnLyrics(title: string, artist: string): Promise<LyricsData | null> {
  try {
    const cleanTitle = cleanTrackTitle(title);
    const cleanArtist = cleanArtistName(artist);
    const query = encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim());

    const searchUrl = `https://saavn.dev/api/search/songs?query=${query}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    
    const searchData = await searchRes.json();
    if (!searchData?.success || !searchData?.data?.results?.length) return null;

    const song = searchData.data.results.find((r: any) => r.hasLyrics) || searchData.data.results[0];
    if (!song || !song.id) return null;

    const lyricsUrl = `https://saavn.dev/api/songs/${song.id}/lyrics`;
    const lyricsRes = await fetch(lyricsUrl);
    if (!lyricsRes.ok) return null;
    
    const lyricsData = await lyricsRes.json();
    if (!lyricsData?.success || !lyricsData?.data?.lyrics) return null;

    let plainLyrics = lyricsData.data.lyrics;
    plainLyrics = plainLyrics.replace(/<br\s*\/?>/gi, '\n');
    plainLyrics = plainLyrics.replace(/<[^>]*>?/gm, '');

    return {
      id: song.id,
      trackName: song.name || cleanTitle,
      artistName: song.primaryArtists || cleanArtist,
      synced: false,
      lines: [],
      plain: plainLyrics,
      source: "jiosaavn",
    };
  } catch (err) {
    console.warn("JioSaavn lyrics fallback failed:", err);
    return null;
  }
}

/**
 * Fetch lyrics from LRCLIB (free public API)
 */
export async function fetchLyrics(
  title: string,
  artist: string,
  duration?: number
): Promise<LyricsData | null> {
  const cleanTitle = cleanTrackTitle(title);
  const cleanArtist = cleanArtistName(artist);
  const cacheKey = `${cleanArtist.toLowerCase()}:::${cleanTitle.toLowerCase()}`;

  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) || null;
  }

  try {
    // 1. Direct match endpoint
    let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}`;
    if (cleanArtist) {
      url += `&artist_name=${encodeURIComponent(cleanArtist)}`;
    }
    if (duration && duration > 0) {
      url += `&duration=${Math.round(duration)}`;
    }

    const res = await fetch(url, { headers: { "Lrclib-Client": "Orchestro (https://github.com/Kryiocifer/Orchestro)" } });

    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics) {
        const parsed: LyricsData = {
          id: data.id,
          trackName: data.trackName,
          artistName: data.artistName,
          synced: true,
          lines: parseLRC(data.syncedLyrics),
          plain: data.plainLyrics || undefined,
          source: "lrclib",
        };
        lyricsCache.set(cacheKey, parsed);
        return parsed;
      } else if (data.plainLyrics) {
        const parsed: LyricsData = {
          id: data.id,
          trackName: data.trackName,
          artistName: data.artistName,
          synced: false,
          lines: [],
          plain: data.plainLyrics,
          source: "lrclib",
        };
        lyricsCache.set(cacheKey, parsed);
        return parsed;
      }
    }

    // 2. Search fallback
    const searchQuery = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`;
    const searchRes = await fetch(searchUrl, { headers: { "Lrclib-Client": "Orchestro (https://github.com/Kryiocifer/Orchestro)" } });

    if (searchRes.ok) {
      const results = await searchRes.json();
      if (Array.isArray(results) && results.length > 0) {
        // Find best candidate with synced lyrics first
        const best = results.find((r: any) => r.syncedLyrics) || results[0];
        if (best.syncedLyrics) {
          const parsed: LyricsData = {
            id: best.id,
            trackName: best.trackName,
            artistName: best.artistName,
            synced: true,
            lines: parseLRC(best.syncedLyrics),
            plain: best.plainLyrics || undefined,
            source: "lrclib",
          };
          lyricsCache.set(cacheKey, parsed);
          return parsed;
        } else if (best.plainLyrics) {
          const parsed: LyricsData = {
            id: best.id,
            trackName: best.trackName,
            artistName: best.artistName,
            synced: false,
            lines: [],
            plain: best.plainLyrics,
            source: "lrclib",
          };
          lyricsCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    }
    // 3. Unofficial Musixmatch Fallback
    try {
      const mxmData = await fetchMusixmatchLyrics(title, artist);
      if (mxmData) {
        lyricsCache.set(cacheKey, mxmData);
        return mxmData;
      }
    } catch (err) {
      console.warn("Musixmatch fallback failed", err);
    }

    // 4. Unofficial YouTube Music Fallback
    try {
      const ytData = await fetchYouTubeMusicLyrics(title, artist);
      if (ytData) {
        lyricsCache.set(cacheKey, ytData);
        return ytData;
      }
    } catch (err) {
      console.warn("YouTube Music fallback failed", err);
    }

    // 5. Unofficial JioSaavn Fallback for Indian Songs
    try {
      const jioData = await fetchJioSaavnLyrics(title, artist);
      if (jioData) {
        lyricsCache.set(cacheKey, jioData);
        return jioData;
      }
    } catch (err) {
      console.warn("JioSaavn fallback failed", err);
    }
  } catch (err) {
    console.warn("Failed to fetch lyrics:", err);
  }

  lyricsCache.set(cacheKey, null);
  return null;
}

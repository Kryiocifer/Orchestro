export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface LyricsData {
  id?: number;
  trackName: string;
  artistName: string;
  synced: boolean;
  lines: LyricLine[];
  plain?: string;
  source: "lrclib" | "cached" | "none";
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
  return title
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
    .trim();
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
  } catch (err) {
    console.warn("Failed to fetch lyrics:", err);
  }

  lyricsCache.set(cacheKey, null);
  return null;
}

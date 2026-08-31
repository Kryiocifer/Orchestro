/**
 * Batch Metadata Enrichment
 * Queries iTunes Search API to find correct title/artist/album/art for a song,
 * then writes the result to the MP3 ID3 tags on disk via Tauri.
 */
import { invoke } from "@tauri-apps/api/core";
import { Song } from "./types";

export interface EnrichmentResult {
  songId: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  newPath?: string;
  status: "updated" | "skipped" | "no_match" | "error";
  reason?: string;
}

/**
 * Returns true if the song likely needs enrichment.
 */
function needsEnrichment(song: Song): boolean {
  const t = song.title;
  if (/\||｜/.test(t)) return true;
  if (/official.*(video|audio)|video song|lyrical|full video/i.test(t)) return true;
  if (/\[[a-zA-Z0-9_-]{11}\]/.test(t)) return true;
  if (!song.artist || /^unknown\s*artist$/i.test(song.artist.trim())) return true;
  return false;
}

/**
 * Extracts the song name and artist name from a yt-dlp-style filename.
 */
function extractMetadata(rawTitle: string): { songName: string; artistName: string } {
  let title = rawTitle
    .replace(/\s*\[[a-zA-Z0-9_-]{11}\]/g, "")
    .replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, "")
    .replace(/^@[\w\s.]+\s*-\s*/i, "")
    .trim();

  // Strip parenthetical fluff FIRST so it doesn't mess up later parsing
  title = title
    .replace(/\(.*?(official|lyric|audio|video|live|amv|slowed|sped|visualizer).*?\)/gi, "")
    .replace(/\[.*?(official|lyric|audio|video|live|amv|slowed|sped|visualizer).*?\]/gi, "");

  let songPart = "";
  let artistPart = "";

  // Indian/yt-dlp pipe format
  if (/\||｜/.test(title)) {
    const parts = title.split(/\||｜/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const p0Lower = parts[0].toLowerCase();
      if (/\bsongs?\b|\balbum\b|\bjukebox\b/i.test(p0Lower)) {
        songPart = parts[1];
      } else {
        const cleaned0 = stripYtFluff(parts[0]);
        if (cleaned0.length > 0) {
          songPart = cleaned0;
          artistPart = parts[1];
        } else {
          songPart = parts[1];
        }
      }
    } else {
      songPart = stripYtFluff(title);
    }

    songPart = stripYtFluff(songPart).trim();

    if (songPart.includes(" - ")) {
      const dashParts = songPart.split(" - ");
      const leftWords = dashParts[0].trim().split(/\s+/).length;
      if (leftWords === 1 && dashParts[1]?.trim()) {
        artistPart = dashParts[0].trim();
        songPart = dashParts[1].trim();
      }
    }
  } else if (title.includes(" - ")) {
    // Western Format: "Artist - Song" or "Song - Artist"
    const dashIdx = title.indexOf(" - ");
    const left = title.substring(0, dashIdx).trim();
    let right = title.substring(dashIdx + 3).trim();

    // Specific check for "Song - Artist" if right side is clearly the artist
    if (/Cigarettes After Sex/i.test(right)) {
      songPart = stripYtFluff(left);
      artistPart = "Cigarettes After Sex";
    } else {
      // Default to right side being the song
      artistPart = left;
      right = right.replace(/\s*-[^-]*(official|lyric|audio|video|live|visualizer)[^-]*-?\s*/gi, "").trim();
      right = stripYtFluff(right);
      right = right.replace(/\s*(official|lyric|video|audio|visualizer)\s*$/gi, "");
      songPart = right || stripYtFluff(title);
    }
  } else {
    // Fallback
    songPart = stripYtFluff(title);
  }

  // Final cleanup for random quotes, trailing underscores (e.g., _I can't move on_), or features
  songPart = songPart.replace(/_.*?_/g, "").replace(/".*?"/g, "").replace(/_.*$/, "").trim();
  songPart = stripYtFluff(songPart);

  return { songName: songPart, artistName: artistPart };
}

function stripYtFluff(s: string): string {
  return s
    .replace(/\s*\(.*?\)\s*/g, (match) => {
      if (/(official|lyric|audio|video|live|amv|slowed|sped|visualizer)/i.test(match)) return "";
      return match;
    })
    .replace(/\s*\[.*?\]\s*/g, (match) => {
      if (/(official|lyric|audio|video|live|amv|slowed|sped|visualizer)/i.test(match)) return "";
      return match;
    })
    .replace(/\s*official\s*full\s*video\s*song\s*/gi, "")
    .replace(/\s*official\s*video\s*song\s*/gi, "")
    .replace(/\s*full\s*video\s*song\s*/gi, "")
    .replace(/\s*4k\s*video\s*song\s*/gi, "")
    .replace(/\s*video\s*song\s*/gi, "")
    .replace(/\s*-\s*full\s*(video|audio)\s*/gi, "")
    .replace(/\s*-\s*(official\s*)?(video|audio|song|visualizer)\s*/gi, "")
    .replace(/\s*official\s*video\s*/gi, "")
    .replace(/\s*lyrics?\s*$/gi, "")
    .replace(/\s+song\s*$/gi, "")
    .replace(/\s+video\s*$/gi, "")
    .replace(/\s+audio\s*$/gi, "")
    .replace(/\s+visualizer\s*$/gi, "")
    .replace(/\s*(official|lyric|video|audio|visualizer)\s*$/gi, "")
    .replace(/\s*Norway Eurovision Winner.*$/gi, "")
    .replace(/\s*OFFICIAL FRIENDZONE ANTHEM.*$/gi, "")
    .replace(/\s*Best Part Slowed Reverb.*$/gi, "")
    .replace(/\s*-\s*gabinp.*$/gi, "")
    .replace(/\s*SuzumeTheme Song.*$/gi, "Suzume")
    .replace(/\s*\(?(feat\.|ft\.).*?\)?\s*/gi, "") // Remove features
    .trim();
}

/**
 * Simple token-overlap similarity score (0–1).
 */
function similarity(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tokB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  let matches = 0;
  for (const t of tokA) if (tokB.has(t)) matches++;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : matches / union;
}

/**
 * Enrich a single song via the iTunes Search API.
 */
export async function enrichSong(song: Song): Promise<EnrichmentResult> {
  if (!needsEnrichment(song)) {
    return {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      artworkUrl: "",
      status: "skipped",
      reason: "Already has clean metadata",
    };
  }

  try {
    const { songName, artistName } = extractMetadata(song.title);
    if (!songName) {
      return {
        songId: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        artworkUrl: "",
        status: "no_match",
        reason: "Could not extract song name from title",
      };
    }

    const query = artistName ? `${songName} ${artistName}` : songName;
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`
    );
    if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);

    const json = await res.json();
    const results: any[] = json.results ?? [];

    if (results.length === 0) {
      return {
        songId: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        artworkUrl: "",
        status: "no_match",
        reason: "Not found on iTunes",
      };
    }

    // Score by title similarity
    const scored = results
      .map((r) => ({ ...r, score: similarity(songName, r.trackName ?? "") }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];

    // Lower threshold now that queries are clean: 30% token overlap
    if (best.score < 0.3) {
      return {
        songId: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        artworkUrl: "",
        status: "no_match",
        reason: `Low confidence: "${best.trackName}" (score ${best.score.toFixed(2)})`,
      };
    }

    const artworkUrl = (best.artworkUrl100 ?? "").replace("100x100bb", "600x600bb");

    return {
      songId: song.id,
      title: best.trackName ?? songName,
      artist: best.artistName ?? song.artist,
      album: best.collectionName ?? song.album,
      artworkUrl,
      status: "updated",
    };
  } catch (err) {
    return {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      artworkUrl: "",
      status: "error",
      reason: String(err),
    };
  }
}

/**
 * Write the enrichment result permanently to the MP3's ID3 tags on disk,
 * and optionally rename the file to a clean format.
 */
export async function applyEnrichment(song: Song, result: EnrichmentResult): Promise<string | undefined> {
  if (result.status !== "updated") return undefined;

  // Generate safe filename (remove invalid chars for Windows/Mac/Linux)
  const safeArtist = result.artist.replace(/[<>:"/\\|?*]/g, "").trim();
  const safeTitle = result.title.replace(/[<>:"/\\|?*]/g, "").trim();
  const newFileName = `${safeArtist} - ${safeTitle}`;

  const newPath = await invoke<string>("write_song_tags", {
    path: song.path,
    title: result.title,
    artist: result.artist,
    album: result.album,
    coverUrl: result.artworkUrl || null,
    renameTo: newFileName,
  });

  return newPath;
}

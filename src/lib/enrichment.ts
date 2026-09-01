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
  status: "updated" | "cleaned" | "skipped" | "no_match" | "error";
  reason?: string;
}

/** Trailing yt-dlp / YouTube junk: [dQw4w9WgXcQ], [oidfgfoehfog], (abc_12-xy) */
const ID_CHUNK = String.raw`[a-zA-Z0-9_-]{6,16}`;
const TRAILING_ID_RE = new RegExp(String.raw`\s*[\[(]${ID_CHUNK}[\])]\s*$`, "g");
const ANY_ID_RE = new RegExp(String.raw`[\[(]${ID_CHUNK}[\])]`, "g");

/** Strip random bracket IDs from titles / filenames. Safe for RAM (string-only). */
export function stripJunkIds(raw: string): string {
  let s = (raw || "").trim();
  s = s.replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, "");
  for (let i = 0; i < 5; i++) {
    const next = s.replace(TRAILING_ID_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  // mid-string ids with no spaces (never strip "[Official Video]")
  s = s.replace(new RegExp(String.raw`\s*[\[(]${ID_CHUNK}[\])]\s*`, "g"), " ");
  return s.replace(/\s+/g, " ").trim();
}

function sourceText(song: Song): string {
  const fromFile = stripJunkIds(song.fileName || "");
  const fromTitle = stripJunkIds(song.title || "");
  // Prefer the longer cleaned string — filename often still has Artist - Title
  if (fromFile.length >= fromTitle.length && fromFile) return fromFile;
  return fromTitle || fromFile;
}

function hasJunkId(song: Song): boolean {
  ANY_ID_RE.lastIndex = 0;
  if (ANY_ID_RE.test(song.title || "")) return true;
  ANY_ID_RE.lastIndex = 0;
  return ANY_ID_RE.test(song.fileName || "");
}

/**
 * Returns true if the song likely needs enrichment.
 */
function needsEnrichment(song: Song): boolean {
  const t = `${song.title || ""} ${song.fileName || ""}`;
  if (hasJunkId(song)) return true;
  if (/\||｜/.test(t)) return true;
  if (/official.*(video|audio)|video song|lyrical|full video/i.test(t)) return true;
  if (!song.artist || /^unknown\s*artist$/i.test(song.artist.trim())) return true;
  return false;
}

/**
 * Extracts the song name and artist name from a yt-dlp-style filename.
 */
function extractMetadata(rawTitle: string): { songName: string; artistName: string } {
  let title = stripJunkIds(rawTitle)
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
    // Western: "Artist - Song" OR "Song - Artist" (OST dumps use the latter)
    const dashIdx = title.indexOf(" - ");
    const left = title.substring(0, dashIdx).trim();
    let right = title.substring(dashIdx + 3).trim();
    right = right
      .replace(/\s*-[^-]*(official|lyric|audio|video|live|visualizer)[^-]*-?\s*/gi, "")
      .trim();
    right = stripYtFluff(right);
    right = right.replace(/\s*(official|lyric|video|audio|visualizer)\s*$/gi, "");

    const leftWords = left.split(/\s+/).filter(Boolean).length;
    const numbered = /^\d{1,3}\.\s+/.test(left);
    const leftLooksLikeTitle =
      numbered ||
      /\(.*soundtrack.*\)/i.test(left) ||
      leftWords >= 4 ||
      left.length > right.length + 8;

    if (leftLooksLikeTitle) {
      songPart = stripYtFluff(left.replace(/^\d{1,3}\.\s+/, ""));
      artistPart = right;
    } else {
      artistPart = left;
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
    const cleanedSource = sourceText(song);
    const { songName, artistName } = extractMetadata(cleanedSource);
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

    const query = artistName ? `${artistName} ${songName}` : songName;
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`
    );
    if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);

    const json = await res.json();
    const results: any[] = json.results ?? [];
    // Drop the rest of the payload immediately — keep 5 small objects max
    json.results = undefined;

    const cleanedFallback = (): EnrichmentResult => ({
      songId: song.id,
      // Keep the original name minus [id] only — do not rebuild from parsed parts
      title: cleanedSource || songName,
      artist: artistName || (song.artist !== "Unknown Artist" ? song.artist : "Unknown Artist"),
      album: song.album,
      artworkUrl: "",
      status: "cleaned",
      reason: "Stripped junk id; iTunes had no confident match",
    });

    if (results.length === 0) {
      return hasJunkId(song) || cleanedSource !== (song.title || "")
        ? cleanedFallback()
        : {
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
      .map((r) => ({
        trackName: r.trackName as string | undefined,
        artistName: r.artistName as string | undefined,
        collectionName: r.collectionName as string | undefined,
        artworkUrl100: r.artworkUrl100 as string | undefined,
        score: similarity(songName, r.trackName ?? ""),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];

    // Lower threshold now that queries are clean: 30% token overlap
    if (best.score < 0.3) {
      return hasJunkId(song) ? cleanedFallback() : {
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
      artist: best.artistName ?? artistName ?? song.artist,
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
  if (result.status !== "updated" && result.status !== "cleaned") return undefined;

  // Generate safe filename (remove invalid chars for Windows/Mac/Linux)
  const safeArtist = (result.artist || "Unknown Artist").replace(/[<>:"/\\|?*]/g, "").trim();
  const safeTitle = result.title.replace(/[<>:"/\\|?*]/g, "").trim();
  // cleaned = original filename minus [id] only (title already holds that full string)
  const newFileName =
    result.status === "cleaned"
      ? safeTitle
      : safeArtist && safeArtist !== "Unknown Artist"
      ? `${safeArtist} - ${safeTitle}`
      : safeTitle;

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

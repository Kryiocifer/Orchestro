/**
 * Metadata module: fetches cover art from external APIs.
 * Priority: iTunes Search API (free) → Last.fm (optional, requires API key)
 */

import { cleanTrackTitle, cleanArtistName } from "./lyrics";

const coverCache = new Map<string, string | null>();

async function fetchItunesCoverArt(title: string, artist: string): Promise<string | null> {
  try {
    const query = [title, artist].filter(Boolean).join(" ");
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const results: any[] = json.results ?? [];
    if (results.length === 0) return null;
    const lower = title.toLowerCase();
    const best = results.find((r) => r.trackName?.toLowerCase().includes(lower)) ?? results[0];
    const art100: string = best.artworkUrl100 ?? "";
    if (!art100) return null;
    return art100.replace("100x100bb", "600x600bb");
  } catch {
    return null;
  }
}

async function fetchLastFmCoverArt(title: string, artist: string, apiKey: string): Promise<string | null> {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${encodeURIComponent(apiKey)}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Orchestro/0.1.0 (https://github.com/Kryiocifer/Orchestro)" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const images: { "#text": string; size: string }[] = json.track?.album?.image ?? [];
    const priority = ["extralarge", "large", "medium", "small"];
    for (const size of priority) {
      const img = images.find((i) => i.size === size);
      if (img?.["#text"] && !img["#text"].includes("2a96cbd8b46e442fc41c2b86b821562f")) {
        return img["#text"];
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch the best available remote cover art for a song.
 * Results are cached in-memory for the session.
 */
export async function fetchRemoteCoverArt(
  title: string,
  artist: string,
  lastFmApiKey?: string | null
): Promise<string | null> {
  const cleanTitle = cleanTrackTitle(title);
  const cleanArtist = cleanArtistName(artist);
  const cacheKey = `${cleanArtist.toLowerCase()}:::${cleanTitle.toLowerCase()}`;

  if (coverCache.has(cacheKey)) {
    return coverCache.get(cacheKey) ?? null;
  }

  const itunes = await fetchItunesCoverArt(cleanTitle, cleanArtist);
  if (itunes) {
    coverCache.set(cacheKey, itunes);
    return itunes;
  }

  if (lastFmApiKey) {
    const lastfm = await fetchLastFmCoverArt(cleanTitle, cleanArtist, lastFmApiKey);
    if (lastfm) {
      coverCache.set(cacheKey, lastfm);
      return lastfm;
    }
  }

  coverCache.set(cacheKey, null);
  return null;
}

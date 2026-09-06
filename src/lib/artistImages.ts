import { invoke } from "@tauri-apps/api/core";

const CACHE_KEY = "orchestro_artist_images_v3";

interface CacheData {
  [artistName: string]: string | null;
}

function getCache(): CacheData {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(data: CacheData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save artist image cache", e);
  }
}

/**
 * Fetches an artist's profile picture from Deezer.
 * Caches results in localStorage to prevent redundant network requests.
 * Returns null if the artist isn't found or network fails.
 */
export async function getArtistImage(artistName: string): Promise<string | null> {
  const cache = getCache();
  
  // If we already tried fetching this artist (even if it failed and is null), return it
  if (artistName in cache) {
    return cache[artistName];
  }

  try {
    const picture = await invoke<string | null>("fetch_artist_image", { artistName });
    
    if (picture) {
      cache[artistName] = picture;
      saveCache(cache);
      return picture;
    }
    
    // If not found, cache null so we don't try again
    cache[artistName] = null;
    saveCache(cache);
    return null;
  } catch (err) {
    console.error(`Failed to fetch artist image for ${artistName}:`, err);
    return null;
  }
}

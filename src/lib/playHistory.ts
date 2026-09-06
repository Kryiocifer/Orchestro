import { Song } from "./types";

const KEY = "orchestro_play_history";

export function recordPlay(songId: string): void {
  try {
    const raw = localStorage.getItem(KEY);
    const history: Record<string, number> = raw ? JSON.parse(raw) : {};
    
    // Update the song's last played time to now
    history[songId] = Date.now();
    
    // Optional: Prune if it gets too large (e.g., keep only latest 100)
    const entries = Object.entries(history);
    if (entries.length > 100) {
      entries.sort((a, b) => b[1] - a[1]); // Descending by timestamp
      const pruned = Object.fromEntries(entries.slice(0, 100));
      localStorage.setItem(KEY, JSON.stringify(pruned));
    } else {
      localStorage.setItem(KEY, JSON.stringify(history));
    }
  } catch (e) {
    console.error("Failed to save play history", e);
  }
}

export function getPlayHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Failed to read play history", e);
    return {};
  }
}

export function getRecentlyPlayed(songs: Song[], limit: number = 10): Song[] {
  const history = getPlayHistory();
  if (Object.keys(history).length === 0) return [];

  // Create a fast lookup map
  const songMap = new Map(songs.map((s) => [s.id, s]));

  // Get all song IDs that have a play history, sort by most recently played
  const sortedIds = Object.entries(history)
    .sort((a, b) => b[1] - a[1]) // Descending timestamp
    .map(([id]) => id);

  // Map to songs, filtering out any that no longer exist in the library
  const result: Song[] = [];
  for (const id of sortedIds) {
    const song = songMap.get(id);
    if (song) {
      result.push(song);
      if (result.length >= limit) break;
    }
  }

  return result;
}

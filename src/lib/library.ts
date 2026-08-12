import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join, dirname } from "@tauri-apps/api/path";
import {
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
  copyFile,
  readFile,
  remove,
  readDir,
} from "@tauri-apps/plugin-fs";
import { v4 as uuidv4 } from "uuid";
import { parseBuffer } from "music-metadata";
import { Song, Playlist, LibraryData } from "./types";
import { getPerfProfile } from "./performance";

const LIBRARY_FILE = "library.json";

const AUDIO_EXTENSIONS = new Set([
  "mp3", "flac", "wav", "ogg", "m4a", "aac", "wma", "opus", "aiff", "aif",
]);

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[_\-]+/g, " ");
}

function getExt(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function isAudioFileName(fileName: string): boolean {
  return AUDIO_EXTENSIONS.has(getExt(fileName));
}

async function getLibraryJsonPath(): Promise<string> {
  const dataDir = await appDataDir();
  return await join(dataDir, LIBRARY_FILE);
}

async function getSongsDir(): Promise<string> {
  const dataDir = await appDataDir();
  const songsDir = await join(dataDir, "library", "songs");
  if (!(await exists(songsDir))) {
    await mkdir(songsDir, { recursive: true });
  }
  return songsDir;
}

export async function loadLibrary(): Promise<LibraryData> {
  try {
    const path = await getLibraryJsonPath();
    if (!(await exists(path))) {
      const empty: LibraryData = { songs: [], playlists: [], musicFolder: null, downloadFolder: null, spotifyClientId: null, spotifyClientSecret: null };
      await saveLibrary(empty);
      return empty;
    }
    const content = await readTextFile(path);
    const data = JSON.parse(content) as LibraryData;

    const seen = new Set<string>();
    const uniqueSongs: Song[] = [];
    for (const song of data.songs || []) {
      const key = normalizeName(song.fileName || song.title || song.id);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueSongs.push(song);
    }

    if (uniqueSongs.length !== (data.songs || []).length) {
      data.songs = uniqueSongs;
      const validIds = new Set(uniqueSongs.map((s) => s.id));
      data.playlists = (data.playlists || []).map((p) => ({
        ...p,
        songIds: p.songIds.filter((id) => validIds.has(id)),
      }));
      await saveLibrary(data);
    }

    if (data.musicFolder === undefined) data.musicFolder = null;
    if (data.downloadFolder === undefined) data.downloadFolder = null;
    if (data.spotifyClientId === undefined) data.spotifyClientId = null;
    if (data.spotifyClientSecret === undefined) data.spotifyClientSecret = null;

    // Strip embedded covers — they explode RAM (hundreds of MB) and aren't needed for scan/list
    let stripped = false;
    for (const s of data.songs || []) {
      if (s.cover) {
        delete s.cover;
        stripped = true;
      }
    }
    if (stripped) {
      try {
        await saveLibrary(data);
      } catch {
        /* ignore */
      }
    }

    return data;
  } catch (err) {
    console.error("Failed to load library:", err);
    return { songs: [], playlists: [], musicFolder: null, downloadFolder: null, spotifyClientId: null, spotifyClientSecret: null };
  }
}

export async function saveLibrary(data: LibraryData): Promise<void> {
  try {
    // Never persist base64 covers
    const slim: LibraryData = {
      ...data,
      songs: (data.songs || []).map((s) => {
        if (!s.cover) return s;
        const { cover, ...rest } = s;
        return rest as typeof s;
      }),
    };
    const path = await getLibraryJsonPath();
    await writeTextFile(path, JSON.stringify(slim, null, 2));
  } catch (err) {
    console.error("Failed to save library:", err);
  }
}

async function extractMetadata(
  filePath: string,
  fileName: string,
  options?: { light?: boolean }
): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover?: string;
}> {
  const light = options?.light === true;
  const fallback = {
    title: fileName.replace(/\.[^/.]+$/, "") || "Unknown Title",
    artist: "Unknown Artist",
    album: "Unknown Album",
    duration: 0,
  };
  try {
    // CRITICAL: never read the whole audio file into JS memory
    const maxBytes = light ? 131_072 : 512_000; // 128KB light / 512KB normal
    let head: Uint8Array;
    try {
      const bytes = await invoke<number[]>("read_file_head", {
        path: filePath,
        maxBytes,
      });
      head = Uint8Array.from(bytes);
    } catch {
      // Fallback only if Rust command missing
      const uint8 = await readFile(filePath);
      head = uint8.byteLength > maxBytes ? uint8.slice(0, maxBytes) : uint8;
    }

    const metadata = await parseBuffer(head, undefined, {
      skipCovers: true,
      duration: !light,
    } as any);

    return {
      title:
        metadata.common.title ||
        fileName.replace(/\.[^/.]+$/, "") ||
        "Unknown Title",
      artist:
        metadata.common.artist ||
        metadata.common.artists?.[0] ||
        "Unknown Artist",
      album: metadata.common.album || "Unknown Album",
      duration: light ? 0 : metadata.format.duration || 0,
    };
  } catch {
    return fallback;
  }
}

/** Iterative walk — avoids stack overflow on deep folders */
async function collectAudioFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  const maxFiles = 5000; // safety cap

  while (stack.length > 0 && out.length < maxFiles) {
    const dir = stack.pop()!;
    try {
      const entries = await readDir(dir);
      for (const entry of entries) {
        const name = entry.name;
        if (!name || name.startsWith(".")) continue;
        const fullPath = await join(dir, name);
        if (entry.isDirectory) {
          stack.push(fullPath);
        } else if (entry.isFile && isAudioFileName(name)) {
          out.push(fullPath);
        }
      }
    } catch (err) {
      console.warn("Failed to read dir:", dir, err);
    }
  }
  return out;
}

export async function setMusicFolder(folderPath: string | null): Promise<LibraryData> {
  const library = await loadLibrary();
  library.musicFolder = folderPath;
  await saveLibrary(library);
  return library;
}


/** Songs that still need duration filled in */
export function songsNeedingDuration(songs: Song[]): Song[] {
  return songs.filter((s) => !s.duration || s.duration <= 0);
}

/**
 * One-shot sequential hydration: fill duration for songs that are still 0:00.
 * - Uses file HEAD only (no full-file reads)
 * - Processes one song at a time
 * - Skips any song that already has duration
 * - Stops when the list is exhausted (no loop)
 * - onProgress allows UI to update without waiting for full batch save
 */
export async function hydrateMissingDurations(
  songs: Song[],
  onProgress?: (updated: Song) => void,
  shouldCancel?: () => boolean
): Promise<{ updated: number; library: LibraryData }> {
  const library = await loadLibrary();
  const byId = new Map(library.songs.map((s) => [s.id, s]));
  let updated = 0;

  // Only candidates that still need duration in the LATEST library
  const queue = songs
    .map((s) => byId.get(s.id) || s)
    .filter((s) => s && (!s.duration || s.duration <= 0));

  for (let i = 0; i < queue.length; i++) {
    if (shouldCancel?.()) break;

    const song = queue[i];
    // Re-check — may have been filled by another path
    const current = byId.get(song.id);
    if (current && current.duration && current.duration > 0) continue;

    try {
      const meta = await extractMetadata(song.path, song.fileName || song.title, {
        light: false, // need duration; still head-only, no covers
      });
      if (meta.duration && meta.duration > 0) {
        const target = byId.get(song.id);
        if (target) {
          target.duration = meta.duration;
          // Prefer better title/artist if still generic
          if (meta.title && (!target.title || target.title === "Unknown Title")) {
            target.title = meta.title;
          }
          if (meta.artist && target.artist === "Unknown Artist") {
            target.artist = meta.artist;
          }
          if (meta.album && target.album === "Unknown Album") {
            target.album = meta.album;
          }
          updated++;
          onProgress?.({ ...target });
        }
      }
    } catch (err) {
      console.warn("Hydrate skip:", song.fileName, err);
    }

    // Small yield so UI stays responsive — not a tight CPU loop
    if (i % 2 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
    // Checkpoint every 20 updates
    if (updated > 0 && updated % 20 === 0) {
      library.songs = Array.from(byId.values());
      try {
        await saveLibrary(library);
      } catch (e) {
        console.warn("Hydrate checkpoint failed:", e);
      }
    }
  }

  library.songs = Array.from(byId.values());
  if (updated > 0) {
    try {
      await saveLibrary(library);
    } catch (e) {
      console.error("Hydrate save failed:", e);
    }
  }

  return { updated, library };
}

export async function setDownloadFolder(folderPath: string | null): Promise<LibraryData> {
  const library = await loadLibrary();
  library.downloadFolder = folderPath;
  await saveLibrary(library);
  return library;
}

/**
 * Scan the linked music folder (recursively) and add any new songs.
 * Does NOT remove songs that are no longer on disk (safer for now).
 */


/**
 * Full rescan of the linked music folder.
 * Folder on disk = source of truth.
 * - Every audio file is considered (not "already scanned, skip")
 * - Matching library entries keep their id (playlists stay valid)
 * - Moved files get updated paths
 * - Files no longer in the folder are removed from the library
 */
export async function scanMusicFolder(): Promise<{
  library: LibraryData;
  added: number;
  skipped: number;
  updated: number;
  removed: number;
}> {
  const library = await loadLibrary();
  if (!library.musicFolder) {
    return { library, added: 0, skipped: 0, updated: 0, removed: 0 };
  }

  const perf = getPerfProfile();
  console.log("Scan perf tier:", perf.tier);

  const folder = library.musicFolder;
  const folderKey = folder.replace(/\\/g, "/").toLowerCase();

  let paths: string[] = [];
  try {
    paths = await collectAudioFiles(folder);
  } catch (err) {
    console.error("Folder walk failed:", err);
    return { library, added: 0, skipped: 0, updated: 0, removed: 0 };
  }

  // Index existing songs for reuse (preserve ids for playlists)
  const byPath = new Map<string, Song>();
  const byName = new Map<string, Song>();
  for (const s of library.songs) {
    byPath.set(s.path.replace(/\\/g, "/").toLowerCase(), s);
    byName.set(normalizeName(s.fileName || s.title || ""), s);
  }

  const seenIds = new Set<string>();
  const newSongs: Song[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0; // unchanged path matches

  for (let i = 0; i < paths.length; i++) {
    const filePath = paths[i];
    try {
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      const norm = normalizeName(fileName);
      const pathKey = filePath.replace(/\\/g, "/").toLowerCase();

      const existing =
        byPath.get(pathKey) || byName.get(norm) || undefined;

      // Light metadata only during bulk scan (no covers — prevents crash on large folders)
      let meta: {
        title: string;
        artist: string;
        album: string;
        duration: number;
        cover?: string;
      } = {
        title: fileName.replace(/\.[^/.]+$/, "") || "Unknown Title",
        artist: "Unknown Artist",
        album: "Unknown Album",
        duration: 0,
      };
      try {
        meta = await extractMetadata(filePath, fileName, { light: true });
      } catch (metaErr) {
        console.warn("Metadata skip:", fileName, metaErr);
      }

      if (existing && !seenIds.has(existing.id)) {
        // Reuse id — update path + metadata from disk
        const pathChanged =
          existing.path.replace(/\\/g, "/").toLowerCase() !== pathKey;
        existing.path = filePath;
        existing.fileName = fileName;
        existing.title = meta.title || existing.title;
        existing.artist = meta.artist || existing.artist;
        existing.album = meta.album || existing.album;
        // Keep existing duration/cover if light scan didn't provide them
        if (meta.duration) existing.duration = meta.duration;
        // Never write covers during bulk scan (base64 blows RAM / crashes WebView)

        newSongs.push(existing);
        seenIds.add(existing.id);
        byPath.set(pathKey, existing);
        byName.set(norm, existing);

        if (pathChanged) updated++;
        else skipped++;
      } else if (!existing) {
        const song: Song = {
          id: uuidv4(),
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          duration: meta.duration,
          path: filePath,
          fileName,
          size: 0,
          addedAt: Date.now(),
        };
        newSongs.push(song);
        seenIds.add(song.id);
        byPath.set(pathKey, song);
        byName.set(norm, song);
        added++;
      }

      // Checkpoint so a crash doesn't lose the whole scan
      if ((added + updated) > 0 && (added + updated) % perf.scanCheckpointEvery === 0) {
        const checkpoint: LibraryData = {
          ...library,
          songs: [
            ...newSongs,
            // keep songs that are NOT under the music folder (manual adds elsewhere)
            ...library.songs.filter((s) => {
              if (seenIds.has(s.id)) return false;
              const p = s.path.replace(/\\/g, "/").toLowerCase();
              return !p.startsWith(folderKey);
            }),
          ],
        };
        try {
          await saveLibrary(checkpoint);
        } catch (e) {
          console.warn("Checkpoint save failed:", e);
        }
      }

      // Yield to UI / GC every few files so the WebView isn't killed as unresponsive
      if (i % perf.scanYieldEvery === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (err) {
      console.warn("Skip file during scan:", filePath, err);
    }
  }

  // Songs that lived under the music folder but are gone from disk → drop
  // Keep songs outside the music folder (e.g. one-off imports / app cache copies)
  const keptOutside = library.songs.filter((s) => {
    if (seenIds.has(s.id)) return false;
    const p = s.path.replace(/\\/g, "/").toLowerCase();
    return !p.startsWith(folderKey);
  });

  const removedSongs = library.songs.filter((s) => {
    if (seenIds.has(s.id)) return false;
    const p = s.path.replace(/\\/g, "/").toLowerCase();
    return p.startsWith(folderKey);
  });
  const removed = removedSongs.length;
  const removedIds = new Set(removedSongs.map((s) => s.id));

  library.songs = [...newSongs, ...keptOutside];
  library.playlists = library.playlists.map((p) => ({
    ...p,
    songIds: p.songIds.filter((id) => !removedIds.has(id)),
  }));

  try {
    await saveLibrary(library);
  } catch (err) {
    console.error("Final scan save failed:", err);
  }

  return { library, added, skipped, updated, removed };
}



/**
 * Background-friendly metadata fill-in (duration / title / artist).
 * Processes a few files at a time with head-only reads — no covers, no full-file loads.
 */
export async function enrichMissingMetadata(
  onUpdate?: (song: Song) => void,
  shouldCancel?: () => boolean
): Promise<number> {
  const library = await loadLibrary();
  const pending = library.songs.filter((s) => !s.duration || s.duration <= 0);
  if (pending.length === 0) return 0;

  const perf = getPerfProfile();
  let updated = 0;

  for (let i = 0; i < pending.length; i++) {
    if (shouldCancel?.()) break;
    const song = pending[i];
    try {
      // light:false → still head-only (512KB), skipCovers, but tries duration
      const meta = await extractMetadata(song.path, song.fileName, {
        light: false,
      });
      let changed = false;
      if (meta.duration && meta.duration > 0 && song.duration !== meta.duration) {
        song.duration = meta.duration;
        changed = true;
      }
      if (meta.title && meta.title !== "Unknown Title" && song.title !== meta.title) {
        song.title = meta.title;
        changed = true;
      }
      if (
        meta.artist &&
        meta.artist !== "Unknown Artist" &&
        song.artist !== meta.artist
      ) {
        song.artist = meta.artist;
        changed = true;
      }
      if (
        meta.album &&
        meta.album !== "Unknown Album" &&
        song.album !== meta.album
      ) {
        song.album = meta.album;
        changed = true;
      }
      if (changed) {
        // write back into library.songs
        const idx = library.songs.findIndex((s) => s.id === song.id);
        if (idx >= 0) library.songs[idx] = { ...song };
        updated++;
        onUpdate?.({ ...song });
      }
    } catch (err) {
      console.warn("Enrich skip:", song.fileName, err);
    }

    // Pause so UI stays smooth; denser pauses on low-end
    const pauseEvery = perf.tier === "low" ? 2 : perf.tier === "mid" ? 4 : 6;
    if (i % pauseEvery === 0) {
      await new Promise((r) => setTimeout(r, perf.tier === "low" ? 40 : 16));
    }
    // Periodic save
    if (updated > 0 && updated % 20 === 0) {
      try {
        await saveLibrary(library);
      } catch {
        /* ignore */
      }
    }
  }

  if (updated > 0) {
    try {
      await saveLibrary(library);
    } catch {
      /* ignore */
    }
  }
  return updated;
}


/** Drop library entries whose files no longer exist on disk */
export async function pruneMissingSongs(): Promise<{
  library: LibraryData;
  removed: number;
}> {
  const library = await loadLibrary();
  const kept: Song[] = [];
  let removed = 0;

  for (const song of library.songs) {
    try {
      if (song.path && (await exists(song.path))) {
        kept.push(song);
      } else {
        removed++;
      }
    } catch {
      removed++;
    }
  }

  if (removed === 0) {
    return { library, removed: 0 };
  }

  const idSet = new Set(kept.map((s) => s.id));
  library.songs = kept;
  library.playlists = library.playlists.map((p) => ({
    ...p,
    songIds: p.songIds.filter((id) => idSet.has(id)),
    updatedAt: Date.now(),
  }));
  await saveLibrary(library);
  return { library, removed };
}

export async function addSongFromPath(
  sourcePath: string,
  fileName: string,
  size: number
): Promise<{ song: Song | null; alreadyExists: boolean }> {
  const results = await addSongsBatch([{ sourcePath, fileName, size }]);
  return results[0];
}

export async function addSongsBatch(
  files: { sourcePath: string; fileName: string; size: number }[]
): Promise<{ song: Song | null; alreadyExists: boolean }[]> {
  const library = await loadLibrary();
  const results: { song: Song | null; alreadyExists: boolean }[] = [];
  const songsDir = await getSongsDir();

  const existingNames = new Set(
    library.songs.map((s) => normalizeName(s.fileName || s.title || ""))
  );
  const existingPaths = new Set(
    library.songs.map((s) => s.path.replace(/\\/g, "/").toLowerCase())
  );

  const seenInBatch = new Set<string>();
  const uniqueFiles: typeof files = [];
  for (const f of files) {
    const key =
      normalizeName(f.fileName) +
      "|" +
      f.sourcePath.replace(/\\/g, "/").toLowerCase();
    if (seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    uniqueFiles.push(f);
  }

  let changed = false;

  for (const file of uniqueFiles) {
    const norm = normalizeName(file.fileName);
    const srcKey = file.sourcePath.replace(/\\/g, "/").toLowerCase();

    if (existingNames.has(norm) || existingPaths.has(srcKey)) {
      results.push({ song: null, alreadyExists: true });
      continue;
    }

    // Prefer original path when file already lives in music/download folders
    // (avoids 2x storage). Only copy into app cache for one-off imports.
    let finalPath = file.sourcePath;
    const srcLower = file.sourcePath.replace(/\\/g, "/").toLowerCase();
    const musicRoot = (library.musicFolder || "").replace(/\\/g, "/").toLowerCase();
    const dlRoot = (library.downloadFolder || "").replace(/\\/g, "/").toLowerCase();
    const alreadyManaged =
      (musicRoot && srcLower.startsWith(musicRoot)) ||
      (dlRoot && srcLower.startsWith(dlRoot));

    if (!alreadyManaged) {
      const destPath = await join(songsDir, file.fileName);
      try {
        await copyFile(file.sourcePath, destPath);
        finalPath = destPath;
      } catch (err: unknown) {
        const msg = String((err as Error)?.message || err);
        if (
          msg.includes("being used by another process") ||
          msg.includes("os error 32")
        ) {
          console.warn("File locked, using original path:", file.fileName);
        } else {
          console.warn("Copy failed, using original path:", err);
        }
      }
    }

    const finalKey = finalPath.replace(/\\/g, "/").toLowerCase();
    if (existingPaths.has(finalKey)) {
      results.push({ song: null, alreadyExists: true });
      continue;
    }

    const meta = await extractMetadata(finalPath, file.fileName);

    const song: Song = {
      id: uuidv4(),
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      duration: meta.duration,
      path: finalPath,
      cover: meta.cover,
      fileName: file.fileName,
      size: file.size,
      addedAt: Date.now(),
    };

    library.songs.push(song);
    existingNames.add(norm);
    existingPaths.add(srcKey);
    existingPaths.add(finalKey);
    results.push({ song, alreadyExists: false });
    changed = true;
  }

  if (changed) await saveLibrary(library);
  return results;
}

export async function removeSong(songId: string): Promise<void> {
  await removeSongsBatch([songId]);
}

/** Bulk remove — one load, one save (fast for large selections) */
export async function removeSongsBatch(songIds: string[]): Promise<void> {
  if (songIds.length === 0) return;
  const idSet = new Set(songIds);
  const library = await loadLibrary();

  const toRemove = library.songs.filter((s) => idSet.has(s.id));

  // Best-effort delete only app-copied files (don't touch user's music folder)
  await Promise.all(
    toRemove.map(async (song) => {
      try {
        if (song.path.includes("library") && song.path.includes("songs")) {
          await remove(song.path);
        }
      } catch (err) {
        console.warn("Could not delete file from disk:", err);
      }
    })
  );

  library.songs = library.songs.filter((s) => !idSet.has(s.id));
  library.playlists = library.playlists.map((p) => ({
    ...p,
    songIds: p.songIds.filter((id) => !idSet.has(id)),
  }));
  await saveLibrary(library);
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const library = await loadLibrary();
  const playlist: Playlist = {
    id: uuidv4(),
    name,
    songIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  library.playlists.push(playlist);
  await saveLibrary(library);
  return playlist;
}

export async function updatePlaylist(playlist: Playlist): Promise<void> {
  const library = await loadLibrary();
  const index = library.playlists.findIndex((p) => p.id === playlist.id);
  if (index !== -1) {
    library.playlists[index] = { ...playlist, updatedAt: Date.now() };
    await saveLibrary(library);
  }
}

export async function deletePlaylist(id: string): Promise<void> {
  const library = await loadLibrary();
  library.playlists = library.playlists.filter((p) => p.id !== id);
  await saveLibrary(library);
}

export async function addSongToPlaylist(
  playlistId: string,
  songId: string
): Promise<void> {
  const library = await loadLibrary();
  const playlist = library.playlists.find((p) => p.id === playlistId);
  if (playlist && !playlist.songIds.includes(songId)) {
    playlist.songIds.push(songId);
    playlist.updatedAt = Date.now();
    await saveLibrary(library);
  }
}

export async function removeSongFromPlaylist(
  playlistId: string,
  songId: string
): Promise<void> {
  const library = await loadLibrary();
  const playlist = library.playlists.find((p) => p.id === playlistId);
  if (playlist) {
    playlist.songIds = playlist.songIds.filter((id) => id !== songId);
    playlist.updatedAt = Date.now();
    await saveLibrary(library);
  }
}

export async function reorderPlaylistSongs(
  playlistId: string,
  songIds: string[]
): Promise<void> {
  const library = await loadLibrary();
  const playlist = library.playlists.find((p) => p.id === playlistId);
  if (playlist) {
    playlist.songIds = songIds;
    playlist.updatedAt = Date.now();
    await saveLibrary(library);
  }
}


/** Strip extension, noise, and normalize for fuzzy matching */
function matchKey(input: string): string {
  let s = input.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* ignore */
  }
  s = s.replace(/^file:\/\/\//i, "").replace(/^file:\/\//i, "");
  s = s.split(/[/\\]/).pop() || s;
  s = s.replace(/\.(mp3|flac|wav|ogg|m4a|aac|wma|opus|aiff|aif)$/i, "");
  s = s.replace(/^\d{1,3}[\s.\-_]+/, "");
  s = s.replace(/\[.*?\]/g, " ");
  s = s.replace(/\(.*?official.*?\)/gi, " ");
  s = s.replace(/\(.*?lyric.*?\)/gi, " ");
  s = s.replace(/\(.*?audio.*?\)/gi, " ");
  s = s.replace(/\(.*?video.*?\)/gi, " ");
  s = s.replace(/\(\d+\)$/g, " ");
  s = s.replace(/[_\-]+/g, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

function findSongMatch(
  entry: string,
  byPath: Map<string, Song>,
  byFileName: Map<string, Song>,
  byMatchKey: Map<string, Song>,
  byTitleKey: Map<string, Song>
): Song | undefined {
  const pathKey = entry.replace(/\\/g, "/").toLowerCase();
  const fileName = (entry.split(/[/\\]/).pop() || entry).toLowerCase();
  const mk = matchKey(entry);

  // 1) full path
  if (byPath.has(pathKey)) return byPath.get(pathKey);

  // 2) filename with extension
  if (byFileName.has(fileName)) return byFileName.get(fileName);

  // 3) fuzzy stem of filename
  if (mk && byMatchKey.has(mk)) return byMatchKey.get(mk);

  // 4) fuzzy title
  if (mk && byTitleKey.has(mk)) return byTitleKey.get(mk);

  // 5) partial contains (min 70% length overlap)
  let best: Song | undefined;
  let bestScore = 0;
  if (mk && mk.length >= 4) {
    for (const [key, song] of byMatchKey) {
      if (!key || key.length < 4) continue;
      if (key.includes(mk) || mk.includes(key)) {
        const score =
          Math.min(key.length, mk.length) / Math.max(key.length, mk.length);
        if (score > bestScore) {
          bestScore = score;
          best = song;
        }
      }
    }
    // also try titles
    for (const [key, song] of byTitleKey) {
      if (!key || key.length < 4) continue;
      if (key.includes(mk) || mk.includes(key)) {
        const score =
          Math.min(key.length, mk.length) / Math.max(key.length, mk.length);
        if (score > bestScore) {
          bestScore = score;
          best = song;
        }
      }
    }
  }
  if (best && bestScore >= 0.65) return best;

  return undefined;
}

/**
 * Import an .m3u / .m3u8 playlist file.
 * Tolerant matching: path, filename, fuzzy stem, title, partial overlap.
 */
export async function importM3UPlaylist(
  m3uPath: string
): Promise<{
  playlist: Playlist | null;
  matched: number;
  total: number;
  unmatched: string[];
}> {
  const library = await loadLibrary();
  const content = await readTextFile(m3uPath);
  const m3uDir = await dirname(m3uPath);

  const lines = content.split(/\r?\n/);
  const entryPaths: string[] = [];

  for (const raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    try {
      if (line.toLowerCase().startsWith("file:")) {
        line = decodeURIComponent(
          line.replace(/^file:\/\/\//i, "").replace(/^file:\/\//i, "")
        );
      } else if (line.includes("%")) {
        line = decodeURIComponent(line);
      }
    } catch {
      /* keep original */
    }

    if (
      /^[a-zA-Z]:[\\/]/.test(line) ||
      line.startsWith("/") ||
      line.startsWith("\\\\")
    ) {
      entryPaths.push(line);
    } else {
      entryPaths.push(await join(m3uDir, line));
    }
  }

  const byPath = new Map<string, Song>();
  const byFileName = new Map<string, Song>();
  const byMatchKey = new Map<string, Song>();
  const byTitleKey = new Map<string, Song>();

  for (const s of library.songs) {
    byPath.set(s.path.replace(/\\/g, "/").toLowerCase(), s);
    const fn = (s.fileName || "").toLowerCase();
    if (fn) byFileName.set(fn, s);
    const mk = matchKey(s.fileName || s.path);
    if (mk) byMatchKey.set(mk, s);
    const tk = matchKey(s.title || "");
    if (tk) byTitleKey.set(tk, s);
  }

  const matchedIds: string[] = [];
  const seenIds = new Set<string>();
  const unmatched: string[] = [];

  for (const p of entryPaths) {
    const song = findSongMatch(p, byPath, byFileName, byMatchKey, byTitleKey);
    if (song) {
      if (!seenIds.has(song.id)) {
        matchedIds.push(song.id);
        seenIds.add(song.id);
      }
    } else {
      unmatched.push(p.split(/[/\\]/).pop() || p);
    }
  }

  const baseName = (
    m3uPath.split(/[/\\]/).pop() || "Imported Playlist"
  ).replace(/\.(m3u8?|M3U8?)$/, "");

  if (matchedIds.length === 0) {
    return {
      playlist: null,
      matched: 0,
      total: entryPaths.length,
      unmatched,
    };
  }

  const playlist: Playlist = {
    id: uuidv4(),
    name: baseName,
    songIds: matchedIds,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  library.playlists.push(playlist);
  await saveLibrary(library);

  return {
    playlist,
    matched: matchedIds.length,
    total: entryPaths.length,
    unmatched,
  };
}


export async function setSpotifyCredentials(
  clientId: string | null,
  clientSecret: string | null
): Promise<LibraryData> {
  const library = await loadLibrary();
  library.spotifyClientId = clientId?.trim() || null;
  library.spotifyClientSecret = clientSecret?.trim() || null;
  await saveLibrary(library);
  return library;
}

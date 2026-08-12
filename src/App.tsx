import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Sidebar from "./components/Sidebar";
import PlayerBar, { RepeatMode } from "./components/PlayerBar";
import LibraryView from "./components/LibraryView";
import PlaylistView from "./components/PlaylistView";
import HomeView from "./components/HomeView";
import YouTubeView from "./components/YouTubeView";
import ImportView from "./components/ImportView";
import DownloadPanel, { DownloadJob } from "./components/DownloadPanel";
import {
  loadLibrary,
  addSongsBatch,
  createPlaylist,
  deletePlaylist,
  updatePlaylist,
  addSongToPlaylist,
  removeSongsBatch,
  hydrateMissingDurations,
  pruneMissingSongs,
  setSpotifyCredentials,
  saveLibrary,
  setMusicFolder,
  scanMusicFolder,
  importM3UPlaylist,
  setDownloadFolder,
  addSongFromPath,
} from "./lib/library";
import { Song, LibraryData, View } from "./lib/types";
import { isAudioFile } from "./lib/utils";

function App() {
  const [library, setLibrary] = useState<LibraryData>({
    songs: [],
    playlists: [],
  });
  const [currentView, setCurrentView] = useState<View>("home");
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [downloadJobs, setDownloadJobs] = useState<DownloadJob[]>([]);
  const [downloadPanelOpen, setDownloadPanelOpen] = useState(false);


  useEffect(() => {
    if (downloadJobs.some((j) => j.status === "downloading" || j.status === "queued" || j.status === "converting")) {
      setDownloadPanelOpen(true);
    }
  }, [downloadJobs]);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("all");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Song[]>([]);
  const currentSongRef = useRef<Song | null>(null);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>("all");
  const originalQueueRef = useRef<Song[]>([]);
  const loadAndPlayRef = useRef<(song: Song, q?: Song[]) => Promise<void>>(async () => {});
  const isAddingRef = useRef(false);
  const playGenRef = useRef(0);
  const isSwitchingRef = useRef(false);
  const playNextRef = useRef<() => void>(() => {});
  const playPreviousRef = useRef<() => void>(() => {});
  const togglePlayRef = useRef<() => void>(() => {});
  /** Prevents media-key repeat / double-fire from skipping multiple songs */
  const skipLockRef = useRef(0); // timestamp of last next/prev
  const hydrateCancelRef = useRef(false);
  const hydrateRunningRef = useRef(false);

  const runDurationHydration = useCallback(async (songs: Song[]) => {
    const needs = songs.filter((s) => !s.duration || s.duration <= 0);
    if (needs.length === 0) return;
    if (hydrateRunningRef.current) return;
    hydrateRunningRef.current = true;
    hydrateCancelRef.current = false;
    try {
      await hydrateMissingDurations(
        needs,
        (updatedSong) => {
          // Patch single song in UI without full library reload
          setLibrary((prev) => ({
            ...prev,
            songs: prev.songs.map((s) =>
              s.id === updatedSong.id ? { ...s, ...updatedSong } : s
            ),
          }));
        },
        () => hydrateCancelRef.current
      );
    } catch (err) {
      console.warn("Duration hydration failed:", err);
    } finally {
      hydrateRunningRef.current = false;
    }
  }, []);


  // Keep refs in sync
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  useEffect(() => {
    repeatRef.current = repeatMode;
  }, [repeatMode]);

  // Load library on mount — drop missing files, strip duplicates
  useEffect(() => {
    (async () => {
      const { library: pruned, removed } = await pruneMissingSongs();
      const seen = new Set<string>();
      const songs = [];
      for (const s of pruned.songs) {
        const key = (s.fileName || s.title || s.id)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
        if (seen.has(key)) continue;
        seen.add(key);
        songs.push(s);
      }
      setLibrary({ ...pruned, songs });
      if (removed > 0) {
        toast(`${removed} missing file${removed > 1 ? "s" : ""} removed from library`, {
          icon: "🧹",
          duration: 3000,
        });
      }
      void runDurationHydration(songs);
    })();
    return () => {
      hydrateCancelRef.current = true;
    };
  }, [runDurationHydration]);

  // Create audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (isSwitchingRef.current) return;
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const onEnded = () => {
      // Delegate to the same logic as the Next button
      playNextRef.current();
    };

    const onLoadedMetadata = () => {
      const curr = currentSongRef.current;
      if (curr && audio.duration && !isNaN(audio.duration) && curr.duration === 0) {
        setLibrary((prev) => {
          const updated = {
            ...prev,
            songs: prev.songs.map((s) =>
              s.id === curr.id ? { ...s, duration: audio.duration } : s
            ),
          };
          saveLibrary(updated);
          return updated;
        });
        // also update currentSong
        setCurrentSong((prev) =>
          prev ? { ...prev, duration: audio.duration } : prev
        );
      }
    };

    const onError = (e: Event) => {
      console.error("Audio error:", e);
      toast.error("Failed to play this song");
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("error", onError);
    };
  }, []);

  // Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Core function to load + play a song (uses Blob URL - most reliable on Windows)
  const loadAndPlay = useCallback(async (song: Song, newQueue?: Song[]) => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const gen = ++playGenRef.current;
    isSwitchingRef.current = true;

    // Stop current playback immediately so UI doesn't fight the old track
    try {
      audio.pause();
    } catch {}
    setProgress(0);
    setCurrentSong(song);
    currentSongRef.current = song;
    if (newQueue) {
      setQueue(newQueue);
      queueRef.current = newQueue;
    }
    setIsPlaying(true); // optimistic — we're about to play

    try {
      if (audio.src && audio.src.startsWith("blob:")) {
        URL.revokeObjectURL(audio.src);
      }

      console.log("Playing:", song.title);

      const { readFile } = await import("@tauri-apps/plugin-fs");
      const data = await readFile(song.path);

      // Aborted by a newer play request?
      if (gen !== playGenRef.current) return;

      const blob = new Blob([data], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      audio.src = url;
      audio.load();

      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          cleanup();
          resolve();
        };
        const onErr = () => {
          cleanup();
          reject(new Error("Failed to load audio"));
        };
        const cleanup = () => {
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("error", onErr);
        };
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("error", onErr);
        setTimeout(() => {
          cleanup();
          resolve();
        }, 5000);
      });

      if (gen !== playGenRef.current) return;

      audio.currentTime = 0;
      await audio.play();

      if (gen !== playGenRef.current) return;

      setIsPlaying(true);
      setProgress(0);
      isSwitchingRef.current = false;
    } catch (err) {
      if (gen !== playGenRef.current) return;
      console.error("Play failed:", err);
      toast.error("Could not play this song");
      setIsPlaying(false);
      isSwitchingRef.current = false;
    }
  }, []);

  // Keep loadAndPlayRef always up to date
  useEffect(() => {
    loadAndPlayRef.current = loadAndPlay;
  }, [loadAndPlay]);




  /** Shuffle an array (Fisher–Yates), optionally pinning a song at index 0 */
  const shuffleSongs = useCallback((songs: Song[], pinFirst?: Song | null): Song[] => {
    if (songs.length <= 1) return [...songs];
    const list = pinFirst
      ? [pinFirst, ...songs.filter((s) => s.id !== pinFirst.id)]
      : [...songs];
    // shuffle everything after index 0 if pinned, else entire list
    const from = pinFirst ? 1 : 0;
    for (let i = list.length - 1; i > from; i--) {
      const j = from + Math.floor(Math.random() * (i - from + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }, []);

  /** Build the active play queue from a source list */
  const buildQueue = useCallback(
    (songs: Song[], startSong?: Song | null): Song[] => {
      if (!songs.length) return [];
      if (shuffleRef.current) {
        return shuffleSongs(songs, startSong ?? null);
      }
      // sequential — if we have a start song, rotate so it comes first
      if (startSong) {
        const idx = songs.findIndex((s) => s.id === startSong.id);
        if (idx > 0) {
          return [...songs.slice(idx), ...songs.slice(0, idx)];
        }
      }
      return [...songs];
    },
    [shuffleSongs]
  );

  const playSong = useCallback(
    (song: Song, sourceList?: Song[]) => {
      const base =
        sourceList && sourceList.length > 0 ? sourceList : library.songs;
      originalQueueRef.current = [...base];
      const q = buildQueue(base, song);
      console.log(
        "Queue built:",
        q.length,
        "songs, shuffle=",
        shuffleRef.current,
        "order:",
        q.slice(0, 5).map((s) => s.title)
      );
      loadAndPlay(song, q);
    },
    [loadAndPlay, buildQueue, library.songs]
  );

  const playNext = useCallback(() => {
    // HARD single-fire: only ONE next per 600ms no matter who calls it
    const now = Date.now();
    if (now - skipLockRef.current < 600) return;
    skipLockRef.current = now;

    const curr = currentSongRef.current;
    const mode = repeatRef.current;
    if (!curr) return;

    if (mode === "one" && audioRef.current) {
      audioRef.current.currentTime = 0;
      setProgress(0);
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      return;
    }

    let q = queueRef.current;
    if (q.length === 0) {
      const base =
        originalQueueRef.current.length > 0
          ? originalQueueRef.current
          : library.songs;
      if (base.length === 0) return;
      q = buildQueue(base, curr);
      queueRef.current = q;
      setQueue(q);
    }

    let idx = q.findIndex((s) => s.id === curr.id);

    // Current song not in queue? rebuild around it
    if (idx < 0) {
      const base =
        originalQueueRef.current.length > 0
          ? originalQueueRef.current
          : library.songs;
      q = buildQueue(base, curr);
      queueRef.current = q;
      setQueue(q);
      idx = q.findIndex((s) => s.id === curr.id);
    }

    if (idx >= 0 && idx < q.length - 1) {
      loadAndPlay(q[idx + 1], q);
      return;
    }

    // End of queue
    if (mode === "all" && q.length > 0) {
      const base =
        originalQueueRef.current.length > 0
          ? originalQueueRef.current
          : q;
      const nextQ = buildQueue(base, null);
      queueRef.current = nextQ;
      setQueue(nextQ);
      loadAndPlay(nextQ[0], nextQ);
    } else {
      // stop cleanly + hint to enable repeat
      try {
        audioRef.current?.pause();
      } catch {}
      setIsPlaying(false);
      setProgress(0);
      toast("End of playlist — turn on repeat to keep going", {
        icon: "🔁",
        duration: 3500,
      });
    }
  }, [loadAndPlay, buildQueue, library.songs]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);



  const playPrevious = useCallback(() => {
    const now = Date.now();
    if (now - skipLockRef.current < 600) return;
    skipLockRef.current = now;

    const audio = audioRef.current;
    const curr = currentSongRef.current;
    if (!curr || !audio) return;

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      setProgress(0);
      return;
    }

    let q = queueRef.current;
    if (q.length === 0) {
      const base =
        originalQueueRef.current.length > 0
          ? originalQueueRef.current
          : library.songs;
      q = buildQueue(base, curr);
      queueRef.current = q;
      setQueue(q);
    }

    const idx = q.findIndex((s) => s.id === curr.id);
    if (idx > 0) {
      loadAndPlay(q[idx - 1], q);
    } else {
      audio.currentTime = 0;
      setProgress(0);
    }
  }, [loadAndPlay, buildQueue, library.songs]);

  const handleToggleShuffle = useCallback(() => {
    const next = !shuffleRef.current;
    shuffleRef.current = next;
    setShuffle(next);

    const curr = currentSongRef.current;
    const base =
      originalQueueRef.current.length > 0
        ? originalQueueRef.current
        : library.songs;

    if (curr && base.length > 0) {
      const q = buildQueue(base, curr);
      // buildQueue reads shuffleRef which we already set
      queueRef.current = q;
      setQueue(q);
      console.log(
        "Shuffle",
        next ? "ON" : "OFF",
        "→ queue:",
        q.slice(0, 6).map((s) => s.title)
      );
    }
  }, [library.songs, buildQueue]);

  const handleCycleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      const next: RepeatMode =
        prev === "off" ? "all" : prev === "all" ? "one" : "off";
      repeatRef.current = next;
      return next;
    });
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentSongRef.current) {
      if (library.songs.length > 0) {
        playSong(library.songs[0], library.songs);
      }
      return;
    }

    // Trust the actual audio element, not React state (avoids double-click bug)
    if (audio.paused) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.error(err);
          setIsPlaying(false);
        });
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [library.songs, playSong]);

  useEffect(() => {
    playPreviousRef.current = playPrevious;
  }, [playPrevious]);

  useEffect(() => {
    togglePlayRef.current = togglePlay;
  }, [togglePlay]);

  // Media Session API — hooks OS / laptop Fn media keys
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        const audio = audioRef.current;
        if (audio?.paused) togglePlayRef.current();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        const audio = audioRef.current;
        if (audio && !audio.paused) togglePlayRef.current();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        playPreviousRef.current();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        playNextRef.current();
      });
      navigator.mediaSession.setActionHandler("stop", () => {
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
          setIsPlaying(false);
          setProgress(0);
        }
      });
    } catch (err) {
      console.warn("Media Session handlers not supported:", err);
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("stop", null);
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Keep Media Session metadata in sync with current song
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!currentSong) {
      navigator.mediaSession.metadata = null;
      return;
    }
    try {
      const artwork = currentSong.cover
        ? [{ src: currentSong.cover, sizes: "512x512", type: "image/png" }]
        : [];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.album,
        artwork,
      });
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    } catch (err) {
      console.warn("MediaMetadata failed:", err);
    }
  }, [currentSong, isPlaying]);

  // Keyboard + media-key shortcuts
  useEffect(() => {
    const skipOnce = (direction: "next" | "prev") => {
      // Guard lives inside playNext / playPrevious themselves
      if (direction === "next") playNextRef.current();
      else playPreviousRef.current();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Never handle auto-repeat for ANY shortcut
      if (e.repeat) return;

      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) {
        return;
      }

      const key = e.key;
      const code = e.code;

      // Play / Pause — Space or media key
      if (code === "Space" || key === " " || key === "MediaPlayPause" || code === "MediaPlayPause") {
        e.preventDefault();
        e.stopPropagation();
        togglePlayRef.current();
        return;
      }

      // Next — one song only
      if (
        key === "MediaTrackNext" ||
        code === "MediaTrackNext" ||
        (code === "ArrowRight" && e.ctrlKey)
      ) {
        e.preventDefault();
        e.stopPropagation();
        skipOnce("next");
        return;
      }

      // Previous — one song only
      if (
        key === "MediaTrackPrevious" ||
        code === "MediaTrackPrevious" ||
        (code === "ArrowLeft" && e.ctrlKey)
      ) {
        e.preventDefault();
        e.stopPropagation();
        skipOnce("prev");
        return;
      }
    };

    // Capture phase so we get the event before anything else eats it
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  const seek = useCallback((percent: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration && !isNaN(audio.duration)) {
      audio.currentTime = (percent / 100) * audio.duration;
      setProgress(percent);
    }
  }, []);

  // ---------- Drag & Drop (Tauri native) ----------
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();

        unlisten = await appWindow.onDragDropEvent(async (event) => {
          if (event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "leave") {
            setIsDragging(false);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            const paths = event.payload.paths;

            const files = paths
              .map((path: string) => {
                const fileName = path.split(/[/\\]/).pop() || path;
                return { sourcePath: path, fileName, size: 0 };
              })
              .filter((f: { fileName: string }) => isAudioFile(f.fileName));

            if (files.length === 0) return;

            const results = await addSongsBatch(files);
            let added = 0;
            let skipped = 0;

            for (const r of results) {
              if (r.alreadyExists) skipped++;
              else if (r.song) added++;
            }

            // Always reload from disk so UI matches saved library (no phantom dupes)
            const fresh = await loadLibrary();
            setLibrary(fresh);

            if (added > 0) toast.success(`Added ${added} song${added > 1 ? "s" : ""}`);
            if (skipped > 0) toast(`${skipped} already existed`, { icon: "⚠️" });
          }
        });
      } catch (err) {
        console.warn("Drag-drop setup failed:", err);
      }
    };

    setup();
    return () => unlisten?.();
  }, []);

  // ---------- File picker button ----------
  const handleAddSongsClick = async () => {
    if (isAddingRef.current) return;
    isAddingRef.current = true;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Audio",
            extensions: ["mp3", "flac", "wav", "ogg", "m4a", "aac", "wma", "opus"],
          },
        ],
      });

      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      const files = paths
        .map((path) => {
          const fileName = path.split(/[/\\]/).pop() || path;
          return { sourcePath: path, fileName, size: 0 };
        })
        .filter((f) => isAudioFile(f.fileName));

      if (files.length === 0) return;

      const results = await addSongsBatch(files);
      let added = 0;
      let skipped = 0;

      for (const r of results) {
        if (r.alreadyExists) skipped++;
        else if (r.song) added++;
      }

      // Always reload from disk so UI matches saved library (no phantom dupes)
      const fresh = await loadLibrary();
      setLibrary(fresh);

      if (added > 0) toast.success(`Added ${added} song${added > 1 ? "s" : ""}`);
      if (skipped > 0) toast(`${skipped} already existed`, { icon: "⚠️" });
    } catch (err) {
      console.error("File dialog error:", err);
      toast.error("Failed to open file picker");
    } finally {
      isAddingRef.current = false;
    }
  };

  // ---------- Playlist helpers ----------

  const handleLinkFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select your music folder",
      });
      if (!selected || Array.isArray(selected)) return;

      await setMusicFolder(selected);
      setIsScanning(true);
      toast("Scanning folder…");
      const { library: fresh, added, skipped, updated, removed } = await scanMusicFolder();
      setLibrary(fresh);
      setIsScanning(false);

      const bits: string[] = [];
      if (added > 0) bits.push(`added ${added}`);
      if (updated > 0) bits.push(`updated ${updated}`);
      if (removed > 0) bits.push(`removed ${removed}`);
      if (bits.length > 0) {
        toast.success(`Linked folder · ${bits.join(" · ")}`);
      } else {
        toast.success(
          skipped > 0
            ? "Folder linked · all songs already in library"
            : "Folder linked · no audio files found"
        );
      }
      void runDurationHydration(fresh.songs);
    } catch (err) {
      console.error(err);
      setIsScanning(false);
      toast.error("Failed to link folder");
    }
  };

  const handleRescan = async () => {
    if (!library.musicFolder) {
      toast("Link a music folder first", { icon: "📁" });
      return;
    }
    try {
      setIsScanning(true);
      toast("Scanning folder…");
      const { library: fresh, added, skipped, updated, removed } = await scanMusicFolder();
      setLibrary(fresh);
      setIsScanning(false);
      const parts: string[] = [];
      if (added > 0) parts.push(`added ${added}`);
      if (updated > 0) parts.push(`updated ${updated}`);
      if (removed > 0) parts.push(`removed ${removed}`);
      if (parts.length > 0) {
        toast.success(`Rescan complete · ${parts.join(" · ")}`);
      } else {
        toast(`Rescan complete · ${skipped} unchanged`, { icon: "✓" });
      }
      void runDurationHydration(fresh.songs);
    } catch (err) {
      console.error(err);
      setIsScanning(false);
      toast.error("Scan failed");
    }
  };




  const handlePickDownloadFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      // Prefer last download folder — never fall back to music folder
      // (Windows otherwise reopens the previous dialog path, often Music Folder)
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose download folder for YouTube audio",
        defaultPath: library.downloadFolder || undefined,
      });
      if (!selected || Array.isArray(selected)) return;
      const fresh = await setDownloadFolder(selected);
      setLibrary(fresh);
      toast.success("Download folder set");
    } catch (err) {
      console.error(err);
      toast.error("Failed to set download folder");
    }
  };

  const handleYtDownloaded = async (filePath: string, title: string) => {
    const fileName = filePath.split(/[/\\]/).pop() || title;
    const result = await addSongFromPath(filePath, fileName, 0);
    const fresh = await loadLibrary();
    setLibrary(fresh);
    if (result.alreadyExists) {
      toast("Already in library", { icon: "✓" });
    } else {
      toast.success("Song saved to folder and library");
    }
  };
  const handleYtDownloadedRef = useRef(handleYtDownloaded);
  handleYtDownloadedRef.current = handleYtDownloaded;

  const downloadProcessingRef = useRef(false);
  const downloadJobsRef = useRef(downloadJobs);
  const downloadFolderRef = useRef(library.downloadFolder);
  downloadJobsRef.current = downloadJobs;
  downloadFolderRef.current = library.downloadFolder;

  // Global download queue — mount once. Do NOT depend on downloadJobs
  // (that cancelled the pump after every status update and left the rest stuck).
  useEffect(() => {
    let alive = true;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const processOne = async (next: DownloadJob) => {
      const folder = downloadFolderRef.current;
      if (!folder) return;

      setDownloadJobs((prev) =>
        prev.map((j) =>
          j.id === next.id ? { ...j, status: "downloading", percent: 1 } : j
        )
      );

      try {
        let url = next.message || "";
        if (!url) throw new Error("Missing download URL");

        if (url.startsWith("search:")) {
          const query = url.slice(7).trim();
          if (!query) throw new Error("Empty search query");
          setDownloadJobs((prev) =>
            prev.map((j) =>
              j.id === next.id
                ? {
                    ...j,
                    status: "downloading",
                    percent: 2,
                    message: "Searching…",
                  }
                : j
            )
          );
          const results = await invoke<{ url: string }[]>("yt_search", {
            query,
          });
          if (!results?.length || !results[0].url) {
            throw new Error(`No YouTube match for: ${query}`);
          }
          url = results[0].url;
        }

        const filePath = await invoke<string>("yt_download", {
          url,
          outputDir: folder,
          jobId: next.id,
        });

        // Fast path: add to library without spamming toasts on bulk imports
        try {
          const fileName = filePath.split(/[/\\]/).pop() || next.title;
          await addSongFromPath(filePath, fileName, 0);
        } catch {
          /* still mark done — file is on disk */
        }

        if (alive) {
          setDownloadJobs((prev) =>
            prev.map((j) =>
              j.id === next.id ? { ...j, status: "done", percent: 100 } : j
            )
          );
        }
      } catch (err) {
        if (alive) {
          const msg = String(err);
          const wasCancelled = /cancel/i.test(msg);
          setDownloadJobs((prev) =>
            prev.map((j) =>
              j.id === next.id
                ? {
                    ...j,
                    status: wasCancelled ? "cancelled" : "error",
                    message: wasCancelled ? "Cancelled" : msg,
                    percent: 0,
                  }
                : j
            )
          );
        }
      }
    };

    const loop = async () => {
      let doneSinceRefresh = 0;
      while (alive) {
        if (downloadProcessingRef.current) {
          await sleep(250);
          continue;
        }
        const next = downloadJobsRef.current.find((j) => j.status === "queued");
        if (!next) {
          // Periodic library refresh after a batch drains
          if (doneSinceRefresh > 0) {
            try {
              const fresh = await loadLibrary();
              setLibrary(fresh);
            } catch {
              /* ignore */
            }
            doneSinceRefresh = 0;
          }
          await sleep(500);
          continue;
        }
        if (
          downloadJobsRef.current.find((j) => j.id === next.id)?.status ===
          "cancelled"
        ) {
          await sleep(100);
          continue;
        }
        if (!downloadFolderRef.current) {
          await sleep(1000);
          continue;
        }

        downloadProcessingRef.current = true;
        try {
          await processOne(next);
          doneSinceRefresh++;
          // Refresh library every 5 completed jobs (not every song — much faster)
          if (doneSinceRefresh >= 5) {
            try {
              const fresh = await loadLibrary();
              setLibrary(fresh);
            } catch {
              /* ignore */
            }
            doneSinceRefresh = 0;
          }
        } finally {
          downloadProcessingRef.current = false;
        }
      }
    };

    loop();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{
      job_id: string;
      percent: number;
      status: string;
      message: string;
    }>("yt-download-progress", (event) => {
      const p = event.payload;
      setDownloadJobs((prev) =>
        prev.map((j) =>
          j.id === p.job_id
            ? {
                ...j,
                percent: p.percent,
                status:
                  p.status === "done"
                    ? "done"
                    : p.status === "cancelled"
                    ? "cancelled"
                    : p.status === "error"
                    ? "error"
                    : p.status === "converting"
                    ? "converting"
                    : "downloading",
                message: p.message,
              }
            : j
        )
      );
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const handleImportPlaylist = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [
          { name: "Playlist", extensions: ["m3u", "m3u8"] },
        ],
        title: "Import playlist (.m3u / .m3u8)",
      });
      if (!selected || Array.isArray(selected)) return;

      const { playlist, matched, total, unmatched } = await importM3UPlaylist(
        selected
      );
      const fresh = await loadLibrary();
      setLibrary(fresh);

      if (playlist && matched > 0) {
        const extra =
          unmatched.length > 0 ? ` · ${unmatched.length} unmatched` : "";
        toast.success(
          `Playlist "${playlist.name}" · ${matched}/${total} matched${extra}`
        );
        if (unmatched.length > 0 && unmatched.length <= 5) {
          console.warn("Unmatched m3u entries:", unmatched);
        }
      } else {
        toast(
          total > 0
            ? `No matches · ${total} entries in file, none found in library`
            : "Playlist file was empty",
          { icon: "⚠️" }
        );
        if (unmatched?.length) console.warn("Unmatched:", unmatched);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to import playlist");
    }
  };

  const handleCreatePlaylist = async (name: string) => {
    const playlist = await createPlaylist(name);
    setLibrary((prev) => ({
      ...prev,
      playlists: [...prev.playlists, playlist],
    }));
    toast.success(`Playlist "${name}" created`);
  };

  const handleDeletePlaylist = async (id: string) => {
    await deletePlaylist(id);
    setLibrary((prev) => ({
      ...prev,
      playlists: prev.playlists.filter((p) => p.id !== id),
    }));
    if (activePlaylistId === id) {
      setCurrentView("library");
      setActivePlaylistId(null);
    }
    toast.success("Playlist deleted");
  };

  const handleAddToPlaylist = async (songIds: string[], playlistId: string) => {
    for (const songId of songIds) {
      await addSongToPlaylist(playlistId, songId);
    }
    setLibrary((prev) => ({
      ...prev,
      playlists: prev.playlists.map((p) => {
        if (p.id !== playlistId) return p;
        const merged = [...p.songIds];
        for (const id of songIds) {
          if (!merged.includes(id)) merged.push(id);
        }
        return { ...p, songIds: merged, updatedAt: Date.now() };
      }),
    }));
    const playlistName =
      library.playlists.find((p) => p.id === playlistId)?.name || "playlist";
    toast.success(
      songIds.length > 1
        ? `Added ${songIds.length} songs to "${playlistName}"`
        : `Added to "${playlistName}"`
    );
  };

  const handleCreatePlaylistAndAdd = async (songIds: string[]) => {
    const name = `My Playlist #${library.playlists.length + 1}`;
    const playlist = await createPlaylist(name);
    for (const songId of songIds) {
      await addSongToPlaylist(playlist.id, songId);
    }
    setLibrary((prev) => ({
      ...prev,
      playlists: [
        ...prev.playlists,
        { ...playlist, songIds: [...songIds] },
      ],
    }));
    toast.success(
      songIds.length > 1
        ? `Created "${name}" with ${songIds.length} songs`
        : `Created "${name}" and added song`
    );
  };

  const handleRemoveSong = async (songIds: string[]) => {
    const idSet = new Set(songIds);
    // Optimistic UI update first (feels instant)
    setLibrary((prev) => ({
      ...prev,
      songs: prev.songs.filter((s) => !idSet.has(s.id)),
      playlists: prev.playlists.map((p) => ({
        ...p,
        songIds: p.songIds.filter((id) => !idSet.has(id)),
      })),
    }));
    if (currentSongRef.current && idSet.has(currentSongRef.current.id)) {
      audioRef.current?.pause();
      setCurrentSong(null);
      setIsPlaying(false);
      setProgress(0);
    }
    toast.success(
      songIds.length > 1 ? `Removed ${songIds.length} songs` : "Song removed"
    );
    // Persist in background (single load/save)
    try {
      await removeSongsBatch(songIds);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save library after remove");
      const fresh = await loadLibrary();
      setLibrary(fresh);
    }
  };

  const activePlaylist = library.playlists.find((p) => p.id === activePlaylistId);

  return (
    <div
      className="flex h-screen flex-col bg-spotify-black"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => e.preventDefault()}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-spotify-green bg-spotify-dark/90 px-12 py-10 text-center">
            <p className="text-2xl font-semibold text-spotify-green">
              Drop music files here
            </p>
            <p className="mt-2 text-spotify-lightgray">
              They will be added to your library
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentView={currentView}
          setCurrentView={setCurrentView}
          playlists={library.playlists}
          activePlaylistId={activePlaylistId}
          musicFolder={library.musicFolder}
          isScanning={isScanning}
          onSelectPlaylist={(id) => {
            setActivePlaylistId(id);
            setCurrentView("playlist");
          }}
          onCreatePlaylist={handleCreatePlaylist}
          onDeletePlaylist={handleDeletePlaylist}
          onLinkFolder={handleLinkFolder}
          onRescan={handleRescan}
          onImportPlaylist={handleImportPlaylist}
          downloadFolder={library.downloadFolder}
          onPickDownloadFolder={handlePickDownloadFolder}
        />

        <main className="flex-1 overflow-y-auto bg-gradient-to-b from-[#1a1a1a] to-spotify-black">
          {currentView === "home" && (
            <HomeView
              songs={library.songs}
              playlists={library.playlists}
              onPlaySong={(song) => playSong(song, library.songs)}
              onSelectPlaylist={(id) => {
                setActivePlaylistId(id);
                setCurrentView("playlist");
              }}
              onAddSongs={handleAddSongsClick}
              onAddToPlaylist={(songId, playlistId) =>
                handleAddToPlaylist([songId], playlistId)
              }
              onCreatePlaylistAndAdd={(songId) =>
                handleCreatePlaylistAndAdd([songId])
              }
              onRemoveSong={(songId) => handleRemoveSong([songId])}
            />
          )}
          {currentView === "library" && (
            <LibraryView
              songs={library.songs}
              playlists={library.playlists}
              currentSongId={currentSong?.id}
              isPlaying={isPlaying}
              onPlaySong={(song) => playSong(song, library.songs)}
              onAddToPlaylist={handleAddToPlaylist}
              onCreatePlaylistAndAdd={handleCreatePlaylistAndAdd}
              onRemoveSong={handleRemoveSong}
              onAddSongs={handleAddSongsClick}
            />
          )}
          {currentView === "import" && (
            <ImportView
              downloadFolder={library.downloadFolder}
              onPickDownloadFolder={handlePickDownloadFolder}
              jobs={downloadJobs}
              setJobs={setDownloadJobs}
              spotifyClientId={library.spotifyClientId}
              onSaveSpotifyClientId={async (id) => {
                const fresh = await setSpotifyCredentials(id, null);
                setLibrary(fresh);
              }}
            />
          )}
          {currentView === "youtube" && (
            <YouTubeView
              downloadFolder={library.downloadFolder}
              onPickDownloadFolder={handlePickDownloadFolder}
              onDownloaded={handleYtDownloaded}
              jobs={downloadJobs}
              setJobs={setDownloadJobs}
            />
          )}
          {currentView === "playlist" && activePlaylist && (
            <PlaylistView
              playlist={activePlaylist}
              songs={library.songs}
              playlists={library.playlists}
              currentSongId={currentSong?.id}
              isPlaying={isPlaying}
              onPlaySong={(song, queueSongs) => playSong(song, queueSongs)}
              onUpdatePlaylist={async (updated) => {
                await updatePlaylist(updated);
                setLibrary((prev) => ({
                  ...prev,
                  playlists: prev.playlists.map((p) =>
                    p.id === updated.id ? updated : p
                  ),
                }));
              }}
              onAddToPlaylist={handleAddToPlaylist}
              onCreatePlaylistAndAdd={handleCreatePlaylistAndAdd}
            />
          )}
        </main>
      </div>

      <DownloadPanel
        jobs={downloadJobs}
        open={downloadPanelOpen}
        onToggle={() => setDownloadPanelOpen((o) => !o)}
        onClearDone={() =>
          setDownloadJobs((prev) =>
            prev.filter(
              (j) =>
                j.status !== "done" &&
                j.status !== "error" &&
                j.status !== "cancelled"
            )
          )
        }
        onCancel={async (jobId) => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            setDownloadJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? { ...j, status: "cancelled" as const, message: "Cancelled" }
                  : j
              )
            );
            await invoke("yt_download_cancel", { jobId });
          } catch (err) {
            console.error("Cancel failed:", err);
          }
        }}
        onCancelAll={async () => {
          const active = downloadJobs.filter(
            (j) =>
              j.status === "queued" ||
              j.status === "downloading" ||
              j.status === "converting"
          );
          setDownloadJobs((prev) =>
            prev.map((j) =>
              j.status === "queued" ||
              j.status === "downloading" ||
              j.status === "converting"
                ? { ...j, status: "cancelled" as const, message: "Cancelled" }
                : j
            )
          );
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await Promise.all(
              active.map((j) =>
                invoke("yt_download_cancel", { jobId: j.id }).catch(() => null)
              )
            );
          } catch (err) {
            console.error("Stop all failed:", err);
          }
        }}
      />

      <PlayerBar
        currentSong={currentSong}
        isPlaying={isPlaying}
        progress={progress}
        volume={volume}
        shuffle={shuffle}
        repeatMode={repeatMode}
        onTogglePlay={togglePlay}
        onNext={playNext}
        onPrevious={playPrevious}
        onSeek={seek}
        onVolumeChange={setVolume}
        onToggleShuffle={handleToggleShuffle}
        onCycleRepeat={handleCycleRepeat}
      />
    </div>
  );
}

export default App;

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { listen } from "@tauri-apps/api/event";
import {
  Search,
  Download,
  Loader2,
  Music2,
  FolderOpen,
  AlertCircle,
  Check,
  WifiOff,
} from "lucide-react";
import { YtSearchResult } from "../lib/types";
import { formatDuration } from "../lib/utils";
import { DownloadJob } from "./DownloadPanel";

interface ProgressPayload {
  job_id: string;
  percent: number;
  status: string;
  message: string;
}

interface YouTubeViewProps {
  downloadFolder: string | null | undefined;
  onPickDownloadFolder: () => void;
  onDownloaded: (filePath: string, title: string) => Promise<void>;
  jobs: DownloadJob[];
  setJobs: React.Dispatch<React.SetStateAction<DownloadJob[]>>;
}

export default function YouTubeView({
  downloadFolder,
  onPickDownloadFolder,
  onDownloaded,
  jobs,
  setJobs,
}: YouTubeViewProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YtSearchResult[]>([]);
  const [playlistMode, setPlaylistMode] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ytdlpStatus, setYtdlpStatus] = useState<{
    available: boolean;
    version: string | null;
    source: string;
  } | null>(null);
  const [updatingYtdlp, setUpdatingYtdlp] = useState(false);
  const [updatePercent, setUpdatePercent] = useState(0);
  const [downloadingFfmpeg, setDownloadingFfmpeg] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // Queue processor refs
  const jobsRef = useRef(jobs);
  const folderRef = useRef(downloadFolder);
  const onDownloadedRef = useRef(onDownloaded);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  useEffect(() => {
    folderRef.current = downloadFolder;
  }, [downloadFolder]);
  useEffect(() => {
    onDownloadedRef.current = onDownloaded;
  }, [onDownloaded]);

  const refreshYtdlpStatus = async () => {
    try {
      const s = await invoke<{
        available: boolean;
        version: string | null;
        source: string;
      }>("yt_dlp_status");
      setYtdlpStatus(s);
    } catch {
      setYtdlpStatus({ available: false, version: null, source: "none" });
    }
  };

  useEffect(() => {
    refreshYtdlpStatus();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ percent: number }>("yt-dlp-update-progress", (e) => {
      setUpdatePercent(e.payload.percent);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const handleUpdateYtdlp = async () => {
    if (updatingYtdlp) return;
    setUpdatingYtdlp(true);
    setUpdatePercent(0);
    try {
      const s = await invoke<{
        available: boolean;
        version: string | null;
        source: string;
        action?: string | null;
        latest_version?: string | null;
      }>("yt_dlp_update");
      setYtdlpStatus({
        available: s.available,
        version: s.version,
        source: s.source,
      });
      if (s.action === "latest") {
        toast.success(`Latest · ${s.version || ""}`.trim(), { duration: 2500 });
      } else if (s.action === "updated") {
        toast.success(`Updated · ${s.version || "latest"}`.trim(), {
          duration: 2500,
        });
      } else if (s.action === "installed") {
        toast.success(`Installed · ${s.version || ""}`.trim(), {
          duration: 2500,
        });
      } else {
        toast.success("yt-dlp ready");
      }
    } catch (err) {
      setError(String(err));
      toast.error("Update failed");
    } finally {
      setUpdatingYtdlp(false);
      setUpdatePercent(0);
    }
  };

  const handleDownloadFfmpeg = async () => {
    if (downloadingFfmpeg) return;
    setDownloadingFfmpeg(true);
    toast.loading("Downloading FFmpeg...");
    try {
      await invoke("download_ffmpeg");
      toast.dismiss();
      toast.success("FFmpeg downloaded successfully!");
    } catch (e) {
      toast.dismiss();
      toast.error(String(e));
    } finally {
      setDownloadingFfmpeg(false);
    }
  };

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ProgressPayload>("yt-download-progress", (event) => {
      const p = event.payload;
      setJobs((prev) =>
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
  }, [setJobs]);

  // Queue worker lives in App.tsx (global)


  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || searching) return;

    if (!navigator.onLine) {
      setOnline(false);
      setError(null);
      setResults([]);
      return;
    }

    setSearching(true);
    setError(null);
    setResults([]);
    const looksLikeUrl = /youtube\.com|youtu\.be|music\.youtube\.com/i.test(q);
    setPlaylistMode(looksLikeUrl);
    setPlaylistTitle(null);

    try {
      const res = await invoke<YtSearchResult[]>("yt_search", { query: q });
      setResults(res || []);
      if (!res?.length) setError("No results found");
      const isPl = looksLikeUrl && (res?.length || 0) > 1;
      setPlaylistMode(isPl);
      const pt = res?.find((r) => r.playlist_title)?.playlist_title || null;
      setPlaylistTitle(isPl ? (pt || "YouTube Playlist") : null);
    } catch (err) {
      const msg = String(err);
      if (!navigator.onLine || /network|offline|failed to fetch|resolve/i.test(msg)) {
        setOnline(false);
      } else {
        setError(msg);
      }
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const playlistFolder = (): string | undefined => {
    if (!playlistMode || !downloadFolder) return undefined;
    const raw = (playlistTitle || "YouTube Playlist").trim();
    const safe =
      raw
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/[.\s]+$/g, "")
        .trim()
        .slice(0, 80) || "YouTube Playlist";
    const sep = downloadFolder.includes("\\") ? "\\" : "/";
    return downloadFolder.endsWith("\\") || downloadFolder.endsWith("/")
      ? `${downloadFolder}${safe}`
      : `${downloadFolder}${sep}${safe}`;
  };

  const handleDownload = (item: YtSearchResult) => {
    if (!downloadFolder) {
      setError("Pick a download folder first");
      return;
    }
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }

    // Already queued/active/done for this video?
    const exists = jobs.some(
      (j) =>
        j.id.startsWith(item.id) &&
        (j.status === "queued" ||
          j.status === "downloading" ||
          j.status === "converting" ||
          j.status === "done")
    );
    if (exists) return;

    const jobId = `${item.id}-${Date.now()}`;
    // Store URL in message temporarily for the queue worker
    setJobs((prev) => [
      {
        id: jobId,
        title: item.title,
        percent: 0,
        status: "queued",
        message: item.url,
        folder: playlistFolder(),
        playlistName: playlistTitle || undefined,
      },
      ...prev,
    ]);
  };

  const handleDownloadAll = () => {
    if (!downloadFolder) {
      setError("Pick a download folder first");
      return;
    }
    const pending = results.filter((item) => !isJobDone(item.id) && !isJobActive(item.id));
    if (pending.length === 0) return;
    setJobs((prev) => {
      const dest = playlistFolder();
      const extra: DownloadJob[] = pending.map((item) => ({
        id: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: item.title,
        percent: 0,
        status: "queued",
        message: item.url,
        folder: dest,
        playlistName: playlistTitle || undefined,
      }));
      return [...extra, ...prev];
    });
    const name = playlistTitle || "playlist";
    toast.success(
      `Queued ${pending.length} track${pending.length === 1 ? "" : "s"} → ${name}`
    );
  };

  const folderLabel = downloadFolder
    ? downloadFolder.split(/[/\\]/).filter(Boolean).pop()
    : null;

  const isJobActive = (videoId: string) =>
    jobs.some(
      (j) =>
        j.id.startsWith(videoId) &&
        (j.status === "downloading" ||
          j.status === "converting" ||
          j.status === "queued")
    );

  const isJobDone = (videoId: string) =>
    jobs.some((j) => j.id.startsWith(videoId) && j.status === "done");

  const queueCount = jobs.filter((j) => j.status === "queued").length;

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">YouTube</h1>
        <p className="mt-1 text-sm text-spotify-lightgray">
          Search and download audio into your library
          {queueCount > 0 && (
            <span className="text-spotify-green">
              {" "}
              · {queueCount} queued
            </span>
          )}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onPickDownloadFolder}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
        >
          <FolderOpen className="h-4 w-4" />
          {folderLabel ? (
            <span className="max-w-[200px] truncate">{folderLabel}</span>
          ) : (
            "Choose download folder"
          )}
        </button>

        {ytdlpStatus && !ytdlpStatus.available && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4" />
            yt-dlp not installed
            <button
              onClick={handleUpdateYtdlp}
              disabled={updatingYtdlp}
              className="rounded-full bg-spotify-green px-3 py-1 text-xs font-semibold text-black hover:bg-spotify-green-hover disabled:opacity-50"
            >
              {updatingYtdlp
                ? `Installing ${Math.round(updatePercent)}%`
                : "Install yt-dlp"}
            </button>
          </div>
        )}
        {ytdlpStatus?.available && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-spotify-lightgray">
            <span>
              yt-dlp {ytdlpStatus.version || ""}
              {ytdlpStatus.source === "bundled" ? " (app)" : " (system)"}
            </span>
            <button
              onClick={handleUpdateYtdlp}
              disabled={updatingYtdlp}
              className="rounded-full bg-white/10 px-3 py-1 font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              {updatingYtdlp
                ? `Updating ${Math.round(updatePercent)}%`
                : "Update yt-dlp"}
            </button>
          </div>
        )}
        
        <button
          onClick={handleDownloadFfmpeg}
          disabled={downloadingFfmpeg}
          className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
        >
          {downloadingFfmpeg ? "Downloading FFmpeg..." : "Download FFmpeg"}
        </button>
      </div>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spotify-lightgray" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, or paste a YouTube playlist / video link…"
            className="w-full rounded-full bg-white/10 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-spotify-lightgray focus:bg-white/15"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="rounded-full bg-spotify-green px-6 py-3 text-sm font-semibold text-black transition hover:scale-105 hover:bg-spotify-green-hover disabled:opacity-40"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </form>

      {!online && (
        <div className="mb-6 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-16">
          <WifiOff className="mb-4 h-12 w-12 text-spotify-lightgray" />
          <p className="text-xl font-semibold">You are offline</p>
          <p className="mt-2 max-w-sm text-center text-sm text-spotify-lightgray">
            Connect to the internet to search and download from YouTube
          </p>
        </div>
      )}

      {online && error && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      {online && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg">
          {searching && (
            <div className="flex flex-col items-center justify-center py-20 text-spotify-lightgray">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-spotify-green" />
              {playlistMode ? "Loading playlist…" : "Searching…"}
            </div>
          )}

          {!searching && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-spotify-lightgray">
              <Music2 className="mb-3 h-12 w-12 opacity-40" />
              <p>Search YouTube for a track to download</p>
              <p className="mt-1 text-xs">
                Needs yt-dlp installed + a download folder
              </p>
            </div>
          )}

          {playlistMode && results.length > 0 && !searching && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
              <p className="min-w-0 truncate text-sm text-white/80">
                {playlistTitle || "Playlist"} · {results.length} track
                {results.length === 1 ? "" : "s"}
              </p>
              <button
                onClick={handleDownloadAll}
                disabled={!downloadFolder}
                className="flex items-center gap-2 rounded-full bg-spotify-green px-4 py-1.5 text-sm font-semibold text-black hover:bg-spotify-green-hover disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Download all
              </button>
            </div>
          )}

          <div className="space-y-1">
            {results.map((item) => {
              const busy = isJobActive(item.id);
              const done = isJobDone(item.id);
              const queued = jobs.some(
                (j) => j.id.startsWith(item.id) && j.status === "queued"
              );
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 transition hover:bg-white/10"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-spotify-gray">
                    <Music2 className="h-5 w-5 text-spotify-lightgray" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="truncate text-sm text-spotify-lightgray">
                      {item.uploader}
                      {item.duration
                        ? ` · ${formatDuration(item.duration)}`
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownload(item)}
                    disabled={busy || !downloadFolder || done}
                    className={
                      done
                        ? "flex items-center gap-2 rounded-full bg-spotify-green/20 px-4 py-2 text-sm font-semibold text-spotify-green"
                        : busy
                        ? "flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                        : "flex items-center gap-2 rounded-full bg-spotify-green px-4 py-2 text-sm font-semibold text-black shadow-md shadow-spotify-green/30 transition hover:scale-105 hover:bg-spotify-green-hover hover:shadow-spotify-green/50 disabled:opacity-40"
                    }
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : done ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {done
                      ? "Added"
                      : queued
                      ? "Queued"
                      : busy
                      ? "Downloading…"
                      : "Download"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

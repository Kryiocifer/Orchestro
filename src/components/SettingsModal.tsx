import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import toast from "react-hot-toast";
import {
  X,
  FolderOpen,
  Download,
  RefreshCw,
  Settings,
  Terminal,
  Cpu,
} from "lucide-react";
import { cn } from "../lib/utils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  musicFolder: string | null | undefined;
  downloadFolder: string | null | undefined;
  onLinkFolder: () => void;
  onPickDownloadFolder: () => void;
  onCheckUpdates?: () => void;
  checkingUpdates?: boolean;
  onRescan: () => void;
  isScanning?: boolean;
  gameMode?: boolean;
  onToggleGameMode?: (enabled: boolean) => void;
  discordRPC?: boolean;
  onToggleDiscordRPC?: (enabled: boolean) => void;
  discordClientId?: string | null;
  onSaveDiscordClientId?: (id: string) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  musicFolder,
  downloadFolder,
  onLinkFolder,
  onPickDownloadFolder,
  onCheckUpdates,
  checkingUpdates,
  onRescan,
  isScanning,
  gameMode,
  onToggleGameMode,
  discordRPC,
  onToggleDiscordRPC,
  discordClientId,
  onSaveDiscordClientId,
}: SettingsModalProps) {
  const [clientIdInput, setClientIdInput] = useState(discordClientId || "");

  useEffect(() => {
    setClientIdInput(discordClientId || "");
  }, [discordClientId]);
  const [ytdlpStatus, setYtdlpStatus] = useState<{
    available: boolean;
    version: string | null;
    source: string;
  } | null>(null);
  const [updatingYtdlp, setUpdatingYtdlp] = useState(false);
  const [updatePercent, setUpdatePercent] = useState(0);
  const [downloadingFfmpeg, setDownloadingFfmpeg] = useState(false);
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      refreshYtdlpStatus();
      refreshFfmpegStatus();
    } else {
      const timer = setTimeout(() => setIsMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const refreshFfmpegStatus = async () => {
    try {
      const isAvailable = await invoke<boolean>("ffmpeg_status");
      setFfmpegAvailable(isAvailable);
    } catch {
      setFfmpegAvailable(false);
    }
  };

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
      }>("yt_dlp_update");
      setYtdlpStatus({ available: s.available, version: s.version, source: s.source });
      if (s.action === "latest") {
        toast.success(`Already on latest · ${s.version || ""}`.trim(), { duration: 2500 });
      } else if (s.action === "updated") {
        toast.success(`Updated to ${s.version || "latest"}`, { duration: 2500 });
      } else if (s.action === "installed") {
        toast.success(`Installed ${s.version || ""}`.trim(), { duration: 2500 });
      } else {
        toast.success("yt-dlp ready");
      }
    } catch {
      toast.error("yt-dlp update failed");
    } finally {
      setUpdatingYtdlp(false);
      setUpdatePercent(0);
    }
  };

  const handleDownloadFfmpeg = async () => {
    if (downloadingFfmpeg) return;
    setDownloadingFfmpeg(true);
    const tid = toast.loading("Downloading FFmpeg…");
    try {
      await invoke("download_ffmpeg");
      toast.dismiss(tid);
      toast.success("FFmpeg ready");
      setFfmpegAvailable(true);
    } catch (e) {
      toast.dismiss(tid);
      toast.error(String(e));
    } finally {
      setDownloadingFfmpeg(false);
    }
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [isOpen, onClose]);

  if (!isOpen && !isMounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[250] flex items-center justify-center p-4",
        "bg-black/50 transition-opacity duration-150",
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full max-w-xl overflow-hidden rounded-xl bg-[#181818] border border-white/5 shadow-2xl flex flex-col max-h-[88vh]",
          "transition-all duration-200",
          isOpen ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-2.5 text-white">
            <Settings className="h-4 w-4 text-spotify-lightgray" />
            <h2 className="text-sm font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-spotify-lightgray transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto sidebar-scroll">

          {/* Section: Library */}
          <div className="px-6 py-5 border-b border-white/5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-spotify-lightgray/50">
              Library
            </p>
            <div className="space-y-2">
              {/* Music folder row */}
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">Music folder</p>
                  <p className="mt-0.5 truncate text-xs text-spotify-lightgray">
                    {musicFolder || "Not set"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {musicFolder && (
                    <button
                      onClick={onRescan}
                      disabled={isScanning}
                      title="Rescan"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-spotify-lightgray transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", isScanning && "animate-spin")} />
                    </button>
                  )}
                  <button
                    onClick={onLinkFolder}
                    className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                  >
                    <FolderOpen className="h-3.5 w-3.5 opacity-70" />
                    {musicFolder ? "Change" : "Choose"}
                  </button>
                </div>
              </div>

              {/* Downloads folder row */}
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">Downloads folder</p>
                  <p className="mt-0.5 truncate text-xs text-spotify-lightgray">
                    {downloadFolder || "Not set"}
                  </p>
                </div>
                <button
                  onClick={onPickDownloadFolder}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                >
                  <FolderOpen className="h-3.5 w-3.5 opacity-70" />
                  {downloadFolder ? "Change" : "Choose"}
                </button>
              </div>
            </div>
          </div>

          {/* Section: YouTube */}
          <div className="px-6 py-5 border-b border-white/5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-spotify-lightgray/50">
              YouTube downloads
            </p>
            <div className="space-y-2">
              {/* yt-dlp */}
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Terminal className="h-4 w-4 shrink-0 text-spotify-lightgray/60" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">yt-dlp</p>
                      {ytdlpStatus && (
                        <span
                          className={cn(
                            "rounded px-1.5 py-px text-[10px] font-semibold",
                            ytdlpStatus.available
                              ? "bg-spotify-green/15 text-spotify-green"
                              : "bg-amber-500/15 text-amber-400"
                          )}
                        >
                          {ytdlpStatus.available ? (ytdlpStatus.version || "ready") : "missing"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-spotify-lightgray">
                      Required to download audio from YouTube
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleUpdateYtdlp}
                  disabled={updatingYtdlp}
                  className="shrink-0 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-40 min-w-[72px] text-center"
                >
                  {updatingYtdlp
                    ? `${Math.round(updatePercent)}%`
                    : ytdlpStatus?.available
                    ? "Update"
                    : "Install"}
                </button>
              </div>

              {/* FFmpeg */}
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Cpu className="h-4 w-4 shrink-0 text-spotify-lightgray/60" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">FFmpeg</p>
                      <span
                        className={cn(
                          "rounded px-1.5 py-px text-[10px] font-semibold",
                          ffmpegAvailable
                            ? "bg-spotify-green/15 text-spotify-green"
                            : "bg-amber-500/15 text-amber-400"
                        )}
                      >
                        {ffmpegAvailable ? "ready" : "missing"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-spotify-lightgray">
                      Required to convert video to audio
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDownloadFfmpeg}
                  disabled={downloadingFfmpeg || ffmpegAvailable}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition min-w-[72px] text-center",
                    ffmpegAvailable
                      ? "text-spotify-lightgray/40 cursor-default"
                      : "bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
                  )}
                >
                  {downloadingFfmpeg ? "Downloading…" : ffmpegAvailable ? "Installed" : "Download"}
                </button>
              </div>
            </div>
          </div>

          {/* Section: Performance */}
          <div className="px-6 py-5 border-b border-white/5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-spotify-lightgray/50">
              Performance
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">Game Mode</p>
                <p className="mt-0.5 text-xs text-spotify-lightgray max-w-[280px]">
                  Pause background scanning, disable heavy UI animations, and unload album art to save RAM and CPU.
                </p>
              </div>
              <button
                onClick={() => onToggleGameMode?.(!gameMode)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  gameMode ? "bg-spotify-green" : "bg-white/20"
                )}
                role="switch"
                aria-checked={gameMode}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    gameMode ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>

          {/* Section: Discord Rich Presence */}
          <div className="px-6 py-5 border-b border-white/5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-spotify-lightgray/50">
              Integrations
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">Discord Rich Presence</p>
                    <span className="rounded bg-[#5865F2]/20 px-1.5 py-px text-[10px] font-semibold text-[#5865F2]">
                      Discord RPC
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-spotify-lightgray max-w-[320px]">
                    Display your current song, artist, and live playback progress bar on your Discord profile.
                  </p>
                </div>
                <button
                  onClick={() => onToggleDiscordRPC?.(discordRPC ?? true ? false : true)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    (discordRPC ?? true) ? "bg-[#5865F2]" : "bg-white/20"
                  )}
                  role="switch"
                  aria-checked={discordRPC ?? true}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      (discordRPC ?? true) ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {(discordRPC ?? true) && (
                <div className="rounded-lg bg-white/[0.02] p-4 border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-white/80">
                      Discord Application ID (Optional)
                    </label>
                    <a
                      href="https://discord.com/developers/applications"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#5865F2] hover:underline"
                    >
                      Developer Portal ↗
                    </a>
                  </div>
                  <p className="text-[11px] text-spotify-lightgray">
                    Want your own custom name or icon on Discord? Create an application on the Discord Developer Portal and paste its Application ID here. Leave blank for default.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="1546083032195403897 (Default)"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      className="flex-1 rounded-md bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/20 border border-white/10 focus:border-[#5865F2] focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        onSaveDiscordClientId?.(clientIdInput.trim());
                        toast.success("Discord Application ID saved");
                      }}
                      className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section: Updates */}
          {onCheckUpdates && (
            <div className="px-6 py-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-spotify-lightgray/50">
                Application
              </p>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">Check for updates</p>
                  <p className="mt-0.5 text-xs text-spotify-lightgray">
                    Download the latest version of Orchestro
                  </p>
                </div>
                <button
                  onClick={onCheckUpdates}
                  disabled={checkingUpdates}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-40"
                >
                  {checkingUpdates ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 opacity-70" />
                      Check now
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

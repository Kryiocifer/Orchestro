import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import toast from "react-hot-toast";
import {
  FolderOpen,
  RefreshCw,
  Settings,
  Download,
  Loader2,
  LogIn,
  LogOut,
  AlertCircle,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";

interface SettingsViewProps {
  musicFolder: string | null | undefined;
  downloadFolder: string | null | undefined;
  isScanning?: boolean;
  onLinkFolder: () => void;
  onRescan: () => void;
  onPickDownloadFolder: () => void;
  spotifyClientId?: string | null;
  onSaveSpotifyClientId?: (id: string) => Promise<void>;
}

export default function SettingsView({
  musicFolder,
  downloadFolder,
  isScanning,
  onLinkFolder,
  onRescan,
  onPickDownloadFolder,
  spotifyClientId,
  onSaveSpotifyClientId,
}: SettingsViewProps) {
  // Spotify connection state
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [clientIdDraft, setClientIdDraft] = useState(spotifyClientId || "");
  const [error, setError] = useState<string | null>(null);

  // yt-dlp update state
  const [updatePercent, setUpdatePercent] = useState(0);
  const [downloadingFfmpeg, setDownloadingFfmpeg] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await invoke<{ connected: boolean }>("spotify_status");
      setConnected(!!s.connected);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const unlisten = listen<{ percent: number }>("yt-dlp-update-progress", (e) => {
      setUpdatePercent(e.payload.percent);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleConnect = async () => {
    const id = (clientIdDraft || spotifyClientId || "").trim();
    if (!id) {
      setError("Please enter your Spotify Client ID");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      if (onSaveSpotifyClientId) await onSaveSpotifyClientId(id);
      await invoke("spotify_connect", { clientId: id });
      setConnected(true);
      toast.success("Connected to Spotify");
    } catch (err) {
      setError(String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke("spotify_disconnect");
      setConnected(false);
      toast.success("Disconnected from Spotify");
    } catch (err) {
      setError(String(err));
    }
  };

  const handleUpdateYtdlp = async () => {
    if (updatePercent > 0) return;
    setUpdatePercent(0);
    try {
      const s = await invoke<{ action: "updated" | "up_to_date"; version: string }>("yt_dlp_update");
      if (s.action === "up_to_date") {
        toast.success(`yt-dlp is up to date (${s.version})`);
      } else {
        toast.success(`Updated yt-dlp to ${s.version || "latest"}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("yt-dlp update failed");
    } finally {
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

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gradient-to-b from-[#1a1a1a] to-spotify-black p-6 safe-pt md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Settings className="h-8 w-8 text-spotify-green" />
          Settings
        </h1>
        <p className="mt-2 text-sm text-spotify-lightgray">
          Manage your storage, connections, and external tools.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-amber-300 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Storage Section */}
      <section className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-spotify-lightgray/80">
          Storage
        </h2>
        
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-white">Music Library Folder</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={onLinkFolder}
                className="flex flex-1 items-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-sm text-white transition hover:bg-white/20"
              >
                <FolderOpen className="h-4 w-4 text-spotify-green" />
                <span className="truncate">{musicFolder || "Choose Folder..."}</span>
              </button>
              
              {musicFolder && (
                <button
                  onClick={onRescan}
                  disabled={isScanning}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-spotify-green/20 px-4 py-3 text-sm font-medium text-spotify-green transition hover:bg-spotify-green/30 disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
                  {isScanning ? "Scanning..." : "Rescan"}
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white">Downloads Folder</p>
            <button
              onClick={onPickDownloadFolder}
              className="flex w-full items-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-sm text-white transition hover:bg-white/20"
            >
              <Download className="h-4 w-4 text-spotify-green" />
              <span className="truncate">{downloadFolder || "Choose Folder..."}</span>
            </button>
            <p className="mt-2 text-xs text-spotify-lightgray">
              Where your downloaded tracks from YouTube and Spotify will be saved.
            </p>
          </div>
        </div>
      </section>

      {/* Connections Section */}
      <section className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-spotify-lightgray/80">
          Connections
        </h2>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-white">Spotify Connection</p>
              {connected && (
                <span className="rounded-full bg-spotify-green/20 px-2 py-0.5 text-xs font-semibold text-spotify-green">
                  Connected
                </span>
              )}
            </div>
            
            {!connected && (
              <div className="mb-3 space-y-2">
                <input
                  value={clientIdDraft}
                  onChange={(e) => setClientIdDraft(e.target.value)}
                  placeholder="Spotify Client ID"
                  className="w-full rounded-lg bg-black/40 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-spotify-green"
                />
                <p className="text-xs text-spotify-lightgray">
                  Required to import your private playlists and liked songs.
                </p>
              </div>
            )}

            <button
              onClick={connected ? handleDisconnect : handleConnect}
              disabled={connecting || (!connected && !clientIdDraft.trim())}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition disabled:opacity-50",
                connected
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : "bg-spotify-green text-black hover:bg-spotify-green-hover"
              )}
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : connected ? (
                <LogOut className="h-4 w-4" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {connected ? "Disconnect" : "Connect Spotify"}
            </button>
          </div>
        </div>
      </section>

      {/* Tools Section */}
      <section className="mb-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-spotify-lightgray/80">
          Tools
        </h2>
        
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium text-white">Downloader Backend (yt-dlp)</p>
            <button
              onClick={handleUpdateYtdlp}
              disabled={updatePercent > 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              {updatePercent > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {updatePercent > 0 ? `Updating ${Math.round(updatePercent)}%` : "Check for updates"}
            </button>
            <p className="mt-2 text-xs text-spotify-lightgray">
              Keep yt-dlp updated if YouTube downloads start failing.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white">Audio Converter (FFmpeg)</p>
            <button
              onClick={handleDownloadFfmpeg}
              disabled={downloadingFfmpeg}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              {downloadingFfmpeg ? (
                <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloadingFfmpeg ? "Downloading..." : "Download FFmpeg"}
            </button>
            <p className="mt-2 text-xs text-spotify-lightgray">
              Required for converting downloaded tracks to compatible audio formats.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

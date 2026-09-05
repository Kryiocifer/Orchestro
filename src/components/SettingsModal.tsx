import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import toast from "react-hot-toast";
import { X, FolderOpen, Download, AlertCircle, RefreshCw, Settings, Youtube, Smartphone, HardDrive, Cpu, Terminal, ArrowRight } from "lucide-react";
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
}

const Section = ({ title, children, icon: Icon }: { title: string, children: React.ReactNode, icon?: React.ElementType }) => (
  <div className="mb-8">
    <h3 className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-spotify-lightgray/60">
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {title}
    </h3>
    <div className="overflow-hidden rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.05]">
      <div className="divide-y divide-white/[0.04]">
        {children}
      </div>
    </div>
  </div>
);

const SettingRow = ({ 
  icon: Icon, 
  title, 
  description, 
  action, 
  status 
}: { 
  icon: React.ElementType, 
  title: string, 
  description?: string, 
  action?: React.ReactNode,
  status?: React.ReactNode
}) => (
  <div className="flex items-center justify-between p-4 sm:p-5 transition-colors hover:bg-white/[0.01]">
    <div className="flex items-start gap-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-spotify-lightgray/80 ring-1 ring-white/10">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-white/90">{title}</h4>
          {status}
        </div>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-spotify-lightgray/70 max-w-sm">{description}</p>}
      </div>
    </div>
    {action && <div className="ml-4 shrink-0 flex items-center gap-2">{action}</div>}
  </div>
);

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
}: SettingsModalProps) {
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
        toast.success(`Updated · ${s.version || "latest"}`.trim(), { duration: 2500 });
      } else if (s.action === "installed") {
        toast.success(`Installed · ${s.version || ""}`.trim(), { duration: 2500 });
      } else {
        toast.success("yt-dlp ready");
      }
    } catch (err) {
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
      setFfmpegAvailable(true);
    } catch (e) {
      toast.dismiss();
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
        "fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6",
        "bg-black/60 backdrop-blur-sm transition-opacity duration-200",
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className={cn(
          "w-full max-w-2xl overflow-hidden rounded-3xl bg-[#121212] shadow-2xl ring-1 ring-white/10 flex flex-col max-h-[85vh]",
          "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isOpen ? "scale-100 translate-y-0 opacity-100" : "scale-95 translate-y-4 opacity-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 bg-[#181818]/80 backdrop-blur-md sticky top-0 z-10 border-b border-white/[0.04]">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-spotify-lightgray" />
            Preferences
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-spotify-lightgray transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6 sidebar-scroll bg-gradient-to-b from-[#181818]/30 to-transparent">
          
          <Section title="Storage & Library" icon={HardDrive}>
            <SettingRow
              icon={FolderOpen}
              title="Music Library Location"
              description={musicFolder || "No folder selected"}
              action={
                <div className="flex items-center gap-2">
                  <button
                    onClick={onLinkFolder}
                    className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10 ring-1 ring-white/10"
                  >
                    Change
                  </button>
                  {musicFolder && (
                    <button
                      onClick={onRescan}
                      disabled={isScanning}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-spotify-lightgray transition hover:bg-white/10 hover:text-white disabled:opacity-50 ring-1 ring-white/10"
                      title="Rescan Folder"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", isScanning && "animate-spin")} />
                    </button>
                  )}
                </div>
              }
            />
            <SettingRow
              icon={Download}
              title="Downloads Location"
              description={downloadFolder || "No folder selected"}
              action={
                <button
                  onClick={onPickDownloadFolder}
                  className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10 ring-1 ring-white/10"
                >
                  Change
                </button>
              }
            />
          </Section>

          <Section title="YouTube Integration" icon={Youtube}>
            <SettingRow
              icon={Terminal}
              title="yt-dlp Utility"
              description={`Core engine for downloading audio from YouTube. ${ytdlpStatus?.version ? `Version: ${ytdlpStatus.version}` : ''}`}
              status={
                ytdlpStatus && !ytdlpStatus.available ? (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500 ring-1 ring-amber-500/20">
                    <AlertCircle className="h-3 w-3" /> Missing
                  </span>
                ) : ytdlpStatus?.available ? (
                  <span className="rounded-full bg-spotify-green/10 px-2 py-0.5 text-[10px] font-semibold text-spotify-green ring-1 ring-spotify-green/20">
                    Ready
                  </span>
                ) : null
              }
              action={
                <button
                  onClick={handleUpdateYtdlp}
                  disabled={updatingYtdlp}
                  className="flex min-w-[100px] items-center justify-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-50 ring-1 ring-white/10"
                >
                  {updatingYtdlp ? (
                    `Updating ${Math.round(updatePercent)}%`
                  ) : ytdlpStatus?.available ? (
                    "Update"
                  ) : (
                    "Install"
                  )}
                </button>
              }
            />
            <SettingRow
              icon={Cpu}
              title="FFmpeg Encoder"
              description="Required for converting and optimizing downloaded media streams into high-quality audio files."
              status={
                ffmpegAvailable ? (
                  <span className="rounded-full bg-spotify-green/10 px-2 py-0.5 text-[10px] font-semibold text-spotify-green ring-1 ring-spotify-green/20">
                    Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500 ring-1 ring-amber-500/20">
                    <AlertCircle className="h-3 w-3" /> Missing
                  </span>
                )
              }
              action={
                <button
                  onClick={handleDownloadFfmpeg}
                  disabled={downloadingFfmpeg || ffmpegAvailable}
                  className={cn(
                    "flex min-w-[100px] items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition ring-1 disabled:opacity-50",
                    ffmpegAvailable
                      ? "bg-transparent text-spotify-lightgray ring-transparent"
                      : "bg-white/5 text-white ring-white/10 hover:bg-white/10"
                  )}
                >
                  {downloadingFfmpeg ? "Downloading..." : ffmpegAvailable ? "Installed" : "Download"}
                </button>
              }
            />
          </Section>

          {onCheckUpdates && (
            <Section title="Application" icon={Smartphone}>
              <SettingRow
                icon={RefreshCw}
                title="Software Update"
                description="Check for new features, bug fixes, and performance improvements for Orchestro."
                action={
                  <button
                    onClick={onCheckUpdates}
                    disabled={checkingUpdates}
                    className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/15 disabled:opacity-50 ring-1 ring-white/10"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", checkingUpdates && "animate-spin")} />
                    {checkingUpdates ? "Checking..." : "Check Now"}
                    {!checkingUpdates && <ArrowRight className="h-3.5 w-3.5 ml-1 opacity-50" />}
                  </button>
                }
              />
            </Section>
          )}
          
        </div>
      </div>
    </div>
  );
}

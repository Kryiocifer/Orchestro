import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, X, Check, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";

export interface DownloadJob {
  id: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  percent: number;
  status: "queued" | "downloading" | "converting" | "done" | "error" | "cancelled";
  message?: string;
  folder?: string;
  playlistName?: string;
}

interface DownloadPanelProps {
  jobs: DownloadJob[];
  open: boolean;
  onToggle: () => void;
  onClearDone: () => void;
  onClose?: () => void;
  onCancelAll?: () => void;
  onCancel: (id: string) => void;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `~${m}m ${s}s left` : `~${m}m left`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `~${h}h ${rm}m left` : `~${h}h left`;
}

export default function DownloadPanel({
  jobs,
  open,
  onToggle,
  onClearDone,
  onCancel,
  onClose,
  onCancelAll,
}: DownloadPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (open && panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose?.();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);
  const active = jobs.filter(
    (j) =>
      j.status === "downloading" ||
      j.status === "converting" ||
      j.status === "queued"
  );
  const doneCount = jobs.filter((j) => j.status === "done").length;
  const errorCount = jobs.filter(
    (j) => j.status === "error" || j.status === "cancelled"
  ).length;
  const hasActive = active.length > 0;
  const total = jobs.length;

  const overall =
    active.length > 0
      ? active.reduce((s, j) => s + (j.status === "queued" ? 0 : j.percent), 0) /
        Math.max(active.length, 1)
      : jobs.some((j) => j.status === "done")
      ? 100
      : 0;

  // ETA: track completed jobs over wall-clock time
  const batchStartRef = useRef<number | null>(null);
  const lastDoneRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasActive) {
      batchStartRef.current = null;
      lastDoneRef.current = doneCount;
      return;
    }
    if (batchStartRef.current == null) {
      batchStartRef.current = Date.now();
      lastDoneRef.current = doneCount;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasActive, doneCount]);

  const etaLabel = useMemo(() => {
    if (!hasActive || batchStartRef.current == null) return "";
    const elapsedSec = (now - batchStartRef.current) / 1000;
    const completedThisBatch = Math.max(0, doneCount - lastDoneRef.current);
    // Prefer jobs finished this session; if none yet, use active percent as soft signal
    if (completedThisBatch >= 1 && elapsedSec >= 3) {
      const perJob = elapsedSec / completedThisBatch;
      const remaining = active.length;
      return formatEta(perJob * remaining);
    }
    // Soft ETA from current download progress only
    const current = active.find(
      (j) => j.status === "downloading" || j.status === "converting"
    );
    if (current && current.percent > 5 && elapsedSec >= 5) {
      const rate = current.percent / elapsedSec; // % per sec for current-ish
      if (rate > 0.05) {
        const remainingPct =
          (100 - current.percent) + Math.max(0, active.length - 1) * 100;
        return formatEta(remainingPct / rate);
      }
    }
    return active.length > 1 ? `${active.length} in queue` : "Working…";
  }, [hasActive, now, doneCount, active]);

  if (jobs.length === 0) return null;

  return (
    <div className="fixed right-5 top-5 z-[80]" ref={panelRef}>
      <button
        onClick={onToggle}
        className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#282828]/80 shadow-lg ring-1 ring-white/10 backdrop-blur transition hover:bg-[#333]"
        title={hasActive ? etaLabel || "Downloads" : "Downloads"}
      >
        <svg className="absolute inset-0 h-11 w-11 -rotate-90" viewBox="0 0 44 44">
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="3"
          />
          {hasActive && (
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              stroke="#1db954"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(overall / 100) * 113} 113`}
              className="transition-all duration-500"
            />
          )}
        </svg>
        {hasActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
        ) : (
          <Download className="h-4 w-4 text-white/90" />
        )}
        {hasActive && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-spotify-green px-1 text-[10px] font-bold text-black">
            {active.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-14 w-[22rem] overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/95 shadow-2xl shadow-black/50 backdrop-blur-md">
          <div className="border-b border-white/5 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Downloads</p>
              <div className="flex items-center gap-2">
                {hasActive && onCancelAll && (
                  <button
                    onClick={onCancelAll}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-red-300/90 transition hover:bg-red-500/15 hover:text-red-200"
                  >
                    Stop all
                  </button>
                )}
                <button
                  onClick={onClearDone}
                  className="rounded-full px-2.5 py-1 text-[11px] text-white/50 transition hover:bg-white/10 hover:text-white/80"
                >
                  Clear done
                </button>
                <button
                  onClick={onToggle}
                  className="rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-white/45">
              <span>
                <span className="text-white/80">{doneCount}</span>
                {errorCount > 0 && (
                  <span className="text-red-300/80"> · {errorCount} failed</span>
                )}
                <span>
                  {" "}
                  / {total} finished
                </span>
              </span>
              {hasActive && etaLabel && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="font-medium text-spotify-green/90">
                    {etaLabel}
                  </span>
                </>
              )}
            </div>

            {hasActive && (
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-spotify-green/80 transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(
                      100,
                      total > 0
                        ? ((doneCount + overall / 100) / total) * 100
                        : overall
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {jobs.map((job) => {
              const canCancel =
                job.status === "queued" ||
                job.status === "downloading" ||
                job.status === "converting";
              return (
                <div
                  key={job.id}
                  className="border-b border-white/[0.04] px-4 py-3 last:border-0"
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <p className="line-clamp-2 flex-1 text-[13px] font-medium leading-snug text-white/90">
                      {job.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {canCancel && (
                        <button
                          onClick={() => onCancel(job.id)}
                          className="rounded-md px-2 py-0.5 text-[11px] font-medium text-white/40 transition hover:bg-white/10 hover:text-red-300"
                          title="Cancel"
                        >
                          Cancel
                        </button>
                      )}
                      {job.status === "done" && (
                        <Check className="h-3.5 w-3.5 text-spotify-green/90" />
                      )}
                      {(job.status === "error" ||
                        job.status === "cancelled") && (
                        <AlertCircle className="h-3.5 w-3.5 text-red-400/80" />
                      )}
                      {(job.status === "downloading" ||
                        job.status === "converting") && (
                        <span className="tabular-nums text-[11px] font-medium text-spotify-green/90">
                          {Math.round(job.percent)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300 ease-out",
                        job.status === "error" || job.status === "cancelled"
                          ? "bg-red-500/70"
                          : job.status === "done"
                          ? "bg-spotify-green/70"
                          : "bg-spotify-green/80"
                      )}
                      style={{
                        width: `${
                          job.status === "done" ||
                          job.status === "error" ||
                          job.status === "cancelled"
                            ? 100
                            : job.status === "queued"
                            ? 4
                            : Math.max(job.percent, 3)
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-white/35">
                    {job.status === "queued" && "Waiting in queue…"}
                    {job.status === "downloading" &&
                      (job.message?.includes("Search")
                        ? "Searching YouTube…"
                        : "Downloading…")}
                    {job.status === "converting" && "Converting to MP3…"}
                    {job.status === "done" && "Saved to library"}
                    {job.status === "cancelled" && "Cancelled"}
                    {job.status === "error" && (job.message || "Failed")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

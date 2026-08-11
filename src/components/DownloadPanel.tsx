import { Download, Loader2, X, Check, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";

export interface DownloadJob {
  id: string;
  title: string;
  percent: number;
  status: "queued" | "downloading" | "converting" | "done" | "error" | "cancelled";
  message?: string;
}

interface DownloadPanelProps {
  jobs: DownloadJob[];
  open: boolean;
  onToggle: () => void;
  onClearDone: () => void;
  onCancel: (jobId: string) => void;
}

export default function DownloadPanel({
  jobs,
  open,
  onToggle,
  onClearDone,
  onCancel,
}: DownloadPanelProps) {
  const active = jobs.filter(
    (j) =>
      j.status === "downloading" ||
      j.status === "converting" ||
      j.status === "queued"
  );
  const hasActive = active.length > 0;
  const overall =
    active.length > 0
      ? active.reduce((s, j) => s + j.percent, 0) / active.length
      : jobs.some((j) => j.status === "done")
      ? 100
      : 0;

  if (jobs.length === 0) return null;

  return (
    <div className="fixed right-5 top-5 z-[80]">
      <button
        onClick={onToggle}
        className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#282828] shadow-lg ring-1 ring-white/10 transition hover:bg-[#333]"
        title="Downloads"
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
            />
          )}
        </svg>
        {hasActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
        ) : (
          <Download className="h-4 w-4 text-white" />
        )}
        {hasActive && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-spotify-green px-1 text-[10px] font-bold text-black">
            {active.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-14 w-80 overflow-hidden rounded-xl border border-white/10 bg-[#181818] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold">Downloads</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClearDone}
                className="text-xs text-spotify-lightgray hover:text-white"
              >
                Clear done
              </button>
              <button
                onClick={onToggle}
                className="rounded p-1 text-spotify-lightgray hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {jobs.map((job) => {
              const canCancel =
                job.status === "queued" ||
                job.status === "downloading" ||
                job.status === "converting";
              return (
                <div
                  key={job.id}
                  className="border-b border-white/5 px-4 py-3 last:border-0"
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <p className="line-clamp-2 flex-1 text-sm font-medium leading-snug">
                      {job.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {canCancel && (
                        <button
                          onClick={() => onCancel(job.id)}
                          className="rounded px-2 py-0.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20"
                          title="Cancel download"
                        >
                          Cancel
                        </button>
                      )}
                      {job.status === "done" && (
                        <Check className="h-4 w-4 text-spotify-green" />
                      )}
                      {(job.status === "error" || job.status === "cancelled") && (
                        <AlertCircle className="h-4 w-4 text-red-400" />
                      )}
                      {(job.status === "downloading" ||
                        job.status === "converting") && (
                        <span className="text-xs font-medium text-spotify-green">
                          {Math.round(job.percent)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        job.status === "error" || job.status === "cancelled"
                          ? "bg-red-500"
                          : "bg-spotify-green"
                      )}
                      style={{
                        width: `${
                          job.status === "done"
                            ? 100
                            : job.status === "error" || job.status === "cancelled"
                            ? 100
                            : Math.max(job.percent, 2)
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-spotify-lightgray">
                    {job.status === "queued" && "Queued…"}
                    {job.status === "downloading" && "Downloading…"}
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

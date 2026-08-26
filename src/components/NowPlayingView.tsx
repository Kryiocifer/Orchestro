import { useEffect, useRef } from "react";
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Volume1,
} from "lucide-react";
import { Song } from "../lib/types";
import { formatTime } from "../lib/utils";
import { cn } from "../lib/utils";
import { RepeatMode } from "./PlayerBar";

interface NowPlayingViewProps {
  song: Song;
  isPlaying: boolean;
  progress: number;
  volume: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  onClose: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (percent: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}

export default function NowPlayingView({
  song,
  isPlaying,
  progress,
  volume,
  shuffle,
  repeatMode,
  onClose,
  onTogglePlay,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  onToggleShuffle,
  onCycleRepeat,
}: NowPlayingViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const elapsed = (progress / 100) * (song.duration || 0);
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ animation: "nowPlayingSlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both" }}
    >
      <div className="absolute inset-0 overflow-hidden">
        {song.cover ? (
          <>
            <img
              src={song.cover}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover"
              style={{ filter: "blur(60px) brightness(0.35) saturate(1.4)" }}
            />
            <div className="absolute inset-0 bg-black/50" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460]" />
        )}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-between px-8 pb-10 pt-6">
        <div className="flex w-full max-w-lg items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/70 backdrop-blur transition hover:bg-white/15 hover:text-white"
          >
            <ChevronDown className="h-4 w-4" />
            Now Playing
          </button>
          <div className="text-xs text-white/30 tabular-nums">
            {song.album || ""}
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-1 items-center justify-center py-6">
          <div
            className="aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl"
            style={{
              boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
              animation: "nowPlayingArtIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both",
            }}
          >
            {song.cover ? (
              <img src={song.cover} alt={song.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#282828] text-8xl">
                🎵
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full max-w-lg flex-col gap-6">
          <div>
            <h2 className="truncate text-2xl font-bold tracking-tight text-white" title={song.title}>
              {song.title}
            </h2>
            <p className="mt-1 truncate text-sm text-white/50">
              {song.artist}{song.album ? ` · ${song.album}` : ""}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="w-full"
              style={{ "--progress": `${progress}%` } as React.CSSProperties}
            />
            <div className="flex justify-between text-xs text-white/40 tabular-nums">
              <span>{formatTime(elapsed)}</span>
              <span>{formatTime(song.duration || 0)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={onToggleShuffle}
              className={cn("rounded-full p-2 transition", shuffle ? "text-white" : "text-white/40 hover:text-white/70")}
            >
              <Shuffle className="h-5 w-5" />
            </button>
            <button onClick={onPrevious} className="rounded-full p-2 text-white/70 transition hover:text-white">
              <SkipBack className="h-7 w-7 fill-current" />
            </button>
            <button
              onClick={onTogglePlay}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 active:scale-95"
            >
              {isPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="h-7 w-7 fill-current" />}
            </button>
            <button onClick={onNext} className="rounded-full p-2 text-white/70 transition hover:text-white">
              <SkipForward className="h-7 w-7 fill-current" />
            </button>
            <button
              onClick={onCycleRepeat}
              className={cn("rounded-full p-2 transition", repeatMode !== "off" ? "text-white" : "text-white/40 hover:text-white/70")}
            >
              {repeatMode === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => onVolumeChange(volume === 0 ? 0.7 : 0)} className="text-white/40 transition hover:text-white/70">
              <VolumeIcon className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="flex-1"
              style={{ "--progress": `${volume * 100}%` } as React.CSSProperties}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes nowPlayingSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes nowPlayingArtIn {
          from { transform: scale(0.85); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

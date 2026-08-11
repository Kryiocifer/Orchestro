import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Shuffle,
  Repeat,
  Repeat1,
} from "lucide-react";
import { Song } from "../lib/types";
import { formatTime } from "../lib/utils";
import { cn } from "../lib/utils";

export type RepeatMode = "off" | "all" | "one";

interface PlayerBarProps {
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number;
  volume: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (percent: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}

export default function PlayerBar({
  currentSong,
  isPlaying,
  progress,
  volume,
  shuffle,
  repeatMode,
  onTogglePlay,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  onToggleShuffle,
  onCycleRepeat,
}: PlayerBarProps) {
  const VolumeIcon =
    volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex h-[90px] items-center gap-4 border-t border-[#282828] bg-spotify-dark px-4">
      {/* Song info */}
      <div className="flex w-[30%] min-w-[180px] items-center gap-3">
        {currentSong ? (
          <>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-spotify-gray">
              {currentSong.cover ? (
                <img
                  src={currentSong.cover}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl">🎵</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{currentSong.title}</p>
              <p className="truncate text-xs text-spotify-lightgray">
                {currentSong.artist}
              </p>
            </div>
          </>
        ) : (
          <div className="text-sm text-spotify-lightgray">No song playing</div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            className={cn(
              "transition",
              shuffle
                ? "text-spotify-green"
                : "text-spotify-lightgray hover:text-white"
            )}
            title={shuffle ? "Disable shuffle" : "Enable shuffle"}
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <button
            onClick={onPrevious}
            className="text-spotify-lightgray transition hover:text-white disabled:opacity-40"
            disabled={!currentSong}
          >
            <SkipBack className="h-5 w-5 fill-current" />
          </button>

          <button
            onClick={onTogglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:scale-105"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
          </button>

          <button
            onClick={onNext}
            className="text-spotify-lightgray transition hover:text-white disabled:opacity-40"
            disabled={!currentSong}
          >
            <SkipForward className="h-5 w-5 fill-current" />
          </button>

          {/* Repeat */}
          <button
            onClick={onCycleRepeat}
            className={cn(
              "transition",
              repeatMode !== "off"
                ? "text-spotify-green"
                : "text-spotify-lightgray hover:text-white"
            )}
            title={
              repeatMode === "off"
                ? "Enable repeat"
                : repeatMode === "all"
                ? "Repeat one"
                : "Disable repeat"
            }
          >
            {repeatMode === "one" ? (
              <Repeat1 className="h-4 w-4" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Progress */}
        <div className="flex w-full max-w-xl items-center gap-2 text-xs text-spotify-lightgray">
          <span className="w-10 text-right">
            {currentSong
              ? formatTime((progress / 100) * (currentSong.duration || 0))
              : "0:00"}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="flex-1"
            style={
              {
                "--progress": `${progress}%`,
              } as React.CSSProperties
            }
            disabled={!currentSong}
          />
          <span className="w-10">
            {currentSong ? formatTime(currentSong.duration) : "0:00"}
          </span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex w-[30%] min-w-[120px] items-center justify-end gap-2">
        <button
          onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
          className="text-spotify-lightgray hover:text-white"
        >
          <VolumeIcon className="h-5 w-5" />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="w-24"
          style={
            {
              "--progress": `${volume * 100}%`,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}

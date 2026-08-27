import { useState, useRef, useEffect } from "react";
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
  ListMusic,
  Trash2,
  X,
  Sliders,
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
  queue?: Song[];
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (percent: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onPlayQueueItem?: (song: Song) => void;
  onRemoveFromQueue?: (index: number) => void;
  onClearQueue?: () => void;
  onSongInfoClick?: () => void;
  onOpenEqualizer?: () => void;
}

export default function PlayerBar({
  currentSong,
  isPlaying,
  progress,
  volume,
  shuffle,
  repeatMode,
  queue = [],
  onTogglePlay,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  onToggleShuffle,
  onCycleRepeat,
  onPlayQueueItem,
  onRemoveFromQueue,
  onClearQueue,
  onSongInfoClick,
  onOpenEqualizer,
}: PlayerBarProps) {
  const [showQueue, setShowQueue] = useState(false);
  const queueMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (queueMenuRef.current && !queueMenuRef.current.contains(e.target as Node)) {
        setShowQueue(false);
      }
    };
    if (showQueue) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [showQueue]);

  const currentIndex = currentSong
    ? queue.findIndex((s) => s.id === currentSong.id)
    : -1;
  const nextUp = currentIndex >= 0 ? queue.slice(currentIndex + 1) : queue;

  const VolumeIcon =
    volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="relative flex h-[90px] items-center gap-4 border-t border-[#282828] bg-spotify-dark px-4">
      {/* Song info */}
      <div className="flex w-[30%] min-w-[180px] items-center gap-3">
        {currentSong ? (
          <button
            onClick={onSongInfoClick}
            className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 transition hover:bg-white/5 active:bg-white/10"
            style={{ cursor: onSongInfoClick ? "pointer" : "default" }}
          >
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
          </button>
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

      {/* Volume & Queue */}
      <div className="flex w-[30%] min-w-[120px] items-center justify-end gap-3">
        <button
          onClick={onOpenEqualizer}
          className="text-spotify-lightgray transition hover:text-white"
          title="Equalizer"
        >
          <Sliders className="h-5 w-5" />
        </button>

        <button
          onClick={() => setShowQueue((v) => !v)}
          className={cn(
            "rounded-md p-1.5 transition",
            showQueue
              ? "bg-white/10 text-spotify-green"
              : "text-spotify-lightgray hover:text-white"
          )}
          title="Queue"
        >
          <ListMusic className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
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

      {/* Queue Drawer / Popover */}
      {showQueue && (
        <div
          ref={queueMenuRef}
          className="fixed bottom-[100px] right-4 z-50 flex max-h-[460px] w-80 flex-col rounded-xl border border-[#333] bg-[#282828] p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic className="h-5 w-5 text-spotify-green" />
              <h3 className="font-semibold text-white">Play Queue</h3>
            </div>
            <div className="flex items-center gap-1">
              {nextUp.length > 0 && onClearQueue && (
                <button
                  onClick={onClearQueue}
                  className="rounded px-2 py-1 text-xs text-spotify-lightgray transition hover:bg-white/10 hover:text-white"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setShowQueue(false)}
                className="rounded p-1 text-spotify-lightgray transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="sidebar-scroll flex-1 space-y-3 overflow-y-auto pr-1">
            {currentSong && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-spotify-lightgray">
                  Now Playing
                </p>
                <div className="flex items-center gap-3 rounded-lg bg-white/5 p-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-spotify-gray">
                    {currentSong.cover ? (
                      <img
                        src={currentSong.cover}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>🎵</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-spotify-green">
                      {currentSong.title}
                    </p>
                    <p className="truncate text-xs text-spotify-lightgray">
                      {currentSong.artist}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-spotify-lightgray">
                Next Up {nextUp.length > 0 && `(${nextUp.length})`}
              </p>
              {nextUp.length === 0 ? (
                <p className="py-4 text-center text-xs text-spotify-lightgray">
                  Queue is empty
                </p>
              ) : (
                <div className="space-y-1">
                  {nextUp.map((song, i) => {
                    const actualIdx =
                      currentIndex >= 0 ? currentIndex + 1 + i : i;
                    return (
                      <div
                        key={`${song.id}-${i}`}
                        className="group flex items-center justify-between rounded-lg p-2 transition hover:bg-white/5"
                      >
                        <button
                          onClick={() => onPlayQueueItem?.(song)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-spotify-gray text-xs">
                            {song.cover ? (
                              <img
                                src={song.cover}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span>🎵</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">
                              {song.title}
                            </p>
                            <p className="truncate text-xs text-spotify-lightgray">
                              {song.artist}
                            </p>
                          </div>
                        </button>
                        {onRemoveFromQueue && (
                          <button
                            onClick={() => onRemoveFromQueue(actualIdx)}
                            className="hidden p-1 text-spotify-lightgray transition hover:text-red-400 group-hover:block"
                            title="Remove from queue"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

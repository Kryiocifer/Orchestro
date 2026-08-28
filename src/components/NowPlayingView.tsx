import { useEffect, useRef, useState, useCallback } from "react";
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Mic2,
  Disc3,
  Sliders,
  RefreshCw,
  RotateCcw,
  Timer,
} from "lucide-react";
import { Song } from "../lib/types";
import { formatTime, cn } from "../lib/utils";
import { RepeatMode } from "./PlayerBar";
import {
  fetchLyrics,
  LyricsData,
  getLyricOffset,
  saveLyricOffset,
} from "../lib/lyrics";

interface NowPlayingViewProps {
  song: Song;
  coverUrl?: string | null;
  isPlaying: boolean;
  progress: number;
  currentTime?: number;
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
  onOpenEqualizer?: () => void;
}

export default function NowPlayingView({
  song,
  coverUrl,
  isPlaying,
  progress,
  currentTime,
  shuffle,
  repeatMode,
  onClose,
  onTogglePlay,
  onNext,
  onPrevious,
  onSeek,
  onToggleShuffle,
  onCycleRepeat,
  onOpenEqualizer,
}: NowPlayingViewProps) {
  const [viewMode, setViewMode] = useState<"artwork" | "lyrics">("artwork");
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [userIsScrolling, setUserIsScrolling] = useState(false);
  const [lyricOffset, setLyricOffset] = useState<number>(() => getLyricOffset(song.id));
  const [showOffsetControls, setShowOffsetControls] = useState(false);

  const offsetControlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (offsetControlsRef.current && !offsetControlsRef.current.contains(e.target as Node)) {
        setShowOffsetControls(false);
      }
    };
    if (showOffsetControls) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showOffsetControls]);

  const scrollTimeoutRef = useRef<number | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Fetch lyrics
  const loadSongLyrics = useCallback(async () => {
    setLoadingLyrics(true);
    setLyrics(null);
    setLyricOffset(getLyricOffset(song.id));
    try {
      const data = await fetchLyrics(song.title, song.artist, song.duration);
      setLyrics(data);
    } catch (err) {
      console.warn("Failed to load lyrics:", err);
    } finally {
      setLoadingLyrics(false);
    }
  }, [song.id, song.title, song.artist, song.duration]);

  useEffect(() => {
    loadSongLyrics();
  }, [loadSongLyrics]);

  // Exact time pipeline
  const effectiveCurrentTime =
    typeof currentTime === "number" && !isNaN(currentTime) && currentTime >= 0
      ? currentTime
      : (progress / 100) * (song.duration || 0);

  // Determine active line
  let activeLyricIndex = -1;
  if (lyrics?.synced && lyrics.lines.length > 0) {
    for (let i = 0; i < lyrics.lines.length; i++) {
      const lineTime = lyrics.lines[i].time + lyricOffset;
      if (effectiveCurrentTime >= lineTime) {
        activeLyricIndex = i;
      } else {
        break;
      }
    }
  }

  // Handle User Scroll detection
  const handleUserManualInteraction = () => {
    setUserIsScrolling(true);
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(() => {
      setUserIsScrolling(false);
    }, 2500); // Wait 2.5s after last touch before auto-scrolling again
  };

  // Reset user scroll when changing view modes
  useEffect(() => {
    if (viewMode === "lyrics") {
      setUserIsScrolling(false);
    }
  }, [viewMode]);

  // Auto-scroll logic
  useEffect(() => {
    if (viewMode !== "lyrics" || userIsScrolling || activeLyricIndex < 0 || !activeLineRef.current) {
      return;
    }
    
    // Custom smooth scroll to bypass jagged/instant native WebKitGTK scrolling
    if (activeLineRef.current && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current;
      const el = activeLineRef.current;
      const targetY = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
      
      const startY = container.scrollTop;
      const difference = targetY - startY;
      const startTime = performance.now();
      const duration = 600; // ms

      const step = (currentTime: number) => {
        // If user interacted during the animation, abort
        if (userIsScrolling) return;

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // easeInOutCubic
        const ease = progress < 0.5 
          ? 4 * progress * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        container.scrollTop = startY + difference * ease;

        if (progress < 1) {
          requestAnimationFrame(step);
        }
      };

      requestAnimationFrame(step);
    }
  }, [activeLyricIndex, viewMode]); // Intentionally removed userIsScrolling to prevent immediate abort on trigger

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-[#121212]"
      style={{
        animation: "nowPlayingSlideUp 0.35s cubic-bezier(0.25,1,0.5,1) both",
      }}
    >
      {/* Background layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {coverUrl || song.cover ? (
          <>
            <img
              src={coverUrl || song.cover}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover transition-all duration-700"
              style={{ filter: "blur(70px) brightness(0.3) saturate(1.2)" }}
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a2e] to-[#0f3460] opacity-80 transition-all duration-700" />
        )}
      </div>

      {/* Header */}
      <div className="relative z-10 flex w-full items-center justify-between px-8 pt-6 pb-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          <ChevronDown className="h-4 w-4" />
          <span>Now Playing</span>
        </button>

        <div className="flex items-center rounded-full bg-black/40 p-1 border border-white/10">
          <button
            onClick={() => setViewMode("artwork")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition",
              viewMode === "artwork" ? "bg-white/20 text-white" : "text-white/50 hover:text-white/80"
            )}
          >
            <Disc3 className="h-4 w-4" />
            <span>Cover</span>
          </button>
          <button
            onClick={() => setViewMode("lyrics")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition",
              viewMode === "lyrics" ? "bg-white/20 text-white" : "text-white/50 hover:text-white/80"
            )}
          >
            <Mic2 className="h-4 w-4" />
            <span>Lyrics</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === "lyrics" && lyrics && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setShowOffsetControls((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition",
                showOffsetControls || lyricOffset !== 0
                  ? "bg-spotify-green text-black"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              )}
            >
              <Timer className="h-4 w-4" />
              <span>
                {lyricOffset !== 0
                  ? `${lyricOffset > 0 ? "+" : ""}${lyricOffset.toFixed(1)}s`
                  : "Sync"}
              </span>
            </button>
          )}

          {onOpenEqualizer && (
            <button
              onClick={onOpenEqualizer}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/20"
            >
              <Sliders className="h-4 w-4 text-spotify-green" />
              <span>EQ</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync popover */}
      {viewMode === "lyrics" && showOffsetControls && (
        <div className="relative z-20 flex w-full justify-end px-8">
          <div ref={offsetControlsRef} className="absolute top-2 w-72 rounded-xl bg-[#282828] p-4 shadow-2xl border border-white/10">
            <div className="flex justify-between items-center text-xs mb-3">
              <span className="font-semibold text-white/80">Lyrics Offset</span>
            </div>
            <input
              type="range"
              min={-15}
              max={15}
              step={0.1}
              value={lyricOffset}
              onChange={(e) => {
                const val = Number(e.target.value);
                setLyricOffset(val);
              }}
              onPointerUp={() => {
                saveLyricOffset(song.id, lyricOffset);
              }}
              className="w-full accent-spotify-green mb-3 cursor-pointer"
            />
            <div className="flex justify-between items-center mt-1">
              <button
                onClick={() => {
                  setLyricOffset(0);
                  saveLyricOffset(song.id, 0);
                }}
                className="text-xs text-white/50 hover:text-white flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const val = Math.max(-15, lyricOffset - 0.5);
                    setLyricOffset(val);
                    saveLyricOffset(song.id, val);
                  }}
                  className="rounded bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20"
                >
                  -0.5s
                </button>
                <button
                  onClick={() => {
                    const val = Math.min(15, lyricOffset + 0.5);
                    setLyricOffset(val);
                    saveLyricOffset(song.id, val);
                  }}
                  className="rounded bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20"
                >
                  +0.5s
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Center Display Area */}
      <div className="relative flex flex-1 w-full overflow-hidden">
        {viewMode === "artwork" ? (
          <div className="flex h-full w-full items-center justify-center p-8">
            <div className="aspect-square w-full max-w-sm overflow-hidden rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              {coverUrl || song.cover ? (
                <img src={coverUrl || song.cover} alt={song.title} className="h-full w-full object-cover transition-opacity duration-500" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#282828] text-6xl">🎵</div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative flex h-full w-full flex-col items-center">
            {/* The Scrollable Lyrics Container */}
            <div
              ref={lyricsContainerRef}
              className="sidebar-scroll w-full flex-1 overflow-y-auto px-4 relative z-0"
              onWheel={handleUserManualInteraction}
              onTouchStart={handleUserManualInteraction}
              onMouseDown={handleUserManualInteraction}
            >
              {loadingLyrics ? (
                <div className="flex h-full items-center justify-center gap-2 text-white/50">
                  <RefreshCw className="h-5 w-5 animate-spin text-spotify-green" />
                  <span>Loading lyrics...</span>
                </div>
              ) : lyrics?.synced && lyrics.lines.length > 0 ? (
                <div className="flex flex-col items-center gap-8 py-[45vh]">
                  {lyrics.lines.map((line, idx) => {
                    const isActive = idx === activeLyricIndex;
                    const isPast = idx < activeLyricIndex;
                    const seekTime = line.time + lyricOffset;

                    return (
                      <button
                        key={idx}
                        ref={(el) => {
                          if (isActive && el) {
                            activeLineRef.current = el;
                          }
                        }}
                        onClick={() => {
                          handleUserManualInteraction(); // clicking is an interaction
                          onSeek(
                            song.duration > 0
                              ? (Math.max(0, seekTime) / song.duration) * 100
                              : 0
                          );
                        }}
                        className={cn(
                          "w-full max-w-4xl text-center px-4 transition-all duration-500 ease-in-out origin-center cursor-pointer",
                          "text-2xl md:text-4xl font-bold",
                          isActive
                            ? "text-white scale-110 drop-shadow-lg"
                            : isPast
                            ? "text-white/40 hover:text-white/60 scale-100"
                            : "text-white/20 hover:text-white/50 scale-100"
                        )}
                      >
                        {line.text || "♪"}
                      </button>
                    );
                  })}
                </div>
              ) : lyrics?.plain ? (
                <div className="flex flex-col items-center py-20">
                  <span className="mb-8 rounded bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white/50">
                    Plain Text Lyrics
                  </span>
                  {lyrics.plain.split("\n").map((line, idx) => (
                    <p key={idx} className="mb-4 text-center text-lg font-medium text-white/80">
                      {line || "\u00A0"}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-white/50">
                  <p>No lyrics found for this song.</p>
                  <button
                    onClick={loadSongLyrics}
                    className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10 hover:text-white"
                  >
                    <RefreshCw className="h-4 w-4" /> Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Player Controls */}
      <div className="relative z-10 w-full bg-black/20 px-8 pt-4 pb-8 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          {/* Metadata */}
          <div className="flex flex-col items-center text-center">
            <h2 className="truncate text-2xl font-bold text-white max-w-full">
              {song.title}
            </h2>
            <p className="mt-1 truncate text-sm font-medium text-white/60 max-w-full">
              {song.artist}
            </p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-4">
            <span className="w-12 text-right text-xs font-medium text-white/50 tabular-nums">
              {formatTime(effectiveCurrentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progress}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="flex-1"
              style={{ "--progress": `${progress}%` } as React.CSSProperties}
            />
            <span className="w-12 text-left text-xs font-medium text-white/50 tabular-nums">
              {formatTime(song.duration || 0)}
            </span>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-6 sm:gap-8">
            <button
              onClick={onToggleShuffle}
              className={cn(
                "p-2 transition-colors",
                shuffle ? "text-spotify-green" : "text-white/40 hover:text-white"
              )}
            >
              <Shuffle className="h-5 w-5" />
            </button>
            
            <button onClick={onPrevious} className="p-2 text-white/70 hover:text-white transition">
              <SkipBack className="h-8 w-8 fill-current" />
            </button>
            
            <button
              onClick={onTogglePlay}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95 shadow-lg"
            >
              {isPlaying ? <Pause className="h-8 w-8 fill-current" /> : <Play className="h-8 w-8 fill-current ml-1" />}
            </button>
            
            <button onClick={onNext} className="p-2 text-white/70 hover:text-white transition">
              <SkipForward className="h-8 w-8 fill-current" />
            </button>
            
            <button
              onClick={onCycleRepeat}
              className={cn(
                "p-2 transition-colors",
                repeatMode !== "off" ? "text-spotify-green" : "text-white/40 hover:text-white"
              )}
            >
              {repeatMode === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes nowPlayingSlideUp {
          0% { transform: translateY(100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

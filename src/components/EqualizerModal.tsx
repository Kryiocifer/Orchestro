import { useState, useEffect, useRef, useCallback } from "react";
import { X, RotateCcw, Power, Music2, Headphones, Volume2 } from "lucide-react";
import {
  equalizerEngine,
  EQ_BAND_LABELS,
  GENRE_PRESETS,
  DEVICE_PRESETS,
  EqualizerSettings,
} from "../lib/equalizer";
import { cn } from "../lib/utils";

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TRACK_H = 140;
const MAX_DB = 12;

function Band({
  label,
  gain,
  disabled,
  onChange,
}: {
  label: string;
  gain: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const safeGain = typeof gain === "number" && !isNaN(gain) ? gain : 0;
  const clampedGain = Math.max(-MAX_DB, Math.min(MAX_DB, safeGain));
  const pct = ((MAX_DB - clampedGain) / (MAX_DB * 2)) * 100;

  const yToGain = useCallback((y: number) => {
    if (!trackRef.current) return 0;
    const r = trackRef.current.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (y - r.top) / r.height));
    return Math.round((MAX_DB - f * MAX_DB * 2) * 2) / 2;
  }, []);

  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    onChange(yToGain(e.clientY));
  };
  const move = (e: React.PointerEvent) => {
    if (dragging.current) onChange(yToGain(e.clientY));
  };
  const up = () => {
    dragging.current = false;
  };

  const mid = 50;
  const fillTop = Math.min(mid, pct);
  const fillBot = 100 - Math.max(mid, pct);

  return (
    <div className={cn("flex flex-col items-center select-none", disabled && "opacity-30")}>
      <span
        className={cn(
          "mb-1 text-[11px] tabular-nums font-medium",
          clampedGain === 0
            ? "text-spotify-lightgray/50"
            : clampedGain > 0
            ? "text-spotify-green font-semibold"
            : "text-red-400 font-semibold"
        )}
      >
        {clampedGain > 0 ? `+${clampedGain}` : clampedGain}
      </span>

      <div
        ref={trackRef}
        className="relative cursor-ns-resize touch-none flex items-center justify-center"
        style={{ width: 20, height: TRACK_H }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {/* rail */}
        <div
          className="absolute inset-x-0 mx-auto w-[3px] rounded-full bg-white/[0.08]"
          style={{ top: 0, bottom: 0 }}
        />
        {/* 0dB line */}
        <div
          className="absolute inset-x-0 h-px bg-white/[0.12]"
          style={{ top: "50%" }}
        />
        {/* fill */}
        {clampedGain !== 0 && (
          <div
            className={cn(
              "absolute inset-x-0 mx-auto w-[3px] rounded-full",
              clampedGain > 0 ? "bg-spotify-green" : "bg-red-400"
            )}
            style={{ top: `${fillTop}%`, bottom: `${fillBot}%` }}
          />
        )}
        {/* thumb */}
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-white/80 shadow-md",
            clampedGain === 0
              ? "bg-spotify-gray"
              : clampedGain > 0
              ? "bg-spotify-green"
              : "bg-red-400"
          )}
          style={{ top: `${pct}%` }}
        />
      </div>

      <span className="mt-1.5 text-[10px] font-medium text-spotify-lightgray/60">
        {label}
      </span>
    </div>
  );
}

export default function EqualizerModal({ isOpen, onClose }: EqualizerModalProps) {
  const [s, setS] = useState<EqualizerSettings>(() => {
    try {
      return equalizerEngine.getSettings();
    } catch {
      return {
        enabled: true,
        preamp: 0,
        musicGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        genreId: "flat",
        deviceId: "speakers",
        deviceCalibrationEnabled: true,
        isCustom: false,
      };
    }
  });

  useEffect(() => {
    if (isOpen) {
      try {
        setS(equalizerEngine.getSettings());
        equalizerEngine.ensureContextRunning();
      } catch (err) {
        console.warn("Failed to sync equalizer settings on modal open:", err);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sync = () => {
    try {
      setS({ ...equalizerEngine.getSettings() });
    } catch (err) {
      console.warn("Error syncing equalizer settings:", err);
    }
  };

  const isEnabled = s?.enabled ?? true;
  const genreId = s?.genreId || "flat";
  const deviceId = s?.deviceId || "speakers";
  const preamp = typeof s?.preamp === "number" && !isNaN(s.preamp) ? s.preamp : 0;
  const gains =
    Array.isArray(s?.musicGains) && s.musicGains.length === 10
      ? s.musicGains
      : Array.isArray(s?.gains) && s.gains.length === 10
      ? s.gains
      : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[640px] rounded-xl border border-[#333] bg-[#282828] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#333] px-5 py-3.5">
          <h3 className="text-sm font-bold text-white">Equalizer</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                equalizerEngine.setEnabled(!isEnabled);
                sync();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                isEnabled
                  ? "bg-spotify-green/20 text-spotify-green border border-spotify-green/30"
                  : "bg-white/5 text-spotify-lightgray hover:text-white border border-white/10"
              )}
            >
              <Power className="h-3.5 w-3.5" />
              {isEnabled ? "On" : "Off"}
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-spotify-lightgray transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Preset selectors */}
        <div className="grid grid-cols-2 gap-3 px-5 py-3.5 border-b border-[#333]/60">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-spotify-lightgray/80">
              <Music2 className="mr-1 inline h-3 w-3 text-spotify-green" />
              Genre Tone Preset
            </p>
            <select
              value={genreId}
              disabled={!isEnabled}
              onChange={(e) => {
                equalizerEngine.setGenre(e.target.value);
                sync();
              }}
              className="w-full rounded-lg border border-[#333] bg-[#181818] px-3 py-2 text-xs font-medium text-white outline-none transition focus:border-spotify-green disabled:opacity-40"
            >
              {GENRE_PRESETS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-spotify-lightgray/80">
              <Headphones className="mr-1 inline h-3 w-3 text-spotify-green" />
              Device Hardware Profile
            </p>
            <select
              value={deviceId}
              disabled={!isEnabled}
              onChange={(e) => {
                equalizerEngine.setDevice(e.target.value);
                sync();
              }}
              className="w-full rounded-lg border border-[#333] bg-[#181818] px-3 py-2 text-xs font-medium text-white outline-none transition focus:border-spotify-green disabled:opacity-40"
            >
              {DEVICE_PRESETS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bands */}
        <div className="px-5 py-3">
          <div
            className={cn(
              "rounded-lg bg-[#1e1e1e] p-4 transition-opacity",
              !isEnabled && "opacity-40"
            )}
          >
            <div className="flex items-end justify-between">
              {EQ_BAND_LABELS.map((label, i) => (
                <Band
                  key={label}
                  label={label}
                  gain={gains[i] ?? 0}
                  disabled={!isEnabled}
                  onChange={(v) => {
                    equalizerEngine.setBandGain(i, v);
                    sync();
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Preamp + Footer */}
        <div className="flex items-center justify-between border-t border-[#333] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Volume2 className="h-4 w-4 text-spotify-lightgray" />
            <span className="text-xs text-spotify-lightgray">Preamp</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={preamp}
              disabled={!isEnabled}
              onChange={(e) => {
                equalizerEngine.setPreamp(parseFloat(e.target.value));
                sync();
              }}
              className="w-28 accent-spotify-green"
              style={
                {
                  "--progress": `${((preamp + 12) / 24) * 100}%`,
                } as React.CSSProperties
              }
            />
            <span
              className={cn(
                "w-10 text-xs tabular-nums font-medium",
                preamp === 0
                  ? "text-spotify-lightgray"
                  : preamp > 0
                  ? "text-spotify-green font-semibold"
                  : "text-red-400 font-semibold"
              )}
            >
              {preamp > 0 ? "+" : ""}
              {preamp} dB
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                equalizerEngine.reset();
                sync();
              }}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-spotify-lightgray transition hover:bg-white/5 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
            <button
              onClick={onClose}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition hover:scale-105 active:scale-95"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

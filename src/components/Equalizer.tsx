import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  GENRE_PRESETS,
  DEVICE_PRESETS,
  FLAT_BANDS,
  EQBand,
  EQEngine,
  equalizerEngine,
} from "../lib/equalizer";
import { cn } from "../lib/utils";

interface EqualizerProps {
  audioElement?: HTMLAudioElement;
  engine?: EQEngine;
}

const CustomSelect: React.FC<{
  value: string;
  options: { id: string; name: string }[];
  onChange: (val: string) => void;
  disabled?: boolean;
}> = ({ value, options, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selected = options.find((o) => o.id === value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs outline-none transition-colors",
          isOpen ? "border-spotify-green bg-[#222]" : "border-[#333] bg-[#181818]",
          !disabled && !isOpen && "hover:border-[#555] hover:bg-[#222]",
          disabled ? "opacity-40 cursor-not-allowed text-white" : "cursor-pointer text-white"
        )}
      >
        <span className="truncate">{selected?.name ?? "Select"}</span>
        <ChevronDown size={14} className={cn("text-spotify-lightgray transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#333] bg-[#282828] py-1 shadow-xl sidebar-scroll">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                onChange(opt.id);
                setIsOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors cursor-pointer",
                value === opt.id 
                  ? "bg-white/10 text-spotify-green" 
                  : "text-spotify-lightgray hover:bg-white/5 hover:text-white"
              )}
            >
              <span className="truncate">{opt.name}</span>
              {value === opt.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Equalizer: React.FC<EqualizerProps> = ({
  audioElement,
  engine,
}) => {
  const engineRef = useRef<EQEngine>(engine ?? equalizerEngine);
  
  const [genreId, setGenreId] = useState(() => engineRef.current.getSettings().genreId || "flat");
  const [deviceId, setDeviceId] = useState(() => engineRef.current.getSettings().deviceId || "speakers");
  const [bands, setBands] = useState<EQBand[]>(() => {
    const s = engineRef.current.getSettings();
    if (s.isCustom) {
      return FLAT_BANDS.map((b, i) => ({ ...b, gain: s.musicGains[i] || 0 }));
    }
    const preset = GENRE_PRESETS.find(p => p.id === s.genreId) || GENRE_PRESETS[0];
    return preset.bands;
  });
  const [preamp, setPreamp] = useState(() => engineRef.current.getSettings().preamp || 0);
  const [enabled, setEnabled] = useState(() => engineRef.current.getSettings().enabled ?? true);

  useEffect(() => {
    if (audioElement) {
      engineRef.current.connectMediaElement(audioElement);
    }
  }, [audioElement]);

  const handleGenreChange = (newGenreId: string) => {
    setGenreId(newGenreId);
    const genre = GENRE_PRESETS.find((p) => p.id === newGenreId) ?? GENRE_PRESETS[0];
    setBands(genre.bands);
    engineRef.current.setGenre(newGenreId);
  };

  const handleDeviceChange = (newDeviceId: string) => {
    setDeviceId(newDeviceId);
    engineRef.current.setDevice(newDeviceId);
  };

  const handlePreampChange = (newPreamp: number) => {
    setPreamp(newPreamp);
    engineRef.current.setPreamp(newPreamp);
  };

  const handleEnabledChange = (newEnabled: boolean) => {
    setEnabled(newEnabled);
    engineRef.current.setEnabled(newEnabled);
  };

  const handleBandChange = (index: number, gain: number) => {
    setBands((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], gain };
      return next;
    });
    engineRef.current.setBandGain(index, gain);
  };

  const reset = () => {
    setGenreId("flat");
    setDeviceId("speakers");
    setBands(FLAT_BANDS);
    setPreamp(0);
    setEnabled(true);
    engineRef.current.reset();
  };

  return (
    <div className="w-full max-w-[640px] rounded-xl border border-[#333] bg-[#282828] p-5 text-white">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b border-[#333] pb-3">
        <h2 className="text-sm font-semibold text-white">Equalizer</h2>
        <label className="flex items-center gap-2 text-xs text-spotify-lightgray cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleEnabledChange(e.target.checked)}
            className="accent-spotify-green"
          />
          Enabled
        </label>
      </div>

      {/* Two Tier Selectors */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-spotify-lightgray/80">
            Music Tone Preset
          </p>
          <CustomSelect
            value={genreId}
            options={GENRE_PRESETS}
            disabled={!enabled}
            onChange={handleGenreChange}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-spotify-lightgray/80">
            Hardware Profile
          </p>
          <CustomSelect
            value={deviceId}
            options={DEVICE_PRESETS}
            disabled={!enabled}
            onChange={handleDeviceChange}
          />
        </div>
      </div>

      {/* 10-Band Sliders */}
      <div className={cn("mb-4 rounded-lg bg-[#1e1e1e] p-4", !enabled && "opacity-40")}>
        <div className="flex items-end justify-between">
          {bands.map((band, i) => (
            <div key={band.frequency} className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "text-[10px] tabular-nums font-medium",
                  band.gain === 0
                    ? "text-spotify-lightgray/50"
                    : band.gain > 0
                    ? "text-spotify-green"
                    : "text-red-400"
                )}
              >
                {band.gain > 0 ? `+${band.gain}` : band.gain}
              </span>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={band.gain}
                disabled={!enabled}
                onChange={(e) => handleBandChange(i, parseFloat(e.target.value))}
                className="vertical-slider"
                style={{ writingMode: "vertical-lr", direction: "rtl" } as React.CSSProperties}
              />
              <span className="text-[10px] text-spotify-lightgray/60">
                {band.frequency >= 1000 ? `${band.frequency / 1000}k` : band.frequency}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Preamp + Reset */}
      <div className="flex items-center justify-between border-t border-[#333] pt-3">
        <div className="flex items-center gap-2.5 text-xs text-spotify-lightgray">
          <span>Preamp</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={0.5}
            value={preamp}
            disabled={!enabled}
            onChange={(e) => handlePreampChange(parseFloat(e.target.value))}
            className="w-28 accent-spotify-green"
            style={{ "--progress": `${((preamp + 12) / 24) * 100}%` } as React.CSSProperties}
          />
          <span className="tabular-nums font-medium">
            {preamp > 0 ? `+${preamp}` : preamp} dB
          </span>
        </div>
        <button
          onClick={reset}
          className="rounded-md px-3 py-1.5 text-xs text-spotify-lightgray transition hover:bg-white/5 hover:text-white"
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default Equalizer;

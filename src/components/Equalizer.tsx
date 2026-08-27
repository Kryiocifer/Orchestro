import React, { useState, useEffect, useRef } from "react";
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

export const Equalizer: React.FC<EqualizerProps> = ({
  audioElement,
  engine,
}) => {
  const [genreId, setGenreId] = useState("flat");
  const [deviceId, setDeviceId] = useState("speakers");
  const [bands, setBands] = useState<EQBand[]>(FLAT_BANDS);
  const [preamp, setPreamp] = useState(0);
  const [enabled, setEnabled] = useState(true);

  const engineRef = useRef<EQEngine>(engine ?? equalizerEngine);

  useEffect(() => {
    if (audioElement) {
      engineRef.current.connectMediaElement(audioElement);
    }
  }, [audioElement]);

  useEffect(() => {
    const genre = GENRE_PRESETS.find((p) => p.id === genreId) ?? GENRE_PRESETS[0];
    setBands(genre.bands);
    engineRef.current.setGenre(genreId);
  }, [genreId]);

  useEffect(() => {
    engineRef.current.setDevice(deviceId);
  }, [deviceId]);

  useEffect(() => {
    engineRef.current.setPreamp(preamp);
  }, [preamp]);

  useEffect(() => {
    engineRef.current.setEnabled(enabled);
  }, [enabled]);

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
            onChange={(e) => setEnabled(e.target.checked)}
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
          <select
            value={genreId}
            disabled={!enabled}
            onChange={(e) => setGenreId(e.target.value)}
            className="w-full rounded-lg border border-[#333] bg-[#181818] px-3 py-2 text-xs text-white outline-none focus:border-spotify-green disabled:opacity-40"
          >
            {GENRE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-spotify-lightgray/80">
            Hardware Profile
          </p>
          <select
            value={deviceId}
            disabled={!enabled}
            onChange={(e) => setDeviceId(e.target.value)}
            className="w-full rounded-lg border border-[#333] bg-[#181818] px-3 py-2 text-xs text-white outline-none focus:border-spotify-green disabled:opacity-40"
          >
            {DEVICE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
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
            onChange={(e) => setPreamp(parseFloat(e.target.value))}
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

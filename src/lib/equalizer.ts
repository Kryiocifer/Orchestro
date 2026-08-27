export const EQ_FREQUENCIES = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

export const EQ_BAND_LABELS = [
  "32Hz",
  "64Hz",
  "125Hz",
  "250Hz",
  "500Hz",
  "1kHz",
  "2kHz",
  "4kHz",
  "8kHz",
  "16kHz",
];

export interface EQBand {
  frequency: number;
  label: string;
  gain: number;
}

export const FLAT_BANDS: EQBand[] = EQ_FREQUENCIES.map((freq, i) => ({
  frequency: freq,
  label: EQ_BAND_LABELS[i],
  gain: 0,
}));

export interface EQPreset {
  id: string;
  name: string;
  description?: string;
  gains: number[];
  bands: EQBand[];
}

function createPreset(
  id: string,
  name: string,
  gains: number[],
  description?: string
): EQPreset {
  return {
    id,
    name,
    description,
    gains,
    bands: EQ_FREQUENCIES.map((freq, i) => ({
      frequency: freq,
      label: EQ_BAND_LABELS[i],
      gain: gains[i] ?? 0,
    })),
  };
}

export const GENRE_PRESETS: EQPreset[] = [
  createPreset("flat", "Flat / Default", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "Uncolored natural sound"),
  createPreset("bass-boost", "Bass Boost", [7, 6, 4, 2, 0, 0, 0, 0, 0, 0], "Deep low-end punch"),
  createPreset("bass-treble", "Bass & Treble", [6, 4, 0, -2, -3, 0, 2, 4, 6, 7], "V-shaped dynamic curve"),
  createPreset("vocal-boost", "Vocal Boost", [-2, -3, -2, 2, 5, 5, 3, 1, 0, -2], "Enhances mid vocal clarity"),
  createPreset("rock", "Rock", [5, 3, -1, -2, 0, 2, 4, 5, 5, 6], "Punchy kicks & crisp guitars"),
  createPreset("pop", "Pop", [2, 4, 3, 1, -1, -1, 1, 2, 3, 4], "Crisp modern vocal balance"),
  createPreset("electronic", "Electronic / EDM", [6, 5, 2, 0, -2, 2, 1, 3, 5, 6], "Heavy sub-bass & high energy"),
  createPreset("hip-hop", "Hip Hop", [7, 6, 2, 0, 1, -1, 2, -1, 2, 3], "Thumping 808s and punch"),
  createPreset("jazz", "Jazz", [3, 2, 1, 2, -1, -1, 0, 1, 2, 3], "Warm acoustic presence"),
  createPreset("classical", "Classical", [5, 4, 3, 2, -1, -1, 0, 2, 3, 4], "Dynamic orchestral space"),
  createPreset("acoustic", "Acoustic", [3, 2, 1, 2, 2, 2, 3, 3, 3, 2], "Intimate organic instruments"),
];

export const DEVICE_PRESETS: EQPreset[] = [
  createPreset(
    "speakers",
    "Direct / Studio Monitors",
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "Neutral uncolored passthrough"
  ),
  createPreset(
    "headphones",
    "Headphones (Over-Ear)",
    [3, 2, 1, 0, -1, 0, 1, 2, 3, 2],
    "Harman curve baseline & airy highs"
  ),
  createPreset(
    "earbuds",
    "In-Ear / Earbuds",
    [4, 3, 1, 0, 0, 1, -1, -2, 1, 2],
    "Smooths harsh ear-canal resonance"
  ),
  createPreset(
    "laptop",
    "Laptop Speakers",
    [-8, -5, 0, 3, 4, 3, 2, 3, 2, 1],
    "Cuts distorting sub-bass, lifts voice presence"
  ),
  createPreset(
    "car",
    "Car Audio",
    [6, 5, 2, 0, 1, 2, 1, 2, 3, 4],
    "Compensates for road noise & cabin rumble"
  ),
  createPreset(
    "bluetooth",
    "Portable Bluetooth",
    [-4, 1, 3, 2, 2, 1, 0, 1, 2, 1],
    "Maximizes vocal punch on small speakers"
  ),
];

export interface EqualizerSettings {
  enabled: boolean;
  preamp: number; // in dB (-12 to +12)
  musicGains: number[]; // 10 numbers for music/genre tone (-12 to +12)
  genreId: string;
  deviceId: string;
  deviceCalibrationEnabled: boolean;
  isCustom: boolean;
  /** Backward-compatible getter for combined or music gains */
  gains: number[];
}

const STORAGE_KEY = "orchestro_eq_settings";

const DEFAULT_SETTINGS: EqualizerSettings = {
  enabled: true,
  preamp: 0,
  musicGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  genreId: "flat",
  deviceId: "speakers",
  deviceCalibrationEnabled: true,
  isCustom: false,
};

export function computeCombinedBands(genreId: string, deviceId: string): number[] {
  const genre = GENRE_PRESETS.find((p) => p.id === genreId) ?? GENRE_PRESETS[0];
  const device = DEVICE_PRESETS.find((p) => p.id === deviceId) ?? DEVICE_PRESETS[0];

  return genre.gains.map((g, i) => {
    const d = device.gains[i] ?? 0;
    return Math.max(-12, Math.min(12, Math.round((g + d) * 10) / 10));
  });
}

export function loadEqualizerSettings(): EqualizerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawGains =
        Array.isArray(parsed?.musicGains) && parsed.musicGains.length === 10
          ? parsed.musicGains
          : Array.isArray(parsed?.gains) && parsed.gains.length === 10
          ? parsed.gains
          : DEFAULT_SETTINGS.musicGains;

      const sanitizedGains = EQ_FREQUENCIES.map((_, i) => {
        const val = rawGains[i];
        return typeof val === "number" && !isNaN(val) ? Math.max(-12, Math.min(12, val)) : 0;
      });

      return {
        enabled: typeof parsed?.enabled === "boolean" ? parsed.enabled : true,
        preamp:
          typeof parsed?.preamp === "number" && !isNaN(parsed.preamp)
            ? Math.max(-12, Math.min(12, parsed.preamp))
            : 0,
        musicGains: sanitizedGains,
        gains: [...sanitizedGains],
        genreId:
          typeof parsed?.genreId === "string" && parsed.genreId
            ? parsed.genreId
            : "flat",
        deviceId:
          typeof parsed?.deviceId === "string" && parsed.deviceId
            ? parsed.deviceId
            : "speakers",
        deviceCalibrationEnabled:
          typeof parsed?.deviceCalibrationEnabled === "boolean"
            ? parsed.deviceCalibrationEnabled
            : true,
        isCustom:
          typeof parsed?.isCustom === "boolean" ? parsed.isCustom : false,
      };
    }
  } catch (e) {
    console.error("Failed to load EQ settings:", e);
  }
  return { ...DEFAULT_SETTINGS, musicGains: [...DEFAULT_SETTINGS.musicGains], gains: [...DEFAULT_SETTINGS.gains] };
}

export function saveEqualizerSettings(settings: EqualizerSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save EQ settings:", e);
  }
}

export class EQEngine {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private preampGainNode: GainNode | null = null;
  private musicFilterNodes: BiquadFilterNode[] = [];
  private deviceFilterNodes: BiquadFilterNode[] = [];
  private settings: EqualizerSettings = loadEqualizerSettings();
  private attachedElement: HTMLAudioElement | null = null;

  /**
   * Connect an HTMLAudioElement to the Two-Stage Web Audio Equalizer pipeline:
   * Source -> Preamp -> [10 Music Filters] -> [10 Device Calibration Filters] -> Destination
   */
  public attach(audioEl: HTMLAudioElement) {
    if (!audioEl) return;
    if (this.attachedElement === audioEl && this.audioCtx) {
      return;
    }

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtxClass) {
        console.warn("Web Audio API not supported in this environment");
        return;
      }

      // If audioCtx already exists, reuse it rather than throwing 'already connected' error
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      this.attachedElement = audioEl;

      // 1. Source node from HTMLAudioElement (only create if not already created)
      if (!this.sourceNode) {
        try {
          this.sourceNode = this.audioCtx.createMediaElementSource(audioEl);
        } catch (mediaErr) {
          console.warn("MediaElementSource already attached or failed:", mediaErr);
          return;
        }
      }

      // 2. Preamp gain node
      this.preampGainNode = this.audioCtx.createGain();
      this.updatePreampGain();

      // 3. Stage 1: 10 Music / Genre Biquad filter nodes
      this.musicFilterNodes = EQ_FREQUENCIES.map((freq, index) => {
        const filter = this.audioCtx!.createBiquadFilter();
        if (index === 0) {
          filter.type = "lowshelf";
        } else if (index === EQ_FREQUENCIES.length - 1) {
          filter.type = "highshelf";
        } else {
          filter.type = "peaking";
          filter.Q.value = 1.41;
        }
        filter.frequency.value = freq;
        return filter;
      });

      // 4. Stage 2: 10 Device Calibration Biquad filter nodes
      this.deviceFilterNodes = EQ_FREQUENCIES.map((freq, index) => {
        const filter = this.audioCtx!.createBiquadFilter();
        if (index === 0) {
          filter.type = "lowshelf";
        } else if (index === EQ_FREQUENCIES.length - 1) {
          filter.type = "highshelf";
        } else {
          filter.type = "peaking";
          filter.Q.value = 1.41;
        }
        filter.frequency.value = freq;
        return filter;
      });

      // 5. Connect the chain:
      // Source -> Preamp -> Music Filters (0..9) -> Device Filters (0..9) -> Destination
      let prevNode: AudioNode = this.sourceNode;
      prevNode.connect(this.preampGainNode);
      prevNode = this.preampGainNode;

      for (const filter of this.musicFilterNodes) {
        prevNode.connect(filter);
        prevNode = filter;
      }

      for (const filter of this.deviceFilterNodes) {
        prevNode.connect(filter);
        prevNode = filter;
      }

      prevNode.connect(this.audioCtx.destination);

      // Apply initial gains
      this.updateAllFilterGains();
    } catch (err) {
      console.error("Failed to initialize Web Audio Equalizer:", err);
    }
  }

  public connectMediaElement(audioEl: HTMLAudioElement) {
    this.attach(audioEl);
  }

  public ensureContextRunning() {
    try {
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
    } catch (err) {
      console.warn("Could not resume AudioContext:", err);
    }
  }

  private updatePreampGain() {
    try {
      if (!this.preampGainNode || !this.audioCtx) return;
      const gainDb = this.settings.enabled ? this.settings.preamp : 0;
      const linearGain = Math.pow(10, gainDb / 20);
      this.preampGainNode.gain.setValueAtTime(
        linearGain,
        this.audioCtx.currentTime
      );
    } catch (e) {
      console.warn("Error updating preamp gain:", e);
    }
  }

  private updateAllFilterGains() {
    try {
      if (!this.audioCtx) return;

      // Stage 1: Music / Genre EQ Filters
      const musicEnabled = this.settings.enabled;
      if (this.musicFilterNodes.length === 10) {
        this.musicFilterNodes.forEach((filter, index) => {
          const gain = musicEnabled ? this.settings.musicGains[index] ?? 0 : 0;
          filter.gain.setValueAtTime(gain, this.audioCtx!.currentTime);
        });
      }

      // Stage 2: Hardware Device Calibration Filters
      const devicePreset =
        DEVICE_PRESETS.find((d) => d.id === this.settings.deviceId) ??
        DEVICE_PRESETS[0];
      const deviceEnabled =
        this.settings.enabled && this.settings.deviceCalibrationEnabled;

      if (this.deviceFilterNodes.length === 10) {
        this.deviceFilterNodes.forEach((filter, index) => {
          const gain = deviceEnabled ? devicePreset.gains[index] ?? 0 : 0;
          filter.gain.setValueAtTime(gain, this.audioCtx!.currentTime);
        });
      }

      this.updatePreampGain();
    } catch (e) {
      console.warn("Error updating filter gains:", e);
    }
  }

  public getSettings(): EqualizerSettings {
    const rawGains =
      Array.isArray(this.settings?.musicGains) && this.settings.musicGains.length === 10
        ? this.settings.musicGains
        : Array.isArray(this.settings?.gains) && this.settings.gains.length === 10
        ? this.settings.gains
        : DEFAULT_SETTINGS.musicGains;

    const safeGains = EQ_FREQUENCIES.map((_, i) =>
      typeof rawGains[i] === "number" && !isNaN(rawGains[i]) ? rawGains[i] : 0
    );

    return {
      enabled: this.settings?.enabled ?? true,
      preamp: this.settings?.preamp ?? 0,
      musicGains: [...safeGains],
      gains: [...safeGains],
      genreId: this.settings?.genreId || "flat",
      deviceId: this.settings?.deviceId || "speakers",
      deviceCalibrationEnabled: this.settings?.deviceCalibrationEnabled ?? true,
      isCustom: this.settings?.isCustom ?? false,
    };
  }

  public setEnabled(enabled: boolean) {
    this.ensureContextRunning();
    this.settings.enabled = enabled;
    this.updateAllFilterGains();
    saveEqualizerSettings(this.settings);
  }

  public setPreamp(preamp: number) {
    this.ensureContextRunning();
    this.settings.preamp = Math.max(-12, Math.min(12, preamp));
    this.updatePreampGain();
    saveEqualizerSettings(this.settings);
  }

  public setBandGain(index: number, gain: number) {
    if (index < 0 || index >= 10) return;
    this.ensureContextRunning();
    const clamped = Math.max(-12, Math.min(12, gain));
    if (!Array.isArray(this.settings.musicGains)) {
      this.settings.musicGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    this.settings.musicGains[index] = clamped;
    this.settings.gains = [...this.settings.musicGains];
    this.settings.isCustom = true;

    try {
      if (this.musicFilterNodes[index] && this.audioCtx) {
        this.musicFilterNodes[index].gain.setValueAtTime(
          this.settings.enabled ? clamped : 0,
          this.audioCtx.currentTime
        );
      }
    } catch (e) {
      console.warn("Error setting band gain:", e);
    }
    saveEqualizerSettings(this.settings);
  }

  public setBands(bands: number[] | EQBand[]) {
    this.ensureContextRunning();
    const numericGains = bands.map((b) => (typeof b === "number" ? b : b.gain));
    this.settings.musicGains = numericGains.map((g) => Math.max(-12, Math.min(12, g)));
    this.settings.gains = [...this.settings.musicGains];
    this.updateAllFilterGains();
    saveEqualizerSettings(this.settings);
  }

  public setGenre(genreId: string) {
    this.ensureContextRunning();
    this.settings.genreId = genreId;
    this.settings.isCustom = false;
    const preset =
      GENRE_PRESETS.find((g) => g.id === genreId) ?? GENRE_PRESETS[0];
    this.settings.musicGains = [...preset.gains];
    this.settings.gains = [...preset.gains];
    this.updateAllFilterGains();
    saveEqualizerSettings(this.settings);
  }

  public setDevice(deviceId: string) {
    this.ensureContextRunning();
    this.settings.deviceId = deviceId;
    this.updateAllFilterGains();
    saveEqualizerSettings(this.settings);
  }

  public setDeviceCalibrationEnabled(enabled: boolean) {
    this.ensureContextRunning();
    this.settings.deviceCalibrationEnabled = enabled;
    this.updateAllFilterGains();
    saveEqualizerSettings(this.settings);
  }

  public reset() {
    this.settings.genreId = "flat";
    this.settings.deviceId = "speakers";
    this.settings.musicGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.settings.gains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.settings.isCustom = false;
    this.settings.preamp = 0;
    this.settings.enabled = true;
    this.settings.deviceCalibrationEnabled = true;
    this.updateAllFilterGains();
    saveEqualizerSettings(this.settings);
  }
}

export const equalizerEngine = new EQEngine();

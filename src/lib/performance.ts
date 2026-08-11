/**
 * Quiet adaptive tuning from coarse device signals.
 * Keeps scan/download behavior sane on low-RAM machines.
 */

export type PerfProfile = {
  /** label for debugging */
  tier: "low" | "mid" | "high";
  /** yield to UI every N files during scan */
  scanYieldEvery: number;
  /** max bytes to read for light metadata */
  lightMetaBytes: number;
  /** checkpoint library save every N changes */
  scanCheckpointEvery: number;
};

function detectTier(): PerfProfile["tier"] {
  try {
    const mem = (navigator as any).deviceMemory as number | undefined; // GiB, Chrome/Edge
    const cores = navigator.hardwareConcurrency || 4;
    if ((mem !== undefined && mem <= 4) || cores <= 4) return "low";
    if ((mem !== undefined && mem <= 8) || cores <= 8) return "mid";
    return "high";
  } catch {
    return "mid";
  }
}

let cached: PerfProfile | null = null;

export function getPerfProfile(): PerfProfile {
  if (cached) return cached;
  const tier = detectTier();
  cached =
    tier === "low"
      ? {
          tier,
          scanYieldEvery: 3,
          lightMetaBytes: 64_000,
          scanCheckpointEvery: 15,
        }
      : tier === "mid"
      ? {
          tier,
          scanYieldEvery: 8,
          lightMetaBytes: 128_000,
          scanCheckpointEvery: 25,
        }
      : {
          tier,
          scanYieldEvery: 12,
          lightMetaBytes: 256_000,
          scanCheckpointEvery: 40,
        };
  return cached;
}

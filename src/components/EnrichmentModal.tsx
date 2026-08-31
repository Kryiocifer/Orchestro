import { useEffect, useRef, useState } from "react";
import { Song } from "../lib/types";
import { enrichSong, applyEnrichment, EnrichmentResult } from "../lib/enrichment";
import { CheckCircle2, XCircle, SkipForward, Loader2, X } from "lucide-react";

interface Props {
  songs: Song[];
  onClose: () => void;
  onComplete: (updatedSongs: { id: string; title: string; artist: string; album: string; newPath?: string; newFileName?: string }[]) => void;
}

type LogEntry = EnrichmentResult & { songTitle: string };

export default function EnrichmentModal({ songs, onClose, onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const cancelRef = useRef(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Smart auto-scroll
  useEffect(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      logEndRef.current?.scrollIntoView();
    }
  }, [log]);

  const run = async () => {
    setRunning(true);
    setDone(false);
    setLog([]);
    setProgress(0);
    cancelRef.current = false;

    const updatedSongs: { id: string; title: string; artist: string; album: string; newPath?: string; newFileName?: string }[] = [];

    for (let i = 0; i < songs.length; i++) {
      if (cancelRef.current) break;

      const song = songs[i];
      const result = await enrichSong(song);

      if (result.status === "updated" && !cancelRef.current) {
        try {
          const newPath = await applyEnrichment(song, result);
          let newFileName;
          if (newPath) {
            newFileName = newPath.replace(/\\/g, "/").split("/").pop();
          }
          updatedSongs.push({
            id: song.id,
            title: result.title,
            artist: result.artist,
            album: result.album,
            newPath,
            newFileName,
          });
        } catch {
          result.status = "error";
          result.reason = "Failed to write tags to disk";
        }
      }

      setLog((prev) => [
        ...prev,
        { ...result, songTitle: song.title },
      ]);
      setProgress(i + 1);

      // Rate limit: 500ms between requests
      if (i < songs.length - 1 && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    setRunning(false);
    setDone(true);
    onComplete(updatedSongs);
  };

  const statusIcon = (status: EnrichmentResult["status"]) => {
    switch (status) {
      case "updated": return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />;
      case "skipped": return <SkipForward className="h-3.5 w-3.5 shrink-0 text-white/30" />;
      case "no_match": return <XCircle className="h-3.5 w-3.5 shrink-0 text-yellow-400" />;
      case "error": return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />;
    }
  };

  const statusLabel = (entry: LogEntry) => {
    switch (entry.status) {
      case "updated": return <span className="text-green-400">→ {entry.title} · {entry.artist}</span>;
      case "skipped": return <span className="text-white/30">Skipped — {entry.reason}</span>;
      case "no_match": return <span className="text-yellow-400">No match — {entry.reason}</span>;
      case "error": return <span className="text-red-400">Error — {entry.reason}</span>;
    }
  };

  const updated = log.filter((l) => l.status === "updated").length;
  const skipped = log.filter((l) => l.status === "skipped").length;
  const noMatch = log.filter((l) => l.status === "no_match" || l.status === "error").length;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1e1e1e] shadow-2xl"
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 bg-[#1e1e1e] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Fix Library Metadata</h2>
            <p className="mt-0.5 text-xs text-white/50">
              Querying iTunes Search API · {songs.length} tracks
            </p>
          </div>
          {!running && (
            <button onClick={onClose} className="rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        {(running || done) && (
          <div className="bg-[#1e1e1e] px-6 pb-2 pt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-white/50">
              <span>{progress} of {songs.length} processed</span>
              {done && (
                <span className="text-white/70">
                  ✓ {updated} updated · {skipped} skipped · {noMatch} unmatched
                </span>
              )}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-white/70 transition-all duration-300 ease-out"
                style={{ width: `${(progress / songs.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Log */}
        <div ref={logContainerRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {!running && !done && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-white">Ready to organize your library</p>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-white/50">
                Orchestro will fetch high-res cover art, correct the track info, and rename your audio files to a clean format.
              </p>
            </div>
          )}

          {log.length > 0 && (
            <div className="space-y-1">
              {log.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-white/5">
                  <div className="mt-0.5">{statusIcon(entry.status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-white/80">{entry.songTitle}</div>
                    <div className="mt-0.5 text-xs">{statusLabel(entry)}</div>
                  </div>
                </div>
              ))}
              {running && (
                <div className="flex items-center gap-2 px-2 py-2 text-xs text-white/40">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing...</span>
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-white/5 bg-[#1a1a1a] px-6 py-4">
          {!running && !done && (
            <>
              <button
                onClick={onClose}
                className="rounded-md px-4 py-1.5 text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={run}
                className="rounded-md bg-white px-5 py-1.5 text-sm font-medium text-black transition hover:bg-gray-200 active:bg-gray-300"
              >
                Start
              </button>
            </>
          )}
          {running && (
            <button
              onClick={() => { cancelRef.current = true; }}
              className="rounded-md border border-white/10 px-5 py-1.5 text-sm font-medium text-white transition hover:bg-white/5"
            >
              Stop
            </button>
          )}
          {done && (
            <button
              onClick={onClose}
              className="rounded-md bg-white/10 px-6 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

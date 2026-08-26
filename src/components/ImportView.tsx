import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Link2,
  Loader2,
  Download,
  Check,
  Search,
  ListMusic,
  AlertCircle,
  FolderOpen,
  LogIn,
  LogOut,
  X,
} from "lucide-react";
import { SpotifyPlaylistResult, SpotifyTrack } from "../lib/types";
import { formatDuration, cn } from "../lib/utils";
import { DownloadJob } from "./DownloadPanel";
import toast from "react-hot-toast";

interface ImportViewProps {
  downloadFolder: string | null | undefined;
  onPickDownloadFolder: () => void;
  jobs: DownloadJob[];
  setJobs: React.Dispatch<React.SetStateAction<DownloadJob[]>>;
  spotifyClientId?: string | null;
  onSaveSpotifyClientId?: (id: string) => Promise<void>;
}

type Mode = "url" | "text" | "my";

interface PlaylistInfo {
  id: string;
  name: string;
  tracks_total: number;
  image?: string | null;
  owned?: boolean;
}

export default function ImportView({
  downloadFolder,
  onPickDownloadFolder,
  jobs: _jobs,
  setJobs,
  spotifyClientId,
  onSaveSpotifyClientId,
}: ImportViewProps) {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SpotifyPlaylistResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [clientIdDraft, setClientIdDraft] = useState(spotifyClientId || "");
  const [showClientId, setShowClientId] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await invoke<{ connected: boolean }>("spotify_status");
      setConnected(!!s.connected);
      return !!s.connected;
    } catch {
      setConnected(false);
      return false;
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    setLoadingPlaylists(true);
    setError(null);
    try {
      const list = await invoke<PlaylistInfo[]>("spotify_list_playlists");
      setPlaylists(list);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingPlaylists(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus().then((ok) => {
      if (ok) loadPlaylists();
    });
  }, [refreshStatus, loadPlaylists]);

  const filteredTracks = useMemo(() => {
    if (!result) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return result.tracks.map((t, i) => ({ t, i }));
    return result.tracks
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t }) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q)
      );
  }, [result, filter]);

  const handleConnect = async () => {
    const id = (clientIdDraft || spotifyClientId || "").trim();
    if (!id) {
      setShowClientId(true);
      setError(
        "Paste your Spotify Client ID (developer.spotify.com). No secret needed. Redirect URI: http://127.0.0.1:18925/callback"
      );
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      if (onSaveSpotifyClientId) await onSaveSpotifyClientId(id);
      await invoke("spotify_connect", { clientId: id });
      setConnected(true);
      setShowClientId(false);
      toast.success("Connected to Spotify");
      await loadPlaylists();
    } catch (err) {
      setError(String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke("spotify_disconnect");
      setConnected(false);
      setPlaylists([]);
      setResult(null);
      toast.success("Disconnected");
    } catch (err) {
      setError(String(err));
    }
  };

  const handleResolveUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(new Set());
    try {
      const res = await invoke<SpotifyPlaylistResult>("resolve_spotify_link", {
        url: url.trim(),
      });
      setResult(res);
      setSelected(new Set(res.tracks.map((_, i) => i)));
      toast.success(`${res.tracks.length} tracks found`);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPlaylist = async (id: string, _owned?: boolean) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(new Set());
    try {
      const res = await invoke<SpotifyPlaylistResult>(
        "resolve_spotify_playlist_by_id",
        { playlistId: id }
      );
      setResult(res);
      setSelected(new Set(res.tracks.map((_, i) => i)));
      toast.success(`${res.tracks.length} tracks loaded`);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLikedSongs = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(new Set());
    try {
      const res = await invoke<SpotifyPlaylistResult>("spotify_liked_songs");
      setResult(res);
      setSelected(new Set(res.tracks.map((_, i) => i)));
      toast.success(`${res.tracks.length} liked songs`);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleParseText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(new Set());
    try {
      const res = await invoke<SpotifyPlaylistResult>("parse_track_list_text", {
        text,
      });
      setResult(res);
      setSelected(new Set(res.tracks.map((_, i) => i)));
      toast.success(`${res.tracks.length} tracks parsed`);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleDownload = () => {
    if (!result || selected.size === 0) return;
    if (!downloadFolder) {
      setError("Pick a download folder first");
      return;
    }
    const tracks: SpotifyTrack[] = [];
    selected.forEach((i) => {
      if (result.tracks[i]) tracks.push(result.tracks[i]);
    });

    const rawName = (result.name || "Imported Playlist").trim();
    const sanitizedFolder = rawName
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/[.\s]+$/, "")
      .trim() || "Imported Playlist";

    const sep = downloadFolder.includes("\\") ? "\\" : "/";
    const targetFolder = downloadFolder.endsWith("\\") || downloadFolder.endsWith("/")
      ? `${downloadFolder}${sanitizedFolder}`
      : `${downloadFolder}${sep}${sanitizedFolder}`;

    setJobs((prev) => {
      const newJobs: DownloadJob[] = tracks.map((track) => {
        const query = `${track.title} ${track.artist}`.trim();
        return {
          id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: `${track.title} — ${track.artist}`,
          percent: 0,
          status: "queued",
          message: `search:${query}`,
          folder: targetFolder,
          playlistName: rawName,
        };
      });
      return [...newJobs, ...prev];
    });
    toast.success(
      `Queued ${tracks.length} download${tracks.length > 1 ? "s" : ""} into folder "${sanitizedFolder}"`
    );
  };

  const folderLabel = downloadFolder
    ? downloadFolder.split(/[/\\]/).filter(Boolean).pop()
    : null;

  const modes: { key: Mode; label: string }[] = [
    { key: "url", label: "Paste link" },
    { key: "my", label: "My playlists" },
    { key: "text", label: "Text list" },
  ];

  return (
    <div className="flex h-full flex-col p-8">
      {/* Header — matches YouTubeView / LibraryView style */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Import</h1>
        <p className="mt-1 text-sm text-spotify-lightgray">
          Paste a public Spotify link, browse your library, or type song names
        </p>
      </div>

      {/* Top bar: folder + spotify connection */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onPickDownloadFolder}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
        >
          <FolderOpen className="h-4 w-4" />
          {folderLabel ? (
            <span className="max-w-[200px] truncate">{folderLabel}</span>
          ) : (
            "Choose download folder"
          )}
        </button>

        {connected ? (
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
          >
            <LogOut className="h-4 w-4" />
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 rounded-full bg-spotify-green px-4 py-2 text-sm font-semibold text-black transition hover:bg-spotify-green-hover disabled:opacity-50"
          >
            {connecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            Connect Spotify
          </button>
        )}
      </div>

      {/* Client ID setup (only shown when needed) */}
      {(showClientId || (!connected && !spotifyClientId)) && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="mb-1 text-sm font-medium">Spotify Client ID</p>
          <p className="mb-3 text-xs text-spotify-lightgray">
            Create an app at developer.spotify.com → add redirect{" "}
            <code className="text-white">http://127.0.0.1:18925/callback</code>{" "}
            → paste Client ID. Only needed for private playlists & liked songs.
          </p>
          <div className="flex gap-2">
            <input
              value={clientIdDraft}
              onChange={(e) => setClientIdDraft(e.target.value)}
              placeholder="Client ID"
              className="flex-1 rounded-lg bg-black/40 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-spotify-green"
            />
            <button
              onClick={handleConnect}
              disabled={connecting || !clientIdDraft.trim()}
              className="rounded-lg bg-spotify-green px-4 py-2 text-sm font-semibold text-black hover:bg-spotify-green-hover disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Mode tabs */}
      <div className="mb-4 flex gap-2">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition",
              mode === m.key
                ? "bg-white text-black"
                : "bg-white/10 text-white hover:bg-white/15"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-amber-300 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* URL mode */}
      {mode === "url" && !result && (
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spotify-lightgray" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://open.spotify.com/playlist/... or /album/..."
              className="w-full rounded-full bg-white/10 py-3 pl-10 pr-4 text-sm outline-none placeholder:text-spotify-lightgray focus:bg-white/15"
              onKeyDown={(e) => e.key === "Enter" && handleResolveUrl()}
            />
          </div>
          <button
            onClick={handleResolveUrl}
            disabled={loading || !url.trim()}
            className="rounded-full bg-spotify-green px-6 py-3 text-sm font-semibold text-black hover:bg-spotify-green-hover disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
          </button>
        </div>
      )}

      {/* Text mode */}
      {mode === "text" && !result && (
        <div className="mb-4 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Artist - Title\nArtist - Title\n..."}
            rows={5}
            className="w-full resize-y rounded-xl bg-white/10 p-4 text-sm outline-none placeholder:text-spotify-lightgray focus:bg-white/15"
          />
          <button
            onClick={handleParseText}
            disabled={loading || !text.trim()}
            className="rounded-full bg-spotify-green px-6 py-2.5 text-sm font-semibold text-black hover:bg-spotify-green-hover disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="inline h-4 w-4 animate-spin" />
            ) : (
              "Parse list"
            )}
          </button>
        </div>
      )}

      {/* My playlists mode */}
      {mode === "my" && !result && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!connected ? (
            <div className="flex flex-col items-center justify-center py-16 text-spotify-lightgray">
              <ListMusic className="mb-3 h-12 w-12 opacity-40" />
              <p>Connect Spotify to see your playlists</p>
            </div>
          ) : loadingPlaylists ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-spotify-green" />
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {/* Liked Songs */}
              <button
                onClick={handleLikedSongs}
                disabled={loading}
                className="flex items-center gap-3 rounded-lg bg-gradient-to-br from-purple-700/40 to-blue-700/30 p-3 text-left transition hover:from-purple-700/55 hover:to-blue-700/45"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-gradient-to-br from-purple-500 to-blue-500">
                  <ListMusic className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Liked Songs</p>
                  <p className="text-xs text-spotify-lightgray">Your saved tracks</p>
                </div>
              </button>

              {/* Playlists */}
              {playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleOpenPlaylist(p.id, p.owned)}
                  disabled={loading}
                  className={cn(
                    "flex items-center gap-3 rounded-lg p-3 text-left transition",
                    p.owned === false
                      ? "bg-white/[0.03] opacity-70 hover:bg-white/10"
                      : "bg-white/5 hover:bg-white/10"
                  )}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-white/10">
                    {p.image ? (
                      <img src={p.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ListMusic className="h-5 w-5 text-spotify-lightgray" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-spotify-lightgray">
                      {p.tracks_total} tracks{p.owned ? " · yours" : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {loading && !result && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-spotify-green" />
        </div>
      )}

      {/* Results panel */}
      {result && (
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/5">
          {/* Result header */}
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{result.name}</p>
              <p className="text-xs text-spotify-lightgray">
                {result.tracks.length} tracks · {selected.size} selected
                {downloadFolder && (
                  <span className="ml-2 font-medium text-spotify-green">
                    📁 Saving into /{result.name.replace(/[<>:"/\\|?*]/g, "_").replace(/[.\s]+$/, "").trim()}
                  </span>
                )}
              </p>
            </div>

            <button
              onClick={() => {
                setResult(null);
                setSelected(new Set());
                setFilter("");
              }}
              className="rounded-full p-1.5 text-spotify-lightgray hover:bg-white/10 hover:text-white"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-spotify-lightgray" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter…"
                className="w-40 rounded-full bg-white/10 py-1.5 pl-8 pr-3 text-xs outline-none"
              />
            </div>

            <button
              onClick={() => setSelected(new Set(result.tracks.map((_, i) => i)))}
              className="text-xs text-spotify-lightgray hover:text-white"
            >
              All
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-spotify-lightgray hover:text-white"
            >
              None
            </button>

            <button
              onClick={handleDownload}
              disabled={selected.size === 0 || !downloadFolder}
              className="flex items-center gap-2 rounded-full bg-spotify-green px-4 py-2 text-sm font-semibold text-black shadow-md shadow-spotify-green/20 hover:bg-spotify-green-hover disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Download {selected.size || ""}
            </button>
          </div>

          {/* Track list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredTracks.map(({ t, i }) => {
              const isSel = selected.has(i);
              return (
                <div
                  key={`${i}-${t.title}`}
                  onClick={() => toggle(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b border-white/5 px-4 py-2.5 transition hover:bg-white/5",
                    isSel && "bg-white/10"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      isSel
                        ? "border-spotify-green bg-spotify-green text-black"
                        : "border-white/30"
                    )}
                  >
                    {isSel && <Check className="h-3 w-3" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="truncate text-xs text-spotify-lightgray">{t.artist}</p>
                  </div>
                  <span className="text-xs text-spotify-lightgray">
                    {t.duration ? formatDuration(t.duration) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

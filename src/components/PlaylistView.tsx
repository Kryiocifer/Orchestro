import { useMemo, useState } from "react";
import { Song, Playlist } from "../lib/types";
import { Play, Clock, ListMusic, Search, Check, Download } from "lucide-react";
import { formatDuration } from "../lib/utils";
import ContextMenu from "./ContextMenu";
import { cn } from "../lib/utils";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import toast from "react-hot-toast";

interface PlaylistViewProps {
  playlist: Playlist;
  songs: Song[];
  playlists: Playlist[];
  currentSongId?: string;
  isPlaying: boolean;
  onPlaySong: (song: Song, queue: Song[]) => void;
  onUpdatePlaylist: (playlist: Playlist) => void;
  onAddToPlaylist: (songIds: string[], playlistId: string) => void;
  onCreatePlaylistAndAdd: (songIds: string[]) => void;
}

export default function PlaylistView({
  playlist,
  songs,
  playlists,
  currentSongId,
  isPlaying,
  onPlaySong,
  onAddToPlaylist,
  onCreatePlaylistAndAdd,
}: PlaylistViewProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: "sno" | "title" | "album" | "duration"; asc: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    songIds: string[];
  } | null>(null);

  const handleSort = (key: "sno" | "title" | "album" | "duration") => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        if (prev.asc) return { key, asc: false };
        return null;
      }
      return { key, asc: true };
    });
  };

  const playlistSongs = useMemo(
    () =>
      playlist.songIds
        .map((id) => songs.find((s) => s.id === id))
        .filter(Boolean) as Song[],
    [playlist.songIds, songs]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = playlistSongs.map((song, index) => ({ song, originalIndex: index }));
    
    if (q) {
      result = result.filter(
        ({ song: s }) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.album.toLowerCase().includes(q)
      );
    }
    
    if (sortConfig) {
      result.sort((a, b) => {
        let cmp = 0;
        const sA = a.song;
        const sB = b.song;
        switch (sortConfig.key) {
          case "title":
            cmp = sA.title.localeCompare(sB.title) || sA.artist.localeCompare(sB.artist);
            break;
          case "album":
            cmp = (sA.album || "").localeCompare(sB.album || "");
            break;
          case "duration":
            cmp = (sA.duration || 0) - (sB.duration || 0);
            break;
          case "sno":
            cmp = a.originalIndex - b.originalIndex;
            break;
        }
        return sortConfig.asc ? cmp : -cmp;
      });
    }

    return result.map((r) => r.song);
  }, [playlistSongs, query, sortConfig]);

  const totalDuration = playlistSongs.reduce(
    (acc, s) => acc + (s.duration || 0),
    0
  );

  const handlePlayAll = () => {
    if (playlistSongs.length > 0) {
      onPlaySong(playlistSongs[0], playlistSongs);
    }
  };

  const handleExport = async () => {
    if (playlistSongs.length === 0) {
      toast.error("Playlist is empty");
      return;
    }

    try {
      const filePath = await save({
        filters: [{ name: "Playlist", extensions: ["m3u8"] }],
        defaultPath: `${playlist.name}.m3u8`,
      });
      if (!filePath) return;

      let m3u8 = "#EXTM3U\n";
      for (const song of playlistSongs) {
        const durationStr = Math.round(song.duration || 0);
        m3u8 += `#EXTINF:${durationStr},${song.artist} - ${song.title}\n`;
        m3u8 += `${song.path}\n`;
      }

      await writeTextFile(filePath, m3u8);
      toast.success("Playlist exported successfully");
    } catch (error) {
      console.error("Failed to export playlist:", error);
      toast.error("Failed to export playlist");
    }
  };

  const handleRowClick = (e: React.MouseEvent, song: Song, index: number) => {
    // Shift → range select from anchor
    if (e.shiftKey) {
      const anchorId = lastClickedId ?? (selected.size > 0 ? Array.from(selected)[0] : null);
      if (anchorId) {
        const startIdx = filtered.findIndex((s) => s.id === anchorId);
        if (startIdx >= 0) {
          const [a, b] = startIdx < index ? [startIdx, index] : [index, startIdx];
          setSelected(new Set(filtered.slice(a, b + 1).map((s) => s.id)));
          return;
        }
      }
      // no anchor yet → just select this one
      setSelected(new Set([song.id]));
      setLastClickedId(song.id);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(song.id)) next.delete(song.id);
        else next.add(song.id);
        return next;
      });
      setLastClickedId(song.id);
      return;
    }

    // normal click → play, clear multi-select
    setSelected(new Set());
    setLastClickedId(song.id);
    onPlaySong(song, playlistSongs);
  };

  const handleContextMenu = (e: React.MouseEvent, songId: string) => {
    e.preventDefault();
    e.stopPropagation();
    let ids: string[];
    if (selected.has(songId) && selected.size > 1) {
      ids = Array.from(selected);
    } else {
      ids = [songId];
      setSelected(new Set([songId]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, songIds: ids });
  };

  return (
    <div>
      <div className="flex items-end gap-6 bg-gradient-to-b from-[#333] to-transparent px-8 pb-6 pt-16">
        <div className="flex h-52 w-52 shrink-0 items-center justify-center overflow-hidden rounded bg-spotify-gray shadow-2xl">
          {playlistSongs[0]?.cover ? (
            <img
              src={playlistSongs[0].cover}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ListMusic className="h-20 w-20 text-spotify-lightgray" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Playlist</span>
          <h1 className="text-5xl font-black tracking-tight">{playlist.name}</h1>
          <p className="mt-2 text-sm text-spotify-lightgray">
            {playlistSongs.length} song{playlistSongs.length !== 1 ? "s" : ""}
            {totalDuration > 0 && ` • ${formatDuration(totalDuration)}`}
            {selected.size > 0 && (
              <span className="text-spotify-green">
                {" "}
                · {selected.size} selected
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="px-8 pb-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <button
            onClick={handlePlayAll}
            disabled={playlistSongs.length === 0}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black shadow-lg transition hover:scale-105 hover:bg-spotify-green-hover disabled:cursor-not-allowed disabled:opacity-40"
            title="Play Playlist"
          >
            <Play className="h-6 w-6 fill-current" />
          </button>

          <button
            onClick={handleExport}
            disabled={playlistSongs.length === 0}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-spotify-lightgray transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title="Export as .m3u8"
          >
            <Download className="h-5 w-5" />
          </button>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spotify-lightgray" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in playlist…"
              className="w-56 rounded-full bg-white/10 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-spotify-lightgray focus:bg-white/15"
            />
          </div>
        </div>

        {playlistSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-spotify-lightgray">
            <p>This playlist is empty</p>
            <p className="mt-1 text-sm">
              Right-click songs in Your Library to add them here
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-spotify-lightgray">
            No songs match “{query}”
          </p>
        ) : (
          <div className="rounded-md select-none">
            <div className="sticky top-0 z-10 grid grid-cols-[auto_16px_4fr_3fr_minmax(120px,1fr)] gap-4 border-b border-[#2a2a2a] bg-spotify-black/80 px-4 pb-2 pt-2 text-xs font-medium uppercase tracking-wider text-spotify-lightgray backdrop-blur">
              <div className="w-6" />
              <div className="cursor-pointer hover:text-white flex items-center gap-1" onClick={() => handleSort("sno")}>
                # {sortConfig?.key === "sno" && (sortConfig.asc ? "↑" : "↓")}
              </div>
              <div className="cursor-pointer hover:text-white flex items-center gap-1" onClick={() => handleSort("title")}>
                Title {sortConfig?.key === "title" && (sortConfig.asc ? "↑" : "↓")}
              </div>
              <div className="cursor-pointer hover:text-white flex items-center gap-1" onClick={() => handleSort("album")}>
                Album {sortConfig?.key === "album" && (sortConfig.asc ? "↑" : "↓")}
              </div>
              <div className="flex justify-end items-center gap-1 cursor-pointer hover:text-white" onClick={() => handleSort("duration")}>
                {sortConfig?.key === "duration" && (sortConfig.asc ? "↑" : "↓")} <Clock className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-2">
              {filtered.map((song, index) => {
                const isCurrent = song.id === currentSongId;
                const isSelected = selected.has(song.id);
                return (
                  <div
                    key={song.id}
                    onClick={(e) => handleRowClick(e, song, index)}
                    onContextMenu={(e) => handleContextMenu(e, song.id)}
                    className={cn(
                      "group grid cursor-pointer grid-cols-[auto_16px_4fr_3fr_minmax(120px,1fr)] gap-4 rounded-md px-4 py-2.5 text-sm transition select-none",
                      isSelected ? "bg-white/20" : "hover:bg-white/10"
                    )}
                  >
                    <div
                      className="flex w-6 items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(song.id)) next.delete(song.id);
                          else next.add(song.id);
                          return next;
                        });
                        setLastClickedId(song.id);
                      }}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border transition",
                          isSelected
                            ? "border-spotify-green bg-spotify-green text-black"
                            : "border-white/30 opacity-0 group-hover:opacity-100",
                          selected.size > 0 && !isSelected && "opacity-100"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </div>
                    </div>

                    <div className="flex items-center text-spotify-lightgray">
                      {isCurrent && isPlaying ? (
                        <span className="text-spotify-green">♫</span>
                      ) : (
                        <>
                          <span className="group-hover:hidden">{index + 1}</span>
                          <Play className="hidden h-4 w-4 fill-white group-hover:block" />
                        </>
                      )}
                    </div>

                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-spotify-gray">
                        {song.cover ? (
                          <img
                            src={song.cover}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg">🎵</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "truncate font-medium",
                            isCurrent && "text-spotify-green"
                          )}
                        >
                          {song.title}
                        </p>
                        <p className="truncate text-spotify-lightgray">
                          {song.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center truncate text-spotify-lightgray">
                      {song.album}
                    </div>

                    <div className="flex items-center justify-end text-spotify-lightgray">
                      {formatDuration(song.duration)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          playlists={playlists}
          selectionCount={contextMenu.songIds.length}
          showRemove={false}
          onAddToPlaylist={(playlistId) => {
            onAddToPlaylist(contextMenu.songIds, playlistId);
            setSelected(new Set());
          }}
          onCreateAndAdd={() => {
            onCreatePlaylistAndAdd(contextMenu.songIds);
            setSelected(new Set());
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

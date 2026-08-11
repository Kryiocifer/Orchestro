import { useMemo, useState } from "react";
import { Song, Playlist } from "../lib/types";
import { Play, Clock, Plus, Search, Check } from "lucide-react";
import { formatDuration } from "../lib/utils";
import ContextMenu from "./ContextMenu";
import { cn } from "../lib/utils";

interface LibraryViewProps {
  songs: Song[];
  playlists: Playlist[];
  currentSongId?: string;
  isPlaying: boolean;
  onPlaySong: (song: Song) => void;
  onAddToPlaylist: (songIds: string[], playlistId: string) => void;
  onCreatePlaylistAndAdd: (songIds: string[]) => void;
  onRemoveSong: (songIds: string[]) => void;
  onAddSongs: () => void;
}

export default function LibraryView({
  songs,
  playlists,
  currentSongId,
  isPlaying,
  onPlaySong,
  onAddToPlaylist,
  onCreatePlaylistAndAdd,
  onRemoveSong,
  onAddSongs,
}: LibraryViewProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    songIds: string[];
  } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q) ||
        s.fileName.toLowerCase().includes(q)
    );
  }, [songs, query]);

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
    onPlaySong(song);
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
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Your Library</h1>
          <p className="mt-1 text-sm text-spotify-lightgray">
            {songs.length} song{songs.length !== 1 ? "s" : ""}
            {selected.size > 0 && (
              <span className="text-spotify-green">
                {" "}
                · {selected.size} selected
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spotify-lightgray" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library…"
              className="w-56 rounded-full bg-white/10 py-2 pl-9 pr-3 text-sm text-white outline-none ring-0 placeholder:text-spotify-lightgray focus:bg-white/15"
            />
          </div>
          <button
            onClick={onAddSongs}
            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/20"
          >
            <Plus className="h-4 w-4" />
            Add Songs
          </button>
        </div>
      </div>

      {songs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#333] py-24">
          <div className="mb-4 text-5xl">🎵</div>
          <p className="text-xl font-medium text-white">No songs yet</p>
          <p className="mt-2 max-w-sm text-center text-sm text-spotify-lightgray">
            Link a music folder or add songs manually
          </p>
          <button
            onClick={onAddSongs}
            className="mt-6 flex items-center gap-2 rounded-full bg-spotify-green px-6 py-3 font-semibold text-black transition hover:scale-105 hover:bg-spotify-green-hover"
          >
            <Plus className="h-5 w-5" />
            Add Songs
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-spotify-lightgray">
          No songs match “{query}”
        </p>
      ) : (
        <div className="rounded-md select-none">
          <div className="sticky top-0 z-10 grid grid-cols-[auto_16px_4fr_3fr_2fr_minmax(120px,1fr)] gap-4 border-b border-[#2a2a2a] bg-spotify-black/80 px-4 pb-2 pt-2 text-xs font-medium uppercase tracking-wider text-spotify-lightgray backdrop-blur">
            <div className="w-6" />
            <div>#</div>
            <div>Title</div>
            <div>Album</div>
            <div>Date added</div>
            <div className="flex justify-end">
              <Clock className="h-4 w-4" />
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
                    "group grid cursor-pointer grid-cols-[auto_16px_4fr_3fr_2fr_minmax(120px,1fr)] gap-4 rounded-md px-4 py-2.5 text-sm transition select-none",
                    isSelected
                      ? "bg-white/20"
                      : "hover:bg-white/10"
                  )}
                >
                  {/* Checkbox — visible when selection active or row hovered */}
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

                  <div className="flex items-center text-spotify-lightgray">
                    {new Date(song.addedAt).toLocaleDateString()}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          playlists={playlists}
          selectionCount={contextMenu.songIds.length}
          onAddToPlaylist={(playlistId) => {
            onAddToPlaylist(contextMenu.songIds, playlistId);
            setSelected(new Set());
          }}
          onCreateAndAdd={() => {
            onCreatePlaylistAndAdd(contextMenu.songIds);
            setSelected(new Set());
          }}
          onRemove={() => {
            onRemoveSong(contextMenu.songIds);
            setSelected(new Set());
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

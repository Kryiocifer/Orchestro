import React, { useMemo, useState, useDeferredValue, useRef, useCallback } from "react";
import { Song, Playlist } from "../lib/types";
import { Play, Clock, Plus, Search, Check, Sparkles } from "lucide-react";
import { formatDuration } from "../lib/utils";
import ContextMenu from "./ContextMenu";
import { cn } from "../lib/utils";

interface LibraryViewProps {
  songs: Song[];
  playlists: Playlist[];
  musicFolder?: string | null;
  currentSongId?: string;
  isPlaying: boolean;
  onPlaySong: (song: Song, queue?: Song[]) => void;
  onAddToQueue: (songIds: string[]) => void;
  onAddToPlaylist: (songIds: string[], playlistId: string) => void;
  onCreatePlaylistAndAdd: (songIds: string[]) => void;
  onRemoveSong: (songIds: string[]) => void;
  onAddSongs: () => void;
  onEnrichLibrary?: () => void;
}

function getSongFolder(song: Song, musicFolder?: string | null): string {
  const normPath = song.path.replace(/\\/g, "/");
  if (musicFolder) {
    const normRoot = musicFolder.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normPath.toLowerCase().startsWith(normRoot.toLowerCase() + "/")) {
      const rel = normPath.slice(normRoot.length + 1);
      const parts = rel.split("/");
      if (parts.length > 1) {
        return parts[0];
      }
      return "Main Folder";
    }
  }
  const lastSlash = normPath.lastIndexOf("/");
  if (lastSlash > 0) {
    const parentPath = normPath.slice(0, lastSlash);
    const parentName = parentPath.split("/").pop();
    if (parentName) return parentName;
  }
  return "Other";
}

interface LibrarySongRowProps {
  song: Song;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  selectedCount: number;
  onRowClick: (e: React.MouseEvent, song: Song, index: number) => void;
  onContextMenu: (e: React.MouseEvent, songId: string) => void;
  onCheckboxClick: (e: React.MouseEvent, songId: string) => void;
}

const LibrarySongRow = React.memo(({
  song, index, isCurrent, isPlaying, isSelected, selectedCount, onRowClick, onContextMenu, onCheckboxClick
}: LibrarySongRowProps) => {
  return (
    <div
      onClick={(e) => onRowClick(e, song, index)}
      onContextMenu={(e) => onContextMenu(e, song.id)}
      className={cn(
        "group grid cursor-pointer grid-cols-[auto_16px_4fr_3fr_2fr_minmax(120px,1fr)] gap-4 rounded-md px-4 py-2.5 text-sm transition select-none",
        isSelected
          ? "bg-white/20"
          : "hover:bg-white/10"
      )}
    >
      <div
        className="flex w-6 items-center justify-center"
        onClick={(e) => onCheckboxClick(e, song.id)}
      >
        <div
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border transition",
            isSelected
              ? "border-spotify-green bg-spotify-green text-black"
              : "border-white/30 opacity-0 group-hover:opacity-100",
            selectedCount > 0 && !isSelected && "opacity-100"
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
              loading="lazy"
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
}, (prev, next) => {
  return prev.song.id === next.song.id &&
         prev.index === next.index &&
         prev.isCurrent === next.isCurrent &&
         prev.isPlaying === next.isPlaying &&
         prev.isSelected === next.isSelected &&
         prev.selectedCount === next.selectedCount;
});

export default function LibraryView({
  songs,
  playlists,
  musicFolder,
  currentSongId,
  isPlaying,
  onPlaySong,
  onAddToQueue,
  onAddToPlaylist,
  onCreatePlaylistAndAdd,
  onRemoveSong,
  onAddSongs,
  onEnrichLibrary,
}: LibraryViewProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: "sno" | "title" | "album" | "dateAdded" | "duration"; asc: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    songIds: string[];
  } | null>(null);

  const folders = useMemo(() => {
    const map = new Map<string, number>();
    for (const song of songs) {
      const f = getSongFolder(song, musicFolder);
      map.set(f, (map.get(f) || 0) + 1);
    }
    const list = Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
    }));
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return list;
  }, [songs, musicFolder]);

  const folderFilteredSongs = useMemo(() => {
    if (!selectedFolder) return songs;
    return songs.filter((s) => getSongFolder(s, musicFolder) === selectedFolder);
  }, [songs, selectedFolder, musicFolder]);

  const handleSort = (key: "sno" | "title" | "album" | "dateAdded" | "duration") => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        if (prev.asc) return { key, asc: false };
        return null;
      }
      return { key, asc: true };
    });
  };

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    let result = folderFilteredSongs.map((song, index) => ({ song, originalIndex: index }));
    
    if (q) {
      result = result.filter(
        ({ song: s }) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.album.toLowerCase().includes(q) ||
          s.fileName.toLowerCase().includes(q)
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
          case "dateAdded":
            cmp = (sA.addedAt || 0) - (sB.addedAt || 0);
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
  }, [folderFilteredSongs, deferredQuery, sortConfig]);

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

    // normal click → play with current filtered queue, clear multi-select
    setSelected(new Set());
    setLastClickedId(song.id);
    onPlaySong(song, filtered);
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

  const handleCheckboxClick = (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
    setLastClickedId(songId);
  };

  // Stable callbacks for memoized rows
  const handleRowClickRef = useRef(handleRowClick);
  handleRowClickRef.current = handleRowClick;
  const onRowClickStable = useCallback((e: React.MouseEvent, song: Song, index: number) => handleRowClickRef.current(e, song, index), []);

  const handleContextMenuRef = useRef(handleContextMenu);
  handleContextMenuRef.current = handleContextMenu;
  const onContextMenuStable = useCallback((e: React.MouseEvent, songId: string) => handleContextMenuRef.current(e, songId), []);

  const handleCheckboxClickRef = useRef(handleCheckboxClick);
  handleCheckboxClickRef.current = handleCheckboxClick;
  const onCheckboxClickStable = useCallback((e: React.MouseEvent, songId: string) => handleCheckboxClickRef.current(e, songId), []);

  return (
    <div className="p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Library</h1>
          <p className="mt-1 text-sm text-spotify-lightgray">
            {selectedFolder
              ? `${filtered.length} track${filtered.length !== 1 ? "s" : ""} in ${selectedFolder}`
              : `${songs.length} track${songs.length !== 1 ? "s" : ""}${folders.length > 1 ? ` · ${folders.length} folders` : ""}`}
            {selected.size > 0 && (
              <span className="text-white"> · {selected.size} selected</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-spotify-lightgray" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-48 rounded-md border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-sm text-white outline-none placeholder:text-spotify-lightgray focus:border-white/20 focus:bg-white/8"
            />
          </div>
          <button
            onClick={onAddSongs}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-spotify-lightgray transition hover:border-white/20 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
          {onEnrichLibrary && (
            <button
              onClick={onEnrichLibrary}
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-spotify-lightgray transition hover:border-white/20 hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Fix Metadata
            </button>
          )}
        </div>
      </div>

      {/* Folder tabs */}
      {folders.length > 0 && (
        <div className="mb-5 flex items-center gap-0 border-b border-white/[0.08]">
          <button
            onClick={() => {
              setSelectedFolder(null);
              setSelected(new Set());
            }}
            className={cn(
              "relative -mb-px shrink-0 border-b-2 px-4 pb-2.5 pt-1 text-sm transition-colors",
              selectedFolder === null
                ? "border-white font-semibold text-white"
                : "border-transparent text-spotify-lightgray hover:text-white/70"
            )}
          >
            All
            <span className={cn(
              "ml-2 text-xs tabular-nums",
              selectedFolder === null ? "text-white/50" : "text-white/25"
            )}>
              {songs.length}
            </span>
          </button>

          {folders.map(({ name, count }) => {
            const isActive = selectedFolder === name;
            return (
              <button
                key={name}
                onClick={() => {
                  setSelectedFolder(isActive ? null : name);
                  setSelected(new Set());
                }}
                className={cn(
                  "relative -mb-px shrink-0 border-b-2 px-4 pb-2.5 pt-1 text-sm transition-colors",
                  isActive
                    ? "border-white font-semibold text-white"
                    : "border-transparent text-spotify-lightgray hover:text-white/70"
                )}
              >
                <span className="max-w-[160px] truncate">{name}</span>
                <span className={cn(
                  "ml-2 text-xs tabular-nums",
                  isActive ? "text-white/50" : "text-white/25"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
            <div className="cursor-pointer hover:text-white flex items-center gap-1" onClick={() => handleSort("sno")}>
              # {sortConfig?.key === "sno" && (sortConfig.asc ? "↑" : "↓")}
            </div>
            <div className="cursor-pointer hover:text-white flex items-center gap-1" onClick={() => handleSort("title")}>
              Title {sortConfig?.key === "title" && (sortConfig.asc ? "↑" : "↓")}
            </div>
            <div className="cursor-pointer hover:text-white flex items-center gap-1" onClick={() => handleSort("album")}>
              Album {sortConfig?.key === "album" && (sortConfig.asc ? "↑" : "↓")}
            </div>
            <div className="cursor-pointer hover:text-white flex items-center gap-1" onClick={() => handleSort("dateAdded")}>
              Date added {sortConfig?.key === "dateAdded" && (sortConfig.asc ? "↑" : "↓")}
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
                <LibrarySongRow
                  key={song.id}
                  song={song}
                  index={index}
                  isCurrent={isCurrent}
                  isPlaying={isPlaying}
                  isSelected={isSelected}
                  selectedCount={selected.size}
                  onRowClick={onRowClickStable}
                  onContextMenu={onContextMenuStable}
                  onCheckboxClick={onCheckboxClickStable}
                />
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
          onAddToQueue={() => {
            onAddToQueue(contextMenu.songIds);
            setSelected(new Set());
          }}
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

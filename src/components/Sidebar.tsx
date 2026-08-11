import { useState } from "react";
import {
  Home,
  Library,
  Plus,
  Music2,
  Trash2,
  ListMusic,
  FolderOpen,
  RefreshCw,
  FileAudio,
  Youtube,
} from "lucide-react";
import { Playlist, View } from "../lib/types";
import { cn } from "../lib/utils";

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  playlists: Playlist[];
  activePlaylistId: string | null;
  musicFolder: string | null | undefined;
  isScanning?: boolean;
  onSelectPlaylist: (id: string) => void;
  onCreatePlaylist: (name: string) => void;
  onDeletePlaylist: (id: string) => void;
  onLinkFolder: () => void;
  onRescan: () => void;
  onImportPlaylist: () => void;
  downloadFolder?: string | null;
  onPickDownloadFolder: () => void;
}

export default function Sidebar({
  currentView,
  setCurrentView,
  playlists,
  activePlaylistId,
  musicFolder,
  isScanning,
  onSelectPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  onLinkFolder,
  onRescan,
  onImportPlaylist,
  downloadFolder,
  onPickDownloadFolder,
}: SidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = () => {
    if (newName.trim()) {
      onCreatePlaylist(newName.trim());
      setNewName("");
      setIsCreating(false);
    }
  };

  const folderLabel = musicFolder
    ? musicFolder.split(/[/\\]/).filter(Boolean).pop() || musicFolder
    : null;

  const dlLabel = downloadFolder
    ? downloadFolder.split(/[/\\]/).filter(Boolean).pop()
    : null;

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-1 bg-spotify-darker px-3 py-5">
      {/* Logo */}
      <div className="mb-6 flex items-center gap-2.5 px-3">
        <Music2 className="h-8 w-8 text-spotify-green" />
        <span className="text-xl font-bold tracking-tight">Orchestro</span>
      </div>

      {/* Main nav */}
      <nav className="space-y-1 px-1">
        {(
          [
            { id: "home" as View, label: "Home", icon: Home },
            { id: "library" as View, label: "Your Library", icon: Library },
            { id: "youtube" as View, label: "YouTube", icon: Youtube },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setCurrentView(id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              currentView === id
                ? "bg-white/10 text-white"
                : "text-spotify-lightgray hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Music folder */}
      <div className="mt-6 space-y-0.5 px-1">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-spotify-lightgray/80">
          Music Folder
        </p>
        <button
          onClick={onLinkFolder}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-spotify-lightgray transition hover:bg-white/5 hover:text-white"
          title={musicFolder || "Link a folder"}
        >
          <FolderOpen className="h-4 w-4 shrink-0 opacity-80" />
          <span className="truncate">{folderLabel || "Link folder…"}</span>
        </button>
        {musicFolder && (
          <button
            onClick={onRescan}
            disabled={isScanning}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-spotify-lightgray transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-4 w-4 shrink-0 opacity-80", isScanning && "animate-spin")}
            />
            {isScanning ? "Scanning…" : "Rescan folder"}
          </button>
        )}
        <button
          onClick={onImportPlaylist}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-spotify-lightgray transition hover:bg-white/5 hover:text-white"
        >
          <FileAudio className="h-4 w-4 shrink-0 opacity-80" />
          Import playlist…
        </button>
      </div>

      {/* Downloads */}
      <div className="mt-5 space-y-0.5 px-1">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-spotify-lightgray/80">
          Downloads
        </p>
        <button
          onClick={onPickDownloadFolder}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-spotify-lightgray transition hover:bg-white/5 hover:text-white"
          title={downloadFolder || "Download folder"}
        >
          <FolderOpen className="h-4 w-4 shrink-0 opacity-80" />
          <span className="truncate">
            {dlLabel || "Set download folder…"}
          </span>
        </button>
      </div>

      {/* Playlists */}
      <div className="mt-5 flex items-center justify-between px-4">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-spotify-lightgray/80">
          Playlists
        </span>
        <button
          onClick={() => setIsCreating(true)}
          className="rounded-md p-1.5 text-spotify-lightgray transition hover:bg-white/10 hover:text-white"
          title="Create playlist"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {isCreating && (
        <div className="mt-2 px-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setIsCreating(false);
                setNewName("");
              }
            }}
            onBlur={() => {
              if (!newName.trim()) setIsCreating(false);
            }}
            placeholder="Playlist name"
            className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none ring-1 ring-spotify-green/60"
          />
        </div>
      )}

      <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-1 pb-2">
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className={cn(
              "group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
              activePlaylistId === playlist.id && currentView === "playlist"
                ? "bg-white/10 text-white"
                : "text-spotify-lightgray hover:bg-white/5 hover:text-white"
            )}
          >
            <button
              onClick={() => onSelectPlaylist(playlist.id)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <ListMusic className="h-4 w-4 shrink-0 opacity-70" />
              <span className="truncate">{playlist.name}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeletePlaylist(playlist.id);
              }}
              className="ml-1 hidden rounded p-1 text-spotify-lightgray hover:text-red-400 group-hover:block"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {playlists.length === 0 && !isCreating && (
          <p className="px-3 py-6 text-center text-xs leading-relaxed text-spotify-lightgray/70">
            No playlists yet.
            <br />
            Create one or import .m3u
          </p>
        )}
      </div>
    </aside>
  );
}

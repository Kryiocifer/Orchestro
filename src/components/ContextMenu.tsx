import { useEffect, useRef } from "react";
import { Playlist } from "../lib/types";
import { ListMusic, Plus, Trash2 } from "lucide-react";

interface ContextMenuProps {
  x: number;
  y: number;
  playlists: Playlist[];
  /** How many songs are targeted (1 = single, >1 = bulk) */
  selectionCount?: number;
  onAddToPlaylist: (playlistId: string) => void;
  onCreateAndAdd: () => void;
  onRemove?: () => void;
  /** Hide remove when not applicable (e.g. playlist-only bulk) */
  showRemove?: boolean;
  onClose: () => void;
}

export default function ContextMenu({
  x,
  y,
  playlists,
  selectionCount = 1,
  onAddToPlaylist,
  onCreateAndAdd,
  onRemove,
  showRemove = true,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    top: Math.min(y, window.innerHeight - 360),
    left: Math.min(x, window.innerWidth - 240),
  };

  const bulk = selectionCount > 1;

  return (
    <div
      ref={menuRef}
      style={style}
      className="fixed z-[100] min-w-[220px] overflow-hidden rounded-md border border-[#333] bg-[#282828] py-1 shadow-2xl"
    >
      {bulk && (
        <div className="px-3 py-1.5 text-xs text-spotify-green">
          {selectionCount} songs selected
        </div>
      )}

      <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-spotify-lightgray">
        {bulk ? "Add selected to playlist" : "Add to playlist"}
      </div>

      <button
        onClick={() => {
          onCreateAndAdd();
          onClose();
        }}
        className="flex w-full items-center gap-3 px-3 py-2 text-sm text-white transition hover:bg-[#3e3e3e]"
      >
        <Plus className="h-4 w-4" />
        Create new playlist
      </button>

      {playlists.length > 0 && (
        <div className="my-1 border-t border-[#3e3e3e]" />
      )}

      <div className="max-h-48 overflow-y-auto">
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            onClick={() => {
              onAddToPlaylist(playlist.id);
              onClose();
            }}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white transition hover:bg-[#3e3e3e]"
          >
            <ListMusic className="h-4 w-4 shrink-0 text-spotify-lightgray" />
            <span className="truncate">{playlist.name}</span>
          </button>
        ))}
      </div>

      {showRemove && onRemove && (
        <>
          <div className="my-1 border-t border-[#3e3e3e]" />
          <button
            onClick={() => {
              onRemove();
              onClose();
            }}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-400 transition hover:bg-[#3e3e3e]"
          >
            <Trash2 className="h-4 w-4" />
            {bulk ? "Remove selected from library" : "Remove from library"}
          </button>
        </>
      )}
    </div>
  );
}

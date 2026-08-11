import { useState } from "react";
import { Song, Playlist } from "../lib/types";
import { Play, ListMusic, Plus } from "lucide-react";
import ContextMenu from "./ContextMenu";

interface HomeViewProps {
  songs: Song[];
  playlists: Playlist[];
  onPlaySong: (song: Song) => void;
  onSelectPlaylist: (id: string) => void;
  onAddSongs: () => void;
  onAddToPlaylist: (songId: string, playlistId: string) => void;
  onCreatePlaylistAndAdd: (songId: string) => void;
  onRemoveSong: (songId: string) => void;
}

export default function HomeView({
  songs,
  playlists,
  onPlaySong,
  onSelectPlaylist,
  onAddSongs,
  onAddToPlaylist,
  onCreatePlaylistAndAdd,
  onRemoveSong,
}: HomeViewProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    songId: string;
  } | null>(null);

  const recentSongs = [...songs]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 10);

  const handleContextMenu = (e: React.MouseEvent, songId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, songId });
  };

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold">Good evening</h1>

      {playlists.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">Your Playlists</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.slice(0, 6).map((playlist) => (
              <button
                key={playlist.id}
                onClick={() => onSelectPlaylist(playlist.id)}
                className="group flex items-center gap-3 overflow-hidden rounded-md bg-white/5 transition hover:bg-white/10"
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-spotify-gray">
                  <ListMusic className="h-7 w-7 text-spotify-lightgray" />
                </div>
                <span className="truncate pr-4 font-semibold">
                  {playlist.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Recently Added</h2>
        </div>

        {recentSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#333] py-20">
            <div className="mb-4 text-5xl">🎧</div>
            <p className="text-xl font-medium">Your library is empty</p>
            <p className="mt-2 max-w-sm text-center text-sm text-spotify-lightgray">
              Drag and drop music files anywhere, or click the button below
            </p>
            <button
              onClick={onAddSongs}
              className="mt-6 flex items-center gap-2 rounded-full bg-spotify-green px-6 py-3 font-semibold text-black transition hover:scale-105 hover:bg-spotify-green-hover"
            >
              <Plus className="h-5 w-5" />
              Add Songs
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {recentSongs.map((song) => (
              <div
                key={song.id}
                className="group relative cursor-pointer rounded-lg bg-spotify-dark p-4 transition hover:bg-spotify-gray"
                onClick={() => onPlaySong(song)}
                onContextMenu={(e) => handleContextMenu(e, song.id)}
              >
                <div className="relative mb-4 aspect-square overflow-hidden rounded-md bg-spotify-gray shadow-lg">
                  {song.cover ? (
                    <img
                      src={song.cover}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">
                      🎵
                    </div>
                  )}
                  <button className="absolute bottom-2 right-2 flex h-12 w-12 translate-y-3 items-center justify-center rounded-full bg-spotify-green opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100">
                    <Play className="h-5 w-5 fill-black text-black" />
                  </button>
                </div>
                <p className="truncate font-semibold">{song.title}</p>
                <p className="truncate text-sm text-spotify-lightgray">
                  {song.artist}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          playlists={playlists}
          onAddToPlaylist={(playlistId) =>
            onAddToPlaylist(contextMenu.songId, playlistId)
          }
          onCreateAndAdd={() => onCreatePlaylistAndAdd(contextMenu.songId)}
          onRemove={() => onRemoveSong(contextMenu.songId)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

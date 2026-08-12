export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  path: string;
  cover?: string;
  addedAt: number;
  fileName: string;
  size: number;
}

export interface Playlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface LibraryData {
  songs: Song[];
  playlists: Playlist[];
  /** User-selected music folder (scanned recursively) */
  musicFolder?: string | null;
  /** Where yt-dlp downloads land */
  downloadFolder?: string | null;
  /** Spotify Web API credentials (local only — do not commit) */
  spotifyClientId?: string | null;
  spotifyClientSecret?: string | null;
  lastPlayed?: {
    songId: string;
    position: number;
  };
}

export type View = "home" | "library" | "playlist" | "youtube" | "import";

export interface YtSearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number | null;
  url: string;
}


export interface SpotifyTrack {
  title: string;
  artist: string;
  duration: number | null;
  /** Original Spotify track id if known */
  id?: string;
}

export interface SpotifyPlaylistResult {
  name: string;
  tracks: SpotifyTrack[];
  url: string;
}

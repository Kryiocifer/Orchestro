# Local Spotify

A **lightweight**, fully offline Spotify-style desktop music player built with **Tauri 2 + React + TypeScript**.

### Features
- 100% local — no accounts, no APIs, no internet required
- Extremely light on RAM & CPU (Tauri)
- Drag & drop music files → auto-added to managed library
- Toast feedback: **"Added!"** or **"Already exists"**
- Real metadata extraction (title, artist, album, duration, cover art)
- Create / delete playlists
- Right-click any song → **Add to playlist**
- Clean Spotify-inspired dark UI
- Bottom player bar with seek + volume + cover art
- Queue support

---

## Getting Started

### Prerequisites
- Node.js 18+
- Rust (latest stable recommended)
- System dependencies for Tauri (see [Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Install & Run

```bash
cd local-spotify
npm install
npm run tauri dev
```

### Build for production

```bash
npm run tauri build
```

---

## How to use

1. Drag any `.mp3`, `.flac`, `.wav`, `.ogg`, `.m4a` etc. into the window
2. Songs appear in **Your Library** with proper title/artist/album + cover
3. Right-click a song → **Add to playlist**
4. Create playlists from the sidebar
5. Click play and enjoy

---

## Project Structure

```
local-spotify/
├── src/                       # React frontend
│   ├── components/
│   │   ├── ContextMenu.tsx    # Right-click menu
│   │   ├── HomeView.tsx
│   │   ├── LibraryView.tsx
│   │   ├── PlayerBar.tsx
│   │   ├── PlaylistView.tsx
│   │   └── Sidebar.tsx
│   ├── lib/
│   │   ├── library.ts         # Core library + metadata logic
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                 # Rust / Tauri
└── package.json
```

---

## Next planned features
- Remove song from playlist / library
- Drag to reorder inside playlists
- YouTube search + download (yt-dlp)
- Keyboard shortcuts
- Mini player / system tray
- Search inside library

---

Made with 💜 for chill local listening

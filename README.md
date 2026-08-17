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

### Linux Installation & Building (Arch / CachyOS)

When building or running Orchestro on Linux, you need specific system libraries for the WebKit interface and audio playback (GStreamer). 

**1. Install required dependencies:**
```bash
# Arch / CachyOS
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl wget openssl \
  appmenu-gtk-module gtk3 \
  libappindicator-gtk3 librsvg libvips \
  gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav \
  fuse2
```

**2. Installing from a Release Download:**
If you downloaded a pre-compiled binary or AppImage from the releases page, you can run it from **any folder** (Downloads, Desktop, etc.). It does not need to be in a specific system folder.

For the **Native Binary** (Recommended for Arch):
```bash
# Make it executable
chmod +x orchestro
# Run it
./orchestro
```
*(Optional: You can move it to `~/.local/bin/` so you can launch it by just typing `orchestro` anywhere in your terminal, but it works fine from any location).*

For the **AppImage**:
```bash
# Make it executable
chmod +x Orchestro_0.1.0_amd64.AppImage
# Run it
./Orchestro_0.1.0_amd64.AppImage
```
> **Troubleshooting AppImages:** If the AppImage opens but audio crashes, WebKitGTK might be isolated from your system's GStreamer plugins. You can force it to see them by launching it like this: `GST_PLUGIN_SYSTEM_PATH_1_0=/usr/lib/gstreamer-1.0 ./Orchestro_0.1.0_amd64.AppImage`

**3. Build the App from Source:**
To properly build the `.AppImage` yourself (and avoid `linuxdeploy` failing or stripping essential libraries), use:
```bash
NO_STRIP=1 APPIMAGE_EXTRACT_AND_RUN=1 npm run tauri build
```

Your compiled files will be located at:
- **Native Binary:** `src-tauri/target/release/orchestro` 
- **AppImage:** `src-tauri/target/release/bundle/appimage/Orchestro_0.1.0_amd64.AppImage`
- **Debian:** `src-tauri/target/release/bundle/deb/Orchestro_0.1.0_amd64.deb`

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

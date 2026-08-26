# Orchestro 🎵

A modern, ultra-lightweight, offline-first Spotify-style desktop music player and downloader built with **Tauri 2 + React + TypeScript + Rust**.

---

## ✨ Features

- **⚡ Blazing Fast & Lightweight**: Minimal RAM and CPU footprint powered by Tauri 2 and native Rust audio handling.
- **📂 Smart Library & Subfolder Navigation**: Point to your music library folder. Browse all tracks at once or filter seamlessly by subfolder with clean navigation tabs.
- **🎨 Immersive "Now Playing" Screen**: Click the current track in the bottom player bar to slide up a full-screen view with a dynamic blurred background, high-resolution album artwork, progress bar, and comprehensive controls.
- **💾 Complete Session Persistence**: Automatically remembers your exact playback state across app restarts — including current song, time elapsed, queue order, volume, shuffle, and repeat modes.
- **🗔 System Tray Integration**: Minimizes to the system tray on close with a native tray menu for instant restoration or exit, preventing accidental shutdowns during playback.
- **📥 Spotify & YouTube Playlist Downloader**: Built-in downloader powered by `yt-dlp` and `ffmpeg`. Downloading a public Spotify playlist creates an organized folder with automatically tagged metadata and artwork.
- **📜 Queue with "Play Next"**: Queue individual tracks or bulk selections to play immediately next without disrupting your ongoing playlist sequence.
- **🏷️ Rich Metadata Extraction**: Automatic parsing of titles, artists, albums, durations, and embedded cover art for `.mp3`, `.flac`, `.wav`, `.ogg`, `.m4a`, and more.
- **🎶 Playlists & Management**: Create custom playlists, right-click context menu actions, search filtering, and drag-and-drop ingestion.
- **🔔 Refined Toast System**: Unobtrusive notifications positioned neatly above player controls.
- **⌨️ Media Session API**: Native OS media keys and playback shortcuts support.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- OS build dependencies (see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))
- Optional for downloads: `yt-dlp` and `ffmpeg` installed on your PATH

### Development

```bash
# Clone the repository
git clone https://github.com/your-username/Orchestro.git
cd Orchestro

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
```

---

## 🐧 Linux Installation & Building (Arch / CachyOS / Ubuntu / Debian)

### 1. Install System Dependencies

#### Arch Linux / CachyOS:
```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl wget openssl \
  appmenu-gtk-module gtk3 \
  libappindicator-gtk3 librsvg libvips \
  gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav \
  fuse2
```

#### Ubuntu / Debian:
```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl wget libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libgstreamer1.0-dev \
  libgstreamer-plugins-base1.0-dev \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-ugly \
  gstreamer1.0-libav
```

### 2. Building AppImage / Debian Bundles

To properly build the `.AppImage` on Linux without library stripping issues:

```bash
npm run build:linux
# or
NO_STRIP=1 APPIMAGE_EXTRACT_AND_RUN=1 npm run tauri build
```

Artifacts will be located at:
- **Native Binary:** `src-tauri/target/release/orchestro`
- **AppImage:** `src-tauri/target/release/bundle/appimage/Orchestro_*.AppImage`
- **Debian Package:** `src-tauri/target/release/bundle/deb/Orchestro_*.deb`

---

## 📁 Project Structure

```
Orchestro/
├── src/                         # React Frontend
│   ├── components/
│   │   ├── ContextMenu.tsx      # Right-click context actions
│   │   ├── DownloadPanel.tsx    # Live download queue & progress
│   │   ├── HomeView.tsx         # Quick access & recently played
│   │   ├── ImportView.tsx       # Spotify & YouTube playlist importer
│   │   ├── LibraryView.tsx      # Filterable song library & folder tabs
│   │   ├── NowPlayingView.tsx   # Full-screen immersive player view
│   │   ├── PlayerBar.tsx        # Persistent bottom player controls
│   │   ├── PlaylistView.tsx     # Custom playlists & track listings
│   │   ├── Sidebar.tsx          # Navigation & library links
│   │   └── YouTubeView.tsx      # In-app YouTube search & streaming
│   ├── lib/
│   │   ├── library.ts           # Storage, scanning & metadata parsing
│   │   ├── types.ts             # TypeScript interfaces & types
│   │   └── utils.ts             # Formatting & helper utilities
│   ├── styles/                  # Tailwind CSS & global styles
│   ├── App.tsx                  # Main application container & state orchestration
│   └── main.tsx                 # React entry point & toast configuration
├── src-tauri/                   # Rust Backend
│   ├── src/
│   │   ├── main.rs              # Application entry
│   │   └── lib.rs               # Commands (audio streaming, yt-dlp, tray, fs)
│   ├── Cargo.toml               # Rust dependencies & metadata
│   └── tauri.conf.json          # Tauri v2 configuration & window settings
├── package.json
└── vite.config.ts
```

---

## 📄 License

MIT License. Crafted for clean, distraction-free local listening.

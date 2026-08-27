# Orchestro

Orchestro is a modern, lightweight, offline-first desktop music player and downloader. It is built utilizing Tauri 2, React, TypeScript, and Rust, providing a fast and resource-efficient experience.

---

## Features

- **High Performance and Lightweight**: Maintains a minimal RAM and CPU footprint, powered by Tauri 2 and native Rust audio handling.
- **Smart Library Navigation**: Allows users to point to their local music library folder. Browse all tracks comprehensively or filter by subfolder using the built-in navigation tabs.
- **Immersive "Now Playing" View**: Provides a full-screen view with a dynamic blurred background, high-resolution album artwork, progress tracking, and comprehensive media controls.
- **Session Persistence**: Automatically saves and restores the exact playback state across application restarts, including the current track, elapsed time, queue order, volume, and playback modes (shuffle and repeat).
- **System Tray Integration**: Minimizes to the system tray on close. Features a native tray menu for instant restoration or application exit, preventing accidental interruptions during playback.
- **Playlist Downloader**: Includes a built-in downloader powered by `yt-dlp` and `ffmpeg`. Downloading public playlists creates an organized directory with automatically tagged metadata and artwork.
- **Advanced Queue Management**: Supports queuing individual tracks or bulk selections to play next without disrupting the current playlist sequence.
- **Metadata Extraction**: Automatically parses titles, artists, albums, durations, and embedded cover art for various audio formats including `.mp3`, `.flac`, `.wav`, `.ogg`, and `.m4a`.
- **Playlist Management**: Enables the creation of custom playlists, contextual actions via right-click, search filtering, and drag-and-drop support.
- **Native Media Controls**: Integrates with the Media Session API for native operating system media keys and playback shortcuts.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- [Rust](https://www.rust-lang.org/tools/install) (stable release)
- Operating System build dependencies (refer to [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))
- Optional (for downloading functionality): `yt-dlp` and `ffmpeg` installed and available in your system PATH.

### Development Environment

```bash
# Clone the repository
git clone https://github.com/your-username/Orchestro.git
cd Orchestro

# Install package dependencies
npm install

# Start the application in development mode
npm run tauri dev
```

### Production Build

For **Windows** and **macOS**, the standard build command securely produces the respective OS installers (NSIS/MSI for Windows, DMG/App for macOS):

```bash
npm run tauri build
```

*(Note: For **Linux** builds, please refer to the [Linux Installation and Building](#linux-installation-and-building) section below for the correct packaging commands.)*

---

## Linux Installation and Building

The project is configured to build DEB, RPM, and AppImage packages on Linux.

### 1. Install System Dependencies

**Arch Linux / CachyOS:**
```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl wget openssl \
  appmenu-gtk-module gtk3 \
  libappindicator-gtk3 librsvg libvips \
  gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav \
  fuse2 rpm-tools patchelf
```

**Ubuntu / Debian:**
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
  gstreamer1.0-libav \
  patchelf rpm
```

### 2. Building Packages

The `package.json` contains dedicated scripts that handle specific environment variables required for proper Linux bundling (e.g., preventing library stripping issues).

```bash
# Build all Linux targets (DEB, RPM, and AppImage)
npm run build:linux

# Build specific targets individually
npm run build:deb
npm run build:rpm
npm run build:appimage
```

Artifacts will be output to the following locations:
- **Native Binary:** `src-tauri/target/release/orchestro`
- **AppImage:** `src-tauri/target/release/bundle/appimage/Orchestro_*.AppImage`
- **Debian Package:** `src-tauri/target/release/bundle/deb/Orchestro_*.deb`
- **RPM Package:** `src-tauri/target/release/bundle/rpm/Orchestro-*.rpm`

---

## Project Structure

```text
Orchestro/
├── src/                         # React Frontend Interface
│   ├── components/
│   │   ├── ContextMenu.tsx      # Right-click context actions
│   │   ├── DownloadPanel.tsx    # Live download queue and progress tracking
│   │   ├── HomeView.tsx         # Quick access and recently played tracks
│   │   ├── ImportView.tsx       # Spotify and YouTube playlist importer
│   │   ├── LibraryView.tsx      # Filterable song library and folder tabs
│   │   ├── NowPlayingView.tsx   # Full-screen immersive player view
│   │   ├── PlayerBar.tsx        # Persistent bottom player controls
│   │   ├── PlaylistView.tsx     # Custom playlists and track listings
│   │   ├── Sidebar.tsx          # Navigation and library links
│   │   └── YouTubeView.tsx      # In-app YouTube search and streaming
│   ├── lib/
│   │   ├── library.ts           # Storage, scanning, and metadata parsing logic
│   │   ├── types.ts             # TypeScript interfaces and type definitions
│   │   └── utils.ts             # Formatting and helper utilities
│   ├── styles/                  # Tailwind CSS and global style definitions
│   ├── App.tsx                  # Main application container and state orchestration
│   └── main.tsx                 # React entry point and toast configuration
├── src-tauri/                   # Rust Backend
│   ├── src/
│   │   ├── main.rs              # Application entry point
│   │   └── lib.rs               # Commands (audio streaming, yt-dlp, tray, file system)
│   ├── Cargo.toml               # Rust dependencies and metadata
│   └── tauri.conf.json          # Tauri v2 configuration and window settings
├── package.json                 # Node dependencies and build scripts
└── vite.config.ts               # Vite configuration
```

---

## License

MIT License.

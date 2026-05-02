# Stack

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Tauri](https://img.shields.io/badge/Desktop-Tauri_2.0-24C8DB)
![React](https://img.shields.io/badge/Frontend-React_18-61DAFB)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6)
![Rust](https://img.shields.io/badge/Backend-Rust-000000)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57)
![Vite](https://img.shields.io/badge/Bundler-Vite-646CFF)

![Stack hero](src/assets/images/wallpaper-1.jpg)

Local sample library manager for producers. Splice-inspired interface, fully offline.
Browse, filter by BPM/key, preview audio and MIDI, and organize your own library.

**Download:** [stack.swendl.com](https://stack.swendl.com)

## Features

- Offline-first desktop app
- Fast indexing for samples, MIDI, and presets
- BPM/key filtering and full-text search
- Audio waveform and MIDI preview
- Folder-based browser with pack organization
- Auto-update flow via GitHub Releases

## Tech Stack

- **Desktop:** Tauri 2.0
- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Rust
- **Database:** SQLite

![Stack browser preview](src/assets/images/wallpaper-2.jpg)

## Prerequisites

- Node.js 20+
- npm
- Rust 1.78+ (stable), install via [rustup](https://rustup.rs)
- macOS: Xcode Command Line Tools (`xcode-select --install`)

## Local Development

```bash
npm install
npm run tauri dev
```

## Production Build

```bash
npm run tauri build
```

The app stores SQLite in the platform-standard app data directory:

- macOS: `~/Library/Application Support/app.stack.desktop/stack.db`
- Linux: `~/.local/share/app.stack.desktop/stack.db`
- Windows: `%APPDATA%\\app.stack.desktop\\stack.db`

## Release

Push a version tag to trigger the release workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Project Structure

```text
src/              React + TypeScript frontend
src-tauri/src/    Rust backend (commands, core, db, metadata, models)
```

## First Run

1. Launch the app.
2. Click **Add Folder** in the sidebar.
3. Select a folder containing samples, MIDI, or presets.
4. Wait for indexing to complete.
5. Search, filter, and preview assets in the Browser tab.

## License

MIT. See [LICENSE](LICENSE).

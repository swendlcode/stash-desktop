# UI Update Summary (macOS + Controls)

This note captures what we just implemented in the last iteration pass.

## macOS native top bar / window behavior

- Enabled macOS overlay title bar setup in `src-tauri/tauri.conf.json`:
  - `titleBarStyle: "Overlay"`
  - `hiddenTitle: true`
- Added missing drag permissions/capabilities so custom drag regions work reliably:
  - `core:window:allow-start-dragging` in `src-tauri/capabilities/default.json`
- Added focus/first-click behavior for better drag UX:
  - `acceptFirstMouse: true`
- Disabled drag/drop conflict on window:
  - `dragDropEnabled: false`
- Tuned traffic-light (red/yellow/green) native button position:
  - `trafficLightPosition: { x: 16, y: 20 }`

## Title bar layout + drag fix

- Moved app logo from top bar into sidebar header (above Browser/Packs nav).
- Refactored `TitleBar` to keep search visually centered with a 3-column layout.
- Implemented Chrome-style drag behavior pattern:
  - Full-width drag layer behind controls.
  - Foreground wrappers use pointer pass-through where needed.
  - Interactive controls remain clickable via `pointer-events-auto` + `no-drag`.
- Added direct drag fallback via Tauri API:
  - `getCurrentWindow().startDragging()` on drag-zone mousedown.

## Sidebar and spacing polish

- Added top spacing in sidebar nav block so Browser section has balanced head spacing.
- Added sidebar logo block with consistent padding/alignment.

## Slider and settings control consistency

- Fixed slider fill rendering bleed by moving fill styling to track-level CSS:
  - `--slider-pct` custom property in `Slider.tsx`
  - track/progress rendering in `index.css`
- Unified volume slider alignment in player bar and settings playback row.
- Updated settings library selects (`Indexer threads`, `Results per page`) style:
  - custom arrow icon
  - consistent control height, border, focus, hover states
- Fixed settings persistence behavior:
  - `Indexer threads` and `Results per page` now save immediately on change
  - values are persisted through backend settings update flow

## Files touched (high-level)

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src/components/layout/TitleBar.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/player/VolumeControl.tsx`
- `src/components/ui/Slider.tsx`
- `src/index.css`
- `src/pages/SettingsPage.tsx`
- `src/App.tsx`
- `src-tauri/src/lib.rs`


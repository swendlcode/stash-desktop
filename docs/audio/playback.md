# Audio Playback Architecture

## Overview

Stack uses a two-layer audio system designed for zero-latency playback when navigating the asset list with arrow keys. The core insight is that audio must start **before** React state updates — the browser's render cycle is too slow to feel instant.

---

## The Problem

The original architecture had this chain for every arrow key press:

```
keydown → setState → React re-render → useEffect → audio.src = url → audio.play()
```

Each step adds latency:

| Step | Latency |
|---|---|
| React re-render | ~16ms (one frame) |
| `audio.src` assignment | triggers fetch + decode |
| Browser audio decode | 20–100ms for local files |
| `audio.play()` promise | resolves after buffering |

Total: **50–150ms** of perceived delay before any sound.

---

## The Solution

### Layer 1 — AudioEngine (`src/services/audioEngine.ts`)

A singleton that lives entirely outside React. It owns a single `AudioContext`, a decoded buffer cache, and handles all sample playback.

**Key idea:** `Web Audio API`'s `decodeAudioData` pre-decodes audio files into `AudioBuffer` objects in memory. Playing from an `AudioBuffer` via a `BufferSourceNode` is instantaneous — no I/O, no decode step, no async pipeline.

```
audioEngine.playBuffer(path, 0)  →  sound starts in the same JS tick
```

#### Buffer Cache

```
prefetch(path)        — background decode, no-op if already cached
ensureBuffer(path)    — decode now if not cached, returns Promise<AudioBuffer>
getBuffer(path)       — synchronous cache lookup, returns null if not ready
playBuffer(path, offset) — plays from cache, returns false if not cached yet
prefetchAround(assets, index) — pre-decodes ±3 tracks around current selection
```

Cache eviction uses LRU with a max of 20 buffers (~100–200 MB typical).

#### Fallback Path

When a buffer isn't cached yet (first time a track is selected), the engine falls back to an HTML `<audio>` element for immediate playback while `decodeAudioData` runs in the background. Once decoding completes, playback seamlessly switches to the buffer — so the *next* time that track plays, it's instant.

---

### Layer 2 — Arrow Key Handler (`src/components/asset/AssetGrid.tsx`)

Arrow key presses call `audioEngine.playBuffer` **directly in the event handler**, before any React state update:

```ts
// keydown handler — audio fires first
if (asset.type === 'sample') audioEngine.playBuffer(asset.path, 0);  // ← instant
playAsset(asset);  // ← React state update, triggers UI re-render after
audioEngine.prefetchAround(assets, next);  // ← warm up neighbours
```

React state (`currentAsset`, `isPlaying`) is updated after audio has already started. The UI (waveform, track title, player bar) catches up on the next render frame — the user hears sound immediately.

---

### Layer 3 — usePlayer Hook (`src/hooks/usePlayer.ts`)

The hook wires the engine's callbacks to the Zustand store for UI sync, and handles MIDI playback (which uses Web Audio oscillator synthesis and is unaffected by this architecture).

**Effect separation:** The hook uses two separate effects instead of one monolithic one:

- `useEffect([currentAsset])` — handles asset changes (load, prefetch, start playback)
- `useEffect([isPlaying])` — handles pause/resume only, never reloads the asset

This prevents pause/resume from re-triggering the full load sequence, and prevents volume changes from restarting playback (volume is stored in a `volumeRef`).

---

## Data Flow

### Arrow key → instant playback (buffer cached)

```
keydown (ArrowDown)
  │
  ├─ audioEngine.playBuffer(path, 0)   ← sound starts here, same tick
  │     └─ BufferSourceNode.start(0)
  │
  ├─ setSelectedIndex(next)            ← React state
  ├─ playerStore.play(asset)           ← React state
  │
  └─ audioEngine.prefetchAround(...)   ← background decode of neighbours
       └─ fetch + decodeAudioData for ±3 tracks
```

### Arrow key → first play (buffer not cached yet)

```
keydown (ArrowDown)
  │
  ├─ audioEngine.playBuffer(path, 0)   ← returns false (not cached)
  │
  ├─ playerStore.play(asset)           ← React state
  │
  └─ useEffect([currentAsset]) fires
        ├─ HTML <audio>.play()         ← fallback, starts buffering immediately
        └─ audioEngine.ensureBuffer()  ← background decode
              └─ on complete: switch to BufferSourceNode seamlessly
```

### Prefetch timeline

```
Page loads / assets change
  └─ audioEngine.prefetchAround(assets, 0)
        └─ decodes tracks 0–3 in background

User presses ArrowDown (index 0 → 1)
  └─ audioEngine.prefetchAround(assets, 1)
        └─ decodes tracks 0–4 (2–4 likely already done)

User presses ArrowDown again (index 1 → 2)
  └─ track 2 buffer already decoded → instant playback ✓
```

---

## MIDI Playback

MIDI files use Web Audio oscillator synthesis (not `AudioBuffer` playback) and are unaffected by the buffer cache. The flow is:

1. Load MIDI notes from the Rust backend via IPC (`get_midi_notes`)
2. If notes are embedded in `asset.meta.pianoRoll`, skip the IPC call
3. Schedule oscillator nodes (`OscillatorNode` + `BiquadFilterNode` + `GainNode`) via `AudioContext`
4. A 50ms `setInterval` ticker updates `currentTime` in the store for the waveform scrubber

MIDI latency is dominated by the IPC round-trip (~5–20ms) when notes aren't pre-embedded.

---

## Files

| File | Role |
|---|---|
| `src/services/audioEngine.ts` | Singleton engine — buffer cache, AudioContext, playback |
| `src/hooks/usePlayer.ts` | Wires engine + MIDI synth to Zustand store |
| `src/components/asset/AssetGrid.tsx` | Arrow key handler — fires audio before React state |
| `src/stores/playerStore.ts` | UI state only (currentAsset, isPlaying, currentTime) |
| `src/services/playerService.ts` | `convertFileSrc` helper for Tauri asset URLs |

---

## Performance Characteristics

| Scenario | Latency |
|---|---|
| Arrow key, buffer cached | < 5ms (same JS tick) |
| Arrow key, buffer not cached (fallback) | 20–50ms (HTML audio buffering) |
| Subsequent plays of same track | < 5ms |
| MIDI playback start | 5–20ms (IPC, or instant if pre-embedded) |
| Pause / resume | < 1ms |
| Volume change | < 1ms (GainNode, no reload) |

import { useEffect, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { usePlayerStore } from '../stores/playerStore';
import { useUiStore } from '../stores/uiStore';
import { assetService } from '../services/assetService';
import { audioEngine } from '../services/audioEngine';
import type { Asset, MidiMeta, MidiNote } from '../types';

function midiToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

function getMidiDurationSeconds(notes: MidiNote[], fallbackMs: number | null): number {
  if (fallbackMs && fallbackMs > 0) return fallbackMs / 1000;
  const maxTick = notes.reduce((max, n) => Math.max(max, n.startTick + n.durationTicks), 0);
  if (maxTick === 0) return 8;
  return 8;
}

function getMidiTiming(notes: MidiNote[], durationSec: number) {
  const maxTick = notes.reduce((max, n) => Math.max(max, n.startTick + n.durationTicks), 0);
  const tickToSec = maxTick > 0 ? durationSec / maxTick : 0;
  return { maxTick, tickToSec };
}

type ScheduledMidiNote = {
  note: MidiNote;
  startSec: number;
  playDurationSec: number;
  velocity: number;
};

/**
 * Select playable MIDI voices for dense passages.
 * - Keeps a bounded number of simultaneous voices.
 * - Prioritizes louder notes when a chord exceeds the cap.
 */
function selectPlayableMidiNotes(
  notes: MidiNote[],
  durationSec: number,
  offsetSec: number,
  maxVoices: number
): ScheduledMidiNote[] {
  const { tickToSec } = getMidiTiming(notes, durationSec);
  if (tickToSec <= 0) return [];

  const normalized: ScheduledMidiNote[] = [];
  for (const note of notes) {
    const noteStart = note.startTick * tickToSec;
    const noteDuration = Math.max(0.03, note.durationTicks * tickToSec);
    const noteEnd = noteStart + noteDuration;
    if (noteEnd <= offsetSec) continue;
    const startSec = Math.max(0, noteStart - offsetSec);
    const cutAtStart = Math.max(0, offsetSec - noteStart);
    const playDurationSec = Math.max(0.02, noteDuration - cutAtStart);
    const velocityNorm = Math.max(0.05, Math.min(1, note.velocity / 127));
    const velocity = 0.12 + Math.pow(velocityNorm, 1.35) * 0.52;
    normalized.push({ note, startSec, playDurationSec, velocity });
  }

  normalized.sort((a, b) => a.startSec - b.startSec || b.velocity - a.velocity);

  const chosen: ScheduledMidiNote[] = [];
  type ActiveVoice = { endSec: number; velocity: number; chosenIndex: number; alive: boolean };
  const active: ActiveVoice[] = [];

  for (const candidate of normalized) {
    // Purge finished voices.
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].endSec <= candidate.startSec) active.splice(i, 1);
    }

    if (active.length < maxVoices) {
      const chosenIndex = chosen.length;
      chosen.push(candidate);
      active.push({
        endSec: candidate.startSec + candidate.playDurationSec,
        velocity: candidate.velocity,
        chosenIndex,
        alive: true,
      });
      continue;
    }

    // Replace the weakest currently active voice if this one is stronger.
    let weakestIdx = 0;
    for (let i = 1; i < active.length; i++) {
      if (active[i].velocity < active[weakestIdx].velocity) weakestIdx = i;
    }
    if (candidate.velocity <= active[weakestIdx].velocity) {
      continue;
    }
    const weakest = active[weakestIdx];
    weakest.alive = false;
    chosen[weakest.chosenIndex] = {
      ...chosen[weakest.chosenIndex],
      playDurationSec: 0,
    };
    const chosenIndex = chosen.length;
    chosen.push(candidate);
    active[weakestIdx] = {
      endSec: candidate.startSec + candidate.playDurationSec,
      velocity: candidate.velocity,
      chosenIndex,
      alive: true,
    };
  }

  return chosen.filter((n) => n.playDurationSec > 0);
}

/**
 * Wires the audioEngine and MIDI synth to the player store.
 *
 * Key design rules that prevent race conditions:
 *
 * 1. A single `useEffect([currentAsset, isPlaying])` handles ALL playback
 *    decisions. Splitting into two effects (one for asset, one for isPlaying)
 *    creates a window where both fire in the same React batch and race.
 *
 * 2. The effect captures a `generation` counter at entry. Any async operation
 *    (buffer decode, MIDI load) checks `generation` before acting — if the
 *    asset or play state changed while we were awaiting, we bail out.
 *
 * 3. `fallbackActiveRef` is cleared immediately when the asset changes, before
 *    any async work, so stale ensureBuffer callbacks can't hijack playback.
 *
 * 4. `audioEngine.playBuffer()` is synchronous on the hot path (arrow keys).
 *    The effect detects that audio is already playing the right asset and skips
 *    re-starting it, avoiding double-play.
 */
export function usePlayer() {
  // Fallback HTML audio element — only used when buffer isn't cached yet
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackActiveRef = useRef(false);

  // Shared AudioContext for MIDI — reused across plays to avoid the browser's
  // ~6 context limit. Closed only when the hook unmounts.
  const midiCtxRef = useRef<AudioContext | null>(null);
  const midiMasterRef = useRef<GainNode | null>(null);
  const midiTickerRef = useRef<number | null>(null);
  const midiEndTimerRef = useRef<number | null>(null);
  const midiStartedAtRef = useRef(0);
  const midiOffsetRef = useRef(0);
  const midiDurationRef = useRef(0);
  const midiNotesRef = useRef<MidiNote[]>([]);
  const midiAssetIdRef = useRef<string | null>(null);

  // Monotonically increasing counter — incremented on every asset/isPlaying change.
  // Async callbacks capture the value at their start and bail if it changed.
  const generationRef = useRef(0);

  // Track the last asset ID so we can detect asset switches vs pause/resume
  const currentAssetIdRef = useRef<string | null>(null);

  // Stable refs so effects don't re-run when these change
  const volumeRef = useRef(0.8);
  const pausedAtRef = useRef(0); // where we paused for the current sample

  const {
    currentAsset,
    isPlaying,
    volume,
    setCurrentTime,
    setDuration,
    pause,
    registerSeek,
  } = usePlayerStore();

  const editorAssetId = useUiStore((s) => s.editorAssetId);

  // ─── Volume sync (no playback side-effects) ────────────────────────────

  useEffect(() => {
    volumeRef.current = volume;
    audioEngine.setVolume(volume);
    if (audioRef.current) audioRef.current.volume = volume;
    if (midiMasterRef.current) midiMasterRef.current.gain.value = volume;
  }, [volume]);

  // ─── MIDI helpers ──────────────────────────────────────────────────────

  const stopMidiTimers = () => {
    if (midiTickerRef.current != null) {
      window.clearInterval(midiTickerRef.current);
      midiTickerRef.current = null;
    }
    if (midiEndTimerRef.current != null) {
      window.clearTimeout(midiEndTimerRef.current);
      midiEndTimerRef.current = null;
    }
  };

  const stopMidiNodes = () => {
    stopMidiTimers();
    // Disconnect master gain to silence all scheduled oscillators immediately
    if (midiMasterRef.current) {
      try { midiMasterRef.current.disconnect(); } catch { /* already disconnected */ }
      midiMasterRef.current = null;
    }
    // Close and replace the context so all scheduled nodes are garbage-collected.
    // We reuse a single context per session — just suspend it rather than close,
    // to avoid the browser's AudioContext instance limit.
    const ctx = midiCtxRef.current;
    if (ctx && ctx.state !== 'closed') {
      ctx.suspend().catch(() => {});
    }
    // Don't null out midiCtxRef — we'll resume it on next MIDI play
  };

  const pauseMidi = () => {
    const ctx = midiCtxRef.current;
    if (ctx && ctx.state === 'running') {
      const elapsed = Math.max(0, ctx.currentTime - midiStartedAtRef.current);
      midiOffsetRef.current = Math.min(
        midiDurationRef.current,
        midiOffsetRef.current + elapsed
      );
    }
    stopMidiNodes();
    setCurrentTime(midiOffsetRef.current);
  };

  const getMidiCtx = async (): Promise<AudioContext> => {
    const AudioCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!midiCtxRef.current || midiCtxRef.current.state === 'closed') {
      midiCtxRef.current = new AudioCtor();
    }
    if (midiCtxRef.current.state === 'suspended') {
      await midiCtxRef.current.resume();
    }
    return midiCtxRef.current;
  };

  const scheduleMidiNotes = async (
    notes: MidiNote[],
    durationSec: number,
    offsetSec: number
  ): Promise<boolean> => {
    if (!notes.length) return false;
    const ctx = await getMidiCtx();
    const MAX_MIDI_VOICES = 24;

    // Create a fresh master gain for this play session
    const master = ctx.createGain();
    // Keep significant headroom for dense MIDI chords.
    master.gain.value = volumeRef.current * 0.42;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 18;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    midiMasterRef.current = master;
    midiStartedAtRef.current = ctx.currentTime;

    const playable = selectPlayableMidiNotes(notes, durationSec, offsetSec, MAX_MIDI_VOICES);
    if (!playable.length) return false;

    // Second pass to estimate concurrent voices and apply polyphony gain compensation.
    const activeEndTimes: number[] = [];
    for (const entry of playable) {
      const startDelay = entry.startSec;
      const playDuration = entry.playDurationSec;
      const velocity = entry.velocity;
      const startAt = ctx.currentTime + startDelay;
      const stopAt = startAt + playDuration;
      const freq = midiToFrequency(entry.note.pitch);

      for (let i = activeEndTimes.length - 1; i >= 0; i--) {
        if (activeEndTimes[i] <= entry.startSec) activeEndTimes.splice(i, 1);
      }
      activeEndTimes.push(entry.startSec + playDuration);
      const activeVoices = activeEndTimes.length;
      const polyComp = 1 / Math.sqrt(Math.max(1, activeVoices));

      // Main tone: slightly warm fundamental + gentle upper harmonics.
      const oscA = ctx.createOscillator();
      oscA.type = 'sine';
      oscA.frequency.setValueAtTime(freq, startAt);
      const oscB = ctx.createOscillator();
      oscB.type = 'triangle';
      oscB.frequency.setValueAtTime(freq * 2, startAt);
      const oscC = ctx.createOscillator();
      oscC.type = 'sine';
      oscC.frequency.setValueAtTime(freq * 0.5, startAt);

      const gainA = ctx.createGain();
      const gainB = ctx.createGain();
      const gainC = ctx.createGain();
      gainA.gain.setValueAtTime(0.56 * polyComp, startAt);
      gainB.gain.setValueAtTime(0.11 * polyComp, startAt);
      gainC.gain.setValueAtTime(0.04 * polyComp, startAt);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const cutoff = Math.min(5600, 2100 + freq * 1.3);
      filter.frequency.setValueAtTime(cutoff, startAt);
      filter.Q.value = 0.45;
      const body = ctx.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.setValueAtTime(440, startAt);
      body.Q.value = 0.7;
      body.gain.setValueAtTime(2.0, startAt);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, startAt);
      // Piano-ish envelope: quick but not clicky attack, natural decay + short release.
      env.gain.exponentialRampToValueAtTime(0.48 * velocity, startAt + 0.014);
      env.gain.exponentialRampToValueAtTime(0.24 * velocity, startAt + 0.12);
      env.gain.exponentialRampToValueAtTime(0.09 * velocity, startAt + 0.40);
      env.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.23);

      oscA.connect(gainA);
      oscB.connect(gainB);
      oscC.connect(gainC);
      gainA.connect(filter);
      gainB.connect(filter);
      gainC.connect(filter);
      filter.connect(body);
      body.connect(env);
      env.connect(master);
      oscA.start(startAt);
      oscB.start(startAt);
      oscC.start(startAt);
      oscA.stop(stopAt + 0.28);
      oscB.stop(stopAt + 0.28);
      oscC.stop(stopAt + 0.28);
    }
    return true;
  };

  const playMidiFromOffset = async (
    notes: MidiNote[],
    durationSec: number,
    offsetSec: number,
    gen: number
  ) => {
    stopMidiNodes();
    const ok = await scheduleMidiNotes(notes, durationSec, offsetSec);
    if (!ok || generationRef.current !== gen) return;

    midiTickerRef.current = window.setInterval(() => {
      const ctx = midiCtxRef.current;
      if (!ctx || ctx.state !== 'running') return;
      const elapsed = Math.max(0, ctx.currentTime - midiStartedAtRef.current);
      setCurrentTime(Math.min(durationSec, offsetSec + elapsed));
    }, 50);

    const remainingMs = Math.max(0, (durationSec - offsetSec) * 1000);
    midiEndTimerRef.current = window.setTimeout(() => {
      if (generationRef.current !== gen) return;
      pause();
      setCurrentTime(durationSec);
      midiOffsetRef.current = durationSec;
      stopMidiNodes();
    }, remainingMs + 40);
  };

  const loadMidiNotes = async (asset: Asset): Promise<MidiNote[]> => {
    const preloaded = (asset.meta as MidiMeta | undefined)?.pianoRoll;
    if (Array.isArray(preloaded) && preloaded.length) return preloaded;
    return assetService.getMidiNotes(asset.id);
  };

  // ─── One-time setup ────────────────────────────────────────────────────

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    const audio = audioRef.current;

    // Wire engine callbacks → store
    audioEngine.onTimeUpdate = (t) => setCurrentTime(t);
    audioEngine.onDuration = (d) => setDuration(d);
    audioEngine.onEnded = () => pause();

    // Fallback HTML audio events
    const onFallbackTime = () => {
      if (fallbackActiveRef.current) setCurrentTime(audio.currentTime);
    };
    const onFallbackMeta = () => {
      if (fallbackActiveRef.current) setDuration(audio.duration || 0);
    };
    const onFallbackEnd = () => {
      if (fallbackActiveRef.current) {
        fallbackActiveRef.current = false;
        pause();
      }
    };
    audio.addEventListener('timeupdate', onFallbackTime);
    audio.addEventListener('loadedmetadata', onFallbackMeta);
    audio.addEventListener('ended', onFallbackEnd);

    registerSeek((time: number) => {
      const current = usePlayerStore.getState().currentAsset;
      if (current?.type === 'midi') {
        const bounded = Math.max(0, Math.min(midiDurationRef.current || time, time));
        midiOffsetRef.current = bounded;
        setCurrentTime(bounded);
        if (usePlayerStore.getState().isPlaying && midiNotesRef.current.length > 0) {
          const gen = generationRef.current;
          playMidiFromOffset(midiNotesRef.current, midiDurationRef.current, bounded, gen);
        }
        return;
      }
      // Sample seek
      pausedAtRef.current = time;
      if (usePlayerStore.getState().isPlaying && current) {
        audioEngine.stop();
        audioEngine.playBufferAsync(current.path, time).catch(() => {});
      } else if (audioRef.current && fallbackActiveRef.current) {
        audioRef.current.currentTime = time;
      }
    });

    return () => {
      audio.removeEventListener('timeupdate', onFallbackTime);
      audio.removeEventListener('loadedmetadata', onFallbackMeta);
      audio.removeEventListener('ended', onFallbackEnd);
      audioEngine.onTimeUpdate = null;
      audioEngine.onDuration = null;
      audioEngine.onEnded = null;
      stopMidiNodes();
      // Close the shared MIDI context on unmount
      if (midiCtxRef.current && midiCtxRef.current.state !== 'closed') {
        midiCtxRef.current.close().catch(() => {});
        midiCtxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCurrentTime, setDuration, pause, registerSeek]);

  // ─── Unified playback effect ───────────────────────────────────────────
  //
  // A single effect reacts to BOTH currentAsset and isPlaying changes.
  // This eliminates the race where two separate effects fire in the same
  // React batch and both try to start/stop audio simultaneously.

  useEffect(() => {
    // Bump generation so any in-flight async work from the previous render
    // knows it's been superseded.
    const gen = ++generationRef.current;

    if (!currentAsset) {
      // Nothing selected — stop everything
      audioEngine.stop();
      if (fallbackActiveRef.current) {
        audioRef.current?.pause();
        fallbackActiveRef.current = false;
      }
      stopMidiNodes();
      return;
    }

    // ── Sample ──────────────────────────────────────────────────────────

    if (currentAsset.type === 'sample') {
      // Stop MIDI if we're switching to a sample
      stopMidiNodes();
      midiOffsetRef.current = 0;
      midiNotesRef.current = [];
      midiDurationRef.current = 0;

      // Detect asset switch — reset pause position so we start from the beginning
      const assetChanged = currentAssetIdRef.current !== currentAsset.id;
      if (assetChanged) {
        currentAssetIdRef.current = currentAsset.id;
        pausedAtRef.current = 0;
      }

      const isEdited = editorAssetId === currentAsset.id;

      if (isEdited) {
        // SampleEditor is open for this asset. It takes full control of playback.
        audioEngine.stop();
        if (fallbackActiveRef.current) {
          audioRef.current?.pause();
          fallbackActiveRef.current = false;
        }
        if (currentAsset.durationMs) setDuration(currentAsset.durationMs / 1000);
        return;
      }

      if (!isPlaying) {
        // Pausing
        if (audioEngine.isActive()) {
          pausedAtRef.current = audioEngine.pause();
        } else if (fallbackActiveRef.current && audioRef.current) {
          pausedAtRef.current = audioRef.current.currentTime;
          audioRef.current.pause();
          fallbackActiveRef.current = false;
        } else {
          // Not playing anything — just prefetch so it's ready when resumed
          audioEngine.prefetch(currentAsset.path);
        }
        return;
      }

      // Playing — check if the engine is already playing THIS EXACT asset.
      // This happens when the arrow-key / click handler called playBuffer()
      // synchronously before the store update triggered this effect. Don't restart it.
      //
      // Critical: only `isPlayingPath` is safe here. `isActive()` returns true even
      // when the engine is still playing the PREVIOUS asset — if we trust it then,
      // the new asset never starts. That was the "click play → nothing happens
      // until you hit Stop first" bug.
      if (audioEngine.isPlayingPath(currentAsset.path)) {
        if (currentAsset.durationMs) {
          setDuration(currentAsset.durationMs / 1000);
        }
        assetService.incrementPlayCount(currentAsset.id).catch(() => {});
        return;
      }

      // Engine is idle, or playing a stale source from the previous asset.
      // Stop the stale source explicitly so playBuffer below starts cleanly
      // and so any subsequent isActive() checks reflect reality.
      if (audioEngine.isActive()) {
        audioEngine.stop();
      }

      // Reset pause position when switching to a new asset
      // (pausedAtRef is 0 for a fresh play, non-zero for resume)
      const offset = pausedAtRef.current;
      // Try instant buffer playback first
      const started = audioEngine.playBuffer(currentAsset.path, offset);
      if (started) {
        assetService.incrementPlayCount(currentAsset.id).catch(() => {});
        return;
      }

      // Buffer not ready — clear any stale fallback state immediately so
      // the ensureBuffer callback below can't be confused by old state
      if (fallbackActiveRef.current) {
        audioRef.current?.pause();
        fallbackActiveRef.current = false;
      }

      // Use HTML audio as fallback while decoding in background
      const audio = audioRef.current;
      if (audio) {
        const url = convertFileSrc(currentAsset.path);
        fallbackActiveRef.current = true;
        audio.pause();
        audio.src = url;
        audio.volume = volumeRef.current;
        audio.currentTime = offset;
        audio.load();
        audio.play().catch(() => {});
      }

      // Decode in background — seamlessly switch to buffer when ready
      const assetId = currentAsset.id;
      const assetPath = currentAsset.path;
      audioEngine.ensureBuffer(assetPath).then((buffer) => {
        // Bail if the asset or play state changed while we were decoding
        if (generationRef.current !== gen) return;
        if (!buffer) return;
        const state = usePlayerStore.getState();
        if (state.currentAsset?.id !== assetId || !state.isPlaying) return;
        if (!fallbackActiveRef.current) return;

        const resumeAt = audioRef.current?.currentTime ?? 0;
        audioRef.current?.pause();
        fallbackActiveRef.current = false;
        audioEngine.playBuffer(assetPath, resumeAt);
      });

      assetService.incrementPlayCount(currentAsset.id).catch(() => {});
      return;
    }

    // ── Non-sample: stop sample engine ──────────────────────────────────
    audioEngine.stop();
    if (fallbackActiveRef.current) {
      audioRef.current?.pause();
      fallbackActiveRef.current = false;
    }
    // Reset sample pause position and asset tracking when switching away
    pausedAtRef.current = 0;
    currentAssetIdRef.current = null;

    if (currentAsset.type !== 'midi') {
      stopMidiNodes();
      return;
    }

    // ── MIDI ─────────────────────────────────────────────────────────────

    // Reset offset when switching to a different MIDI asset
    if (midiAssetIdRef.current !== currentAsset.id) {
      midiAssetIdRef.current = currentAsset.id;
      midiOffsetRef.current = 0;
    }

    if (!isPlaying) {
      pauseMidi();
      return;
    }

    // Load notes (may be instant from meta, or an IPC round-trip)
    const capturedAsset = currentAsset;
    (async () => {
      const notes = await loadMidiNotes(capturedAsset).catch(() => [] as MidiNote[]);
      if (generationRef.current !== gen) return; // superseded
      midiNotesRef.current = notes;
      const durationSec = getMidiDurationSeconds(notes, capturedAsset.durationMs);
      midiDurationRef.current = durationSec;
      setDuration(durationSec);
      if (!usePlayerStore.getState().isPlaying) {
        pauseMidi();
        return;
      }
      await playMidiFromOffset(notes, durationSec, midiOffsetRef.current, gen);
      if (generationRef.current === gen) {
        assetService.incrementPlayCount(capturedAsset.id).catch(() => {});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAsset, isPlaying, editorAssetId]);
}

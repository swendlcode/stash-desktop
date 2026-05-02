/**
 * audioEngine.ts — Zero-latency audio playback engine
 *
 * Lives entirely outside React. Uses Web Audio API with pre-decoded
 * AudioBuffers so playback is instant — no buffering, no render cycle,
 * no IPC round-trip on the hot path.
 *
 * Strategy:
 *  1. Decode audio files into AudioBuffers ahead of time (background)
 *  2. On play: grab the cached buffer and start a BufferSourceNode immediately
 *  3. React state updates happen AFTER audio starts — UI follows audio, not the other way around
 */

import { convertFileSrc } from '@tauri-apps/api/core';

// How many tracks to pre-decode around the current selection
const PREFETCH_RADIUS = 3;
// Max decoded buffers to keep in memory (~5–10 MB each for a typical sample)
const CACHE_MAX = 20;
// Extra output gain for sample preview playback so perceived loudness is higher.
const SAMPLE_GAIN_BOOST = 2;

type CacheEntry = {
  buffer: AudioBuffer;
  lastUsed: number;
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private cache = new Map<string, CacheEntry>();
  // Single in-flight decode promise per path — prevents duplicate fetches
  private decoding = new Map<string, Promise<AudioBuffer | null>>();
  private volume = 0.8;

  // Callbacks wired up by usePlayer
  onTimeUpdate: ((time: number) => void) | null = null;
  onDuration: ((duration: number) => void) | null = null;
  onEnded: (() => void) | null = null;

  private tickerRef: number | null = null;
  private startedAt = 0;   // ctx.currentTime when playback started
  private startOffset = 0; // where in the buffer we started from

  // ─── AudioContext ────────────────────────────────────────────────────────

  /**
   * Returns the AudioContext, creating it if needed.
   * Returns a Promise so callers can await resume() before starting a source.
   */
  async getCtxAsync(): Promise<AudioContext> {
    if (!this.ctx || this.ctx.state === 'closed') {
      const Ctor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // If resume fails the context is unusable — recreate it next call
        this.ctx = null;
        return this.getCtxAsync();
      }
    }
    return this.ctx;
  }

  /** Synchronous accessor — only safe after getCtxAsync() has been awaited once. */
  private getCtxSync(): AudioContext | null {
    if (!this.ctx || this.ctx.state === 'closed' || this.ctx.state === 'suspended') {
      return null;
    }
    return this.ctx;
  }

  // ─── Buffer cache ────────────────────────────────────────────────────────

  private evictIfNeeded() {
    if (this.cache.size < CACHE_MAX) return;
    // Remove least-recently-used entry
    let oldest = Infinity;
    let oldestKey = '';
    for (const [k, v] of this.cache) {
      if (v.lastUsed < oldest) {
        oldest = v.lastUsed;
        oldestKey = k;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  /**
   * Fetch + decode a file into an AudioBuffer.
   * Always registers in `decoding` so concurrent callers share the same promise.
   * Returns null on any failure.
   */
  private decodeFile(path: string): Promise<AudioBuffer | null> {
    // Return existing in-flight promise if one exists
    const existing = this.decoding.get(path);
    if (existing) return existing;

    const p = (async (): Promise<AudioBuffer | null> => {
      const url = convertFileSrc(path);
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        // Ensure context is running before decoding
        const ctx = await this.getCtxAsync();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        this.evictIfNeeded();
        this.cache.set(path, { buffer, lastUsed: Date.now() });
        return buffer;
      } catch {
        return null;
      } finally {
        this.decoding.delete(path);
      }
    })();

    this.decoding.set(path, p);
    return p;
  }

  /**
   * Synchronous cache lookup. Returns the buffer if already decoded, null otherwise.
   */
  getBuffer(path: string): AudioBuffer | null {
    const entry = this.cache.get(path);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.buffer;
    }
    return null;
  }

  /** Kick off background decode for a path (no-op if already cached or decoding) */
  prefetch(path: string): void {
    if (this.cache.has(path)) return;
    if (this.decoding.has(path)) return;
    this.decodeFile(path);
  }

  /** Ensure a buffer is ready, decoding now if needed. Returns the buffer. */
  async ensureBuffer(path: string): Promise<AudioBuffer | null> {
    const cached = this.cache.get(path);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.buffer;
    }
    return this.decodeFile(path);
  }

  // ─── Playback ────────────────────────────────────────────────────────────

  private stopTicker() {
    if (this.tickerRef !== null) {
      window.clearInterval(this.tickerRef);
      this.tickerRef = null;
    }
  }

  private stopCurrentSource() {
    this.stopTicker();
    const src = this.currentSource;
    if (src) {
      // Null out first so the onended handler is a no-op if it fires after stop()
      this.currentSource = null;
      this.currentPath = null; // Clear path
      src.onended = null;
      try { 
        src.stop(); 
      } catch (error) { 
        // Already stopped or invalid state - this is normal during rapid navigation
      }
      try {
        src.disconnect();
      } catch (error) {
        // Already disconnected - this is normal during rapid navigation
      }
    }
  }

  private currentPath: string | null = null; // Track which path is currently playing

  // Dispatch a custom event when playback starts so UI can react immediately
  private notifyPlaybackStart(path: string) {
    window.dispatchEvent(new CustomEvent('audioEnginePlaybackStart', { 
      detail: { path } 
    }));
  }

  /**
   * Play a buffer immediately. Awaits AudioContext resume so the context is
   * guaranteed to be running before the source starts.
   * Returns true if playback started, false if buffer not cached.
   */
  async playBufferAsync(path: string, offsetSec = 0): Promise<boolean> {
    const buffer = this.getBuffer(path);
    if (!buffer) return false;

    const ctx = await this.getCtxAsync();
    this.stopCurrentSource();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode!);

    this.startedAt = ctx.currentTime;
    this.startOffset = Math.max(0, Math.min(offsetSec, buffer.duration));
    this.currentPath = path; // Track the path
    this.notifyPlaybackStart(path); // Notify UI immediately

    source.start(0, this.startOffset);
    this.currentSource = source;

    // Notify duration immediately
    this.onDuration?.(buffer.duration);

    // Start time ticker
    this.tickerRef = window.setInterval(() => {
      const ctx = this.getCtxSync();
      if (!ctx || !this.currentSource) return;
      const elapsed = ctx.currentTime - this.startedAt;
      const current = Math.min(buffer.duration, this.startOffset + elapsed);
      this.onTimeUpdate?.(current);
    }, 50);

    source.onended = () => {
      // Guard: only fire if this source is still the active one
      if (this.currentSource !== source) return;
      this.stopTicker();
      this.currentSource = null;
      this.currentPath = null; // Clear path
      this.onEnded?.();
    };

    return true;
  }

  /**
   * Synchronous play — only works if the AudioContext is already running.
   * Used by the arrow-key handler for zero-latency playback on the hot path.
   * Returns false if context isn't ready or buffer isn't cached.
   */
  playBuffer(path: string, offsetSec = 0): boolean {
    const buffer = this.getBuffer(path);
    if (!buffer) {
      // Buffer not cached — sync fast path can't play. Critically, if a
      // DIFFERENT asset is currently playing through this engine, stop it
      // now. Otherwise the engine reports `isActive() === true` while the
      // caller's store has switched to a new asset, and the React effect
      // in usePlayer will incorrectly "trust the engine" and never start
      // the new asset. (The "click play → nothing happens until Stop" bug.)
      if (this.currentSource && this.currentPath !== path) {
        this.stopCurrentSource();
      }
      return false;
    }

    const ctx = this.getCtxSync();
    if (!ctx) {
      // Same reasoning as above — keep the engine's state honest.
      if (this.currentSource && this.currentPath !== path) {
        this.stopCurrentSource();
      }
      return false;
    }

    this.stopCurrentSource();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode!);

    this.startedAt = ctx.currentTime;
    this.startOffset = Math.max(0, Math.min(offsetSec, buffer.duration));
    this.currentPath = path; // Track the path
    this.notifyPlaybackStart(path); // Notify UI immediately

    source.start(0, this.startOffset);
    this.currentSource = source;

    this.onDuration?.(buffer.duration);

    this.tickerRef = window.setInterval(() => {
      const ctx = this.getCtxSync();
      if (!ctx || !this.currentSource) return;
      const elapsed = ctx.currentTime - this.startedAt;
      const current = Math.min(buffer.duration, this.startOffset + elapsed);
      this.onTimeUpdate?.(current);
    }, 50);

    source.onended = () => {
      if (this.currentSource !== source) return;
      this.stopTicker();
      this.currentSource = null;
      this.currentPath = null; // Clear path
      this.onEnded?.();
    };

    return true;
  }

  pause(): number {
    const ctx = this.getCtxSync();
    const elapsed = ctx ? Math.max(0, ctx.currentTime - this.startedAt) : 0;
    const pausedAt = Math.max(0, this.startOffset + elapsed);
    this.stopCurrentSource();
    return pausedAt;
  }

  stop() {
    this.stopCurrentSource();
    this.startOffset = 0;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.gainNode) this.gainNode.gain.value = v * SAMPLE_GAIN_BOOST;
  }

  getCurrentTime(): number {
    const ctx = this.getCtxSync();
    if (!ctx || !this.currentSource) return 0;
    return Math.max(0, this.startOffset + (ctx.currentTime - this.startedAt));
  }

  isActive(): boolean {
    return this.currentSource !== null;
  }

  /** Check if the engine is currently playing a specific path */
  isPlayingPath(path: string): boolean {
    return this.currentSource !== null && this.currentPath === path;
  }

  /** Get the path currently being played, or null if nothing is playing */
  getCurrentPath(): string | null {
    return this.currentPath;
  }

  /** Pre-decode the surrounding tracks so they're ready before the user gets there */
  prefetchAround(assets: { path: string; type: string }[], currentIndex: number) {
    const start = Math.max(0, currentIndex - PREFETCH_RADIUS);
    const end = Math.min(assets.length - 1, currentIndex + PREFETCH_RADIUS);
    for (let i = start; i <= end; i++) {
      if (assets[i].type === 'sample') {
        this.prefetch(assets[i].path);
      }
    }
  }

  /** Check if a buffer is already cached and ready for immediate playback */
  isBufferCached(path: string): boolean {
    return this.cache.has(path);
  }

  /** Get cache statistics for debugging */
  getCacheStats(): { size: number; maxSize: number; paths: string[] } {
    return {
      size: this.cache.size,
      maxSize: CACHE_MAX,
      paths: Array.from(this.cache.keys())
    };
  }

  /** Clear all cached buffers - used when folders are deleted */
  clearCache(): void {
    this.cache.clear();
    console.log('Audio engine cache cleared');
  }

  /** Clear cached buffers for specific paths - used when specific files are deleted */
  clearCacheForPaths(paths: string[]): void {
    let cleared = 0;
    for (const path of paths) {
      if (this.cache.delete(path)) {
        cleared++;
      }
    }
    if (cleared > 0) {
      console.log(`Audio engine cache cleared for ${cleared} paths`);
    }
  }

  /** Ensure AudioContext is ready for immediate playback - call this during rapid navigation */
  async ensureContextReady(): Promise<void> {
    try {
      await this.getCtxAsync();
    } catch (error) {
      console.warn('Failed to prepare AudioContext:', error);
    }
  }
}

// Singleton — one engine for the whole app
export const audioEngine = new AudioEngine();

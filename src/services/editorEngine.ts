import { convertFileSrc } from '@tauri-apps/api/core';

type Listener = () => void;

class EditorEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;   // high-cut
  private highpass: BiquadFilterNode | null = null;  // low-cut
  private startedAtCtx = 0;
  private startOffset = 0;
  private ticker: number | null = null;
  private listeners = new Set<Listener>();

  private _loadedPath: string | null = null;
  private _playing = false;
  private _currentTime = 0;
  private _duration = 0;

  private _volume = 1;
  private _rate = 1;
  private _loopOn = false;
  private _loopStart = 0;
  private _loopEnd = 0;
  private _highCutHz = 22050;
  private _lowCutHz = 20;
  private _pitchSemitones = 0;   // -24 … +24 semitones
  private _reversed = false;
  // Working buffer — may differ from the original when reverse/normalize applied
  private _workBuffer: AudioBuffer | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  get loadedPath() { return this._loadedPath; }
  get playing() { return this._playing; }
  get currentTime() { return this._currentTime; }
  get duration() { return this._duration; }
  /** The original decoded buffer (never mutated). */
  get buffered() { return this.buffer; }
  /** The working buffer (reversed / normalized copy, or same as buffered). */
  get workBuffer() { return this._workBuffer ?? this.buffer; }

  private async ensureGraph() {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this._volume;
    this.highpass = this.ctx.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.frequency.value = this._lowCutHz;
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = this._highCutHz;
    this.highpass.connect(this.lowpass).connect(this.gain).connect(this.ctx.destination);
    return this.ctx;
  }

  async load(path: string): Promise<boolean> {
    if (this._loadedPath === path && this.buffer) return true;
    this.stop();
    const ctx = await this.ensureGraph();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    try {
      const res = await fetch(convertFileSrc(path));
      if (!res.ok) return false;
      const ab = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      this.buffer = buf;
      this._workBuffer = null;
      this._loadedPath = path;
      this._duration = buf.duration;
      this._currentTime = 0;
      this._loopStart = 0;
      this._loopEnd = buf.duration;
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resets every per-sample edit (rate, gain, filters, loop, pitch, reverse) back to
   * defaults and pushes the new values onto the live graph nodes. Display
   * preferences like waveform color live in `editorStore` and are not
   * touched here.
   */
  resetEdits() {
    this._rate = 1;
    this._volume = 1;
    this._highCutHz = 22050;
    this._lowCutHz = 20;
    this._loopOn = false;
    this._loopStart = 0;
    this._loopEnd = this._duration;
    this._pitchSemitones = 0;
    this._reversed = false;
    this._workBuffer = null;
    if (this.source) {
      this.source.playbackRate.value = 1;
      this.source.loop = false;
      this.source.loopStart = 0;
      this.source.loopEnd = this._duration;
    }
    if (this.gain) this.gain.gain.value = 1;
    if (this.lowpass) this.lowpass.frequency.value = 22050;
    if (this.highpass) this.highpass.frequency.value = 20;
    this.emit();
  }

  async play(fromSec?: number) {
    if (!this.buffer || !this.ctx) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    this.stopSource();
    const src = this.ctx.createBufferSource();
    // Use work buffer (reversed/normalized) if available, else original
    src.buffer = this._workBuffer ?? this.buffer;
    // Combine user rate with pitch shift (semitones → ratio)
    const pitchRatio = Math.pow(2, this._pitchSemitones / 12);
    src.playbackRate.value = this._rate * pitchRatio;
    if (this._loopOn) {
      src.loop = true;
      src.loopStart = this._loopStart;
      src.loopEnd = this._loopEnd > this._loopStart ? this._loopEnd : (this._workBuffer ?? this.buffer).duration;
    }
    src.connect(this.highpass!);
    const offset = Math.max(0, Math.min((this._workBuffer ?? this.buffer).duration, fromSec ?? this._currentTime));
    this.startOffset = offset;
    this.startedAtCtx = this.ctx.currentTime;
    src.start(0, offset);
    this.source = src;
    this._playing = true;
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this._playing = false;
      this._currentTime = 0;
      this.stopTicker();
      this.emit();
    };
    this.startTicker();
    this.emit();
  }

  pause() {
    if (!this._playing || !this.ctx) return;
    const elapsed = (this.ctx.currentTime - this.startedAtCtx) * this._rate;
    this._currentTime = Math.max(0, this.startOffset + elapsed);
    this.stopSource();
    this._playing = false;
    this.stopTicker();
    this.emit();
  }

  stop() {
    this.stopSource();
    this._currentTime = 0;
    this._playing = false;
    this.stopTicker();
    this.emit();
  }

  seek(sec: number) {
    const t = Math.max(0, Math.min(this._duration, sec));
    this._currentTime = t;
    if (this._playing) this.play(t);
    else this.emit();
  }

  setVolume(v: number) {
    this._volume = v;
    if (this.gain) this.gain.gain.value = v;
    this.emit();
  }
  get volume() { return this._volume; }

  setRate(r: number) {
    this._rate = r;
    const pitchRatio = Math.pow(2, this._pitchSemitones / 12);
    if (this.source) this.source.playbackRate.value = r * pitchRatio;
    this.emit();
  }
  get rate() { return this._rate; }

  /** Shift pitch by semitones (-24 to +24). Does not affect playback speed. */
  setPitch(semitones: number) {
    this._pitchSemitones = Math.max(-24, Math.min(24, semitones));
    const pitchRatio = Math.pow(2, this._pitchSemitones / 12);
    if (this.source) this.source.playbackRate.value = this._rate * pitchRatio;
    this.emit();
  }
  get pitchSemitones() { return this._pitchSemitones; }

  /**
   * Reverses the audio buffer in-place (creates a new work buffer).
   * Calling again un-reverses it.
   */
  reverse() {
    const src = this.buffer;
    if (!src) return;
    const wasPlaying = this._playing;
    const wasTime = this._currentTime;
    this.stop();

    if (this._reversed) {
      // Un-reverse: restore original
      this._workBuffer = null;
      this._reversed = false;
    } else {
      // Reverse: create a new buffer with all channels reversed
      const ctx = this.ctx;
      if (!ctx) {
        // Create a temporary offline context just to make a buffer
        const rev = new OfflineAudioContext(src.numberOfChannels, src.length, src.sampleRate);
        const revBuf = rev.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
        for (let c = 0; c < src.numberOfChannels; c++) {
          const orig = src.getChannelData(c);
          const dest = revBuf.getChannelData(c);
          for (let i = 0; i < orig.length; i++) dest[i] = orig[orig.length - 1 - i];
        }
        this._workBuffer = revBuf;
      } else {
        const revBuf = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
        for (let c = 0; c < src.numberOfChannels; c++) {
          const orig = src.getChannelData(c);
          const dest = revBuf.getChannelData(c);
          for (let i = 0; i < orig.length; i++) dest[i] = orig[orig.length - 1 - i];
        }
        this._workBuffer = revBuf;
      }
      this._reversed = true;
    }

    // Mirror playhead position
    const mirroredTime = this._reversed ? this._duration - wasTime : wasTime;
    this._currentTime = Math.max(0, Math.min(this._duration, mirroredTime));
    this.emit();
    if (wasPlaying) this.play(this._currentTime);
  }
  get reversed() { return this._reversed; }

  /**
   * Normalizes the working buffer so the peak amplitude is 0 dBFS.
   * Applies on top of any existing reverse. Idempotent — calling again
   * re-normalizes (useful after other edits).
   */
  normalize() {
    const src = this._workBuffer ?? this.buffer;
    if (!src) return;
    const wasPlaying = this._playing;
    const wasTime = this._currentTime;
    this.stop();

    // Find peak across all channels
    let peak = 0;
    for (let c = 0; c < src.numberOfChannels; c++) {
      const data = src.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    if (peak < 0.0001) { this.emit(); return; } // silence — nothing to do

    const scale = 1 / peak;
    // Build a new normalized buffer (don't mutate the original)
    const normBuf = (this.ctx ?? new AudioContext()).createBuffer(
      src.numberOfChannels, src.length, src.sampleRate
    );
    for (let c = 0; c < src.numberOfChannels; c++) {
      const orig = src.getChannelData(c);
      const dest = normBuf.getChannelData(c);
      for (let i = 0; i < orig.length; i++) dest[i] = orig[i] * scale;
    }
    this._workBuffer = normBuf;
    this._currentTime = wasTime;
    this.emit();
    if (wasPlaying) this.play(wasTime);
  }

  /**
   * Deletes the audio between `startSec` and `endSec` from the working buffer,
   * splicing the two surrounding sections together seamlessly.
   * After deletion the playhead is placed at the splice point.
   * Loop is turned off since the region no longer exists.
   */
  deleteRegion(startSec: number, endSec: number) {
    const src = this._workBuffer ?? this.buffer;
    if (!src) return;
    const sr = src.sampleRate;
    const totalSamples = src.length;

    // Clamp to buffer bounds
    const s0 = Math.max(0, Math.round(startSec * sr));
    const s1 = Math.min(totalSamples, Math.round(endSec * sr));
    if (s1 <= s0) return; // nothing to delete

    const wasPlaying = this._playing;
    this.stop();

    const keepBefore = s0;           // samples [0, s0)
    const keepAfter  = totalSamples - s1; // samples [s1, end)
    const newLength  = keepBefore + keepAfter;
    if (newLength <= 0) return;

    const ctx = this.ctx ?? new AudioContext();
    const newBuf = ctx.createBuffer(src.numberOfChannels, newLength, sr);

    for (let c = 0; c < src.numberOfChannels; c++) {
      const orig = src.getChannelData(c);
      const dest = newBuf.getChannelData(c);
      // Copy the part before the deleted region
      dest.set(orig.subarray(0, s0), 0);
      // Copy the part after the deleted region
      dest.set(orig.subarray(s1), keepBefore);
    }

    this._workBuffer = newBuf;
    this._duration   = newBuf.duration;
    // Place playhead at the splice point (start of deleted region, now merged)
    this._currentTime = Math.min(startSec, newBuf.duration);
    // Clear loop — the selected region is gone
    this._loopOn    = false;
    this._loopStart = 0;
    this._loopEnd   = newBuf.duration;

    this.emit();
    if (wasPlaying) this.play(this._currentTime);
  }

  setHighCut(hz: number) {
    this._highCutHz = hz;
    if (this.lowpass) this.lowpass.frequency.value = hz;
    this.emit();
  }
  get highCutHz() { return this._highCutHz; }

  setLowCut(hz: number) {
    this._lowCutHz = hz;
    if (this.highpass) this.highpass.frequency.value = hz;
    this.emit();
  }
  get lowCutHz() { return this._lowCutHz; }

  setLoop(on: boolean, start?: number, end?: number) {
    this._loopOn = on;
    if (start != null) this._loopStart = Math.max(0, start);
    if (end != null) this._loopEnd = Math.min(this._duration, end);
    if (this.source) {
      this.source.loop = on;
      this.source.loopStart = this._loopStart;
      this.source.loopEnd = this._loopEnd;
    }
    this.emit();
  }
  get loopOn() { return this._loopOn; }
  get loopStart() { return this._loopStart; }
  get loopEnd() { return this._loopEnd; }

  private startTicker() {
    this.stopTicker();
    this.ticker = window.setInterval(() => {
      if (!this.ctx || !this.source) return;
      const elapsed = (this.ctx.currentTime - this.startedAtCtx) * this._rate;
      let t = this.startOffset + elapsed;
      if (this._loopOn && this._loopEnd > this._loopStart) {
        const len = this._loopEnd - this._loopStart;
        if (t > this._loopEnd) {
          t = this._loopStart + ((t - this._loopStart) % len);
        }
      }
      this._currentTime = Math.max(0, Math.min(this._duration, t));
      this.emit();
    }, 50);
  }
  private stopTicker() {
    if (this.ticker != null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
  }
  private stopSource() {
    const s = this.source;
    if (s) {
      this.source = null;
      s.onended = null;
      try { s.stop(); } catch { /* noop */ }
      s.disconnect();
    }
  }

  unload() {
    this.stop();
    this.buffer = null;
    this._workBuffer = null;
    this._reversed = false;
    this._pitchSemitones = 0;
    this._loadedPath = null;
    this._duration = 0;
    this.emit();
  }

  /**
   * Renders the current edit offline with filters + rate + pitch + loop trim applied.
   * Uses the work buffer (reversed/normalized) when available.
   * When loop is on, renders just the loop region; otherwise the full buffer.
   */
  async renderEdit(): Promise<AudioBuffer | null> {
    const srcBuf = this._workBuffer ?? this.buffer;
    if (!srcBuf) return null;
    const srcDur = this._loopOn && this._loopEnd > this._loopStart
      ? this._loopEnd - this._loopStart
      : srcBuf.duration;
    const pitchRatio = Math.pow(2, this._pitchSemitones / 12);
    const effectiveRate = Math.max(0.01, this._rate * pitchRatio);
    const outDur = srcDur / effectiveRate;
    const sampleRate = srcBuf.sampleRate;
    const channels = srcBuf.numberOfChannels;
    const OfflineCtor =
      window.OfflineAudioContext ||
      (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    const offline = new OfflineCtor(channels, Math.ceil(outDur * sampleRate), sampleRate);
    const src = offline.createBufferSource();
    src.buffer = srcBuf;
    src.playbackRate.value = effectiveRate;
    const hp = offline.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = this._lowCutHz;
    const lp = offline.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this._highCutHz;
    const g = offline.createGain();
    g.gain.value = this._volume;
    src.connect(hp).connect(lp).connect(g).connect(offline.destination);
    const startOffset = this._loopOn ? this._loopStart : 0;
    src.start(0, startOffset, srcDur);
    return offline.startRendering();
  }
}

export const editorEngine = new EditorEngine();

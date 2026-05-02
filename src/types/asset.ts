export type AssetType = 'sample' | 'midi' | 'preset' | 'project';
export type IndexStatus = 'pending' | 'indexed' | 'missing' | 'error';
export type KeyScale = 'major' | 'minor';
export type BpmSource = 'filename' | 'audio_analysis' | 'midi';

export interface MidiNote {
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
}

export interface SampleMeta {
  bitDepth?: number;
}

export interface MidiMeta {
  timeSignature?: string;
  barCount?: number;
  noteCount?: number;
  pianoRoll?: MidiNote[];
  tracks?: number;
  noteRangeLow?: number;
  noteRangeHigh?: number;
}

export interface PresetMeta {
  synth: string;
  category: string;
  tags: string[];
}

/** A single clip placed on the FL Studio playlist. */
export interface PlaylistClip {
  /** Playlist track index (top-down, 0-based). */
  track: number;
  /** Position on the timeline, in PPQ ticks. */
  positionTicks: number;
  /** Visible clip length on the timeline, in PPQ ticks. */
  lengthTicks: number;
  /** Trim from the source start, in PPQ ticks. */
  startOffsetTicks: number;
  /** Trim from the source end, in PPQ ticks. */
  endOffsetTicks: number;
  /** Set when the clip references a pattern (0-based index into `patterns`). */
  patternIndex: number | null;
  /** Set when the clip references an audio/automation channel. */
  channelIndex: number | null;
  muted: boolean;
}

export interface ProjectMeta {
  daw: string;
  version?: string;
  trackCount?: number;
  tempo?: number;
  timeSignature?: string;
  lastModified?: number;
  plugins?: string[];
  sampleCount?: number;
  /** Sample / audio file paths referenced by the project, when extractable. */
  samples?: string[];
  title?: string;
  author?: string;
  genre?: string;
  comments?: string;
  fileSizeBytes?: number;
  /** Channel (instrument) names from the project rack. */
  channels?: string[];
  /** Pattern names defined in the project. */
  patterns?: string[];
  /** Mixer-insert names (FL Studio "Mixer tracks", distinct from playlist tracks). */
  mixerTracks?: string[];
  url?: string;
  /** Pulses per quarter note from FLhd. Required to convert clip ticks → beats. */
  ppq?: number;
  /** Playlist clips parsed from the FLP arrangement. Mirrors `arrangements[0].clips`. */
  clips?: PlaylistClip[];
  /** One entry per FL Studio arrangement (FL 12.9+). Always populated. */
  arrangements?: Arrangement[];
}

/** A single FL Studio arrangement (named playlist). */
export interface Arrangement {
  index: number;
  name: string | null;
  clips: PlaylistClip[];
}

export type AssetMeta = SampleMeta | MidiMeta | PresetMeta | ProjectMeta | Record<string, unknown>;

export interface Asset {
  id: string;
  path: string;
  filename: string;
  extension: string;
  type: AssetType;
  packId: string | null;
  packName: string | null;

  bpm: number | null;
  keyNote: string | null;
  keyScale: KeyScale | null;
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;

  instrument: string | null;
  subtype: string | null;

  /** Smart tags derived from filename analysis */
  energyLevel: 'high' | 'low' | null;
  texture: 'organic' | 'synthetic' | null;
  space: 'dry' | 'wet' | null;
  role: 'foundation' | 'top_end' | 'ear_candy' | null;

  isFavorite: boolean;
  userTags: string[];
  playCount: number;
  lastPlayed: number | null;
  rating: number | null;

  meta: AssetMeta;

  indexStatus: IndexStatus;
  waveformData: number[] | null;
  bpmSource: BpmSource | null;
  keySource: BpmSource | null;

  createdAt: number;
  updatedAt: number;
}

export interface SearchResult {
  assets: Asset[];
  total: number;
}

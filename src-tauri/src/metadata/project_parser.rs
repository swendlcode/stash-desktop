use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::error::Result;

/// Cap at index time so a playlist with thousands of clips can't bloat
/// the asset row's meta JSON or the IPC payload.
const MAX_PLAYLIST_CLIPS: usize = 5000;

#[derive(Debug, Clone)]
pub struct ProjectMeta {
    pub daw: String,
    pub version: Option<String>,
    pub track_count: Option<u32>,
    pub tempo: Option<f32>,
    pub time_signature: Option<String>,
    pub last_modified: Option<u64>,
    pub plugins: Vec<String>,
    pub sample_count: Option<u32>,
    /// Sample / audio file paths referenced by the project, when extractable.
    pub samples: Vec<String>,
    /// Project title embedded inside the file (FLP "ProjectTitle" event).
    pub title: Option<String>,
    /// Author / artist string embedded inside the file.
    pub author: Option<String>,
    /// Genre embedded inside the file.
    pub genre: Option<String>,
    /// Free-form comments / notes.
    pub comments: Option<String>,
    /// File size on disk in bytes.
    pub file_size_bytes: Option<u64>,
    /// Channel (instrument) names from the project rack.
    pub channels: Vec<String>,
    /// Pattern names defined in the project.
    pub patterns: Vec<String>,
    /// Mixer-insert names (FL Studio "Mixer tracks", distinct from playlist tracks).
    pub mixer_tracks: Vec<String>,
    /// Project URL embedded in the file, if any.
    pub url: Option<String>,
    /// Pulses per quarter note, from FLhd. Required to convert clip ticks to beats.
    pub ppq: Option<u16>,
    /// Playlist clips parsed from `DataPlayListItems`. For multi-arrangement
    /// projects, mirrors the **first** arrangement's clips so older consumers
    /// keep working. Use `arrangements` to get the full set.
    pub clips: Vec<PlaylistClip>,
    /// One entry per arrangement in the FLP (FL Studio 12.9+). Always
    /// populated — even single-arrangement projects yield one entry.
    pub arrangements: Vec<Arrangement>,
}

/// One FL Studio arrangement (a named playlist). FL emits `ArrangementIndex`
/// (0x99) followed by the arrangement's name and `DataPlayListItems` events;
/// every clip event between two index markers belongs to the active arrangement.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Arrangement {
    pub index: u32,
    pub name: Option<String>,
    pub clips: Vec<PlaylistClip>,
}

/// A single clip placed on the FL Studio playlist.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistClip {
    /// Playlist track index (top-down, 0-based).
    pub track: u32,
    /// Position on the timeline, in PPQ ticks.
    pub position_ticks: i32,
    /// Visible clip length on the timeline, in PPQ ticks.
    pub length_ticks: i32,
    /// Trim from the source start, in PPQ ticks.
    pub start_offset_ticks: i32,
    /// Trim from the source end, in PPQ ticks.
    pub end_offset_ticks: i32,
    /// Set when the clip references a pattern (`patternId > patternBase`).
    /// Index is into the project's pattern list (0-based).
    pub pattern_index: Option<u16>,
    /// Set when the clip references an audio/automation channel
    /// (`patternId <= patternBase`).
    pub channel_index: Option<u16>,
    pub muted: bool,
}

/// Parse project file metadata based on file extension and basic file analysis.
/// This provides basic metadata extraction without full project file parsing.
pub fn parse(path: &Path) -> Result<ProjectMeta> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let metadata = fs::metadata(path)?;
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    let file_size_bytes = Some(metadata.len());

    let daw = match ext.as_str() {
        "flp" => "FL Studio",
        "als" => "Ableton Live",
        "logicx" => "Logic Pro",
        "cpr" => "Cubase",
        "ptx" => "Pro Tools",
        "rpp" => "Reaper",
        "reason" => "Reason",
        "song" => "Studio One",
        "mmpz" | "mmp" => "LMMS",
        "bwproject" => "Bitwig Studio",
        "xrns" => "Renoise",
        "cwp" => "Cakewalk",
        "dawproject" => "DAWproject",
        _ => "Unknown DAW",
    };

    // For some formats, we can extract basic info from filename patterns
    let (tempo, time_signature) = extract_from_filename(path);

    // Try to extract additional metadata for supported formats
    let (mut version, mut track_count, mut plugins, mut sample_count) = match ext.as_str() {
        "als" => parse_ableton_basic(path),
        "rpp" => parse_reaper_basic(path),
        _ => (None, None, Vec::new(), None),
    };

    let mut samples: Vec<String> = Vec::new();
    let mut title: Option<String> = None;
    let mut author: Option<String> = None;
    let mut genre: Option<String> = None;
    let mut comments: Option<String> = None;
    let mut channels: Vec<String> = Vec::new();
    let mut patterns: Vec<String> = Vec::new();
    let mut mixer_tracks: Vec<String> = Vec::new();
    let mut url: Option<String> = None;
    let mut ppq: Option<u16> = None;
    let mut clips: Vec<PlaylistClip> = Vec::new();
    let mut arrangements: Vec<Arrangement> = Vec::new();
    let mut tempo = tempo;
    let mut time_signature = time_signature;

    if ext == "flp" {
        if let Ok(scan) = scan_flp(path) {
            if !scan.plugins.is_empty() {
                plugins = scan.plugins;
            }
            samples = scan.samples;
            if scan.channel_count > 0 {
                track_count = Some(scan.channel_count);
            }
            if sample_count.is_none() {
                sample_count = Some(samples.len() as u32);
            }
            if version.is_none() {
                version = scan.version;
            }
            if scan.tempo.is_some() {
                tempo = scan.tempo;
            }
            if scan.time_signature.is_some() {
                time_signature = scan.time_signature;
            }
            title = scan.title;
            author = scan.author;
            genre = scan.genre;
            comments = scan.comments;
            channels = scan.channels;
            patterns = scan.patterns;
            mixer_tracks = scan.mixer_tracks;
            url = scan.url;
            ppq = scan.ppq;
            clips = scan.clips;
            arrangements = scan.arrangements;
        }
    }

    Ok(ProjectMeta {
        daw: daw.to_string(),
        version,
        track_count,
        tempo,
        time_signature,
        last_modified,
        plugins,
        sample_count,
        samples,
        title,
        author,
        genre,
        comments,
        file_size_bytes,
        channels,
        patterns,
        mixer_tracks,
        url,
        ppq,
        clips,
        arrangements,
    })
}

/// Result of parsing an FLP file.
struct FlpScan {
    plugins: Vec<String>,
    samples: Vec<String>,
    channel_count: u32,
    version: Option<String>,
    title: Option<String>,
    author: Option<String>,
    genre: Option<String>,
    comments: Option<String>,
    tempo: Option<f32>,
    time_signature: Option<String>,
    channels: Vec<String>,
    patterns: Vec<String>,
    mixer_tracks: Vec<String>,
    url: Option<String>,
    ppq: Option<u16>,
    clips: Vec<PlaylistClip>,
    arrangements: Vec<Arrangement>,
}

impl FlpScan {
    fn empty() -> Self {
        FlpScan {
            plugins: Vec::new(),
            samples: Vec::new(),
            channel_count: 0,
            version: None,
            title: None,
            author: None,
            genre: None,
            comments: None,
            tempo: None,
            time_signature: None,
            channels: Vec::new(),
            patterns: Vec::new(),
            mixer_tracks: Vec::new(),
            url: None,
            ppq: None,
            clips: Vec::new(),
            arrangements: Vec::new(),
        }
    }
}

/// FL Studio event IDs. Bytes are split into ranges by ID:
///   0x00–0x3F → 1-byte payload
///   0x40–0x7F → 2-byte payload (little-endian)
///   0x80–0xBF → 4-byte payload (little-endian)
///   0xC0–0xFF → variable-length: 7-bit varint length, then `length` bytes
///
/// Text events (≥ 0xC0) carry UTF-16-LE NUL-terminated strings, **except**
/// `TextVersion` (0xC7) which is UTF-8. Above 0xD2 the events are raw binary
/// payloads (plugin params, clip records, …) — do NOT decode them as text.
///
/// IDs cross-checked against monadgroup/FLParser `Enums.cs` and PyFLP.
mod flp_event {
    // --- Byte events (1-byte payload) ---
    pub const TEMPO_COARSE_BYTE: u8 = 0x14; // legacy: BPM as a single byte (rare)
    pub const TIME_SIG_NUM: u8 = 0x11;
    pub const TIME_SIG_DEN: u8 = 0x12;
    // --- Word events (16-bit payload) ---
    pub const NEW_CHANNEL: u8 = 0x40; // 64 — WordNewChan, marks a new channel slot
    pub const TEMPO_WORD: u8 = 0x42; // 66
    pub const TIME_SIG_NUM_WORD: u8 = 0x53; // 83
    pub const TIME_SIG_DEN_WORD: u8 = 0x54; // 84
    // --- DWord events (32-bit payload) ---
    pub const TEMPO_DWORD: u8 = 0x9C; // 156 — newer; tempo*1000
    pub const ARRANGEMENT_INDEX: u8 = 0x99; // 153 — switches the "current" arrangement;
                                            // every following 0xE9 belongs to it.
    // --- Text events (UTF-16-LE, varint-prefixed length) ---
    pub const CHANNEL_NAME: u8 = 0xC0; // 192 — TextChanName
    pub const PATTERN_NAME: u8 = 0xC1; // 193 — TextPatName
    pub const PROJECT_TITLE: u8 = 0xC2; // 194 — TextTitle
    pub const COMMENT: u8 = 0xC3; // 195 — TextComment
    pub const SAMPLE_FILE_NAME: u8 = 0xC4; // 196 — TextSampleFileName
    pub const URL: u8 = 0xC5; // 197 — TextUrl
    pub const COMMENT_RTF: u8 = 0xC6; // 198 — TextCommentRtf
    pub const VERSION: u8 = 0xC7; // 199 — TextVersion (UTF-8!)
    pub const PLUGIN_DLL_PATH: u8 = 0xCB; // 203 — TextPluginName
    pub const MIXER_TRACK_NAME: u8 = 0xCC; // 204 — TextInsertName
    pub const GENRE: u8 = 0xCE; // 206 — TextGenre
    pub const AUTHOR: u8 = 0xCF; // 207 — TextAuthor
    // --- Data events (binary, varint-prefixed length) ---
    pub const PLAYLIST_ITEMS: u8 = 0xE9; // 233 — DataPlayListItems
    pub const ARRANGEMENT_NAME: u8 = 0xF1; // 241 — TextArrName (UTF-16-LE)
}

fn scan_flp(path: &Path) -> Result<FlpScan> {
    let bytes = fs::read(path)?;

    // Try the proper event-stream parse first; fall back to a printable-string
    // sweep only when the FLhd/FLdt headers are unreadable. The event walker
    // returns a partial scan whenever the headers are valid, so a corrupt
    // mid-file event no longer wipes out the metadata we already collected.
    if let Some(scan) = parse_flp_events(&bytes) {
        return Ok(scan);
    }
    Ok(scan_flp_strings(&bytes))
}

/// Read 2 LE bytes without risking a panic on short slices. Returns 0 if the
/// slice is undersized — should never happen given the event-size table, but
/// the defensive default keeps a corrupt file from killing the whole parse.
#[inline]
fn read_u16_le(bytes: &[u8]) -> u16 {
    if bytes.len() >= 2 {
        u16::from_le_bytes([bytes[0], bytes[1]])
    } else {
        0
    }
}

#[inline]
fn read_u32_le(bytes: &[u8]) -> u32 {
    if bytes.len() >= 4 {
        u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
    } else {
        0
    }
}

/// Walk the FLhd / FLdt chunk pair and decode each event.
fn parse_flp_events(bytes: &[u8]) -> Option<FlpScan> {
    if bytes.len() < 14 {
        return None;
    }
    if &bytes[0..4] != b"FLhd" {
        return None;
    }
    // FLhd: 4 magic + 4 length + 2 format + 2 nchans + 2 ppq = 14 bytes.
    // PPQ (pulses per quarter note) is the tick base for every position/length
    // in the playlist; without it we can't render clips on a beat grid.
    let ppq = read_u16_le(&bytes[12..14]);
    let mut pos = 14usize;
    if pos + 8 > bytes.len() || &bytes[pos..pos + 4] != b"FLdt" {
        return None;
    }
    let dt_len = read_u32_le(&bytes[pos + 4..pos + 8]) as usize;
    pos += 8;
    let end = pos.saturating_add(dt_len).min(bytes.len());

    let mut scan = FlpScan::empty();
    if ppq > 0 {
        scan.ppq = Some(ppq);
    }
    let mut plugin_set: BTreeSet<String> = BTreeSet::new();
    let mut sample_set: BTreeSet<String> = BTreeSet::new();
    let mut channel_set: BTreeSet<String> = BTreeSet::new();
    let mut pattern_set: BTreeSet<String> = BTreeSet::new();
    let mut mixer_set: BTreeSet<String> = BTreeSet::new();
    let mut channel_count = 0u32;
    let mut version_major: Option<u32> = None;
    let mut arrangements: Vec<Arrangement> = Vec::new();
    // FL files without any 0x99 still emit a 0xE9. Default to arrangement 0 so
    // those single-arrangement projects still produce one entry.
    let mut current_arr_idx: u32 = 0;
    let mut saw_arrangement_index = false;
    let mut playlist_events_seen: u32 = 0;

    while pos < end {
        let id = bytes[pos];
        pos += 1;

        let payload_size: usize = if id < 0x40 {
            1
        } else if id < 0x80 {
            2
        } else if id < 0xC0 {
            4
        } else {
            // Varlen — 7-bit-per-byte length prefix. A corrupt varint here means
            // we can no longer locate the next event boundary, so stop the loop
            // and return whatever we collected so far instead of bailing the
            // entire scan.
            match read_varlen(&bytes[pos..]) {
                Some((len, used)) => {
                    pos += used;
                    len
                }
                None => break,
            }
        };

        if pos + payload_size > end {
            break;
        }
        let payload = &bytes[pos..pos + payload_size];
        pos += payload_size;

        match id {
            // Byte events
            flp_event::TIME_SIG_NUM => {
                if let Some(&n) = payload.first() {
                    let prev = scan.time_signature.clone().unwrap_or_else(|| "4/4".into());
                    let den = prev.split('/').nth(1).unwrap_or("4");
                    scan.time_signature = Some(format!("{}/{}", n, den));
                }
            }
            flp_event::TIME_SIG_DEN => {
                if let Some(&d) = payload.first() {
                    let prev = scan.time_signature.clone().unwrap_or_else(|| "4/4".into());
                    let num = prev.split('/').next().unwrap_or("4");
                    scan.time_signature = Some(format!("{}/{}", num, d));
                }
            }
            flp_event::TEMPO_COARSE_BYTE => {
                if scan.tempo.is_none() {
                    if let Some(&b) = payload.first() {
                        scan.tempo = Some(b as f32);
                    }
                }
            }
            // Word events
            flp_event::NEW_CHANNEL => {
                // Authoritative channel-creation marker. Counting these gives an
                // accurate track count even when channels keep their default
                // (empty) name — the old "count CHANNEL_NAME events" approach
                // missed those entirely.
                channel_count += 1;
            }
            flp_event::TEMPO_WORD => {
                let v = read_u16_le(payload);
                if v > 0 && scan.tempo.is_none() {
                    scan.tempo = Some(v as f32);
                }
            }
            flp_event::TIME_SIG_NUM_WORD => {
                let v = read_u16_le(payload);
                let prev = scan.time_signature.clone().unwrap_or_else(|| "4/4".into());
                let den = prev.split('/').nth(1).unwrap_or("4");
                scan.time_signature = Some(format!("{}/{}", v, den));
            }
            flp_event::TIME_SIG_DEN_WORD => {
                let v = read_u16_le(payload);
                let prev = scan.time_signature.clone().unwrap_or_else(|| "4/4".into());
                let num = prev.split('/').next().unwrap_or("4");
                scan.time_signature = Some(format!("{}/{}", num, v));
            }
            // DWord events — newer FL stores tempo as bpm * 1000
            flp_event::TEMPO_DWORD => {
                let v = read_u32_le(payload);
                // Sanity check: real FL tempos are 10–999 BPM; anything outside
                // that means we're staring at the wrong event ID for this
                // version of the format.
                let bpm = v as f32 / 1000.0;
                if (10.0..=999.0).contains(&bpm) {
                    scan.tempo = Some(bpm);
                }
            }
            // Text events
            flp_event::PROJECT_TITLE => {
                if scan.title.is_none() {
                    if let Some(s) = decode_utf16le_text(payload) {
                        if !s.is_empty() {
                            scan.title = Some(s);
                        }
                    }
                }
            }
            flp_event::COMMENT | flp_event::COMMENT_RTF => {
                if scan.comments.is_none() {
                    if let Some(s) = decode_utf16le_text(payload) {
                        // RTF strings start with `{\rtf` — strip control words so we
                        // surface plain text. Crude but enough for a sidebar.
                        let cleaned = if s.starts_with("{\\rtf") {
                            strip_rtf(&s)
                        } else {
                            s
                        };
                        if !cleaned.is_empty() {
                            scan.comments = Some(cleaned);
                        }
                    }
                }
            }
            flp_event::URL => {
                if scan.url.is_none() {
                    scan.url = decode_utf16le_text(payload);
                }
            }
            flp_event::VERSION => {
                // TextVersion is UTF-8, unlike every other text event. The first
                // dotted segment is the major version, which the playlist parser
                // needs to pick the right `track = N - rawTrack` formula.
                if let Some(s) = decode_utf8_nul_terminated(payload) {
                    if version_major.is_none() {
                        version_major = s
                            .split('.')
                            .next()
                            .and_then(|seg| seg.parse::<u32>().ok());
                    }
                    if scan.version.is_none() && !s.is_empty() {
                        scan.version = Some(s);
                    }
                }
            }
            flp_event::GENRE => {
                if scan.genre.is_none() {
                    scan.genre = decode_utf16le_text(payload);
                }
            }
            flp_event::AUTHOR => {
                if scan.author.is_none() {
                    scan.author = decode_utf16le_text(payload);
                }
            }
            flp_event::SAMPLE_FILE_NAME => {
                if let Some(s) = decode_utf16le_text(payload) {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() && trimmed.len() < 1024 {
                        sample_set.insert(trimmed.to_string());
                    }
                }
            }
            flp_event::PLUGIN_DLL_PATH => {
                if let Some(s) = decode_utf16le_text(payload) {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() && trimmed.len() < 512 {
                        plugin_set.insert(plugin_basename(trimmed));
                    }
                }
            }
            flp_event::CHANNEL_NAME => {
                // Channel count comes from NEW_CHANNEL (0x40); names here are
                // optional flavor only.
                if let Some(s) = decode_utf16le_text(payload) {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        channel_set.insert(trimmed.to_string());
                    }
                }
            }
            flp_event::PATTERN_NAME => {
                if let Some(s) = decode_utf16le_text(payload) {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        pattern_set.insert(trimmed.to_string());
                    }
                }
            }
            flp_event::MIXER_TRACK_NAME => {
                if let Some(s) = decode_utf16le_text(payload) {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        mixer_set.insert(trimmed.to_string());
                    }
                }
            }
            flp_event::ARRANGEMENT_INDEX => {
                current_arr_idx = read_u32_le(payload);
                saw_arrangement_index = true;
            }
            flp_event::ARRANGEMENT_NAME => {
                if let Some(name) = decode_utf16le_text(payload) {
                    if !name.is_empty() {
                        let arr = arrangement_slot(&mut arrangements, current_arr_idx);
                        arr.name = Some(name);
                    }
                }
            }
            flp_event::PLAYLIST_ITEMS => {
                let parsed = parse_playlist_items(payload, version_major, scan.ppq);
                // Older FL revisions (and some re-saved files) emit one 0xE9 per
                // arrangement without ever firing a preceding 0x99. Detect that
                // by promoting each subsequent 0xE9 to a fresh arrangement
                // index — but only while no real ArrangementIndex has shown up.
                let target_idx = if saw_arrangement_index {
                    current_arr_idx
                } else {
                    let next = playlist_events_seen;
                    current_arr_idx = next;
                    next
                };
                playlist_events_seen += 1;
                let arr = arrangement_slot(&mut arrangements, target_idx);
                arr.clips.extend(parsed);
            }
            _ => {}
        }
    }

    // Stable order: by arrangement index ascending.
    arrangements.sort_by_key(|a| a.index);
    // Top-level `clips` mirrors arrangement 0 (or first present) so the rest
    // of the codebase keeps working without mandatory arrangement plumbing.
    if let Some(first) = arrangements.first() {
        scan.clips = first.clips.clone();
    }
    scan.arrangements = arrangements;

    scan.plugins = plugin_set.into_iter().collect();
    scan.samples = sample_set.into_iter().collect();
    scan.channels = channel_set.into_iter().collect();
    scan.patterns = pattern_set.into_iter().collect();
    scan.mixer_tracks = mixer_set.into_iter().collect();
    scan.channel_count = channel_count;
    Some(scan)
}

/// Get-or-create the `Arrangement` with the given index. Used by the event
/// walker to lazily materialise arrangements as their events show up.
fn arrangement_slot(arrangements: &mut Vec<Arrangement>, index: u32) -> &mut Arrangement {
    if let Some(pos) = arrangements.iter().position(|a| a.index == index) {
        return &mut arrangements[pos];
    }
    arrangements.push(Arrangement {
        index,
        name: None,
        clips: Vec::new(),
    });
    arrangements.last_mut().unwrap()
}

/// 7-bit varint (LSB first; high bit signals continuation). Returns
/// (value, bytes consumed).
fn read_varlen(bytes: &[u8]) -> Option<(usize, usize)> {
    let mut value: u64 = 0;
    let mut shift = 0u32;
    for (i, &b) in bytes.iter().enumerate() {
        value |= ((b & 0x7F) as u64) << shift;
        if b & 0x80 == 0 {
            return Some((value as usize, i + 1));
        }
        shift += 7;
        if shift >= 64 {
            return None;
        }
    }
    None
}

/// Decode a UTF-16-LE NUL-terminated payload into a Rust String, stripping
/// any trailing NULs.
fn decode_utf16le_text(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 2 {
        return None;
    }
    let mut units: Vec<u16> = Vec::with_capacity(bytes.len() / 2);
    let mut i = 0;
    while i + 1 < bytes.len() {
        let cp = u16::from_le_bytes([bytes[i], bytes[i + 1]]);
        if cp == 0 {
            break;
        }
        units.push(cp);
        i += 2;
    }
    String::from_utf16(&units).ok().map(|s| s.trim().to_string())
}

/// Decode a NUL-terminated UTF-8 payload (used by `TextVersion`).
fn decode_utf8_nul_terminated(bytes: &[u8]) -> Option<String> {
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    std::str::from_utf8(&bytes[..end])
        .ok()
        .map(|s| s.trim().to_string())
}

/// Decode the binary payload of `DataPlayListItems` (event 0xE9). Each clip
/// record is a fixed 32 bytes:
///
/// ```text
///  i32 startTime           // ticks
///  u16 patternBase
///  u16 patternId           // <= patternBase → channel/sample clip
///                          // >  patternBase → pattern index = patternId - patternBase - 1
///  i32 length              // ticks
///  i32 rawTrack            // FL20+: track = 501 - rawTrack
///                          // FL<20: track = 198 - rawTrack
///  u16 unknown1
///  u16 itemFlags           // & 0x2000 → muted
///  u32 unknown3
///  i32/f32 startOffset     // f32-beats × PPQ for channel clips, ticks for pattern clips
///  i32/f32 endOffset       // ditto
/// ```
/// Sniff the track-mapping origin (501 vs 198) from the raw track values when
/// the FL version isn't known. Picks whichever formula puts every clip in a
/// plausible 0..500 lane range with the smallest median lane index.
fn detect_track_origin(payload: &[u8]) -> Option<i32> {
    const RECORD: usize = 32;
    let mut samples: Vec<i32> = payload
        .chunks_exact(RECORD)
        .take(64)
        .map(|r| read_u32_le(&r[12..16]) as i32)
        .collect();
    if samples.is_empty() {
        return None;
    }
    samples.sort_unstable();
    let median = samples[samples.len() / 2];
    let v20 = 501 - median;
    let old = 198 - median;
    let pick = |o: i32| -> bool { o >= 0 && o <= 500 };
    match (pick(v20), pick(old)) {
        (true, true) => Some(if v20.abs() <= old.abs() { 501 } else { 198 }),
        (true, false) => Some(501),
        (false, true) => Some(198),
        _ => None,
    }
}

fn parse_playlist_items(
    payload: &[u8],
    version_major: Option<u32>,
    ppq: Option<u16>,
) -> Vec<PlaylistClip> {
    const RECORD: usize = 32;
    let count = payload.len() / RECORD;
    let mut clips: Vec<PlaylistClip> = Vec::with_capacity(count.min(MAX_PLAYLIST_CLIPS));
    let ppq_f = ppq.map(|p| p as f32).unwrap_or(96.0);

    // Auto-detect the track-mapping origin. FL20+ uses `501 - raw`, older FL
    // versions use `198 - raw`. The version event usually arrives first, but
    // not always — and when it doesn't, the wrong formula produces negative or
    // huge track indices for every clip. Sample the first chunk to pick the
    // formula that yields the smallest sane track index.
    let track_origin: i32 = match version_major {
        Some(v) if v >= 20 => 501,
        Some(_) => 198,
        None => detect_track_origin(payload).unwrap_or(501),
    };

    for record in payload.chunks_exact(RECORD).take(MAX_PLAYLIST_CLIPS) {
        let position_ticks = i32::from_le_bytes(record[0..4].try_into().unwrap());
        let pattern_base = u16::from_le_bytes(record[4..6].try_into().unwrap());
        let pattern_id = u16::from_le_bytes(record[6..8].try_into().unwrap());
        let length_ticks = i32::from_le_bytes(record[8..12].try_into().unwrap());
        let raw_track = i32::from_le_bytes(record[12..16].try_into().unwrap());
        // record[16..18] unknown1
        let item_flags = u16::from_le_bytes(record[18..20].try_into().unwrap());
        // record[20..24] unknown3
        let off_a = &record[24..28];
        let off_b = &record[28..32];

        if length_ticks <= 0 {
            continue;
        }
        // Use checked_sub to guard against malformed records where raw_track
        // is a large negative i32 — e.g. i32::MIN — which would cause
        // track_origin - raw_track to overflow i32 and panic.
        let track_signed = match track_origin.checked_sub(raw_track) {
            Some(v) => v,
            None => continue,
        };
        if track_signed < 0 || track_signed > 500 {
            continue;
        }

        let is_pattern_clip = pattern_id > pattern_base;
        let (start_offset_ticks, end_offset_ticks, pattern_index, channel_index) =
            if is_pattern_clip {
                (
                    i32::from_le_bytes(off_a.try_into().unwrap()),
                    i32::from_le_bytes(off_b.try_into().unwrap()),
                    Some(pattern_id - pattern_base - 1),
                    None,
                )
            } else {
                // Channel/sample clip — offsets are stored as f32 *beats*.
                let beats_to_ticks = |b: f32| -> i32 {
                    if !b.is_finite() {
                        return 0;
                    }
                    (b * ppq_f) as i32
                };
                (
                    beats_to_ticks(f32::from_le_bytes(off_a.try_into().unwrap())),
                    beats_to_ticks(f32::from_le_bytes(off_b.try_into().unwrap())),
                    None,
                    Some(pattern_id),
                )
            };

        clips.push(PlaylistClip {
            track: track_signed as u32,
            position_ticks,
            length_ticks,
            start_offset_ticks,
            end_offset_ticks,
            pattern_index,
            channel_index,
            muted: (item_flags & 0x2000) != 0,
        });
    }

    clips
}

/// Crude RTF → plain text. Drops `\` control words and `{ }` group markers.
fn strip_rtf(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                // skip until non-letter / non-digit / non-whitespace separator
                while let Some(&n) = chars.peek() {
                    if n.is_ascii_alphanumeric() || n == '-' {
                        chars.next();
                    } else {
                        if n == ' ' {
                            chars.next();
                        }
                        break;
                    }
                }
            }
            '{' | '}' => {}
            _ => out.push(c),
        }
    }
    out.trim().to_string()
}

/// Fallback string scan for files whose header isn't FLhd.
fn scan_flp_strings(bytes: &[u8]) -> FlpScan {
    let mut strings: Vec<String> = Vec::new();
    extract_ascii_runs(bytes, &mut strings);
    extract_utf16le_runs(bytes, &mut strings);

    let mut plugin_set: BTreeSet<String> = BTreeSet::new();
    let mut sample_set: BTreeSet<String> = BTreeSet::new();
    let mut version: Option<String> = None;

    for s in &strings {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            continue;
        }
        if looks_like_audio_path(trimmed) {
            sample_set.insert(trimmed.to_string());
            continue;
        }
        if looks_like_plugin_name(trimmed) {
            plugin_set.insert(plugin_basename(trimmed));
            continue;
        }
        if version.is_none()
            && (trimmed.contains("FL Studio") || trimmed.starts_with("Fruity Loops"))
            && trimmed.len() < 64
        {
            version = Some(trimmed.to_string());
        }
    }

    FlpScan {
        plugins: plugin_set.into_iter().collect(),
        samples: sample_set.into_iter().collect(),
        channel_count: 0,
        version,
        ..FlpScan::empty()
    }
}

fn extract_ascii_runs(bytes: &[u8], out: &mut Vec<String>) {
    let mut current: Vec<u8> = Vec::new();
    for &b in bytes {
        if (0x20..=0x7E).contains(&b) {
            current.push(b);
        } else {
            if current.len() >= 4 {
                if let Ok(s) = std::str::from_utf8(&current) {
                    out.push(s.to_string());
                }
            }
            current.clear();
        }
    }
    if current.len() >= 4 {
        if let Ok(s) = std::str::from_utf8(&current) {
            out.push(s.to_string());
        }
    }
}

fn extract_utf16le_runs(bytes: &[u8], out: &mut Vec<String>) {
    let mut current: Vec<u16> = Vec::new();
    let mut i = 0;
    while i + 1 < bytes.len() {
        let lo = bytes[i];
        let hi = bytes[i + 1];
        let cp = (hi as u16) << 8 | (lo as u16);
        if hi == 0 && (0x20..=0x7E).contains(&lo) {
            current.push(cp);
        } else {
            if current.len() >= 4 {
                if let Ok(s) = String::from_utf16(&current) {
                    out.push(s);
                }
            }
            current.clear();
        }
        i += 2;
    }
    if current.len() >= 4 {
        if let Ok(s) = String::from_utf16(&current) {
            out.push(s);
        }
    }
}

fn looks_like_audio_path(s: &str) -> bool {
    if s.len() > 512 {
        return false;
    }
    let lower = s.to_ascii_lowercase();
    let has_audio_ext = lower.ends_with(".wav")
        || lower.ends_with(".mp3")
        || lower.ends_with(".flac")
        || lower.ends_with(".ogg")
        || lower.ends_with(".aif")
        || lower.ends_with(".aiff");
    let has_path_sep = s.contains('/') || s.contains('\\') || s.contains(':');
    has_audio_ext && has_path_sep
}

fn looks_like_plugin_name(s: &str) -> bool {
    if s.len() < 4 || s.len() > 96 {
        return false;
    }
    let lower = s.to_ascii_lowercase();
    if lower.ends_with(".dll")
        || lower.ends_with(".vst3")
        || lower.ends_with(".vst")
        || lower.ends_with(".component")
    {
        return true;
    }
    // FL native generators are stamped under a small known list; recognising
    // a few plus the file-suffix rule above catches the bulk of plugins
    // without producing too many false positives.
    matches!(
        lower.as_str(),
        "fruity wrapper"
            | "fruity dx10"
            | "fruity dx5"
            | "fruity vibrator"
            | "fruity envelope controller"
            | "fruity formula controller"
            | "fruity peak controller"
            | "fruity keyboard controller"
            | "fruity x-y controller"
            | "fruity granulizer"
            | "fruity slicer"
            | "fruity drumsynth live"
            | "fruity dance"
            | "midi out"
            | "speech synthesizer"
            | "boobass"
            | "buzzgenerator"
            | "drumpad"
            | "fl keys"
            | "harmless"
            | "harmor"
            | "morphine"
            | "ogun"
            | "patcher"
            | "plucked!"
            | "sakura"
            | "slicex"
            | "soundfont player"
            | "sytrus"
            | "wasp"
            | "wasp xt"
            | "kick"
            | "kick 2"
            | "edison"
    )
}

/// `C:\\VST\\Serum.dll` -> `Serum`; bare names pass through.
fn plugin_basename(s: &str) -> String {
    let normalized = s.replace('\\', "/");
    let last = normalized.rsplit('/').next().unwrap_or(s);
    let stem = match last.rfind('.') {
        Some(i) => &last[..i],
        None => last,
    };
    stem.to_string()
}

/// Extract tempo and time signature from filename patterns like:
/// "My Track - 128 BPM - 4-4.als"
/// "Song Name 140bpm.flp"
fn extract_from_filename(path: &Path) -> (Option<f32>, Option<String>) {
    let filename = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    // Extract BPM
    let tempo = if let Some(bpm_match) = regex::Regex::new(r"(\d+)\s*bpm")
        .ok()
        .and_then(|re| re.captures(&filename))
    {
        bpm_match.get(1).and_then(|m| m.as_str().parse::<f32>().ok())
    } else if let Some(bpm_match) = regex::Regex::new(r"(\d+)\s*-\s*bpm")
        .ok()
        .and_then(|re| re.captures(&filename))
    {
        bpm_match.get(1).and_then(|m| m.as_str().parse::<f32>().ok())
    } else {
        None
    };

    // Extract time signature
    let time_signature = if let Some(ts_match) = regex::Regex::new(r"(\d+)[/-](\d+)")
        .ok()
        .and_then(|re| re.captures(&filename))
    {
        if let (Some(num), Some(den)) = (ts_match.get(1), ts_match.get(2)) {
            Some(format!("{}/{}", num.as_str(), den.as_str()))
        } else {
            None
        }
    } else {
        None
    };

    (tempo, time_signature)
}

/// Basic Ableton Live project parsing - extract minimal info from .als files
fn parse_ableton_basic(path: &Path) -> (Option<String>, Option<u32>, Vec<String>, Option<u32>) {
    // .als files are compressed XML, but we can try to read some basic info
    // This is a simplified approach - full parsing would require decompression
    match fs::read_to_string(path) {
        Ok(content) => {
            let version = extract_version_from_xml(&content, "Creator");
            let track_count = count_xml_elements(&content, "MidiTrack") + 
                             count_xml_elements(&content, "AudioTrack");
            let plugins = extract_plugin_names(&content);
            let sample_count = count_xml_elements(&content, "SampleRef");
            
            (version, Some(track_count), plugins, Some(sample_count))
        }
        Err(_) => (None, None, Vec::new(), None),
    }
}

/// Basic Reaper project parsing - extract info from .rpp files
fn parse_reaper_basic(path: &Path) -> (Option<String>, Option<u32>, Vec<String>, Option<u32>) {
    match fs::read_to_string(path) {
        Ok(content) => {
            let version = extract_reaper_version(&content);
            let track_count = content.lines()
                .filter(|line| line.trim().starts_with("<TRACK"))
                .count() as u32;
            let plugins = extract_reaper_plugins(&content);
            let sample_count = content.lines()
                .filter(|line| line.contains("FILE "))
                .count() as u32;
            
            (version, Some(track_count), plugins, Some(sample_count))
        }
        Err(_) => (None, None, Vec::new(), None),
    }
}

fn extract_version_from_xml(content: &str, tag: &str) -> Option<String> {
    let pattern = format!(r#"{}\s+Version="([^"]+)""#, tag);
    regex::Regex::new(&pattern)
        .ok()?
        .captures(content)?
        .get(1)?
        .as_str()
        .to_string()
        .into()
}

fn count_xml_elements(content: &str, element: &str) -> u32 {
    let pattern = format!(r"<{}", element);
    regex::Regex::new(&pattern)
        .map(|re| re.find_iter(content).count() as u32)
        .unwrap_or(0)
}

fn extract_plugin_names(content: &str) -> Vec<String> {
    let mut plugins = Vec::new();
    
    // Look for VST plugin references
    if let Ok(re) = regex::Regex::new(r#"PlugName="([^"]+)""#) {
        for cap in re.captures_iter(content) {
            if let Some(name) = cap.get(1) {
                plugins.push(name.as_str().to_string());
            }
        }
    }
    
    plugins.sort();
    plugins.dedup();
    plugins
}

fn extract_reaper_version(content: &str) -> Option<String> {
    content.lines()
        .find(|line| line.starts_with("<REAPER_PROJECT"))
        .and_then(|line| {
            regex::Regex::new(r"<REAPER_PROJECT\s+([^\s>]+)")
                .ok()?
                .captures(line)?
                .get(1)?
                .as_str()
                .to_string()
                .into()
        })
}

fn extract_reaper_plugins(content: &str) -> Vec<String> {
    let mut plugins = Vec::new();
    
    for line in content.lines() {
        if line.contains("VST:") || line.contains("JS:") || line.contains("AU:") {
            if let Some(plugin_name) = line.split_whitespace().nth(1) {
                plugins.push(plugin_name.to_string());
            }
        }
    }
    
    plugins.sort();
    plugins.dedup();
    plugins
}
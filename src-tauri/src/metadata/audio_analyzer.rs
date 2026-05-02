use std::fs::File;
use std::path::Path;

use serde::{Deserialize, Serialize};
use symphonia::core::audio::{AudioBuffer, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::error::{Result, StackError};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AudioInfo {
    pub duration_ms: Option<u64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AudioAnalysis {
    pub bpm: Option<f32>,
    pub key_note: Option<String>,
    pub key_scale: Option<String>,
    pub duration_ms: u64,
    pub sample_rate: u32,
    pub channels: u8,
    pub waveform: Vec<f32>,
}

/// Quick format probe — reads headers only, no full decode. Cheap.
pub fn quick_info(path: &Path) -> Result<AudioInfo> {
    let file = File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| StackError::Other(format!("probe: {}", e)))?;

    let track = probed
        .format
        .default_track()
        .ok_or_else(|| StackError::Other("no track".into()))?;

    let params = &track.codec_params;
    let sample_rate = params.sample_rate;
    let channels = params.channels.map(|c| c.count() as u8);
    let duration_ms = match (params.n_frames, sample_rate) {
        (Some(n), Some(sr)) if sr > 0 => Some(((n as f64 / sr as f64) * 1000.0) as u64),
        _ => None,
    };

    Ok(AudioInfo {
        duration_ms,
        sample_rate,
        channels,
    })
}

/// Decode and compute a waveform envelope. Handles every sample format
/// symphonia supports (u8, u16, u24, u32, s8, s16, s24, s32, f32, f64)
/// by converting each decoded buffer to f32 before processing.
///
/// Uses a streaming peak-hold accumulator — never buffers the full decoded
/// audio in memory. Peak is computed per bucket as frames arrive, so memory
/// usage is O(target_bars) regardless of file length.
pub fn analyze(path: &Path) -> Result<AudioAnalysis> {
    const TARGET_BARS: usize = 1024;

    let file = File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| StackError::Other(format!("probe: {}", e)))?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| StackError::Other("no track".into()))?;

    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44_100);
    let channels = track
        .codec_params
        .channels
        .map(|c| c.count() as u8)
        .unwrap_or(2);
    // Use n_frames from headers to pre-size the streaming accumulator.
    // Falls back to a reasonable estimate (30s) if not available.
    let total_frames_hint = track
        .codec_params
        .n_frames
        .unwrap_or((sample_rate as u64) * 30) as usize;

    if track.codec_params.codec == CODEC_TYPE_NULL {
        return Err(StackError::Other("null codec".into()));
    }

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| StackError::Other(format!("codec: {}", e)))?;

    // Streaming peak accumulator — one bucket per output bar.
    // bucket_size is the number of mono frames per bar.
    let bucket_size = (total_frames_hint / TARGET_BARS).max(1);
    let mut peaks: Vec<f32> = Vec::with_capacity(TARGET_BARS + 4);
    let mut current_peak: f32 = 0.0;
    let mut frames_in_bucket: usize = 0;
    let mut total_frames: usize = 0;

    // Reusable f32 conversion buffer — avoids re-allocating per packet.
    let mut f32_buf: Option<AudioBuffer<f32>> = None;

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymError::IoError(_)) | Err(SymError::ResetRequired) => break,
            Err(e) => {
                tracing::warn!("audio packet error ({}): {}", path.display(), e);
                break;
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(SymError::IoError(_)) | Err(SymError::DecodeError(_)) => continue,
            Err(e) => {
                tracing::warn!("audio decode error ({}): {}", path.display(), e);
                continue;
            }
        };

        // Convert ANY sample format → f32 using symphonia's built-in conversion.
        let buf = {
            let equiv = f32_buf.get_or_insert_with(|| decoded.make_equivalent::<f32>());
            decoded.convert(equiv);
            &*equiv
        };

        let n_channels = buf.spec().channels.count();
        let n_frames = buf.frames();
        let inv_channels = 1.0 / n_channels as f32;

        for frame in 0..n_frames {
            // Mono-mix: average all channels
            let mut mono = 0.0f32;
            for ch in 0..n_channels {
                mono += buf.chan(ch)[frame];
            }
            let sample = (mono * inv_channels).abs();

            if sample > current_peak {
                current_peak = sample;
            }
            frames_in_bucket += 1;
            total_frames += 1;

            if frames_in_bucket >= bucket_size {
                peaks.push(current_peak);
                current_peak = 0.0;
                frames_in_bucket = 0;
            }
        }
    }

    // Flush the last partial bucket
    if frames_in_bucket > 0 {
        peaks.push(current_peak);
    }

    if peaks.is_empty() {
        tracing::warn!("audio analyzer produced no samples for {}", path.display());
        return Err(StackError::Other(format!(
            "no samples decoded from {}",
            path.display()
        )));
    }

    let duration_ms = ((total_frames as f64 / sample_rate as f64) * 1000.0) as u64;

    // Resample peaks to exactly TARGET_BARS using peak-hold
    let waveform = resample_peaks(&peaks, TARGET_BARS);

    tracing::debug!(
        "analyzed {} → {} frames, {}ms, {} waveform bars",
        path.display(),
        total_frames,
        duration_ms,
        waveform.len()
    );

    Ok(AudioAnalysis {
        bpm: None,
        key_note: None,
        key_scale: None,
        duration_ms,
        sample_rate,
        channels,
        waveform,
    })
}

pub fn should_analyze_key(instrument: &Option<String>) -> bool {
    match instrument.as_deref() {
        Some("drum") | Some("fx") => false,
        _ => true,
    }
}

/// Resample a peak buffer to exactly `target` bars using peak-hold per bucket.
/// Normalizes so the loudest bar is 1.0.
fn resample_peaks(peaks: &[f32], target: usize) -> Vec<f32> {
    if peaks.is_empty() || target == 0 {
        return vec![];
    }
    if peaks.len() == target {
        // Already the right size — just normalize in place
        let mut out = peaks.to_vec();
        normalize(&mut out);
        return out;
    }

    let ratio = peaks.len() as f64 / target as f64;
    let mut out = Vec::with_capacity(target);

    for i in 0..target {
        let start = (i as f64 * ratio) as usize;
        let end = ((i + 1) as f64 * ratio) as usize;
        let end = end.min(peaks.len());

        let peak = if start < end {
            peaks[start..end].iter().cloned().fold(0.0f32, f32::max)
        } else {
            peaks.get(start).cloned().unwrap_or(0.0)
        };
        out.push(peak);
    }

    normalize(&mut out);
    out
}

#[inline]
fn normalize(v: &mut Vec<f32>) {
    let max = v.iter().cloned().fold(0.0f32, f32::max);
    if max > 0.001 {
        let scale = 1.0 / max;
        for x in v.iter_mut() {
            *x *= scale;
        }
    }
}

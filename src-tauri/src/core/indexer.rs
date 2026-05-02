use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::Semaphore;
use tokio::time::{sleep, Duration};
use uuid::Uuid;

use crate::core::{hasher, scanner};
use crate::db::{AssetRepository, DatabasePool, PackRepository};
use crate::error::Result;
use crate::metadata::{filename_parser, midi_parser, path_parser, preset_parser, project_parser};
use crate::models::{Asset, Pack, ScanProgress};

/// How often the indexer emits a progress event to the frontend.
/// Emitting on every file causes thousands of IPC wakeups during large scans.
/// 250 ms gives smooth progress bar updates without hammering the JS thread.
const PROGRESS_THROTTLE_MS: u64 = 250;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum JobPriority {
    Low = 1,
    Normal = 2,
    High = 3,
}

#[derive(Debug, Clone)]
pub struct IndexJob {
    pub path: PathBuf,
    pub priority: JobPriority,
    pub pack_root: Option<PathBuf>,
}

#[derive(Default)]
struct Counters {
    total: usize,
    indexed: usize,
    queued: usize,
}

pub struct Indexer {
    #[allow(dead_code)]
    db: Arc<DatabasePool>,
    asset_repo: Arc<AssetRepository>,
    pack_repo: Arc<PackRepository>,
    app: AppHandle,
    sem: Arc<parking_lot::RwLock<Arc<Semaphore>>>,
    tx: UnboundedSender<IndexJob>,
    counters: Arc<Mutex<Counters>>,
    cancelled: Arc<AtomicBool>,
    lock_retries_window: Arc<AtomicUsize>,
    completed_window: Arc<AtomicUsize>,
    current_concurrency: Arc<AtomicUsize>,
    min_concurrency: usize,
    max_concurrency: usize,
    /// Timestamp (ms since epoch) of the last progress event sent to the UI.
    /// Used to throttle IPC — we only emit every PROGRESS_THROTTLE_MS.
    last_progress_ms: AtomicUsize,
    /// Buffered `touch_last_seen` IDs — flushed in batches instead of one
    /// UPDATE per file, which was causing thousands of individual write locks.
    pending_touches: Mutex<Vec<String>>,
}

impl Indexer {
    pub fn spawn(
        db: Arc<DatabasePool>,
        asset_repo: Arc<AssetRepository>,
        pack_repo: Arc<PackRepository>,
        app: AppHandle,
        concurrency: usize,
    ) -> Arc<Self> {
        let (tx, mut rx) = unbounded_channel::<IndexJob>();
        let sem = Arc::new(parking_lot::RwLock::new(
            Arc::new(Semaphore::new(concurrency.max(1)))
        ));
        let initial_concurrency = concurrency.max(1);
        let min_concurrency = if initial_concurrency > 1 { 2 } else { 1 };
        let max_concurrency = initial_concurrency;

        let indexer = Arc::new(Self {
            db,
            asset_repo,
            pack_repo,
            app,
            sem,
            tx,
            counters: Arc::new(Mutex::new(Counters::default())),
            cancelled: Arc::new(AtomicBool::new(false)),
            lock_retries_window: Arc::new(AtomicUsize::new(0)),
            completed_window: Arc::new(AtomicUsize::new(0)),
            current_concurrency: Arc::new(AtomicUsize::new(initial_concurrency)),
            min_concurrency,
            max_concurrency,
            last_progress_ms: AtomicUsize::new(0),
            pending_touches: Mutex::new(Vec::new()),
        });

        let worker = indexer.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(job) = rx.recv().await {
                if worker.cancelled.load(Ordering::Relaxed) {
                    worker.bump_indexed();
                    worker.emit_progress();
                    continue;
                }
                // Read the current semaphore — may have been replaced by set_concurrency
                let sem = worker.sem.read().clone();
                let permit = sem.acquire_owned().await.ok();
                let w = worker.clone();
                tauri::async_runtime::spawn(async move {
                    let _permit = permit;
                    if !w.cancelled.load(Ordering::Relaxed) {
                        if let Err(e) = w.process_with_retry(job).await {
                            tracing::warn!("index job failed: {}", e);
                        }
                    }
                    w.bump_indexed();
                    w.emit_progress();
                });
            }
        });

        let tuner = indexer.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                sleep(Duration::from_secs(5)).await;
                let queued = {
                    let c = tuner.counters.lock();
                    c.queued
                };
                if queued == 0 {
                    tuner.lock_retries_window.store(0, Ordering::Relaxed);
                    tuner.completed_window.store(0, Ordering::Relaxed);
                    continue;
                }

                let lock_retries = tuner.lock_retries_window.swap(0, Ordering::Relaxed);
                let completed = tuner.completed_window.swap(0, Ordering::Relaxed);
                let current = tuner.current_concurrency.load(Ordering::Relaxed);
                let mut target = current;

                // If we keep hitting SQLite write locks, back off quickly.
                if lock_retries >= 3 && current > tuner.min_concurrency {
                    target = current.saturating_sub(1);
                // If no lock pressure and good throughput, scale up carefully.
                } else if lock_retries == 0
                    && completed >= current.saturating_mul(2)
                    && current < tuner.max_concurrency
                {
                    target = current + 1;
                }

                if target != current {
                    tuner.set_concurrency(target);
                    tuner.current_concurrency.store(target, Ordering::Relaxed);
                }
            }
        });

        indexer
    }

    /// Update the concurrency limit live — takes effect on the next job dispatch.
    pub fn set_concurrency(&self, n: usize) {
        let new_sem = Arc::new(Semaphore::new(n.max(1)));
        *self.sem.write() = new_sem;
        tracing::info!("indexer concurrency updated to {}", n.max(1));
    }

    pub fn enqueue(&self, job: IndexJob) {
        {
            let mut c = self.counters.lock();
            c.total += 1;
            c.queued += 1;
        }
        let _ = self.tx.send(job);
        self.emit_progress();
    }

    pub fn enqueue_batch(&self, jobs: Vec<IndexJob>) {
        {
            let mut c = self.counters.lock();
            c.total += jobs.len();
            c.queued += jobs.len();
        }
        for job in jobs {
            let _ = self.tx.send(job);
        }
        self.emit_progress();
    }

    pub fn progress(&self) -> ScanProgress {
        let c = self.counters.lock();
        ScanProgress {
            total: c.total,
            indexed: c.indexed,
            queued: c.queued,
            is_scanning: c.queued > 0,
        }
    }

    pub fn reset_counters(&self) {
        let mut c = self.counters.lock();
        *c = Counters::default();
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
        let mut c = self.counters.lock();
        // Mark all queued as "done" so progress shows complete
        c.indexed += c.queued;
        c.queued = 0;
        self.emit_progress();
    }

    pub fn reset(&self) {
        self.cancelled.store(false, Ordering::Relaxed);
        let mut c = self.counters.lock();
        *c = Counters::default();
        self.emit_progress();
    }

    fn bump_indexed(&self) {
        let mut c = self.counters.lock();
        c.indexed += 1;
        c.queued = c.queued.saturating_sub(1);
        self.completed_window.fetch_add(1, Ordering::Relaxed);
        let finished = c.queued == 0 && c.total > 0;
        drop(c);

        // When the last job finishes:
        // 1. Flush any remaining buffered touch_last_seen IDs.
        // 2. Recount all pack asset_counts in one pass.
        // 3. Force a final progress emit so the UI shows 100%.
        if finished {
            self.flush_touches();
            let pack_repo = self.pack_repo.clone();
            tauri::async_runtime::spawn(async move {
                tokio::task::spawn_blocking(move || pack_repo.recount_all()).await.ok();
            });
            // Force-emit the final progress regardless of throttle.
            let _ = self.app.emit("stack://scan-progress", self.progress());
            return;
        }

        // Throttled emit — only send to the UI every PROGRESS_THROTTLE_MS.
        // During a 10k-file scan this reduces IPC calls from ~10,000 to ~40.
        self.emit_progress_throttled();
    }

    /// Emit progress only if enough time has passed since the last emit.
    /// Always emits when called from cancel/reset (those call emit_progress directly).
    fn emit_progress_throttled(&self) {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as usize;
        let last = self.last_progress_ms.load(Ordering::Relaxed);
        if now_ms.saturating_sub(last) >= PROGRESS_THROTTLE_MS as usize {
            self.last_progress_ms.store(now_ms, Ordering::Relaxed);
            let _ = self.app.emit("stack://scan-progress", self.progress());
        }
    }

    pub fn emit_progress(&self) {
        // Unconditional emit — used by cancel/reset/enqueue where we always
        // want the UI to reflect the new state immediately.
        self.last_progress_ms.store(0, Ordering::Relaxed); // reset throttle
        let _ = self.app.emit("stack://scan-progress", self.progress());
    }

    /// Buffer a `touch_last_seen` ID. Flushed in batches of 500 or at scan end.
    fn queue_touch(&self, id: String) {
        let mut buf = self.pending_touches.lock();
        buf.push(id);
        let len = buf.len();
        if len >= 500 {
            let ids: Vec<String> = std::mem::take(&mut *buf);
            drop(buf);
            let repo = self.asset_repo.clone();
            let now = unix_now();
            tauri::async_runtime::spawn(async move {
                tokio::task::spawn_blocking(move || repo.touch_last_seen_batch(&ids, now))
                    .await
                    .ok();
            });
        }
    }

    /// Flush any remaining buffered touches synchronously (called at scan end).
    fn flush_touches(&self) {
        let ids: Vec<String> = {
            let mut buf = self.pending_touches.lock();
            std::mem::take(&mut *buf)
        };
        if ids.is_empty() {
            return;
        }
        let repo = self.asset_repo.clone();
        let now = unix_now();
        tauri::async_runtime::spawn(async move {
            tokio::task::spawn_blocking(move || repo.touch_last_seen_batch(&ids, now))
                .await
                .ok();
        });
    }

    async fn process_with_retry(&self, job: IndexJob) -> Result<()> {
        const MAX_ATTEMPTS: usize = 5;
        for attempt in 0..MAX_ATTEMPTS {
            match self.process(job.clone()).await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    let locked = e.to_string().to_lowercase().contains("database is locked");
                    if locked && attempt + 1 < MAX_ATTEMPTS {
                        self.lock_retries_window.fetch_add(1, Ordering::Relaxed);
                        let backoff_ms = 150 * (attempt as u64 + 1);
                        sleep(Duration::from_millis(backoff_ms)).await;
                        continue;
                    }
                    return Err(e);
                }
            }
        }
        Ok(())
    }

    async fn process(&self, job: IndexJob) -> Result<()> {
        let path = job.path.clone();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let asset_type = scanner::classify(&ext).unwrap_or("sample").to_string();

        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let path_str = path.to_string_lossy().to_string();

        // Fast path: if this exact path is already indexed AND the file on disk
        // hasn't been modified since we last indexed it, just touch last_seen
        // and skip the expensive hash + metadata read. When the file IS newer
        // (e.g. user re-saved an FLP in FL Studio), fall through and re-parse
        // so the meta JSON — playlist clips, tempo, plugins — stays in sync.
        if let Ok(Some((existing_id, updated_at))) = self.asset_repo.path_stamp(&path_str) {
            let mtime_secs = std::fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            if mtime_secs <= updated_at {
                // Buffer the touch — flushed in batches of 500 to avoid
                // thousands of individual UPDATE statements during re-scans.
                self.queue_touch(existing_id);
                return Ok(());
            }
        }

        // Hash for identity
        let id = tokio::task::spawn_blocking({
            let p = path.clone();
            move || hasher::hash_file(&p)
        })
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

        // Ensure pack
        let (pack_id, pack_name) = self.ensure_pack(&path, job.pack_root.as_deref())?;

        // Tier 1: filename
        let fm = filename_parser::parse(&filename);
        // Tier 2: path
        let pack_root = job
            .pack_root
            .clone()
            .unwrap_or_else(|| path.parent().map(|p| p.to_path_buf()).unwrap_or_default());
        let pm = path_parser::parse(&path, &pack_root);

        // Merge
        let instrument = fm.instrument.clone().or(pm.category.clone());
        let subtype = fm.subtype.clone().or(pm.subtype.clone());

        let bpm = fm.bpm;
        let key_note = fm.key_note.clone();
        let key_scale = fm.key_scale.clone();

        let now = unix_now();

        let (mut duration_ms, mut sample_rate, mut channels, mut meta_value, mut eff_bpm, eff_key_note, eff_key_scale) =
            (None, None, None, serde_json::json!({}), bpm, key_note, key_scale);

        let (mut bpm_source, mut key_source) = (None::<String>, None::<String>);
        if eff_bpm.is_some() {
            bpm_source = Some("filename".into());
        }
        if eff_key_note.is_some() {
            key_source = Some("filename".into());
        }

        match asset_type.as_str() {
            "midi" => {
                if let Ok(midi) = midi_parser::parse(&path) {
                    if eff_bpm.is_none() && midi.bpm.is_some() {
                        eff_bpm = midi.bpm;
                        bpm_source = Some("midi".into());
                    }
                    duration_ms = Some(midi.duration_ms as i64);
                    meta_value = serde_json::json!({
                        "timeSignature": midi.time_signature,
                        "barCount": midi.bar_count,
                        "noteCount": midi.note_count,
                        "pianoRoll": midi.piano_roll,
                        "tracks": midi.tracks,
                        "noteRangeLow": midi.note_range_low,
                        "noteRangeHigh": midi.note_range_high,
                    });
                }
            }
            "preset" => {
                if let Ok(preset) = preset_parser::parse(&path) {
                    meta_value = serde_json::json!({
                        "synth": preset.synth,
                        "category": preset.category,
                        "tags": preset.tags,
                    });
                }
            }
            "project" => {
                if let Ok(project) = project_parser::parse(&path) {
                    if eff_bpm.is_none() && project.tempo.is_some() {
                        eff_bpm = project.tempo;
                        bpm_source = Some("filename".into());
                    }
                    meta_value = serde_json::json!({
                        "daw": project.daw,
                        "version": project.version,
                        "trackCount": project.track_count,
                        "tempo": project.tempo,
                        "timeSignature": project.time_signature,
                        "lastModified": project.last_modified,
                        "plugins": project.plugins,
                        "sampleCount": project.sample_count,
                        "samples": project.samples,
                        "title": project.title,
                        "author": project.author,
                        "genre": project.genre,
                        "comments": project.comments,
                        "fileSizeBytes": project.file_size_bytes,
                        "channels": project.channels,
                        "patterns": project.patterns,
                        "mixerTracks": project.mixer_tracks,
                        "url": project.url,
                        "ppq": project.ppq,
                        "clips": project.clips,
                        "arrangements": project.arrangements,
                    });
                }
            }
            "sample" => {
                // Keep indexing lightweight for huge libraries:
                // waveform is analyzed lazily in `get_waveform`.
                if let Ok(info) = crate::metadata::audio_analyzer::quick_info(&path) {
                    duration_ms = info.duration_ms.map(|d| d as i64);
                    sample_rate = info.sample_rate.map(|s| s as i64);
                    channels = info.channels.map(|c| c as i64);
                }
            }
            _ => {}
        }

        let asset = Asset {
            id: id.clone(),
            path: path_str,
            filename: filename.clone(),
            extension: ext.clone(),
            asset_type: asset_type.clone(),
            pack_id: pack_id.clone(),
            pack_name: pack_name.clone(),
            bpm: eff_bpm,
            key_note: eff_key_note,
            key_scale: eff_key_scale,
            duration_ms,
            sample_rate,
            channels,
            instrument: instrument.clone(),
            subtype: subtype.clone(),
            is_favorite: false,
            user_tags: vec![],
            play_count: 0,
            last_played: None,
            rating: None,
            meta: meta_value,
            index_status: "indexed".into(),
            waveform_data: None,
            bpm_source,
            key_source,
            energy_level: fm.energy_level.clone(),
            texture: fm.texture.clone(),
            space: fm.space.clone(),
            role: fm.role.clone(),
            created_at: now,
            updated_at: now,
        };

        self.asset_repo.upsert(&asset)?;

        // Don't recount per-file — pack counts are reconciled at scan end.
        // Don't emit the full asset payload per-file either — the UI refreshes
        // via the throttled scan-progress event and re-queries when scanning ends.
        // This eliminates thousands of IPC serialisation calls during large scans.

        Ok(())
    }

    fn ensure_pack(
        &self,
        file_path: &std::path::Path,
        pack_root_hint: Option<&std::path::Path>,
    ) -> Result<(Option<String>, Option<String>)> {
        let root = match pack_root_hint {
            Some(r) => r.to_path_buf(),
            None => {
                // Watcher path: pack_root unknown. If the file lives inside
                // any project-kind watched folder, the watched root IS the
                // pack root — every project file maps to one project pack,
                // never a subfolder pack. Otherwise fall back to parent dir.
                let project_root = self
                    .pack_repo
                    .list_watched()
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|w| w.kind == "project")
                    .filter_map(|w| {
                        let p = std::path::PathBuf::from(&w.path);
                        if file_path.starts_with(&p) {
                            Some(p)
                        } else {
                            None
                        }
                    })
                    .max_by_key(|p| p.as_os_str().len());
                match project_root {
                    Some(p) => p,
                    None => match file_path.parent() {
                        Some(p) => p.to_path_buf(),
                        None => return Ok((None, None)),
                    },
                }
            }
        };

        let root_str = root.to_string_lossy().to_string();
        if let Some(existing) = self.pack_repo.find_by_root(&root_str)? {
            return Ok((Some(existing.id), Some(existing.name)));
        }

        let name = root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Untitled Pack")
            .to_string();

        let now = unix_now();
        let pack = Pack {
            id: Uuid::new_v4().to_string(),
            name: name.clone(),
            root_path: root_str.clone(),
            vendor: None,
            genre: None,
            color: None,
            asset_count: 0,
            added_at: now,
            updated_at: now,
            kind: "pack".to_string(),
            project_meta: None,
        };
        self.pack_repo.upsert(&pack)?;

        // Read back by root_path to get the canonical id. Upsert with
        // `ON CONFLICT(root_path) DO UPDATE` preserves the *existing* id when
        // another worker won the race, so the id we generated locally may not
        // actually be in the table.
        match self.pack_repo.find_by_root(&root_str)? {
            Some(p) => Ok((Some(p.id), Some(p.name))),
            None => Ok((None, Some(name))),
        }
    }
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

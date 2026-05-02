use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebouncedEvent, Debouncer, FileIdMap};
use parking_lot::RwLock;
use tokio::sync::mpsc::UnboundedSender;

use crate::error::Result;

#[derive(Debug, Clone)]
pub enum WatchEvent {
    Created(PathBuf),
    Deleted(PathBuf),
    Renamed { from: PathBuf, to: PathBuf },
    Modified(PathBuf),
}

pub struct FileWatcher {
    debouncer: parking_lot::Mutex<Debouncer<notify::RecommendedWatcher, FileIdMap>>,
    watched: Arc<RwLock<HashSet<PathBuf>>>,
}

impl FileWatcher {
    pub fn new(tx: UnboundedSender<WatchEvent>) -> Result<Self> {
        let debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |res: std::result::Result<Vec<DebouncedEvent>, Vec<notify::Error>>| match res {
                Ok(events) => {
                    for e in events {
                        for ev in convert(&e) {
                            let _ = tx.send(ev);
                        }
                    }
                }
                Err(errs) => {
                    for err in errs {
                        tracing::warn!("watcher error: {}", err);
                    }
                }
            },
        )?;

        Ok(Self {
            debouncer: parking_lot::Mutex::new(debouncer),
            watched: Arc::new(RwLock::new(HashSet::new())),
        })
    }

    pub fn watch(&self, path: &Path) -> Result<()> {
        self.debouncer
            .lock()
            .watcher()
            .watch(path, RecursiveMode::Recursive)?;
        self.watched.write().insert(path.to_path_buf());
        Ok(())
    }

    pub fn unwatch(&self, path: &Path) -> Result<()> {
        self.debouncer.lock().watcher().unwatch(path).ok();
        self.watched.write().remove(path);
        Ok(())
    }

    pub fn watched_paths(&self) -> Vec<PathBuf> {
        self.watched.read().iter().cloned().collect()
    }
}

fn convert(e: &DebouncedEvent) -> Vec<WatchEvent> {
    use notify::EventKind::*;
    let paths = e.event.paths.clone();
    match e.event.kind {
        Create(_) => paths.into_iter().map(WatchEvent::Created).collect(),
        Remove(_) => paths.into_iter().map(WatchEvent::Deleted).collect(),
        Modify(notify::event::ModifyKind::Name(_)) if paths.len() == 2 => {
            vec![WatchEvent::Renamed { from: paths[0].clone(), to: paths[1].clone() }]
        }
        // Some macOS/Finder operations emit single-path rename/name events.
        // Classify by current FS state: exists => modified/created-ish, missing => deleted.
        Modify(notify::event::ModifyKind::Name(_)) => paths
            .into_iter()
            .map(|p| {
                if p.exists() {
                    WatchEvent::Modified(p)
                } else {
                    WatchEvent::Deleted(p)
                }
            })
            .collect(),
        Modify(_) => paths.into_iter().map(WatchEvent::Modified).collect(),
        _ => vec![],
    }
}

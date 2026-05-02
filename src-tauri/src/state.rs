use std::sync::Arc;

use parking_lot::RwLock;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc::unbounded_channel;

use crate::core::{FileWatcher, Indexer, WatchEvent};
use crate::db::{AssetRepository, DatabasePool, PackRepository};
use crate::error::Result;
use crate::models::Settings;

pub struct AppState {
    pub db: Arc<DatabasePool>,
    pub asset_repo: Arc<AssetRepository>,
    pub pack_repo: Arc<PackRepository>,
    pub indexer: Arc<Indexer>,
    pub watcher: Arc<FileWatcher>,
    pub settings: Arc<RwLock<Settings>>,
    pub settings_path: std::path::PathBuf,
}

impl AppState {
    pub fn init(app: AppHandle) -> Result<Self> {
        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("stack"));
        std::fs::create_dir_all(&data_dir)?;

        // Load persisted settings or fall back to defaults
        let settings_path = data_dir.join("settings.json");
        let settings = if settings_path.exists() {
            std::fs::read_to_string(&settings_path)
                .ok()
                .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
                .unwrap_or_default()
        } else {
            Settings::default()
        };

        let db = DatabasePool::open(&data_dir.join("stack.db"))?;
        let asset_repo = Arc::new(AssetRepository::new(db.clone()));
        let pack_repo = Arc::new(PackRepository::new(db.clone()));

        let settings = Arc::new(RwLock::new(settings));
        let concurrency = settings.read().indexer_concurrency;

        let indexer = Indexer::spawn(
            db.clone(),
            asset_repo.clone(),
            pack_repo.clone(),
            app.clone(),
            concurrency,
        );

        // Watcher wires file events back into the indexer.
        let (watch_tx, mut watch_rx) = unbounded_channel::<WatchEvent>();
        let watcher = Arc::new(FileWatcher::new(watch_tx)?);

        {
            let indexer = indexer.clone();
            let asset_repo = asset_repo.clone();
            let pack_repo = pack_repo.clone();
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(evt) = watch_rx.recv().await {
                    match evt {
                        WatchEvent::Created(path) | WatchEvent::Modified(path) => {
                            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                if crate::core::scanner::classify(&ext.to_lowercase()).is_none() {
                                    continue;
                                }
                            } else {
                                continue;
                            }
                            indexer.enqueue(crate::core::IndexJob {
                                path,
                                priority: crate::core::JobPriority::Normal,
                                pack_root: None,
                            });
                        }
                        WatchEvent::Deleted(path) => {
                            let p = path.to_string_lossy().to_string();
                            let marked = asset_repo.mark_missing_under_path(&p).unwrap_or(0);
                            let _ = pack_repo.recount_all();
                            let _ = pack_repo.delete_empty_or_missing();
                            let _ = app_handle.emit(
                                "stack://asset-missing",
                                serde_json::json!({ "id": "", "path": p, "count": marked }),
                            );
                            tracing::info!("delete event {} -> marked missing: {}", p, marked);
                        }
                        WatchEvent::Renamed { from, to } => {
                            let from_path = from.to_string_lossy().to_string();
                            let marked = asset_repo.mark_missing_under_path(&from_path).unwrap_or(0);
                            let _ = pack_repo.recount_all();
                            let _ = pack_repo.delete_empty_or_missing();
                            let _ = app_handle.emit(
                                "stack://asset-missing",
                                serde_json::json!({ "id": "", "path": from_path, "count": marked }),
                            );
                            if let Some(ext) = to.extension().and_then(|e| e.to_str()) {
                                if crate::core::scanner::classify(&ext.to_lowercase()).is_some() {
                                    indexer.enqueue(crate::core::IndexJob {
                                        path: to,
                                        priority: crate::core::JobPriority::Normal,
                                        pack_root: None,
                                    });
                                }
                            }
                        }
                    }
                }
            });
        }

        // Re-attach watchers to previously-watched folders.
        for wf in pack_repo.list_watched()?.iter().filter(|w| w.is_active) {
            let p = std::path::PathBuf::from(&wf.path);
            if p.exists() {
                watcher.watch(&p).ok();
            }
        }

        Ok(Self {
            db,
            asset_repo,
            pack_repo,
            indexer,
            watcher,
            settings,
            settings_path,
        })
    }

    /// Persist current settings to disk.
    pub fn save_settings(&self) {
        let s = self.settings.read().clone();
        if let Ok(json) = serde_json::to_string_pretty(&s) {
            std::fs::write(&self.settings_path, json).ok();
        }
    }
}

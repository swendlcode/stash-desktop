use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::core::{tree, IndexJob, JobPriority, Reconciler, Scanner};
use crate::error::Result;
use crate::metadata::project_folder_parser;
use crate::models::{
    CategoryStat, CleanCacheReport, FolderInfo, HardCleanReport, Pack, ProjectInfo,
    ReconcileReport, ScanProgress, ScanStats, SubfolderSummary, TreeNode, WatchedFolder,
};
use crate::state::AppState;

#[tauri::command]
pub async fn scan_folder(path: String, state: State<'_, AppState>) -> Result<ScanStats> {
    let root = PathBuf::from(&path);
    let (files, stats) = tokio::task::spawn_blocking(move || Scanner::scan(&root))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    // For project-kind watched folders the *watched root itself* is the pack
    // root — every file under it belongs to one project pack. For sample-pack
    // folders we keep the existing one-level-deep heuristic so each sample
    // pack under the watched root becomes its own pack.
    let watched = state.pack_repo.list_watched()?;
    let watched_norm: Vec<(String, String)> = watched
        .iter()
        .map(|w| (normalize_path(&w.path), w.kind.clone()))
        .collect();
    let root_norm = normalize_path(&path);
    let is_project_root = watched_norm
        .iter()
        .any(|(p, k)| p == &root_norm && k == "project");

    let root = PathBuf::from(&path);
    let jobs: Vec<IndexJob> = files
        .into_iter()
        .map(|f| {
            let pack_root = if is_project_root {
                Some(root.clone())
            } else {
                Scanner::detect_pack_root(&f.path, &root)
            };
            IndexJob {
                pack_root,
                path: f.path,
                priority: JobPriority::High,
            }
        })
        .collect();

    state.indexer.enqueue_batch(jobs);
    Ok(stats)
}

fn normalize_path(p: &str) -> String {
    p.replace('\\', "/").trim_end_matches('/').to_string()
}

#[tauri::command]
pub async fn add_watched_folder(
    path: String,
    state: State<'_, AppState>,
) -> Result<WatchedFolder> {
    let now = unix_now();
    let folder = WatchedFolder {
        id: Uuid::new_v4().to_string(),
        path: path.clone(),
        is_active: true,
        added_at: now,
        kind: "pack".to_string(),
    };

    // ON CONFLICT(path) DO UPDATE SET is_active = 1 — safe to call even if already watched
    state.pack_repo.add_watched(&folder)?;

    // Clean up any stale assets under this path that were left from a previous
    // removal. This prevents duplicates when a folder is removed then re-added.
    // Assets with index_status = 'missing' are safe to delete — they're already gone.
    let asset_repo = state.asset_repo.clone();
    let path_clone = path.clone();
    tokio::task::spawn_blocking(move || asset_repo.delete_missing_under_path(&path_clone))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    let p = PathBuf::from(&path);
    if p.exists() {
        state.watcher.watch(&p).ok();
    }
    Ok(folder)
}

#[tauri::command]
pub async fn remove_watched_folder(id: String, state: State<'_, AppState>) -> Result<()> {
    let folders = state.pack_repo.list_watched()?;
    let removed_path = folders.iter().find(|w| w.id == id).map(|f| f.path.clone());

    if let Some(path) = removed_path {
        let p = PathBuf::from(&path);
        state.watcher.unwatch(&p).ok();

        // Delete assets first (also cleans FTS), then atomically remove packs +
        // watched_folder row in a single operation so no partial state is left
        // behind if the process is interrupted.
        let assets_deleted = state.asset_repo.delete_under_path(&path)?;
        let packs_deleted = state.pack_repo.remove_watched_with_packs(&id, &path)?;
        tracing::info!(
            "removed watched folder {}: -{} assets, -{} packs",
            path,
            assets_deleted,
            packs_deleted
        );
    } else {
        // Folder path not found — still remove the watched_folder row if it exists.
        state.pack_repo.remove_watched(&id)?;
    }

    // Secondary cleanup: remove any assets still marked 'missing' (e.g. from a
    // previous partial removal) and drop packs that are now empty or gone from disk.
    let asset_repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || {
        asset_repo.delete_missing().ok();
    })
    .await
    .ok();

    let pack_repo = state.pack_repo.clone();
    tokio::task::spawn_blocking(move || {
        pack_repo.recount_all().ok();
        pack_repo.delete_empty_or_missing().ok();
    })
    .await
    .ok();

    // If this was the last watched folder, do a full hard clean to ensure
    // the DB is completely empty and no stale data remains.
    let remaining = state.pack_repo.list_watched()?.len();
    if remaining == 0 {
        tracing::info!("last watched folder removed — running full cleanup");
        let asset_repo = state.asset_repo.clone();
        tokio::task::spawn_blocking(move || {
            asset_repo.delete_not_under_paths(&[]).ok();
        })
        .await
        .ok();

        let pack_repo = state.pack_repo.clone();
        tokio::task::spawn_blocking(move || {
            pack_repo.delete_not_under_paths(&[]).ok();
        })
        .await
        .ok();
    }

    // Reset indexer progress counters to clear stale "Indexed X files" display
    // and emit progress event to update the UI immediately
    state.indexer.reset_counters();
    state.indexer.emit_progress();

    Ok(())
}

#[tauri::command]
pub async fn add_project_folder(
    path: String,
    state: State<'_, AppState>,
) -> Result<WatchedFolder> {
    let now = unix_now();
    let folder = WatchedFolder {
        id: Uuid::new_v4().to_string(),
        path: path.clone(),
        is_active: true,
        added_at: now,
        kind: "project".to_string(),
    };
    state.pack_repo.add_watched(&folder)?;

    // Pre-create the pack row for this project root with parsed metadata so
    // the Projects page card can render before any file is indexed. The indexer
    // will skip pack creation when find_by_root returns a hit.
    let p = PathBuf::from(&path);
    let folder_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled Project")
        .to_string();
    let project_meta = project_folder_parser::parse(&folder_name);

    let pack = Pack {
        id: Uuid::new_v4().to_string(),
        name: folder_name,
        root_path: path.clone(),
        vendor: None,
        genre: None,
        color: None,
        asset_count: 0,
        added_at: now,
        updated_at: now,
        kind: "project".to_string(),
        project_meta: Some(project_meta),
    };
    state.pack_repo.upsert(&pack)?;

    // Reuse the same stale-asset cleanup path so re-adding a previously removed
    // project folder doesn't surface ghost rows.
    let asset_repo = state.asset_repo.clone();
    let path_clone = path.clone();
    tokio::task::spawn_blocking(move || asset_repo.delete_missing_under_path(&path_clone))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    if p.exists() {
        state.watcher.watch(&p).ok();
    }
    Ok(folder)
}

#[tauri::command]
pub async fn get_watched_folders(state: State<'_, AppState>) -> Result<Vec<WatchedFolder>> {
    state.pack_repo.list_watched()
}

#[tauri::command]
pub async fn cancel_scan(state: State<'_, AppState>) -> Result<()> {
    state.indexer.cancel();
    Ok(())
}

#[tauri::command]
pub async fn get_scan_progress(state: State<'_, AppState>) -> Result<ScanProgress> {
    Ok(state.indexer.progress())
}

#[tauri::command]
pub async fn run_reconciliation(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ReconcileReport> {
    // Reset indexer counters so any leftover state from a previous scan
    // doesn't bleed into the reconciliation progress display.
    state.indexer.reset_counters();

    let asset_repo = state.asset_repo.clone();
    let pack_repo = state.pack_repo.clone();
    let indexer = state.indexer.clone();
    let report = Reconciler::run(asset_repo, pack_repo, indexer).await?;
    let _ = app.emit("stack://reconcile-complete", &report);
    Ok(report)
}

#[tauri::command]
pub async fn clean_cache(state: State<'_, AppState>) -> Result<CleanCacheReport> {
    let asset_repo = state.asset_repo.clone();
    let pack_repo = state.pack_repo.clone();

    let missing_deleted = tokio::task::spawn_blocking(move || asset_repo.delete_missing())
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    let pack_repo_clone = pack_repo.clone();
    tokio::task::spawn_blocking(move || pack_repo_clone.recount_all())
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    let packs_deleted = tokio::task::spawn_blocking(move || pack_repo.delete_empty_or_missing())
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    // Reset indexer progress counters to clear stale "Indexed X files" display
    // and emit progress event to update the UI immediately
    state.indexer.reset_counters();
    state.indexer.emit_progress();

    Ok(CleanCacheReport {
        missing_deleted,
        packs_deleted,
    })
}

#[tauri::command]
pub async fn hard_clean_cache(state: State<'_, AppState>) -> Result<HardCleanReport> {
    let watched = state.pack_repo.list_watched()?;
    let roots: Vec<String> = watched.into_iter().map(|w| w.path).collect();

    let asset_repo = state.asset_repo.clone();
    let pack_repo = state.pack_repo.clone();
    let roots_for_assets = roots.clone();
    let roots_for_packs = roots.clone();

    let (assets_result, packs_result) = tokio::join!(
        tokio::task::spawn_blocking(move || asset_repo.delete_not_under_paths(&roots_for_assets)),
        tokio::task::spawn_blocking(move || pack_repo.delete_not_under_paths(&roots_for_packs)),
    );
    let assets_deleted = assets_result
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;
    let packs_deleted = packs_result
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    let pack_repo_recount = state.pack_repo.clone();
    tokio::task::spawn_blocking(move || pack_repo_recount.recount_all())
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    // Reset indexer progress counters to clear stale "Indexed X files" display
    // and emit progress event to update the UI immediately
    state.indexer.reset_counters();
    state.indexer.emit_progress();

    Ok(HardCleanReport {
        assets_deleted,
        packs_deleted,
    })
}

#[tauri::command]
pub async fn get_library_tree(state: State<'_, AppState>) -> Result<Vec<TreeNode>> {
    let watched = state.pack_repo.list_watched()?;
    let asset_repo = state.asset_repo.clone();
    let paths = tokio::task::spawn_blocking(move || asset_repo.all_active_paths())
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;
    Ok(tree::build(&watched, &paths))
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub async fn get_folder_info(path: String, state: State<'_, AppState>) -> Result<FolderInfo> {
    let root = PathBuf::from(&path);

    // Disk traversal and DB count are independent — run them concurrently
    let asset_repo = state.asset_repo.clone();
    let path_clone = path.clone();
    let (walk_result, count_result) = tokio::join!(
        tokio::task::spawn_blocking(move || {
            let mut size: u64 = 0;
            let mut count: u64 = 0;
            for entry in walkdir::WalkDir::new(&root).follow_links(false) {
                if let Ok(e) = entry {
                    if e.file_type().is_file() {
                        size += e.metadata().map(|m| m.len()).unwrap_or(0);
                        count += 1;
                    }
                }
            }
            (size, count)
        }),
        tokio::task::spawn_blocking(move || asset_repo.count_under_path(&path_clone)),
    );
    let (total_size_bytes, file_count) =
        walk_result.map_err(|e| crate::error::StackError::Other(e.to_string()))?;
    let asset_count =
        count_result.map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    Ok(FolderInfo {
        path,
        total_size_bytes,
        file_count,
        asset_count,
    })
}

#[tauri::command]
pub async fn move_library_folder(
    from_path: String,
    to_parent_path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<()> {
    let from = PathBuf::from(&from_path);
    let to_parent = PathBuf::from(&to_parent_path);

    if !from.is_dir() {
        return Err(crate::error::StackError::Other(format!(
            "Source folder does not exist: {}",
            from_path
        )));
    }
    if !to_parent.is_dir() {
        return Err(crate::error::StackError::Other(format!(
            "Destination folder does not exist: {}",
            to_parent_path
        )));
    }

    let folder_name = from
        .file_name()
        .ok_or_else(|| crate::error::StackError::Other("Invalid source folder".into()))?;
    let destination = to_parent.join(folder_name);

    if destination == from {
        return Ok(());
    }
    if destination.exists() {
        return Err(crate::error::StackError::Other(format!(
            "Destination already exists: {}",
            destination.display()
        )));
    }
    if destination.starts_with(&from) {
        return Err(crate::error::StackError::Other(
            "Cannot move a folder into itself".into(),
        ));
    }

    let from_clone = from.clone();
    let destination_clone = destination.clone();
    tokio::task::spawn_blocking(move || std::fs::rename(&from_clone, &destination_clone))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?;

    let report = Reconciler::run(
        state.asset_repo.clone(),
        state.pack_repo.clone(),
        state.indexer.clone(),
    )
    .await?;
    let _ = app.emit("stack://reconcile-complete", &report);

    Ok(())
}

#[tauri::command]
pub async fn get_project_info(path: String) -> Result<ProjectInfo> {
    let root = PathBuf::from(&path);
    tokio::task::spawn_blocking(move || compute_project_info(root))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

fn compute_project_info(root: PathBuf) -> Result<ProjectInfo> {
    let mut info = ProjectInfo {
        path: root.to_string_lossy().to_string(),
        total_size_bytes: 0,
        file_count: 0,
        audio: CategoryStat::default(),
        midi: CategoryStat::default(),
        preset: CategoryStat::default(),
        project: CategoryStat::default(),
        video: CategoryStat::default(),
        image: CategoryStat::default(),
        other: CategoryStat::default(),
        backup_count: 0,
        backup_size_bytes: 0,
        subfolders: Vec::new(),
    };
    if !root.is_dir() {
        return Ok(info);
    }

    use std::collections::BTreeMap;
    let mut subfolder_stats: BTreeMap<String, (u64, u64, PathBuf)> = BTreeMap::new();

    for entry in walkdir::WalkDir::new(&root).follow_links(false) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let path = entry.path();
        info.total_size_bytes += size;
        info.file_count += 1;

        let stat = match category_for(path) {
            Category::Audio => &mut info.audio,
            Category::Midi => &mut info.midi,
            Category::Preset => &mut info.preset,
            Category::Project => &mut info.project,
            Category::Video => &mut info.video,
            Category::Image => &mut info.image,
            Category::Other => &mut info.other,
        };
        stat.count += 1;
        stat.size_bytes += size;

        if is_backup(path) {
            info.backup_count += 1;
            info.backup_size_bytes += size;
        }

        // Track totals per top-level subfolder.
        if let Ok(rel) = path.strip_prefix(&root) {
            let mut parts = rel.components();
            if let Some(first) = parts.next() {
                let name = first.as_os_str().to_string_lossy().to_string();
                // Only count the entry if it has at least one more path component
                // (i.e. lives *inside* the subfolder, not at the root level).
                if parts.next().is_some() {
                    let entry =
                        subfolder_stats.entry(name.clone()).or_insert_with(|| {
                            (0, 0, root.join(first.as_os_str()))
                        });
                    entry.0 += 1;
                    entry.1 += size;
                }
            }
        }
    }

    let mut subfolders: Vec<SubfolderSummary> = subfolder_stats
        .into_iter()
        .map(|(name, (count, size, path))| SubfolderSummary {
            name,
            path: path.to_string_lossy().to_string(),
            file_count: count,
            size_bytes: size,
        })
        .collect();
    subfolders.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    info.subfolders = subfolders;

    Ok(info)
}

enum Category {
    Audio,
    Midi,
    Preset,
    Project,
    Video,
    Image,
    Other,
}

fn category_for(path: &std::path::Path) -> Category {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "wav" | "mp3" | "flac" | "ogg" | "aif" | "aiff" | "m4a" => Category::Audio,
        "mid" | "midi" => Category::Midi,
        "fxp" | "fxb" | "vstpreset" | "serumpreset" | "nmsv" | "nksf" | "h2p" | "h2pmap"
        | "spf" | "syl1" | "vital" | "pigments" => Category::Preset,
        "flp" | "als" | "logicx" | "cpr" | "ptx" | "rpp" | "reason" | "song" | "mmpz" | "mmp"
        | "bwproject" | "xrns" | "cwp" | "dawproject" | "prproj" => Category::Project,
        "mp4" | "mov" | "mkv" | "avi" | "webm" | "m4v" => Category::Video,
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "psd" | "tif" | "tiff" => Category::Image,
        _ => Category::Other,
    }
}

fn is_backup(path: &std::path::Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if name.contains("autosaved") || name.contains("overwritten") {
        return true;
    }
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy().to_ascii_lowercase();
        s == "backup" || s == "backups" || s.contains("auto-save") || s.contains("auto save")
    })
}

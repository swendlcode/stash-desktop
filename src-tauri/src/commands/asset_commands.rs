use std::path::PathBuf;

use tauri::{AppHandle, Emitter, State};

use crate::error::Result;
use crate::metadata::audio_analyzer;
use crate::models::{Asset, FacetCounts, MidiNote, SearchQuery, SearchResult};
use crate::state::AppState;

#[tauri::command]
pub async fn search_assets(
    query: SearchQuery,
    state: State<'_, AppState>,
) -> Result<SearchResult> {
    let repo = state.asset_repo.clone();
    let filters = query.filters.clone();
    tokio::task::spawn_blocking(move || {
        let assets = repo.search(&query)?;
        let total = repo.count(&filters)?;
        Ok(SearchResult { assets, total })
    })
    .await
    .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_asset(id: String, state: State<'_, AppState>) -> Result<Option<Asset>> {
    let repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || repo.get_by_id(&id))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn asset_exists(id: String, state: State<'_, AppState>) -> Result<bool> {
    let repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || {
        match repo.get_by_id(&id) {
            Ok(Some(_)) => Ok(true),
            Ok(None) => Ok(false),
            Err(_) => Ok(false), // If there's an error, assume it doesn't exist
        }
    })
    .await
    .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn toggle_favorite(id: String, state: State<'_, AppState>) -> Result<bool> {
    let repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || repo.toggle_favorite(&id))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn add_tag(id: String, tag: String, state: State<'_, AppState>) -> Result<()> {
    let repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || repo.add_tag(&id, &tag))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn remove_tag(id: String, tag: String, state: State<'_, AppState>) -> Result<()> {
    let repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || repo.remove_tag(&id, &tag))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn increment_play_count(id: String, state: State<'_, AppState>) -> Result<()> {
    let repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || repo.increment_play_count(&id))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_waveform(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<f32>> {
    let repo = state.asset_repo.clone();

    // Fetch path and cached waveform in a single round-trip
    let id_clone = id.clone();
    let row = tokio::task::spawn_blocking(move || repo.get_path_and_waveform(&id_clone))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    let Some((asset_path, cached_waveform)) = row else {
        return Ok(vec![]);
    };

    if let Some(w) = cached_waveform {
        return Ok(w);
    }

    // Analyze audio — handles all sample formats (u8/u16/u24/u32/s8/s16/s24/s32/f32/f64)
    let path = PathBuf::from(&asset_path);
    let path_str = asset_path.clone();

    let analysis = match tokio::task::spawn_blocking(move || audio_analyzer::analyze(&path)).await {
        Ok(Ok(a)) => a,
        Ok(Err(e)) => {
            // File may have been deleted externally between list/render and waveform request.
            // Mark it missing and avoid noisy warnings for expected races.
            let msg = e.to_string().to_lowercase();
            if msg.contains("no such file or directory") || msg.contains("os error 2") {
                let repo = state.asset_repo.clone();
                let path_for_mark = path_str.clone();
                let marked = tokio::task::spawn_blocking(move || repo.mark_missing_under_path(&path_for_mark))
                    .await
                    .ok()
                    .and_then(|r| r.ok())
                    .unwrap_or(1);
                let _ = app.emit(
                    "stack://asset-missing",
                    serde_json::json!({ "id": id, "path": path_str, "count": marked }),
                );
                tracing::debug!("waveform skipped (file missing): {}", path_str);
                return Ok(vec![]);
            }
            tracing::warn!("waveform analysis failed for {}: {}", path_str, e);
            return Ok(vec![]);
        }
        Err(e) => {
            tracing::warn!("waveform task panicked for {}: {}", path_str, e);
            return Ok(vec![]);
        }
    };

    // Persist to DB so next request is instant
    let repo = state.asset_repo.clone();
    let id_clone = id.clone();
    let waveform = analysis.waveform.clone();
    tokio::task::spawn_blocking(move || repo.set_waveform(&id_clone, &waveform))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

    // Notify frontend so any other open viewers update immediately
    let _ = app.emit(
        "stack://waveform-ready",
        serde_json::json!({ "id": id, "data": analysis.waveform }),
    );

    tracing::debug!(
        "waveform ready: {} bars for {} ({})",
        analysis.waveform.len(),
        id,
        path_str
    );
    Ok(analysis.waveform)
}

#[tauri::command]
pub async fn get_midi_notes(id: String, state: State<'_, AppState>) -> Result<Vec<MidiNote>> {
    let repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || repo.get_midi_notes(&id))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_facet_counts(
    filters: crate::models::AssetFilters,
    state: State<'_, AppState>,
) -> Result<FacetCounts> {
    let repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || repo.get_facet_counts(&filters))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

/// Find assets similar to the given asset.
/// Matches on: same BPM (±5), same key, same texture tag, same instrument.
/// Returns up to `limit` results, excluding the source asset itself.
#[tauri::command]
pub async fn find_similar(
    id: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<Asset>> {
    let repo = state.asset_repo.clone();
    tokio::task::spawn_blocking(move || {
        let asset = repo.get_by_id(&id)?;
        let Some(asset) = asset else {
            return Ok(vec![]);
        };
        repo.find_similar(&asset, limit.unwrap_or(20))
    })
    .await
    .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

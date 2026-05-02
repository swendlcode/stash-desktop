use tauri::State;

use crate::error::Result;
use crate::state::AppState;

/// Return the asset path so the frontend can stream via the Tauri asset protocol
/// or load as a blob. Audio decoding happens in the browser's Web Audio API.
#[tauri::command]
pub async fn decode_audio(id: String, state: State<'_, AppState>) -> Result<String> {
    let repo = state.asset_repo.clone();
    let lookup_id = id.clone();
    let asset = tokio::task::spawn_blocking(move || repo.get_by_id(&lookup_id))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;
    let asset = asset.ok_or_else(|| crate::error::StackError::NotFound(id))?;
    Ok(asset.path)
}

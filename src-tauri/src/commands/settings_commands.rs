use tauri::State;
use tauri_plugin_autostart::ManagerExt;

use crate::error::Result;
use crate::models::Settings;
use crate::state::AppState;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings> {
    Ok(state.settings.read().clone())
}

#[tauri::command]
pub async fn update_settings(
    settings: Settings,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Settings> {
    let prev = state.settings.read().clone();

    {
        let mut guard = state.settings.write();
        *guard = settings.clone();
    }

    // Persist to disk immediately
    state.save_settings();

    // ── Apply settings that have live runtime effects ──────────────────────

    // Indexer concurrency — takes effect on the next job dispatch
    if settings.indexer_concurrency != prev.indexer_concurrency {
        state.indexer.set_concurrency(settings.indexer_concurrency);
    }

    // File watcher — start or stop based on watchForChanges
    if settings.watch_for_changes != prev.watch_for_changes {
        let watched = state.pack_repo.list_watched().unwrap_or_default();
        for wf in watched.iter().filter(|w| w.is_active) {
            let p = std::path::PathBuf::from(&wf.path);
            if settings.watch_for_changes {
                state.watcher.watch(&p).ok();
            } else {
                state.watcher.unwatch(&p).ok();
            }
        }
    }

    // Launch at startup — sync with OS
    if settings.launch_at_startup != prev.launch_at_startup {
        let autostart = app.autolaunch();
        if settings.launch_at_startup {
            autostart.enable().ok();
        } else {
            autostart.disable().ok();
        }
    }

    Ok(settings)
}

/// Read the real OS autostart state and sync it into settings.
/// Called once on startup so the toggle reflects reality.
#[tauri::command]
pub async fn sync_autostart(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<bool> {
    let enabled = app.autolaunch().is_enabled().unwrap_or(false);
    state.settings.write().launch_at_startup = enabled;
    state.save_settings();
    Ok(enabled)
}

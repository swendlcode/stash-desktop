use tauri::{AppHandle, Manager};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;

const ARTWORK_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp"];
const LEGACY_COVER_NAMES: &[&str] = &[
    "folder.jpg", "folder.jpeg", "folder.png", "folder.webp",
    "cover.jpg", "cover.jpeg", "cover.png", "cover.webp",
    "artwork.jpg", "artwork.jpeg", "artwork.png",
];

/// Returns an absolute path to a PNG used as the visual preview during a
/// native file drag-out. The icon is embedded at compile time and extracted
/// to the app data directory on first call, so the path is valid in both
/// dev and bundled runs.
#[tauri::command]
pub async fn get_drag_icon(app: AppHandle) -> Result<String, String> {
    get_default_drag_icon(&app)
}

#[tauri::command]
pub async fn get_drag_icon_for_pack(app: AppHandle, pack_root: String) -> Result<String, String> {
    let root = PathBuf::from(pack_root);
    if let Some(cover) = find_pack_cover_for_drag(&root) {
        if let Ok(icon) = ensure_small_drag_icon(&app, &cover) {
            return Ok(icon);
        }
        return Ok(cover.to_string_lossy().into_owned());
    }
    get_default_drag_icon(&app)
}

fn get_default_drag_icon(app: &AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let icon_path = dir.join("drag-icon.png");
    if !icon_path.exists() {
        let bytes: &[u8] = include_bytes!("../../icons/32x32.png");
        std::fs::write(&icon_path, bytes).map_err(|e| e.to_string())?;
    }

    Ok(icon_path.to_string_lossy().into_owned())
}

fn find_pack_cover_for_drag(root: &Path) -> Option<PathBuf> {
    for ext in ARTWORK_EXTS {
        let candidate = root.join(".stack").join(format!("cover.{}", ext));
        if candidate.exists() {
            return Some(candidate);
        }
    }
    for name in LEGACY_COVER_NAMES {
        let candidate = root.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn ensure_small_drag_icon(app: &AppHandle, source: &Path) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut hasher = DefaultHasher::new();
    source.to_string_lossy().hash(&mut hasher);
    let hash = hasher.finish();
    let target = dir.join(format!("drag-pack-icon-{}.png", hash));

    if target.exists() {
        return Ok(target.to_string_lossy().into_owned());
    }

    // macOS: generate a compact thumbnail so drag preview isn't huge.
    let output = Command::new("sips")
        .arg("-z")
        .arg("48")
        .arg("48")
        .arg(source)
        .arg("--out")
        .arg(&target)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(target.to_string_lossy().into_owned())
}

/// Writes a rendered WAV (or other container) blob to the app cache directory
/// under `exports/` and returns its absolute path. Used by the sample editor's
/// drag-to-DAW — after offline-rendering the current edit, the frontend hands
/// us the bytes + desired filename and we materialize a real file the DAW can
/// consume via the native drag-out.
#[tauri::command]
pub async fn save_export(
    app: AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let base = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let dir = base.join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let safe: String = filename
        .chars()
        .map(|c| if c.is_alphanumeric() || "._- ".contains(c) { c } else { '_' })
        .collect();
    let target = dir.join(safe);
    std::fs::write(&target, &bytes).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::core::{IndexJob, JobPriority, Scanner};
use crate::error::{Result, StackError};
use crate::models::{Asset, Pack};
use crate::state::AppState;

/// Legacy top-level cover filenames to fall back to when no user-set artwork exists.
const LEGACY_COVER_NAMES: &[&str] = &[
    "folder.jpg", "folder.jpeg", "folder.png", "folder.webp",
    "cover.jpg",  "cover.jpeg",  "cover.png",  "cover.webp",
    "artwork.jpg","artwork.jpeg","artwork.png",
];

/// Supported user-set artwork extensions. The user-set cover is stored as
/// `<pack_root>/.stack/cover.<ext>` — the `.stack/` dir is hidden and the
/// scanner already skips dotfiles so it stays out of the index.
const ARTWORK_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp"];

const STASH_DIR: &str = ".stack";
const PACK_META_FILE: &str = "pack.json";
const MAX_ARTWORK_BYTES: usize = 8 * 1024 * 1024;

fn stack_dir(pack_root: &Path) -> PathBuf {
    pack_root.join(STASH_DIR)
}

fn find_user_cover(pack_root: &Path) -> Option<PathBuf> {
    let dir = stack_dir(pack_root);
    for ext in ARTWORK_EXTS {
        let candidate = dir.join(format!("cover.{}", ext));
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn ext_from_mime(mime: &str) -> Option<&'static str> {
    match mime.to_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackMeta {
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub updated_at: i64,
}

/// Return the absolute path of the pack's cover image, in priority order:
///   1. user-set artwork under `<root>/.stack/cover.{ext}`
///   2. legacy top-level names (folder.jpg / cover.jpg / artwork.png ...)
///   3. nested locations producers commonly use (Cover/Cover.jpg,
///      Cover/1x1/Cover.png, Artwork/Artwork.png, ...). Case-insensitive.
/// Returns `None` if no image exists.
#[tauri::command]
pub async fn get_pack_cover(pack_root: String) -> Result<Option<String>> {
    let root = PathBuf::from(&pack_root);
    if let Some(user) = find_user_cover(&root) {
        return Ok(Some(user.to_string_lossy().to_string()));
    }
    for name in LEGACY_COVER_NAMES {
        let candidate = root.join(name);
        if candidate.exists() {
            return Ok(Some(candidate.to_string_lossy().to_string()));
        }
    }
    if let Some(nested) = find_nested_cover(&root) {
        return Ok(Some(nested.to_string_lossy().to_string()));
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(finder) = export_macos_finder_icon(&root) {
            return Ok(Some(finder.to_string_lossy().to_string()));
        }
    }
    Ok(None)
}

/// Subfolder names (case-insensitive) where producers often stack a cover.
const COVER_DIR_NAMES: &[&str] = &["cover", "covers", "artwork", "art", "images"];
/// Sub-subfolder names (case-insensitive) under a cover dir — common aspect
/// ratio buckets like `1x1`, `square`, `16x9`.
const COVER_ASPECT_DIRS: &[&str] = &["1x1", "square", "1_1", "1-1", "16x9", "16_9", "16-9"];
/// Filename stems (case-insensitive) we accept for a cover image.
const COVER_STEMS: &[&str] = &[
    "cover", "covers", "artwork", "art", "folder", "image", "thumb", "thumbnail",
];

/// Walk one level into common cover directories, plus a second hop into
/// aspect-ratio subdirs, looking for a recognizable cover file. Bounded:
/// only directories matching COVER_DIR_NAMES are entered.
fn find_nested_cover(root: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;
    let dirs: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| COVER_DIR_NAMES.iter().any(|d| d.eq_ignore_ascii_case(n)))
                .unwrap_or(false)
        })
        .collect();

    for dir in &dirs {
        if let Some(found) = find_cover_in_dir(dir) {
            return Some(found);
        }
        // Hop into aspect-ratio buckets.
        if let Ok(children) = fs::read_dir(dir) {
            for child in children.flatten() {
                let p = child.path();
                if !p.is_dir() {
                    continue;
                }
                let name = match p.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n,
                    None => continue,
                };
                if COVER_ASPECT_DIRS.iter().any(|d| d.eq_ignore_ascii_case(name)) {
                    if let Some(found) = find_cover_in_dir(&p) {
                        return Some(found);
                    }
                }
            }
        }
    }
    None
}

/// Inside one directory, return the first file whose stem matches COVER_STEMS
/// and whose extension is a supported image format. Case-insensitive on both.
fn find_cover_in_dir(dir: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_lowercase(),
            None => continue,
        };
        if !COVER_STEMS.iter().any(|s| *s == stem.as_str()) {
            continue;
        }
        let ext = match path.extension().and_then(|e| e.to_str()) {
            Some(e) => e.to_lowercase(),
            None => continue,
        };
        if ARTWORK_EXTS.iter().any(|e| *e == ext.as_str()) {
            return Some(path);
        }
    }
    None
}

/// Write base64-encoded image bytes as the pack's cover art. Replaces any
/// existing `.stack/cover.*` and creates `.stack/` if needed. On macOS this
/// also applies the image as the folder's Finder icon.
#[tauri::command]
pub async fn set_pack_artwork(
    pack_root: String,
    data_base64: String,
    mime: String,
) -> Result<String> {
    let bytes = B64
        .decode(data_base64.as_bytes())
        .map_err(|e| StackError::Other(format!("invalid base64 artwork data: {}", e)))?;

    if bytes.len() > MAX_ARTWORK_BYTES {
        return Err(StackError::Other(format!(
            "artwork too large: {} bytes (max {})",
            bytes.len(),
            MAX_ARTWORK_BYTES
        )));
    }
    let ext = ext_from_mime(&mime)
        .or_else(|| sniff_ext(&bytes))
        .ok_or_else(|| StackError::Other(format!("unsupported image mime type: {}", mime)))?;

    let root = PathBuf::from(&pack_root);
    if !root.exists() {
        return Err(StackError::NotFound(format!("pack root {}", pack_root)));
    }
    let dir = stack_dir(&root);
    fs::create_dir_all(&dir).map_err(StackError::from)?;

    for other in ARTWORK_EXTS {
        let p = dir.join(format!("cover.{}", other));
        if p.exists() {
            let _ = fs::remove_file(p);
        }
    }

    let target = dir.join(format!("cover.{}", ext));
    fs::write(&target, &bytes).map_err(StackError::from)?;

    #[cfg(target_os = "macos")]
    {
        if let Err(e) = apply_macos_folder_icon(&root, Some(&target)) {
            tracing::warn!("failed to set macOS folder icon: {}", e);
        }
    }

    // Propagate the cover to every descendant folder — so applying artwork
    // to a top-level pack automatically distributes it down to the last
    // leaf. Descendants that already have their own `.stack/cover.*` are
    // left alone so a user-customized child isn't overwritten.
    if let Err(e) = propagate_cover_to_descendants(&root, ext, &bytes) {
        tracing::warn!("failed to propagate cover to descendants: {}", e);
    }

    Ok(target.to_string_lossy().to_string())
}

/// Walks every subdirectory under `root` and writes the same cover bytes
/// into each descendant's `.stack/cover.<ext>`, overwriting any existing
/// cover on those descendants so the newly uploaded artwork always wins.
/// Skips:
///   - the root itself (already written above)
///   - any directory whose name starts with '.' (hidden / .stack)
/// On macOS each descendant also gets the Finder icon applied.
fn propagate_cover_to_descendants(
    root: &Path,
    ext: &'static str,
    bytes: &[u8],
) -> std::io::Result<()> {
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if !ft.is_dir() { continue; }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
            // Skip hidden / internal dirs (including our own `.stack`).
            if name.starts_with('.') { continue; }

            // Always overwrite — the parent upload takes precedence.
            write_child_cover(&path, ext, bytes);
            stack.push(path);
        }
    }
    Ok(())
}

fn write_child_cover(child: &Path, ext: &'static str, bytes: &[u8]) {
    let dir = stack_dir(child);
    if fs::create_dir_all(&dir).is_err() { return; }
    // Clear any stale alternate-extension covers so only one exists.
    for other in ARTWORK_EXTS {
        let p = dir.join(format!("cover.{}", other));
        if p.exists() { let _ = fs::remove_file(p); }
    }
    let target = dir.join(format!("cover.{}", ext));
    if fs::write(&target, bytes).is_err() { return; }

    #[cfg(target_os = "macos")]
    {
        if let Err(e) = apply_macos_folder_icon(child, Some(&target)) {
            tracing::warn!("propagate: macOS folder icon failed for {}: {}", child.display(), e);
        }
    }
}

/// Remove any user-set `.stack/cover.*`. Leaves legacy top-level covers alone.
/// On macOS, also strips the folder's custom Finder icon.
#[tauri::command]
pub async fn clear_pack_artwork(pack_root: String) -> Result<()> {
    let root = PathBuf::from(&pack_root);
    let dir = stack_dir(&root);
    if dir.exists() {
        for ext in ARTWORK_EXTS {
            let p = dir.join(format!("cover.{}", ext));
            if p.exists() {
                let _ = fs::remove_file(p);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Err(e) = apply_macos_folder_icon(&root, None) {
            tracing::warn!("failed to clear macOS folder icon: {}", e);
        }
    }

    Ok(())
}

/// Infer image extension from the first bytes when the mime type is missing.
fn sniff_ext(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 8 && &bytes[..8] == b"\x89PNG\r\n\x1a\n" {
        Some("png")
    } else if bytes.len() >= 3 && &bytes[..3] == b"\xff\xd8\xff" {
        Some("jpg")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

/// Ask Finder (via `osascript` + NSWorkspace) to apply `image_path` as the
/// custom icon on `folder`. If `image_path` is `None`, clears the icon.
///
/// macOS stores custom folder icons in the resource fork (`Icon\r` sidecar +
/// `kHasCustomIcon` FinderFlag). Writing our PNG alone doesn't do that —
/// NSWorkspace::setIcon:forFile:options: handles the whole dance.
#[cfg(target_os = "macos")]
fn apply_macos_folder_icon(folder: &Path, image_path: Option<&Path>) -> std::io::Result<()> {
    use std::process::Command;

    let script = r#"
ObjC.import('AppKit');
function run(argv) {
  var folderPath = argv[0];
  var imagePath = argv[1];
  var img = $();
  if (imagePath && imagePath.length > 0) {
    img = $.NSImage.alloc.initWithContentsOfFile(imagePath);
    if (img.isNil()) return 'failed-to-load-image';
  }
  var ok = $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, folderPath, 0);
  return ok ? 'ok' : 'setIcon-failed';
}
"#;

    let folder_str = folder.to_string_lossy().to_string();
    let image_str = image_path
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let output = Command::new("osascript")
        .arg("-l")
        .arg("JavaScript")
        .arg("-e")
        .arg(script)
        .arg(folder_str)
        .arg(image_str)
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("osascript failed: {}", stderr.trim()),
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout != "ok" {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("osascript reported: {}", stdout),
        ));
    }
    Ok(())
}

/// If `folder` has a custom Finder icon (the user dragged an image onto it
/// via Get Info), export it to `<folder>/.stack/finder-icon.png` and return
/// that path. Returns `None` if no custom icon is set or the export fails.
///
/// We detect "has custom icon" via the `Icon\r` sidecar + `kHasCustomIcon`
/// Finder flag — `iconForFile:` always returns *something*, so we have to
/// gate on the flag, otherwise every folder would render the generic icon.
/// The exported PNG is cached and only re-written when the source mtime is
/// newer than the cached file.
#[cfg(target_os = "macos")]
fn export_macos_finder_icon(folder: &Path) -> Option<PathBuf> {
    use std::process::Command;

    let icon_sidecar = folder.join("Icon\r");
    if !icon_sidecar.exists() {
        return None;
    }

    let dir = stack_dir(folder);
    if fs::create_dir_all(&dir).is_err() {
        return None;
    }
    let target = dir.join("finder-icon.png");

    let src_mtime = fs::metadata(&icon_sidecar)
        .and_then(|m| m.modified())
        .ok();
    let cached_mtime = fs::metadata(&target)
        .and_then(|m| m.modified())
        .ok();
    if let (Some(src), Some(cached)) = (src_mtime, cached_mtime) {
        if cached >= src {
            return Some(target);
        }
    }

    let script = r#"
ObjC.import('AppKit');
function run(argv) {
  var folderPath = argv[0];
  var outPath = argv[1];
  var img = $.NSWorkspace.sharedWorkspace.iconForFile(folderPath);
  if (img.isNil()) return 'no-icon';
  // Resize the image to its largest underlying representation so the PNG is sharp.
  var reps = img.representations;
  var bestW = 0, bestH = 0;
  for (var i = 0; i < reps.count; i++) {
    var r = reps.objectAtIndex(i);
    if (r.pixelsWide > bestW) bestW = r.pixelsWide;
    if (r.pixelsHigh > bestH) bestH = r.pixelsHigh;
  }
  if (bestW < 16) { bestW = 512; bestH = 512; }
  img.setSize($.NSMakeSize(bestW, bestH));
  var tiff = img.TIFFRepresentation;
  if (tiff.isNil()) return 'no-tiff';
  var bitmap = $.NSBitmapImageRep.alloc.initWithData(tiff);
  if (bitmap.isNil()) return 'no-bitmap';
  var data = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
  if (data.isNil()) return 'no-data';
  var ok = data.writeToFileAtomically(outPath, true);
  return ok ? 'ok' : 'write-failed';
}
"#;

    let output = Command::new("osascript")
        .arg("-l")
        .arg("JavaScript")
        .arg("-e")
        .arg(script)
        .arg(folder.to_string_lossy().to_string())
        .arg(target.to_string_lossy().to_string())
        .output()
        .ok()?;

    if !output.status.success() {
        tracing::warn!(
            "export_macos_finder_icon: osascript failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout != "ok" {
        tracing::warn!("export_macos_finder_icon: {}", stdout);
        return None;
    }
    Some(target)
}

#[tauri::command]
pub async fn get_pack_description(pack_root: String) -> Result<String> {
    let path = stack_dir(&PathBuf::from(&pack_root)).join(PACK_META_FILE);
    if !path.exists() {
        return Ok(String::new());
    }
    let raw = fs::read_to_string(&path).map_err(StackError::from)?;
    let meta: PackMeta = serde_json::from_str(&raw).unwrap_or_default();
    Ok(meta.description)
}

#[tauri::command]
pub async fn set_pack_description(pack_root: String, description: String) -> Result<()> {
    let root = PathBuf::from(&pack_root);
    if !root.exists() {
        return Err(StackError::NotFound(format!("pack root {}", pack_root)));
    }
    let dir = stack_dir(&root);
    fs::create_dir_all(&dir).map_err(StackError::from)?;

    let path = dir.join(PACK_META_FILE);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let meta = PackMeta {
        description,
        updated_at: now,
    };
    let serialized = serde_json::to_string_pretty(&meta)
        .map_err(|e| StackError::Other(e.to_string()))?;
    fs::write(&path, serialized).map_err(StackError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn get_packs(state: State<'_, AppState>) -> Result<Vec<Pack>> {
    let repo = state.pack_repo.clone();
    tokio::task::spawn_blocking(move || repo.list())
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_pack(id: String, state: State<'_, AppState>) -> Result<Pack> {
    let repo = state.pack_repo.clone();
    tokio::task::spawn_blocking(move || repo.get(&id))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

/// Delete a pack and all its assets from the database.
/// Does NOT re-scan — deletion means remove from the library.
/// Use rescan_pack separately if you want to re-index.
#[tauri::command]
pub async fn delete_pack(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<()> {
    // Fetch the pack so we know its root_path before deleting
    let pack = {
        let repo = state.pack_repo.clone();
        let id2 = id.clone();
        tokio::task::spawn_blocking(move || repo.get(&id2))
            .await
            .map_err(|e| crate::error::StackError::Other(e.to_string()))??
    };

    let root_path = pack.root_path.clone();

    // Delete all assets under this pack's root path
    {
        let asset_repo = state.asset_repo.clone();
        let path = root_path.clone();
        tokio::task::spawn_blocking(move || asset_repo.delete_under_path(&path))
            .await
            .map_err(|e| crate::error::StackError::Other(e.to_string()))??;
    }

    // Delete the pack record itself
    {
        let pack_repo = state.pack_repo.clone();
        let path = root_path.clone();
        tokio::task::spawn_blocking(move || pack_repo.delete_under_path(&path))
            .await
            .map_err(|e| crate::error::StackError::Other(e.to_string()))??;
    }

    // Emit so the frontend can update immediately
    let _ = app.emit(
        "stack://pack-deleted",
        serde_json::json!({ "id": id, "rootPath": root_path }),
    );

    // Reset indexer progress counters to clear stale "Indexed X files" display
    // and emit progress event to update the UI immediately
    state.indexer.reset_counters();
    state.indexer.emit_progress();

    Ok(())
}

/// Re-scan a single pack's root folder without deleting anything.
#[tauri::command]
pub async fn rescan_pack(
    id: String,
    state: State<'_, AppState>,
) -> Result<()> {
    let pack = {
        let repo = state.pack_repo.clone();
        let id2 = id.clone();
        tokio::task::spawn_blocking(move || repo.get(&id2))
            .await
            .map_err(|e| crate::error::StackError::Other(e.to_string()))??
    };

    let root = PathBuf::from(&pack.root_path);
    if root.exists() {
        let (files, _) = tokio::task::spawn_blocking({
            let root = root.clone();
            move || Scanner::scan(&root)
        })
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))??;

        let is_project = pack.kind == "project";
        let jobs: Vec<IndexJob> = files
            .into_iter()
            .map(|f| IndexJob {
                pack_root: if is_project {
                    Some(root.clone())
                } else {
                    Scanner::detect_pack_root(&f.path, &root)
                },
                path: f.path,
                priority: JobPriority::Normal,
            })
            .collect();

        state.indexer.enqueue_batch(jobs);
    }

    Ok(())
}

#[tauri::command]
pub async fn set_pack_color(
    id: String,
    color: String,
    state: State<'_, AppState>,
) -> Result<()> {
    let repo = state.pack_repo.clone();
    tokio::task::spawn_blocking(move || repo.set_color(&id, &color))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_pack_assets(
    id: String,
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<Asset>> {
    let repo = state.asset_repo.clone();
    let limit = limit.unwrap_or(500);
    let offset = offset.unwrap_or(0);
    tokio::task::spawn_blocking(move || repo.by_pack(&id, limit, offset))
        .await
        .map_err(|e| crate::error::StackError::Other(e.to_string()))?
}

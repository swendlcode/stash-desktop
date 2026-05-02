use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::error::Result;
use crate::models::ScanStats;

const SKIP_NAMES: &[&str] = &[".DS_Store", "Thumbs.db", "__MACOSX"];
const SKIP_DIRS: &[&str] = &[
    "backup", "backups", "Backup", "Backups", "BACKUP", "BACKUPS",
    "__MACOSX", ".git", ".svn", "node_modules", "Trash", ".Trash",
    "Recycle Bin", "$RECYCLE.BIN", "System Volume Information",
];
const AUDIO_EXTS: &[&str] = &["wav", "aif", "aiff", "mp3", "flac", "ogg"];
const MIDI_EXTS: &[&str] = &["mid", "midi"];
const PRESET_EXTS: &[&str] = &[
    "fxp", "fxb", "vstpreset", "serumpreset", "nmsv", "nksf", "h2p", "h2pmap", "spf", "syl1",
    "vital", "pigments",
];
const PROJECT_EXTS: &[&str] = &[
    // DAW Project Files
    "flp",        // FL Studio
    "als",        // Ableton Live
    "logicx",     // Logic Pro X
    "cpr",        // Cubase
    "ptx",        // Pro Tools
    "rpp",        // Reaper
    "reason",     // Reason
    "song",       // Studio One
    "mmpz", "mmp", // LMMS
    "bwproject",  // Bitwig
    "xrns",       // Renoise
    "cwp",        // Cakewalk
    "dawproject", // Universal DAWproject format
];
const SKIP_EXTS: &[&str] = &[
    "asd", "txt", "pdf", "jpg", "jpeg", "png", "gif", "zip", "rar", "7z", "docx", "doc",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedFile {
    pub path: PathBuf,
    pub extension: String,
    pub asset_type: String,
    pub file_size: u64,
}

pub struct Scanner;

impl Scanner {
    /// Walk a root path and collect every indexable file.
    pub fn scan(root: &Path) -> Result<(Vec<ScannedFile>, ScanStats)> {
        let start = Instant::now();
        let mut files = Vec::new();
        let mut skipped = 0usize;

        for entry in WalkDir::new(root).follow_links(false) {
            let entry = match entry {
                Ok(e) => e,
                Err(err) => {
                    tracing::warn!("walk error: {}", err);
                    skipped += 1;
                    continue;
                }
            };

            let path = entry.path();

            // Skip directories that should be ignored
            if entry.file_type().is_dir() && Self::should_skip_dir(path) {
                continue;
            }

            if !entry.file_type().is_file() {
                continue;
            }

            if Self::should_skip_file(path) {
                skipped += 1;
                continue;
            }

            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            let asset_type = match classify(&ext) {
                Some(t) => t,
                None => {
                    skipped += 1;
                    continue;
                }
            };

            let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);

            files.push(ScannedFile {
                path: path.to_path_buf(),
                extension: ext,
                asset_type: asset_type.to_string(),
                file_size,
            });
        }

        let stats = ScanStats {
            total_files: files.len(),
            skipped,
            duration_ms: start.elapsed().as_millis() as u64,
        };

        Ok((files, stats))
    }

    /// Detect the pack root. Heuristic: one level below the watched folder root.
    /// e.g. /Samples/Dropgun Melodic Techno/Loops/file.wav → /Samples/Dropgun Melodic Techno
    pub fn detect_pack_root(file_path: &Path, watched_root: &Path) -> Option<PathBuf> {
        let rel = file_path.strip_prefix(watched_root).ok()?;
        let first = rel.components().next()?;
        Some(watched_root.join(first.as_os_str()))
    }

    fn should_skip_file(path: &Path) -> bool {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if name.starts_with("._") || name.starts_with('.') {
            return true;
        }

        if SKIP_NAMES.iter().any(|s| *s == name) {
            return true;
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if SKIP_EXTS.contains(&ext.as_str()) {
            return true;
        }

        false
    }

    fn should_skip_dir(path: &Path) -> bool {
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        
        // Skip hidden directories
        if name.starts_with('.') {
            return true;
        }
        
        // Skip backup directories and other unwanted folders
        if SKIP_DIRS.iter().any(|skip_dir| {
            name.eq_ignore_ascii_case(skip_dir)
        }) {
            return true;
        }
        
        false
    }
}

pub fn classify(ext: &str) -> Option<&'static str> {
    if AUDIO_EXTS.contains(&ext) {
        Some("sample")
    } else if MIDI_EXTS.contains(&ext) {
        Some("midi")
    } else if PRESET_EXTS.contains(&ext) {
        Some("preset")
    } else if PROJECT_EXTS.contains(&ext) {
        Some("project")
    } else {
        None
    }
}

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::Result;
use crate::models::PluginEntry;

#[tauri::command]
pub fn scan_plugins(formats: Vec<String>, extra_paths: Vec<String>) -> Result<Vec<PluginEntry>> {
    let requested: HashSet<String> = formats
        .into_iter()
        .map(|f| f.to_lowercase())
        .collect();

    let mut out: Vec<PluginEntry> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for (format, roots) in default_roots() {
        if !requested.is_empty() && !requested.contains(format) {
            continue;
        }
        for (root, scope) in roots {
            scan_root(&root, format, scope, &mut out, &mut seen)?;
        }
    }

    for path in extra_paths {
        let root = PathBuf::from(path);
        scan_root(&root, "custom", "custom", &mut out, &mut seen)?;
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn scan_root(
    root: &Path,
    format_hint: &str,
    scope: &str,
    out: &mut Vec<PluginEntry>,
    seen: &mut HashSet<String>,
) -> Result<()> {
    if !root.exists() {
        return Ok(());
    }

    for entry in WalkDir::new(root).follow_links(true).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase());

        let Some(ext) = ext else { continue };
        if ext != "vst" && ext != "vst3" && ext != "component" {
            continue;
        }

        let canonical = path.to_string_lossy().to_string();
        if seen.contains(&canonical) {
            continue;
        }
        seen.insert(canonical.clone());

        let format = match ext.as_str() {
            "vst" => "vst",
            "vst3" => "vst3",
            "component" => "au",
            _ => format_hint,
        }
        .to_string();

        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown Plugin")
            .to_string();

        out.push(PluginEntry {
            kind: classify_kind(&name),
            name,
            path: canonical,
            format,
            scope: scope.to_string(),
        });
    }

    Ok(())
}

fn classify_kind(name: &str) -> String {
    let lower = name.to_lowercase();
    let instrument_hints = [
        "synth",
        "sampler",
        "instrument",
        "piano",
        "keys",
        "organ",
        "drum",
        "bass",
        "rompler",
    ];
    if instrument_hints.iter().any(|h| lower.contains(h)) {
        "instrument".to_string()
    } else {
        "effect".to_string()
    }
}

fn default_roots() -> Vec<(&'static str, Vec<(PathBuf, &'static str)>)> {
    let home = std::env::var("HOME").unwrap_or_default();
    vec![
        (
            "vst",
            vec![
                (PathBuf::from("/Library/Audio/Plug-Ins/VST"), "system"),
                (PathBuf::from(format!("{home}/Library/Audio/Plug-Ins/VST")), "user"),
            ],
        ),
        (
            "vst3",
            vec![
                (PathBuf::from("/Library/Audio/Plug-Ins/VST3"), "system"),
                (PathBuf::from(format!("{home}/Library/Audio/Plug-Ins/VST3")), "user"),
                (PathBuf::from("/Network/Library/Audio/Plug-Ins/VST3"), "system"),
            ],
        ),
        (
            "au",
            vec![
                (PathBuf::from("/Library/Audio/Plug-Ins/Components"), "system"),
                (
                    PathBuf::from(format!("{home}/Library/Audio/Plug-Ins/Components")),
                    "user",
                ),
            ],
        ),
    ]
}

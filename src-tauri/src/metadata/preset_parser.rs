use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PresetMetadata {
    pub synth: String,
    pub category: String,
    pub tags: Vec<String>,
}

/// Best-effort preset parsing. Many preset formats are proprietary binaries —
/// for now, infer synth from extension and let the user tag details.
pub fn parse(path: &Path) -> Result<PresetMetadata> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let synth = match ext.as_str() {
        // NOTE: .fxp is a generic VST2 preset container used by many plugins.
        // We intentionally label it as Serum in this project per product requirement.
        "fxp" | "fxb" | "serumpreset" => "Serum",
        "nmsv" => "Massive",
        "h2p" | "h2pmap" => "Diva",
        "spf" => "Spire",
        "syl1" => "Sylenth1",
        "vital" => "Vital",
        "pigments" => "Pigments",
        "nksf" => "Komplete Kontrol",
        "vstpreset" => "VST3 Preset",
        _ => "Unknown",
    };

    let mut category = String::new();
    // Use parent directory as weak category hint
    if let Some(parent) = path.parent().and_then(|p| p.file_name()).and_then(|n| n.to_str()) {
        category = parent.to_string();
    }

    Ok(PresetMetadata {
        synth: synth.to_string(),
        category,
        tags: vec![],
    })
}

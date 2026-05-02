use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pack {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub vendor: Option<String>,
    pub genre: Option<String>,
    pub color: Option<String>,
    pub asset_count: i64,
    pub added_at: i64,
    pub updated_at: i64,
    /// "pack" (default sample pack) or "project" (DAW project folder).
    pub kind: String,
    /// Parsed project folder metadata (title/key/bpm/deadline) — only set when kind = "project".
    pub project_meta: Option<crate::metadata::project_folder_parser::ProjectFolderMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchedFolder {
    pub id: String,
    pub path: String,
    pub is_active: bool,
    pub added_at: i64,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanStats {
    pub total_files: usize,
    pub skipped: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub total: usize,
    pub indexed: usize,
    pub queued: usize,
    pub is_scanning: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileReport {
    pub new_files: usize,
    pub missing_files: usize,
    pub duration_ms: u64,
    pub packs_removed: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub asset_count: u32,
    pub children: Vec<TreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CleanCacheReport {
    pub missing_deleted: usize,
    pub packs_deleted: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HardCleanReport {
    pub assets_deleted: usize,
    pub packs_deleted: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    pub path: String,
    pub total_size_bytes: u64,
    pub file_count: u64,
    pub asset_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CategoryStat {
    pub count: u64,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubfolderSummary {
    pub name: String,
    pub path: String,
    pub file_count: u64,
    pub size_bytes: u64,
}

/// Aggregated information about a project folder for the Info sidebar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub path: String,
    pub total_size_bytes: u64,
    pub file_count: u64,
    pub audio: CategoryStat,
    pub midi: CategoryStat,
    pub preset: CategoryStat,
    pub project: CategoryStat,
    pub video: CategoryStat,
    pub image: CategoryStat,
    pub other: CategoryStat,
    pub backup_count: u64,
    pub backup_size_bytes: u64,
    pub subfolders: Vec<SubfolderSummary>,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub extension: String,
    #[serde(rename = "type")]
    pub asset_type: String,
    pub pack_id: Option<String>,
    pub pack_name: Option<String>,

    pub bpm: Option<f32>,
    pub key_note: Option<String>,
    pub key_scale: Option<String>,
    pub duration_ms: Option<i64>,
    pub sample_rate: Option<i64>,
    pub channels: Option<i64>,

    pub instrument: Option<String>,
    pub subtype: Option<String>,

    pub is_favorite: bool,
    pub user_tags: Vec<String>,
    pub play_count: i64,
    pub last_played: Option<i64>,
    pub rating: Option<i64>,

    pub meta: serde_json::Value,

    pub index_status: String,
    pub waveform_data: Option<Vec<f32>>,
    pub bpm_source: Option<String>,
    pub key_source: Option<String>,

    /// Smart tags derived from filename analysis
    pub energy_level: Option<String>,
    pub texture: Option<String>,
    pub space: Option<String>,
    pub role: Option<String>,

    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub filters: AssetFilters,
    pub sort: SortOptions,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetFilters {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(default)]
    pub pack_ids: Vec<String>,
    #[serde(default)]
    pub instruments: Vec<String>,
    #[serde(default)]
    pub subtypes: Vec<String>,
    pub bpm_min: Option<f32>,
    pub bpm_max: Option<f32>,
    #[serde(default)]
    pub keys: Vec<String>,
    #[serde(default)]
    pub scales: Vec<String>,
    #[serde(default)]
    pub favorites_only: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    pub path_prefix: Option<String>,
    /// Smart tag filters
    #[serde(default)]
    pub energy_levels: Vec<String>,
    #[serde(default)]
    pub textures: Vec<String>,
    #[serde(default)]
    pub spaces: Vec<String>,
    #[serde(default)]
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SortOptions {
    pub field: String,
    pub direction: String,
}

impl Default for SortOptions {
    fn default() -> Self {
        Self {
            field: "filename".into(),
            direction: "asc".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub assets: Vec<Asset>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiNote {
    pub pitch: u8,
    pub start_tick: u32,
    pub duration_ticks: u32,
    pub velocity: u8,
}

/// A single facet bucket: value + count.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FacetCount {
    pub value: String,
    pub count: i64,
}

/// All facet counts returned in one IPC call.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FacetCounts {
    pub instruments: Vec<FacetCount>,
    pub subtypes: Vec<FacetCount>,
    pub energy_levels: Vec<FacetCount>,
    pub textures: Vec<FacetCount>,
    pub spaces: Vec<FacetCount>,
    pub roles: Vec<FacetCount>,
}

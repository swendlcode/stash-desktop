use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    // ── Playback ──────────────────────────────────────────────────────────
    pub default_volume: f32,
    /// Auto-play next track when current one ends
    pub auto_play_next: bool,

    // ── Library ───────────────────────────────────────────────────────────
    pub indexer_concurrency: usize,
    pub analyze_audio_in_background: bool,
    /// Re-scan watched folders automatically when files change on disk
    pub watch_for_changes: bool,
    /// Page size for the asset grid
    pub page_size: usize,

    // ── Appearance ────────────────────────────────────────────────────────
    pub theme: String,
    /// Show waveform in the player bar
    pub show_waveform: bool,
    /// Show BPM badge on asset rows
    pub show_bpm_badge: bool,
    /// Show key badge on asset rows
    pub show_key_badge: bool,
    /// Show the Playground pill in sidebar
    #[serde(default = "default_true")]
    pub show_playground_badge: bool,
    /// Use virtual folder organization instead of moving real files
    #[serde(default = "default_true")]
    pub enable_playground_mode: bool,

    // ── Application ───────────────────────────────────────────────────────
    /// Launch Stack automatically at system startup
    pub launch_at_startup: bool,
    /// Confirm before removing a watched folder
    pub confirm_folder_removal: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_volume: 0.9,
            auto_play_next: false,
            indexer_concurrency: 8,
            analyze_audio_in_background: true,
            watch_for_changes: true,
            page_size: 100,
            theme: "dark".into(),
            show_waveform: true,
            show_bpm_badge: true,
            show_key_badge: true,
            show_playground_badge: true,
            enable_playground_mode: true,
            launch_at_startup: false,
            confirm_folder_removal: true,
        }
    }
}

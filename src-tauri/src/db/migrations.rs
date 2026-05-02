use rusqlite::Connection;

use crate::error::Result;

const MIGRATIONS: &[(&str, &str)] = &[
(
    "001_initial",
    r#"
CREATE TABLE IF NOT EXISTS packs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  root_path    TEXT NOT NULL UNIQUE,
  vendor       TEXT,
  genre        TEXT,
  color        TEXT,
  asset_count  INTEGER DEFAULT 0,
  added_at     INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id            TEXT PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  extension     TEXT NOT NULL,
  type          TEXT NOT NULL,
  pack_id       TEXT REFERENCES packs(id) ON DELETE SET NULL,

  bpm           REAL,
  key_note      TEXT,
  key_scale     TEXT,
  duration_ms   INTEGER,
  sample_rate   INTEGER,
  channels      INTEGER,
  bit_depth     INTEGER,

  instrument    TEXT,
  subtype       TEXT,
  pack_name     TEXT,

  is_favorite   INTEGER DEFAULT 0,
  user_tags     TEXT DEFAULT '[]',
  play_count    INTEGER DEFAULT 0,
  last_played   INTEGER,
  rating        INTEGER,

  meta          TEXT DEFAULT '{}',

  index_status  TEXT DEFAULT 'pending',
  bpm_source    TEXT,
  key_source    TEXT,

  waveform_data TEXT,

  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stacks (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stack_assets (
  stack_id   TEXT REFERENCES stacks(id) ON DELETE CASCADE,
  asset_id   TEXT REFERENCES assets(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (stack_id, asset_id)
);

CREATE TABLE IF NOT EXISTS watched_folders (
  id         TEXT PRIMARY KEY,
  path       TEXT NOT NULL UNIQUE,
  is_active  INTEGER DEFAULT 1,
  added_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_pack_id    ON assets(pack_id);
CREATE INDEX IF NOT EXISTS idx_assets_type       ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_bpm        ON assets(bpm);
CREATE INDEX IF NOT EXISTS idx_assets_key        ON assets(key_note, key_scale);
CREATE INDEX IF NOT EXISTS idx_assets_instrument ON assets(instrument);
CREATE INDEX IF NOT EXISTS idx_assets_favorite   ON assets(is_favorite);
CREATE INDEX IF NOT EXISTS idx_assets_status     ON assets(index_status);
CREATE INDEX IF NOT EXISTS idx_assets_last_seen  ON assets(last_seen_at);

CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
  id UNINDEXED,
  filename,
  pack_name,
  instrument,
  user_tags
);
"#,
),
(
    "002_clear_empty_waveforms",
    // Clear waveform_data that is NULL, empty array '[]', or empty string so
    // that previously-failed analyses (wrong sample format) are retried.
    "UPDATE assets SET waveform_data = NULL WHERE waveform_data IS NULL OR waveform_data = '[]' OR waveform_data = '';",
),
(
    "003_clear_json_waveforms",
    // Waveform storage migrated from JSON text to base64 binary (6x smaller).
    // Clear all JSON-format waveforms so they are re-generated in the new format
    // on next scan or first view.
    "UPDATE assets SET waveform_data = NULL WHERE waveform_data LIKE '[%';",
),
(
    "004_smart_tags",
    // Add smart tag columns for energy level, texture, space, and role.
    // These are derived from filename analysis during indexing and enable
    // the Smart Filter combinations (Global Tech, Aggressive Color, etc.).
    r#"
ALTER TABLE assets ADD COLUMN energy_level TEXT;
ALTER TABLE assets ADD COLUMN texture      TEXT;
ALTER TABLE assets ADD COLUMN space        TEXT;
ALTER TABLE assets ADD COLUMN role         TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_energy  ON assets(energy_level);
CREATE INDEX IF NOT EXISTS idx_assets_texture ON assets(texture);
CREATE INDEX IF NOT EXISTS idx_assets_space   ON assets(space);
CREATE INDEX IF NOT EXISTS idx_assets_role    ON assets(role);
"#,
),
(
    "005_project_kind",
    // Distinguish sample-pack folders from DAW-project folders. New folders
    // added via add_project_folder write 'project'; existing rows keep 'pack'.
    // packs.project_meta holds JSON parsed from the folder name (title/key/bpm/deadline).
    r#"
ALTER TABLE watched_folders ADD COLUMN kind TEXT NOT NULL DEFAULT 'pack';
ALTER TABLE packs ADD COLUMN kind TEXT NOT NULL DEFAULT 'pack';
ALTER TABLE packs ADD COLUMN project_meta TEXT;

CREATE INDEX IF NOT EXISTS idx_packs_kind   ON packs(kind);
CREATE INDEX IF NOT EXISTS idx_watched_kind ON watched_folders(kind);
"#,
),
(
    "006_assets_path_index",
    // The UNIQUE constraint on assets.path implicitly creates a covering index,
    // but making it explicit guarantees the planner uses it for the hot
    // `path_exists` lookup in indexer.rs (one call per scanned file).
    "CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(path);",
),
(
    "007_clear_lowres_waveforms",
    // Waveform resolution bumped from 200 → 1024 bars. Old cached previews
    // looked pixelated at typical row widths. Clearing forces a re-render
    // on first preview.
    "UPDATE assets SET waveform_data = NULL WHERE waveform_data IS NOT NULL;",
),
];

pub fn run(conn: &mut Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at INTEGER NOT NULL
        );",
    )?;

    for (name, sql) in MIGRATIONS {
        let already_applied: bool = conn
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE name = ?1",
                [name],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if already_applied {
            continue;
        }

        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (name, applied_at) VALUES (?1, strftime('%s','now'))",
            [name],
        )?;
        tx.commit()?;
        tracing::info!("applied migration: {}", name);
    }

    Ok(())
}

use std::sync::Arc;

use rusqlite::{params, params_from_iter, Row};

use crate::db::{query_builder, DatabasePool};
use crate::error::{Result, StackError};
use crate::models::{Asset, AssetFilters, FacetCount, FacetCounts, MidiNote, SearchQuery, SortOptions};

/// Encode waveform data as base64 little-endian f32 bytes.
/// 1024 bars → 4096 bytes → ~5500 chars base64, vs ~7500 chars JSON.
fn waveform_to_base64(data: &[f32]) -> String {
    let mut bytes = Vec::with_capacity(data.len() * 4);
    for &v in data {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(&bytes)
}

/// Decode waveform data from either base64 binary or legacy JSON format.
/// Transparent migration: old JSON rows are decoded on read without any DB write.
fn waveform_from_str(s: &str) -> Vec<f32> {
    // Detect JSON array (legacy format)
    let trimmed = s.trim_start();
    if trimmed.starts_with('[') {
        return serde_json::from_str(s).unwrap_or_default();
    }
    // Base64 binary format
    use base64::Engine as _;
    let bytes = match base64::engine::general_purpose::STANDARD.decode(s) {
        Ok(b) => b,
        Err(_) => return vec![],
    };
    if bytes.len() % 4 != 0 {
        return vec![];
    }
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

pub struct AssetRepository {
    db: Arc<DatabasePool>,
}

impl AssetRepository {
    pub fn new(db: Arc<DatabasePool>) -> Self {
        Self { db }
    }

    pub fn search(&self, query: &SearchQuery) -> Result<Vec<Asset>> {
        self.search_raw(&query.filters, &query.sort, query.limit, query.offset)
    }

    pub fn count(&self, filters: &AssetFilters) -> Result<i64> {
        let q = query_builder::build_count(filters);
        let conn = self.db.get()?;
        let mut stmt = conn.prepare(&q.sql)?;
        let count: i64 = stmt.query_row(params_from_iter(q.params.iter()), |r| r.get(0))?;
        Ok(count)
    }

    /// Returns per-value counts for all six facets in a single round-trip.
    /// Each branch of the UNION ignores its own filter so all options remain visible
    /// while other active filters (query, type, pack, BPM, key…) still narrow the counts.
    /// Buckets are ordered by count DESC within each facet for stable UI display.
    pub fn get_facet_counts(&self, filters: &AssetFilters) -> Result<FacetCounts> {
        let q = query_builder::build_facet_counts(filters);
        let conn = self.db.get()?;
        let mut stmt = conn.prepare(&q.sql)?;

        let mut instruments: Vec<FacetCount> = Vec::new();
        let mut subtypes: Vec<FacetCount> = Vec::new();
        let mut energy_levels: Vec<FacetCount> = Vec::new();
        let mut textures: Vec<FacetCount> = Vec::new();
        let mut spaces: Vec<FacetCount> = Vec::new();
        let mut roles: Vec<FacetCount> = Vec::new();

        let rows = stmt.query_map(params_from_iter(q.params.iter()), |r| {
            let facet: String = r.get(0)?;
            let value: String = r.get(1)?;
            let count: i64 = r.get(2)?;
            Ok((facet, FacetCount { value, count }))
        })?;

        for row in rows {
            let (facet, fc) = row?;
            match facet.as_str() {
                "instrument" => instruments.push(fc),
                "subtype" => subtypes.push(fc),
                "energy" => energy_levels.push(fc),
                "texture" => textures.push(fc),
                "space" => spaces.push(fc),
                "role" => roles.push(fc),
                _ => {}
            }
        }

        // Each facet was previously ORDER BY cnt DESC inside its own query.
        // The UNION ALL drops that, so re-sort each bucket on the Rust side.
        for v in [&mut instruments, &mut subtypes, &mut energy_levels, &mut textures, &mut spaces, &mut roles] {
            v.sort_by(|a, b| b.count.cmp(&a.count));
        }

        Ok(FacetCounts { instruments, subtypes, energy_levels, textures, spaces, roles })
    }

    pub fn search_raw(
        &self,
        filters: &AssetFilters,
        sort: &SortOptions,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Asset>> {
        let q = query_builder::build_search(filters, sort, limit, offset);
        let conn = self.db.get()?;
        let mut stmt = conn.prepare(&q.sql)?;
        let assets = stmt
            .query_map(params_from_iter(q.params.iter()), row_to_asset)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(assets)
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<Asset>> {
        let conn = self.db.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, path, filename, extension, type, pack_id, pack_name, \
             bpm, key_note, key_scale, duration_ms, sample_rate, channels, bit_depth, \
             instrument, subtype, is_favorite, user_tags, play_count, last_played, rating, \
             meta, index_status, bpm_source, key_source, waveform_data, \
             energy_level, texture, space, role, \
             created_at, updated_at \
             FROM assets WHERE id = ?1",
        )?;
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_asset(row)?))
        } else {
            Ok(None)
        }
    }

    pub fn upsert(&self, asset: &Asset) -> Result<()> {
        let mut conn = self.db.get()?;
        let tags = serde_json::to_string(&asset.user_tags)?;
        let meta = serde_json::to_string(&asset.meta)?;
        let waveform = match &asset.waveform_data {
            Some(v) => Some(waveform_to_base64(v)),
            None => None,
        };
        let tx = conn.transaction()?;

        tx.execute(
            "INSERT INTO assets (id, path, filename, extension, type, pack_id, pack_name, \
             bpm, key_note, key_scale, duration_ms, sample_rate, channels, \
             instrument, subtype, is_favorite, user_tags, play_count, meta, \
             index_status, bpm_source, key_source, waveform_data, \
             energy_level, texture, space, role, \
             created_at, updated_at, last_seen_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30) \
             ON CONFLICT(id) DO UPDATE SET \
                path = excluded.path, filename = excluded.filename, pack_id = excluded.pack_id, \
                pack_name = excluded.pack_name, bpm = COALESCE(excluded.bpm, assets.bpm), \
                key_note = COALESCE(excluded.key_note, assets.key_note), \
                key_scale = COALESCE(excluded.key_scale, assets.key_scale), \
                duration_ms = COALESCE(excluded.duration_ms, assets.duration_ms), \
                sample_rate = COALESCE(excluded.sample_rate, assets.sample_rate), \
                channels = COALESCE(excluded.channels, assets.channels), \
                instrument = COALESCE(excluded.instrument, assets.instrument), \
                subtype = COALESCE(excluded.subtype, assets.subtype), \
                meta = excluded.meta, index_status = excluded.index_status, \
                bpm_source = COALESCE(excluded.bpm_source, assets.bpm_source), \
                key_source = COALESCE(excluded.key_source, assets.key_source), \
                waveform_data = COALESCE(excluded.waveform_data, assets.waveform_data), \
                energy_level = COALESCE(excluded.energy_level, assets.energy_level), \
                texture = COALESCE(excluded.texture, assets.texture), \
                space = COALESCE(excluded.space, assets.space), \
                role = COALESCE(excluded.role, assets.role), \
                updated_at = excluded.updated_at, last_seen_at = excluded.last_seen_at",
            params![
                asset.id,
                asset.path,
                asset.filename,
                asset.extension,
                asset.asset_type,
                asset.pack_id,
                asset.pack_name,
                asset.bpm,
                asset.key_note,
                asset.key_scale,
                asset.duration_ms,
                asset.sample_rate,
                asset.channels,
                asset.instrument,
                asset.subtype,
                asset.is_favorite as i64,
                tags,
                asset.play_count,
                meta,
                asset.index_status,
                asset.bpm_source,
                asset.key_source,
                waveform,
                asset.energy_level,
                asset.texture,
                asset.space,
                asset.role,
                asset.created_at,
                asset.updated_at,
                asset.updated_at,
            ],
        )?;

        // FTS5 does not support ON CONFLICT, so delete the stale entry first to
        // ensure the index stays current when an asset is re-indexed.
        tx.execute("DELETE FROM assets_fts WHERE id = ?1", [&asset.id]).ok();
        tx.execute(
            "INSERT INTO assets_fts (id, filename, pack_name, instrument, user_tags) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![asset.id, asset.filename, asset.pack_name, asset.instrument, tags],
        )
        .ok();
        tx.commit()?;

        Ok(())
    }

    pub fn path_exists(&self, path: &str) -> Result<Option<String>> {
        let conn = self.db.get()?;
        let mut stmt = conn.prepare("SELECT id FROM assets WHERE path = ?1")?;
        let mut rows = stmt.query([path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    /// Returns `(id, updated_at)` for an asset at this path, if it exists.
    /// Used by the indexer's fast path to decide whether the on-disk file
    /// is newer than what we have stored.
    pub fn path_stamp(&self, path: &str) -> Result<Option<(String, i64)>> {
        let conn = self.db.get()?;
        let mut stmt = conn.prepare("SELECT id, updated_at FROM assets WHERE path = ?1")?;
        let mut rows = stmt.query([path])?;
        if let Some(row) = rows.next()? {
            Ok(Some((row.get(0)?, row.get(1)?)))
        } else {
            Ok(None)
        }
    }

    pub fn delete_under_path(&self, prefix: &str) -> Result<usize> {
        let conn = self.db.get()?;
        let pattern = format!("{}%", prefix);
        // Collect the IDs first so we can do a targeted FTS delete —
        // avoids a full-table NOT IN scan and keeps FTS in sync.
        let mut stmt = conn.prepare("SELECT id FROM assets WHERE path LIKE ?1")?;
        let ids: Vec<String> = stmt
            .query_map([&pattern], |r| r.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        drop(stmt);
        if ids.is_empty() {
            return Ok(0);
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        conn.execute(
            &format!("DELETE FROM assets_fts WHERE id IN ({})", placeholders),
            params_from_iter(ids.iter()),
        )
        .ok();
        let deleted = conn.execute("DELETE FROM assets WHERE path LIKE ?1", [&pattern])?;
        Ok(deleted)
    }

    pub fn delete_not_under_paths(&self, roots: &[String]) -> Result<usize> {
        let conn = self.db.get()?;
        let deleted = if roots.is_empty() {
            conn.execute("DELETE FROM assets_fts", []).ok();
            conn.execute("DELETE FROM assets", [])?
        } else {
            let predicates = roots
                .iter()
                .map(|_| "path LIKE ?")
                .collect::<Vec<_>>()
                .join(" OR ");
            // Collect IDs to delete for a targeted FTS cleanup.
            let id_sql = format!("SELECT id FROM assets WHERE NOT ({})", predicates);
            let params_vec: Vec<String> = roots.iter().map(|r| format!("{}%", r)).collect();
            let mut stmt = conn.prepare(&id_sql)?;
            let ids: Vec<String> = stmt
                .query_map(params_from_iter(params_vec.iter()), |r| r.get(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            drop(stmt);
            if !ids.is_empty() {
                let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                conn.execute(
                    &format!("DELETE FROM assets_fts WHERE id IN ({})", placeholders),
                    params_from_iter(ids.iter()),
                )
                .ok();
            }
            let sql = format!("DELETE FROM assets WHERE NOT ({})", predicates);
            conn.execute(&sql, params_from_iter(params_vec.iter()))?
        };
        Ok(deleted)
    }

    pub fn mark_missing(&self, cutoff: i64) -> Result<usize> {
        let conn = self.db.get()?;
        let n = conn.execute(
            "UPDATE assets SET index_status = 'missing', updated_at = strftime('%s','now') \
             WHERE last_seen_at < ?1 AND index_status != 'missing'",
            params![cutoff],
        )?;
        Ok(n)
    }

    pub fn mark_missing_under_path(&self, path: &str) -> Result<usize> {
        let conn = self.db.get()?;
        let like = format!("{}/%", path.trim_end_matches('/'));
        let n = conn.execute(
            "UPDATE assets SET index_status = 'missing', updated_at = strftime('%s','now') \
             WHERE (path = ?1 OR path LIKE ?2) AND index_status != 'missing'",
            params![path, like],
        )?;
        Ok(n)
    }

    pub fn touch_last_seen(&self, id: &str, ts: i64) -> Result<()> {
        let conn = self.db.get()?;
        conn.execute(
            "UPDATE assets SET last_seen_at = ?1, index_status = 'indexed' WHERE id = ?2",
            params![ts, id],
        )?;
        Ok(())
    }

    /// Batch version of touch_last_seen — updates up to 500 IDs in a single
    /// transaction instead of one UPDATE per file. Dramatically reduces write
    /// lock contention during re-scans of large already-indexed libraries.
    pub fn touch_last_seen_batch(&self, ids: &[String], ts: i64) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let mut conn = self.db.get()?;
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "UPDATE assets SET last_seen_at = ?1, index_status = 'indexed' WHERE id = ?2",
            )?;
            for id in ids {
                stmt.execute(params![ts, id])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn toggle_favorite(&self, id: &str) -> Result<bool> {
        let conn = self.db.get()?;
        let current: i64 = conn
            .query_row("SELECT is_favorite FROM assets WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .map_err(|_| StackError::NotFound(format!("asset {}", id)))?;
        let next = if current == 0 { 1 } else { 0 };
        conn.execute(
            "UPDATE assets SET is_favorite = ?1, updated_at = strftime('%s','now') WHERE id = ?2",
            params![next, id],
        )?;
        Ok(next == 1)
    }

    pub fn add_tag(&self, id: &str, tag: &str) -> Result<()> {
        let conn = self.db.get()?;
        conn.execute(
            "UPDATE assets
             SET user_tags = CASE
               WHEN user_tags IS NULL OR user_tags = '' OR user_tags = '[]'
               THEN json_array(?1)
               WHEN (SELECT COUNT(*) FROM json_each(user_tags) WHERE value = ?1) > 0
               THEN user_tags
               ELSE json_insert(user_tags, '$[#]', ?1)
             END,
             updated_at = strftime('%s','now')
             WHERE id = ?2",
            params![tag, id],
        )?;
        Ok(())
    }

    pub fn remove_tag(&self, id: &str, tag: &str) -> Result<()> {
        let conn = self.db.get()?;
        conn.execute(
            "UPDATE assets
             SET user_tags = COALESCE(
               (SELECT json_group_array(value) FROM json_each(user_tags) WHERE value != ?1),
               '[]'
             ),
             updated_at = strftime('%s','now')
             WHERE id = ?2",
            params![tag, id],
        )?;
        Ok(())
    }

    pub fn increment_play_count(&self, id: &str) -> Result<()> {
        let conn = self.db.get()?;
        conn.execute(
            "UPDATE assets SET play_count = play_count + 1, last_played = strftime('%s','now') \
             WHERE id = ?1",
            [id],
        )?;
        Ok(())
    }

    pub fn set_waveform(&self, id: &str, data: &[f32]) -> Result<()> {
        let conn = self.db.get()?;
        // Store as base64-encoded little-endian f32 bytes — ~6x smaller than JSON.
        let encoded = waveform_to_base64(data);
        conn.execute(
            "UPDATE assets SET waveform_data = ?1 WHERE id = ?2",
            params![encoded, id],
        )?;
        Ok(())
    }

    pub fn get_waveform(&self, id: &str) -> Result<Option<Vec<f32>>> {
        let conn = self.db.get()?;
        let wave: Option<String> = conn
            .query_row("SELECT waveform_data FROM assets WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .ok()
            .flatten();
        match wave {
            Some(s) => Ok(Some(waveform_from_str(&s))),
            None => Ok(None),
        }
    }

    /// Fetch path and cached waveform in a single query.
    /// Returns None if the asset doesn't exist.
    pub fn get_path_and_waveform(&self, id: &str) -> Result<Option<(String, Option<Vec<f32>>)>> {
        let conn = self.db.get()?;
        let mut stmt = conn.prepare(
            "SELECT path, waveform_data FROM assets WHERE id = ?1",
        )?;
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            let path: String = row.get(0)?;
            let wave: Option<String> = row.get(1).ok().flatten();
            let waveform = wave.map(|s| waveform_from_str(&s));
            Ok(Some((path, waveform)))
        } else {
            Ok(None)
        }
    }

    pub fn get_midi_notes(&self, id: &str) -> Result<Vec<MidiNote>> {
        let conn = self.db.get()?;
        let meta: Option<String> = conn
            .query_row("SELECT meta FROM assets WHERE id = ?1", [id], |r| r.get(0))
            .ok();
        if let Some(s) = meta {
            let v: serde_json::Value = serde_json::from_str(&s).unwrap_or(serde_json::Value::Null);
            if let Some(arr) = v.get("pianoRoll").and_then(|x| x.as_array()) {
                let notes: Vec<MidiNote> = arr
                    .iter()
                    .filter_map(|n| serde_json::from_value(n.clone()).ok())
                    .collect();
                return Ok(notes);
            }
        }
        Ok(vec![])
    }

    /// Every active asset path — used by the tree builder. Cheap column-only read.
    pub fn all_active_paths(&self) -> Result<Vec<String>> {
        let conn = self.db.get()?;
        let mut stmt = conn.prepare(
            "SELECT path FROM assets WHERE index_status != 'missing' ORDER BY path",
        )?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn delete_missing(&self) -> Result<usize> {
        let conn = self.db.get()?;
        // Collect IDs before deleting for a targeted FTS cleanup.
        let mut stmt =
            conn.prepare("SELECT id FROM assets WHERE index_status = 'missing'")?;
        let ids: Vec<String> = stmt
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        drop(stmt);
        if ids.is_empty() {
            return Ok(0);
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        conn.execute(
            &format!("DELETE FROM assets_fts WHERE id IN ({})", placeholders),
            params_from_iter(ids.iter()),
        )
        .ok();
        let n = conn.execute("DELETE FROM assets WHERE index_status = 'missing'", [])?;
        Ok(n)
    }

    /// Delete assets under a path that are marked missing — used before re-adding
    /// a folder to prevent duplicates from a previous removal.
    pub fn delete_missing_under_path(&self, prefix: &str) -> Result<usize> {
        let conn = self.db.get()?;
        let pattern = format!("{}%", prefix);
        let mut stmt = conn.prepare(
            "SELECT id FROM assets WHERE path LIKE ?1 AND index_status = 'missing'",
        )?;
        let ids: Vec<String> = stmt
            .query_map([&pattern], |r| r.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        drop(stmt);
        if ids.is_empty() {
            return Ok(0);
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        conn.execute(
            &format!("DELETE FROM assets_fts WHERE id IN ({})", placeholders),
            params_from_iter(ids.iter()),
        )
        .ok();
        let n = conn.execute(
            "DELETE FROM assets WHERE path LIKE ?1 AND index_status = 'missing'",
            [&pattern],
        )?;
        Ok(n)
    }

    pub fn count_under_path(&self, prefix: &str) -> Result<i64> {
        let conn = self.db.get()?;
        let pattern = format!("{}%", prefix);
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM assets WHERE path LIKE ?1 AND index_status != 'missing'",
            [&pattern],
            |r| r.get(0),
        )?;
        Ok(count)
    }

    /// Find assets similar to the given asset.
    /// Scoring: same key (+3), BPM within ±5 (+2), same texture (+2),
    /// same instrument (+1), same role (+1). Returns top `limit` results.
    pub fn find_similar(&self, source: &Asset, limit: i64) -> Result<Vec<Asset>> {
        let conn = self.db.get()?;

        // Build a query that scores candidates and orders by score descending.
        // We use CASE expressions to compute a relevance score in SQL.
        let mut conditions: Vec<String> = Vec::new();
        let mut score_parts: Vec<String> = Vec::new();
        let mut params: Vec<rusqlite::types::Value> = Vec::new();

        // Always exclude the source asset and missing files
        conditions.push("id != ?".to_string());
        params.push(rusqlite::types::Value::Text(source.id.clone()));
        conditions.push("index_status != 'missing'".to_string());

        // At least one of: same key, BPM within ±10, same texture, same instrument
        // must match to be considered similar at all.
        let mut relevance_filters: Vec<String> = Vec::new();

        if let Some(ref key) = source.key_note {
            score_parts.push("CASE WHEN key_note = ? THEN 3 ELSE 0 END".to_string());
            params.push(rusqlite::types::Value::Text(key.clone()));
            relevance_filters.push(format!("key_note = '{}'", key.replace('\'', "''")));
        }

        if let Some(bpm) = source.bpm {
            score_parts.push("CASE WHEN bpm BETWEEN ? AND ? THEN 2 ELSE 0 END".to_string());
            params.push(rusqlite::types::Value::Real((bpm - 5.0) as f64));
            params.push(rusqlite::types::Value::Real((bpm + 5.0) as f64));
            relevance_filters.push(format!("bpm BETWEEN {} AND {}", bpm - 10.0, bpm + 10.0));
        }

        if let Some(ref texture) = source.texture {
            score_parts.push("CASE WHEN texture = ? THEN 2 ELSE 0 END".to_string());
            params.push(rusqlite::types::Value::Text(texture.clone()));
            relevance_filters.push(format!("texture = '{}'", texture.replace('\'', "''")));
        }

        if let Some(ref instrument) = source.instrument {
            score_parts.push("CASE WHEN instrument = ? THEN 1 ELSE 0 END".to_string());
            params.push(rusqlite::types::Value::Text(instrument.clone()));
            relevance_filters.push(format!("instrument = '{}'", instrument.replace('\'', "''")));
        }

        if let Some(ref role) = source.role {
            score_parts.push("CASE WHEN role = ? THEN 1 ELSE 0 END".to_string());
            params.push(rusqlite::types::Value::Text(role.clone()));
        }

        // Require at least one relevance signal
        if relevance_filters.is_empty() {
            return Ok(vec![]);
        }
        conditions.push(format!("({})", relevance_filters.join(" OR ")));

        let score_expr = if score_parts.is_empty() {
            "0".to_string()
        } else {
            score_parts.join(" + ")
        };

        let where_clause = conditions.join(" AND ");
        // waveform_data omitted from list projection — see build_search comment.
        let sql = format!(
            "SELECT id, path, filename, extension, type, pack_id, pack_name, \
             bpm, key_note, key_scale, duration_ms, sample_rate, channels, bit_depth, \
             instrument, subtype, is_favorite, user_tags, play_count, last_played, rating, \
             meta, index_status, bpm_source, key_source, NULL AS waveform_data, \
             energy_level, texture, space, role, \
             created_at, updated_at, \
             ({}) AS _score \
             FROM assets WHERE {} \
             ORDER BY _score DESC LIMIT ?",
            score_expr, where_clause
        );

        params.push(rusqlite::types::Value::Integer(limit));

        let mut stmt = conn.prepare(&sql)?;
        let assets = stmt
            .query_map(params_from_iter(params.iter()), |row| {
                // row_to_asset reads columns 0..31; column 32 is _score (ignored)
                row_to_asset(row)
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(assets)
    }

    pub fn by_pack(&self, pack_id: &str, limit: i64, offset: i64) -> Result<Vec<Asset>> {
        let conn = self.db.get()?;
        // waveform_data omitted from list projection — see build_search comment.
        let mut stmt = conn.prepare(
            "SELECT id, path, filename, extension, type, pack_id, pack_name, \
             bpm, key_note, key_scale, duration_ms, sample_rate, channels, bit_depth, \
             instrument, subtype, is_favorite, user_tags, play_count, last_played, rating, \
             meta, index_status, bpm_source, key_source, NULL AS waveform_data, \
             energy_level, texture, space, role, \
             created_at, updated_at \
             FROM assets WHERE pack_id = ?1 ORDER BY filename COLLATE NOCASE LIMIT ?2 OFFSET ?3",
        )?;
        let assets = stmt
            .query_map(params![pack_id, limit, offset], row_to_asset)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(assets)
    }
}

fn row_to_asset(row: &Row) -> rusqlite::Result<Asset> {
    let user_tags: String = row.get(17).unwrap_or_else(|_| "[]".into());
    let user_tags: Vec<String> = serde_json::from_str(&user_tags).unwrap_or_default();

    let meta: String = row.get(21).unwrap_or_else(|_| "{}".into());
    let meta: serde_json::Value = serde_json::from_str(&meta).unwrap_or(serde_json::Value::Null);

    let waveform: Option<String> = row.get(25).ok();
    let waveform_data = waveform.map(|s| waveform_from_str(&s));

    let is_fav: i64 = row.get(16).unwrap_or(0);

    // Columns 26-29: energy_level, texture, space, role (added in migration 004)
    // Columns 30-31: created_at, updated_at
    Ok(Asset {
        id: row.get(0)?,
        path: row.get(1)?,
        filename: row.get(2)?,
        extension: row.get(3)?,
        asset_type: row.get(4)?,
        pack_id: row.get(5).ok(),
        pack_name: row.get(6).ok(),
        bpm: row.get(7).ok(),
        key_note: row.get(8).ok(),
        key_scale: row.get(9).ok(),
        duration_ms: row.get(10).ok(),
        sample_rate: row.get(11).ok(),
        channels: row.get(12).ok(),
        instrument: row.get(14).ok(),
        subtype: row.get(15).ok(),
        is_favorite: is_fav != 0,
        user_tags,
        play_count: row.get(18).unwrap_or(0),
        last_played: row.get(19).ok(),
        rating: row.get(20).ok(),
        meta,
        index_status: row.get(22).unwrap_or_else(|_| "pending".into()),
        bpm_source: row.get(23).ok(),
        key_source: row.get(24).ok(),
        waveform_data,
        energy_level: row.get(26).ok(),
        texture: row.get(27).ok(),
        space: row.get(28).ok(),
        role: row.get(29).ok(),
        created_at: row.get(30).unwrap_or(0),
        updated_at: row.get(31).unwrap_or(0),
    })
}

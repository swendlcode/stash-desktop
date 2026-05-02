use rusqlite::types::Value;
use std::sync::Mutex;

use crate::models::{AssetFilters, SortOptions};
use crate::search::QueryProcessor;

pub struct AssetQuery {
    pub sql: String,
    pub params: Vec<Value>,
}

// Global query processor instance (thread-safe)
lazy_static::lazy_static! {
    static ref QUERY_PROCESSOR: Mutex<QueryProcessor> = Mutex::new(QueryProcessor::new());
}

/// Build a parameterized SELECT for the assets table based on filters + sort + pagination.
pub fn build_search(filters: &AssetFilters, sort: &SortOptions, limit: i64, offset: i64) -> AssetQuery {
    let (where_sql, mut params) = build_where(filters);
    // waveform_data is intentionally projected as NULL — it's a large base64
    // blob the grid never reads. The detail view fetches it lazily via
    // get_waveform / useWaveformData (cached client-side with staleTime: Infinity).
    // Keeping the slot as NULL preserves column indices for row_to_asset.
    let mut sql = format!(
        "SELECT id, path, filename, extension, type, pack_id, pack_name, \
         bpm, key_note, key_scale, duration_ms, sample_rate, channels, bit_depth, \
         instrument, subtype, is_favorite, user_tags, play_count, last_played, rating, \
         meta, index_status, bpm_source, key_source, NULL AS waveform_data, \
         energy_level, texture, space, role, \
         created_at, updated_at \
         FROM assets WHERE 1=1{}",
        where_sql
    );

    let order_col = match sort.field.as_str() {
        "filename" => "filename COLLATE NOCASE",
        "bpm" => "bpm",
        "key" => "key_note",
        "duration" => "duration_ms",
        "pack" => "pack_name COLLATE NOCASE",
        "added" => "created_at",
        "mostUsed" => "play_count",
        "mostRecent" => "last_played",
        "random" => "RANDOM()",
        _ => "filename COLLATE NOCASE",
    };
    if sort.field == "random" {
        sql.push_str(" ORDER BY RANDOM() LIMIT ? OFFSET ?");
    } else {
        let direction = if sort.direction.eq_ignore_ascii_case("desc") { "DESC" } else { "ASC" };
        sql.push_str(&format!(" ORDER BY {} {} LIMIT ? OFFSET ?", order_col, direction));
    }
    params.push(Value::Integer(limit));
    params.push(Value::Integer(offset));

    AssetQuery { sql, params }
}

/// Build a COUNT(*) query with the same filters (no sort/pagination).
pub fn build_count(filters: &AssetFilters) -> AssetQuery {
    let (where_sql, params) = build_where(filters);
    let sql = format!("SELECT COUNT(*) FROM assets WHERE 1=1{}", where_sql);
    AssetQuery { sql, params }
}

/// Build a single UNION ALL query that returns counts for all six facets in one round-trip.
/// Each branch ignores its own filter so all options remain visible while other
/// active filters (query, type, pack, BPM, key…) still narrow the counts.
///
/// Result rows: (facet TEXT, value TEXT, count INTEGER), where `facet` is one of
/// "instrument" | "subtype" | "energy" | "texture" | "space" | "role".
/// The repository demultiplexes on `facet` to populate FacetCounts.
pub fn build_facet_counts(filters: &AssetFilters) -> AssetQuery {
    // Each branch needs the where-clause built with its own filter excluded.
    let (w_inst, p_inst) = build_where(&AssetFilters { instruments: vec![], ..filters.clone() });
    let (w_sub, p_sub) = build_where(&AssetFilters { subtypes: vec![], ..filters.clone() });
    let (w_energy, p_energy) = build_where(&AssetFilters { energy_levels: vec![], ..filters.clone() });
    let (w_texture, p_texture) = build_where(&AssetFilters { textures: vec![], ..filters.clone() });
    let (w_space, p_space) = build_where(&AssetFilters { spaces: vec![], ..filters.clone() });
    let (w_role, p_role) = build_where(&AssetFilters { roles: vec![], ..filters.clone() });

    let sql = format!(
        "SELECT 'instrument' AS facet, instrument AS value, COUNT(*) AS cnt FROM assets \
         WHERE 1=1{} AND instrument IS NOT NULL AND instrument != '' GROUP BY instrument \
         UNION ALL \
         SELECT 'subtype', subtype, COUNT(*) FROM assets \
         WHERE 1=1{} AND subtype IS NOT NULL AND subtype != '' GROUP BY subtype \
         UNION ALL \
         SELECT 'energy', energy_level, COUNT(*) FROM assets \
         WHERE 1=1{} AND energy_level IS NOT NULL AND energy_level != '' GROUP BY energy_level \
         UNION ALL \
         SELECT 'texture', texture, COUNT(*) FROM assets \
         WHERE 1=1{} AND texture IS NOT NULL AND texture != '' GROUP BY texture \
         UNION ALL \
         SELECT 'space', space, COUNT(*) FROM assets \
         WHERE 1=1{} AND space IS NOT NULL AND space != '' GROUP BY space \
         UNION ALL \
         SELECT 'role', role, COUNT(*) FROM assets \
         WHERE 1=1{} AND role IS NOT NULL AND role != '' GROUP BY role",
        w_inst, w_sub, w_energy, w_texture, w_space, w_role
    );

    // Concatenate params in the same order the WHERE clauses appear in the SQL.
    let mut params = Vec::with_capacity(
        p_inst.len() + p_sub.len() + p_energy.len() + p_texture.len() + p_space.len() + p_role.len(),
    );
    params.extend(p_inst);
    params.extend(p_sub);
    params.extend(p_energy);
    params.extend(p_texture);
    params.extend(p_space);
    params.extend(p_role);

    AssetQuery { sql, params }
}

fn build_where(filters: &AssetFilters) -> (String, Vec<Value>) {
    let mut sql = String::new();
    let mut params: Vec<Value> = Vec::new();

    if !filters.query.trim().is_empty() {
        static KNOWN_TERMS: &[&str] = &[
            "atmosphere", "atmospheric", "ambient",
            "drum", "drums", "percussion",
            "bass", "synth", "lead", "pad",
            "pluck", "chord", "arp", "keys",
            "piano", "guitar", "strings", "brass",
            "vocal", "fx", "dark", "bright",
            "warm", "cold", "soft", "hard",
            "electronic", "acoustic", "loop", "oneshot",
        ];

        let processed_query = {
            let mut processor = QUERY_PROCESSOR.lock().unwrap();
            let known_terms: Vec<String> = KNOWN_TERMS.iter().map(|s| s.to_string()).collect();
            processor.process_query(&filters.query, &known_terms)
        };

        // Build a comprehensive search that includes:
        // 1. Original query
        // 2. Expanded synonyms
        // 3. Fuzzy variants for typo tolerance
        let mut search_conditions = Vec::new();
        let mut all_queries = vec![processed_query.normalized.clone()];
        all_queries.extend(processed_query.expanded_terms);
        all_queries.extend(processed_query.fuzzy_variants);
        
        // Remove duplicates and empty queries
        all_queries.sort();
        all_queries.dedup();
        all_queries.retain(|q| !q.trim().is_empty());

        // If we have no processed queries, fall back to original
        if all_queries.is_empty() {
            all_queries.push(filters.query.clone());
        }

        for query in all_queries {
            // Search in filename, pack_name, and instrument with LIKE
            search_conditions.push("(filename LIKE ? OR pack_name LIKE ? OR instrument LIKE ?)".to_string());
            let pattern = format!("%{}%", query);
            params.push(Value::Text(pattern.clone()));
            params.push(Value::Text(pattern.clone()));
            params.push(Value::Text(pattern));
        }

        if !search_conditions.is_empty() {
            sql.push_str(&format!(" AND ({})", search_conditions.join(" OR ")));
        }
    }

    if !filters.types.is_empty() {
        let placeholders = vec!["?"; filters.types.len()].join(",");
        sql.push_str(&format!(" AND type IN ({})", placeholders));
        for t in &filters.types {
            params.push(Value::Text(t.clone()));
        }
    }

    if !filters.pack_ids.is_empty() {
        let placeholders = vec!["?"; filters.pack_ids.len()].join(",");
        sql.push_str(&format!(" AND pack_id IN ({})", placeholders));
        for p in &filters.pack_ids {
            params.push(Value::Text(p.clone()));
        }
    }

    if !filters.instruments.is_empty() {
        let placeholders = vec!["?"; filters.instruments.len()].join(",");
        sql.push_str(&format!(" AND instrument IN ({})", placeholders));
        for i in &filters.instruments {
            params.push(Value::Text(i.clone()));
        }
    }

    if !filters.subtypes.is_empty() {
        let placeholders = vec!["?"; filters.subtypes.len()].join(",");
        sql.push_str(&format!(" AND subtype IN ({})", placeholders));
        for s in &filters.subtypes {
            params.push(Value::Text(s.clone()));
        }
    }

    if let Some(min) = filters.bpm_min {
        sql.push_str(" AND bpm >= ?");
        params.push(Value::Real(min as f64));
    }

    if let Some(max) = filters.bpm_max {
        sql.push_str(" AND bpm <= ?");
        params.push(Value::Real(max as f64));
    }

    if !filters.keys.is_empty() {
        let placeholders = vec!["?"; filters.keys.len()].join(",");
        sql.push_str(&format!(" AND key_note IN ({})", placeholders));
        for k in &filters.keys {
            params.push(Value::Text(k.clone()));
        }
    }

    if !filters.scales.is_empty() {
        let placeholders = vec!["?"; filters.scales.len()].join(",");
        sql.push_str(&format!(" AND key_scale IN ({})", placeholders));
        for s in &filters.scales {
            params.push(Value::Text(s.clone()));
        }
    }

    if filters.favorites_only {
        sql.push_str(" AND is_favorite = 1");
    }

    if let Some(prefix) = filters.path_prefix.as_ref().filter(|p| !p.is_empty()) {
        sql.push_str(" AND path LIKE ?");
        params.push(Value::Text(format!("{}%", prefix)));
    }

    if !filters.energy_levels.is_empty() {
        let placeholders = vec!["?"; filters.energy_levels.len()].join(",");
        sql.push_str(&format!(" AND energy_level IN ({})", placeholders));
        for e in &filters.energy_levels {
            params.push(Value::Text(e.clone()));
        }
    }

    if !filters.textures.is_empty() {
        let placeholders = vec!["?"; filters.textures.len()].join(",");
        sql.push_str(&format!(" AND texture IN ({})", placeholders));
        for t in &filters.textures {
            params.push(Value::Text(t.clone()));
        }
    }

    if !filters.spaces.is_empty() {
        let placeholders = vec!["?"; filters.spaces.len()].join(",");
        sql.push_str(&format!(" AND space IN ({})", placeholders));
        for s in &filters.spaces {
            params.push(Value::Text(s.clone()));
        }
    }

    if !filters.roles.is_empty() {
        let placeholders = vec!["?"; filters.roles.len()].join(",");
        sql.push_str(&format!(" AND role IN ({})", placeholders));
        for r in &filters.roles {
            params.push(Value::Text(r.clone()));
        }
    }

    sql.push_str(" AND index_status != 'missing'");

    (sql, params)
}

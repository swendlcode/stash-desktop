use std::sync::Arc;

use rusqlite::{params, Row};

use crate::db::DatabasePool;
use crate::error::{Result, StackError};
use crate::metadata::project_folder_parser::ProjectFolderMeta;
use crate::models::{Pack, WatchedFolder};

const PACK_COLS: &str = "id, name, root_path, vendor, genre, color, asset_count, added_at, updated_at, kind, project_meta";

pub struct PackRepository {
    db: Arc<DatabasePool>,
}

impl PackRepository {
    pub fn new(db: Arc<DatabasePool>) -> Self {
        Self { db }
    }

    pub fn list(&self) -> Result<Vec<Pack>> {
        let conn = self.db.get()?;
        let sql = format!(
            "SELECT {} FROM packs ORDER BY name COLLATE NOCASE",
            PACK_COLS
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], row_to_pack)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get(&self, id: &str) -> Result<Pack> {
        let conn = self.db.get()?;
        let sql = format!("SELECT {} FROM packs WHERE id = ?1", PACK_COLS);
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(row_to_pack(row)?)
        } else {
            Err(StackError::NotFound(format!("pack {}", id)))
        }
    }

    pub fn find_by_root(&self, root_path: &str) -> Result<Option<Pack>> {
        let conn = self.db.get()?;
        let sql = format!("SELECT {} FROM packs WHERE root_path = ?1", PACK_COLS);
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query([root_path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_pack(row)?))
        } else {
            Ok(None)
        }
    }

    pub fn upsert(&self, pack: &Pack) -> Result<()> {
        let conn = self.db.get()?;
        let project_meta_json = pack
            .project_meta
            .as_ref()
            .map(|m| serde_json::to_string(m).unwrap_or_else(|_| "null".to_string()));
        conn.execute(
            "INSERT INTO packs (id, name, root_path, vendor, genre, color, asset_count, added_at, updated_at, kind, project_meta) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) \
             ON CONFLICT(root_path) DO UPDATE SET \
                name = excluded.name, vendor = excluded.vendor, genre = excluded.genre, \
                color = excluded.color, updated_at = excluded.updated_at, \
                kind = excluded.kind, \
                project_meta = COALESCE(excluded.project_meta, packs.project_meta)",
            params![
                pack.id,
                pack.name,
                pack.root_path,
                pack.vendor,
                pack.genre,
                pack.color,
                pack.asset_count,
                pack.added_at,
                pack.updated_at,
                pack.kind,
                project_meta_json,
            ],
        )?;
        Ok(())
    }

    pub fn set_color(&self, id: &str, color: &str) -> Result<()> {
        let conn = self.db.get()?;
        conn.execute(
            "UPDATE packs SET color = ?1, updated_at = strftime('%s','now') WHERE id = ?2",
            params![color, id],
        )?;
        Ok(())
    }

    pub fn recount_assets(&self, id: &str) -> Result<()> {
        let conn = self.db.get()?;
        conn.execute(
            "UPDATE packs SET asset_count = \
               (SELECT COUNT(*) FROM assets WHERE pack_id = ?1 AND index_status != 'missing') \
             WHERE id = ?1",
            [id],
        )?;
        Ok(())
    }

    // Watched folders
    pub fn list_watched(&self) -> Result<Vec<WatchedFolder>> {
        let conn = self.db.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, path, is_active, added_at, kind FROM watched_folders ORDER BY added_at",
        )?;
        let rows = stmt
            .query_map([], |row| {
                let active: i64 = row.get(2)?;
                Ok(WatchedFolder {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    is_active: active != 0,
                    added_at: row.get(3)?,
                    kind: row.get(4).unwrap_or_else(|_| "pack".to_string()),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn add_watched(&self, folder: &WatchedFolder) -> Result<()> {
        let conn = self.db.get()?;
        conn.execute(
            "INSERT INTO watched_folders (id, path, is_active, added_at, kind) VALUES (?1, ?2, ?3, ?4, ?5) \
             ON CONFLICT(path) DO UPDATE SET is_active = 1, kind = excluded.kind",
            params![folder.id, folder.path, folder.is_active as i64, folder.added_at, folder.kind],
        )?;
        Ok(())
    }

    pub fn remove_watched(&self, id: &str) -> Result<()> {
        let conn = self.db.get()?;
        conn.execute("DELETE FROM watched_folders WHERE id = ?1", [id])?;
        Ok(())
    }

    /// Atomically remove a watched folder and all packs under its path in one transaction.
    /// Returns the number of packs deleted.
    pub fn remove_watched_with_packs(&self, id: &str, path: &str) -> Result<usize> {
        let conn = self.db.get()?;
        let pattern = format!("{}%", path);
        let packs_deleted =
            conn.execute("DELETE FROM packs WHERE root_path LIKE ?1", [&pattern])?;
        conn.execute("DELETE FROM watched_folders WHERE id = ?1", [id])?;
        Ok(packs_deleted)
    }

    pub fn delete_under_path(&self, prefix: &str) -> Result<usize> {
        let conn = self.db.get()?;
        let pattern = format!("{}%", prefix);
        let n = conn.execute("DELETE FROM packs WHERE root_path LIKE ?1", [&pattern])?;
        Ok(n)
    }

    pub fn delete_not_under_paths(&self, roots: &[String]) -> Result<usize> {
        let conn = self.db.get()?;
        if roots.is_empty() {
            return Ok(conn.execute("DELETE FROM packs", [])?);
        }
        let predicates = roots
            .iter()
            .map(|_| "root_path LIKE ?")
            .collect::<Vec<_>>()
            .join(" OR ");
        let sql = format!("DELETE FROM packs WHERE NOT ({})", predicates);
        let params = roots
            .iter()
            .map(|r| format!("{}%", r))
            .collect::<Vec<_>>();
        let n = conn.execute(&sql, rusqlite::params_from_iter(params.iter()))?;
        Ok(n)
    }

    pub fn recount_all(&self) -> Result<()> {
        let conn = self.db.get()?;
        conn.execute(
            "UPDATE packs SET asset_count = \
               (SELECT COUNT(*) FROM assets a WHERE a.pack_id = packs.id AND a.index_status != 'missing')",
            [],
        )?;
        Ok(())
    }

    /// Delete packs whose root_path no longer exists on disk AND have no active assets.
    pub fn delete_empty_or_missing(&self) -> Result<usize> {
        let packs = self.list()?;
        let to_delete: Vec<String> = packs
            .into_iter()
            .filter(|p| p.asset_count == 0 && !std::path::Path::new(&p.root_path).exists())
            .map(|p| p.id)
            .collect();
        if to_delete.is_empty() {
            return Ok(0);
        }
        let conn = self.db.get()?;
        let placeholders = to_delete.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let n = conn.execute(
            &format!("DELETE FROM packs WHERE id IN ({})", placeholders),
            rusqlite::params_from_iter(to_delete.iter()),
        )?;
        Ok(n)
    }
}

fn row_to_pack(row: &Row) -> rusqlite::Result<Pack> {
    let project_meta_str: Option<String> = row.get(10).ok();
    let project_meta = project_meta_str
        .as_deref()
        .and_then(|s| serde_json::from_str::<ProjectFolderMeta>(s).ok());
    Ok(Pack {
        id: row.get(0)?,
        name: row.get(1)?,
        root_path: row.get(2)?,
        vendor: row.get(3).ok(),
        genre: row.get(4).ok(),
        color: row.get(5).ok(),
        asset_count: row.get(6).unwrap_or(0),
        added_at: row.get(7)?,
        updated_at: row.get(8)?,
        kind: row.get(9).unwrap_or_else(|_| "pack".to_string()),
        project_meta,
    })
}

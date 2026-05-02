use std::path::Path;
use std::sync::Arc;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;

use crate::error::Result;

pub type PooledConn = r2d2::PooledConnection<SqliteConnectionManager>;

pub struct DatabasePool {
    pool: Pool<SqliteConnectionManager>,
}

impl DatabasePool {
    pub fn open(db_path: &Path) -> Result<Arc<Self>> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let manager = SqliteConnectionManager::file(db_path).with_init(|c: &mut Connection| {
            c.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA temp_store = MEMORY;
                 PRAGMA mmap_size = 268435456;
                 PRAGMA cache_size = -32000;
                 PRAGMA busy_timeout = 10000;
                 PRAGMA wal_autocheckpoint = 1000;",
            )
        });

        // One dedicated write connection + several read connections.
        // SQLite WAL allows concurrent readers but only one writer at a time.
        // Keeping the pool small reduces write contention dramatically.
        let pool = Pool::builder().max_size(4).build(manager)?;

        let mut conn = pool.get()?;
        super::migrations::run(&mut conn)?;

        Ok(Arc::new(Self { pool }))
    }

    pub fn get(&self) -> Result<PooledConn> {
        Ok(self.pool.get()?)
    }
}

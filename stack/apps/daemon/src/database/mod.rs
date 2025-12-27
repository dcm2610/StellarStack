//! State persistence module
//!
//! Provides SQLite-based state storage for server state persistence.

mod state;
mod activity;

pub use state::{StateStore, ServerState};
pub use activity::{ActivityStore, ActivityLog, ActivityAction};

use std::path::Path;

use rusqlite::{Connection, Result as SqliteResult};
use thiserror::Error;
use tokio::sync::Mutex;
use tracing::info;

/// Database errors
#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("{0}")]
    Other(String),
}

pub type DatabaseResult<T> = Result<T, DatabaseError>;

/// Main database wrapper
pub struct Database {
    conn: Mutex<Connection>,
    pub state: StateStore,
    pub activity: ActivityStore,
}

impl Database {
    /// Open or create the database
    pub fn open(path: impl AsRef<Path>) -> DatabaseResult<Self> {
        let path = path.as_ref();

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path)?;

        // Enable WAL mode for better concurrent access
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        // Initialize tables
        Self::init_tables(&conn)?;

        info!("Database opened at {:?}", path);

        Ok(Self {
            conn: Mutex::new(conn),
            state: StateStore::new(),
            activity: ActivityStore::new(),
        })
    }

    /// Open an in-memory database (for testing)
    pub fn open_in_memory() -> DatabaseResult<Self> {
        let conn = Connection::open_in_memory()?;
        Self::init_tables(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
            state: StateStore::new(),
            activity: ActivityStore::new(),
        })
    }

    /// Initialize database tables
    fn init_tables(conn: &Connection) -> SqliteResult<()> {
        conn.execute_batch(
            r#"
            -- Server state table
            CREATE TABLE IF NOT EXISTS server_state (
                server_uuid TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                last_crash_time INTEGER,
                crash_count INTEGER DEFAULT 0,
                is_installing INTEGER DEFAULT 0,
                is_transferring INTEGER DEFAULT 0,
                is_restoring INTEGER DEFAULT 0,
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            );

            -- Activity log queue
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_uuid TEXT NOT NULL,
                user_uuid TEXT,
                action TEXT NOT NULL,
                metadata TEXT,
                ip_address TEXT,
                timestamp INTEGER DEFAULT (strftime('%s', 'now')),
                sent INTEGER DEFAULT 0
            );

            -- Backup metadata
            CREATE TABLE IF NOT EXISTS backup_metadata (
                backup_uuid TEXT PRIMARY KEY,
                server_uuid TEXT NOT NULL,
                checksum TEXT,
                size INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                is_locked INTEGER DEFAULT 0,
                adapter_type TEXT
            );

            -- Index for activity log queue
            CREATE INDEX IF NOT EXISTS idx_activity_log_sent
                ON activity_log(sent, timestamp);

            CREATE INDEX IF NOT EXISTS idx_activity_log_server
                ON activity_log(server_uuid);

            -- Index for backup lookup
            CREATE INDEX IF NOT EXISTS idx_backup_server
                ON backup_metadata(server_uuid);
            "#,
        )?;

        Ok(())
    }

    /// Get state store with connection
    pub async fn state_store(&self) -> StateStoreWithConn<'_> {
        StateStoreWithConn {
            conn: self.conn.lock().await,
            store: &self.state,
        }
    }

    /// Get activity store with connection
    pub async fn activity_store(&self) -> ActivityStoreWithConn<'_> {
        ActivityStoreWithConn {
            conn: self.conn.lock().await,
            store: &self.activity,
        }
    }

    /// Save backup metadata
    pub async fn save_backup(
        &self,
        backup_uuid: &str,
        server_uuid: &str,
        checksum: Option<&str>,
        size: u64,
        is_locked: bool,
        adapter_type: &str,
    ) -> DatabaseResult<()> {
        let conn = self.conn.lock().await;
        conn.execute(
            r#"
            INSERT OR REPLACE INTO backup_metadata
                (backup_uuid, server_uuid, checksum, size, is_locked, adapter_type)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            rusqlite::params![
                backup_uuid,
                server_uuid,
                checksum,
                size as i64,
                is_locked as i32,
                adapter_type
            ],
        )?;
        Ok(())
    }

    /// Delete backup metadata
    pub async fn delete_backup(&self, backup_uuid: &str) -> DatabaseResult<()> {
        let conn = self.conn.lock().await;
        conn.execute(
            "DELETE FROM backup_metadata WHERE backup_uuid = ?1",
            [backup_uuid],
        )?;
        Ok(())
    }

    /// List backups for a server
    pub async fn list_backups(&self, server_uuid: &str) -> DatabaseResult<Vec<BackupMetadata>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            r#"
            SELECT backup_uuid, server_uuid, checksum, size, created_at, is_locked, adapter_type
            FROM backup_metadata
            WHERE server_uuid = ?1
            ORDER BY created_at DESC
            "#,
        )?;

        let backups = stmt.query_map([server_uuid], |row| {
            Ok(BackupMetadata {
                backup_uuid: row.get(0)?,
                server_uuid: row.get(1)?,
                checksum: row.get(2)?,
                size: row.get::<_, i64>(3)? as u64,
                created_at: row.get(4)?,
                is_locked: row.get::<_, i32>(5)? != 0,
                adapter_type: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(backups)
    }
}

/// Backup metadata record
#[derive(Debug, Clone)]
pub struct BackupMetadata {
    pub backup_uuid: String,
    pub server_uuid: String,
    pub checksum: Option<String>,
    pub size: u64,
    pub created_at: i64,
    pub is_locked: bool,
    pub adapter_type: String,
}

/// State store with active connection
pub struct StateStoreWithConn<'a> {
    conn: tokio::sync::MutexGuard<'a, Connection>,
    store: &'a StateStore,
}

impl<'a> StateStoreWithConn<'a> {
    /// Get server state
    pub fn get(&self, server_uuid: &str) -> DatabaseResult<Option<ServerState>> {
        self.store.get(&self.conn, server_uuid)
    }

    /// Save server state
    pub fn save(&self, state: &ServerState) -> DatabaseResult<()> {
        self.store.save(&self.conn, state)
    }

    /// Delete server state
    pub fn delete(&self, server_uuid: &str) -> DatabaseResult<()> {
        self.store.delete(&self.conn, server_uuid)
    }
}

/// Activity store with active connection
pub struct ActivityStoreWithConn<'a> {
    conn: tokio::sync::MutexGuard<'a, Connection>,
    store: &'a ActivityStore,
}

impl<'a> ActivityStoreWithConn<'a> {
    /// Log an activity
    pub fn log(&self, activity: &ActivityLog) -> DatabaseResult<()> {
        self.store.log(&self.conn, activity)
    }

    /// Get pending (unsent) activities
    pub fn get_pending(&self, limit: usize) -> DatabaseResult<Vec<ActivityLog>> {
        self.store.get_pending(&self.conn, limit)
    }

    /// Mark activities as sent
    pub fn mark_sent(&self, ids: &[i64]) -> DatabaseResult<()> {
        self.store.mark_sent(&self.conn, ids)
    }

    /// Delete old sent activities
    pub fn cleanup(&self, older_than_secs: i64) -> DatabaseResult<usize> {
        self.store.cleanup(&self.conn, older_than_secs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_database_open() {
        let db = Database::open_in_memory().unwrap();

        // Save and retrieve state
        let state = ServerState {
            server_uuid: "test-uuid".to_string(),
            state: "running".to_string(),
            crash_count: 0,
            last_crash_time: None,
            is_installing: false,
            is_transferring: false,
            is_restoring: false,
        };

        {
            let store = db.state_store().await;
            store.save(&state).unwrap();
        }

        {
            let store = db.state_store().await;
            let loaded = store.get("test-uuid").unwrap();
            assert!(loaded.is_some());
            assert_eq!(loaded.unwrap().state, "running");
        }
    }
}

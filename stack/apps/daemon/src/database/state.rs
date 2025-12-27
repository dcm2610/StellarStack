//! Server state persistence

use rusqlite::Connection;

use super::{DatabaseError, DatabaseResult};

/// Server state record
#[derive(Debug, Clone)]
pub struct ServerState {
    pub server_uuid: String,
    pub state: String,
    pub crash_count: u32,
    pub last_crash_time: Option<i64>,
    pub is_installing: bool,
    pub is_transferring: bool,
    pub is_restoring: bool,
}

impl ServerState {
    /// Create a new server state
    pub fn new(server_uuid: impl Into<String>) -> Self {
        Self {
            server_uuid: server_uuid.into(),
            state: "offline".to_string(),
            crash_count: 0,
            last_crash_time: None,
            is_installing: false,
            is_transferring: false,
            is_restoring: false,
        }
    }

    /// Create state with specific values
    pub fn with_state(mut self, state: impl Into<String>) -> Self {
        self.state = state.into();
        self
    }
}

/// State store for server persistence
pub struct StateStore;

impl StateStore {
    /// Create a new state store
    pub fn new() -> Self {
        Self
    }

    /// Get server state by UUID
    pub fn get(&self, conn: &Connection, server_uuid: &str) -> DatabaseResult<Option<ServerState>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT server_uuid, state, crash_count, last_crash_time,
                   is_installing, is_transferring, is_restoring
            FROM server_state
            WHERE server_uuid = ?1
            "#,
        )?;

        let result = stmt.query_row([server_uuid], |row| {
            Ok(ServerState {
                server_uuid: row.get(0)?,
                state: row.get(1)?,
                crash_count: row.get::<_, i32>(2)? as u32,
                last_crash_time: row.get(3)?,
                is_installing: row.get::<_, i32>(4)? != 0,
                is_transferring: row.get::<_, i32>(5)? != 0,
                is_restoring: row.get::<_, i32>(6)? != 0,
            })
        });

        match result {
            Ok(state) => Ok(Some(state)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DatabaseError::from(e)),
        }
    }

    /// Save server state
    pub fn save(&self, conn: &Connection, state: &ServerState) -> DatabaseResult<()> {
        conn.execute(
            r#"
            INSERT OR REPLACE INTO server_state
                (server_uuid, state, crash_count, last_crash_time,
                 is_installing, is_transferring, is_restoring, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%s', 'now'))
            "#,
            rusqlite::params![
                state.server_uuid,
                state.state,
                state.crash_count as i32,
                state.last_crash_time,
                state.is_installing as i32,
                state.is_transferring as i32,
                state.is_restoring as i32,
            ],
        )?;
        Ok(())
    }

    /// Delete server state
    pub fn delete(&self, conn: &Connection, server_uuid: &str) -> DatabaseResult<()> {
        conn.execute(
            "DELETE FROM server_state WHERE server_uuid = ?1",
            [server_uuid],
        )?;
        Ok(())
    }

    /// Get all server states
    pub fn all(&self, conn: &Connection) -> DatabaseResult<Vec<ServerState>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT server_uuid, state, crash_count, last_crash_time,
                   is_installing, is_transferring, is_restoring
            FROM server_state
            "#,
        )?;

        let states = stmt.query_map([], |row| {
            Ok(ServerState {
                server_uuid: row.get(0)?,
                state: row.get(1)?,
                crash_count: row.get::<_, i32>(2)? as u32,
                last_crash_time: row.get(3)?,
                is_installing: row.get::<_, i32>(4)? != 0,
                is_transferring: row.get::<_, i32>(5)? != 0,
                is_restoring: row.get::<_, i32>(6)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(states)
    }

    /// Update only the state field
    pub fn update_state(&self, conn: &Connection, server_uuid: &str, state: &str) -> DatabaseResult<()> {
        conn.execute(
            r#"
            UPDATE server_state
            SET state = ?2, updated_at = strftime('%s', 'now')
            WHERE server_uuid = ?1
            "#,
            rusqlite::params![server_uuid, state],
        )?;
        Ok(())
    }

    /// Record a crash
    pub fn record_crash(&self, conn: &Connection, server_uuid: &str) -> DatabaseResult<()> {
        conn.execute(
            r#"
            UPDATE server_state
            SET crash_count = crash_count + 1,
                last_crash_time = strftime('%s', 'now'),
                updated_at = strftime('%s', 'now')
            WHERE server_uuid = ?1
            "#,
            [server_uuid],
        )?;
        Ok(())
    }

    /// Reset crash counter
    pub fn reset_crashes(&self, conn: &Connection, server_uuid: &str) -> DatabaseResult<()> {
        conn.execute(
            r#"
            UPDATE server_state
            SET crash_count = 0, last_crash_time = NULL, updated_at = strftime('%s', 'now')
            WHERE server_uuid = ?1
            "#,
            [server_uuid],
        )?;
        Ok(())
    }

    /// Set installing flag
    pub fn set_installing(&self, conn: &Connection, server_uuid: &str, value: bool) -> DatabaseResult<()> {
        conn.execute(
            r#"
            UPDATE server_state
            SET is_installing = ?2, updated_at = strftime('%s', 'now')
            WHERE server_uuid = ?1
            "#,
            rusqlite::params![server_uuid, value as i32],
        )?;
        Ok(())
    }

    /// Set transferring flag
    pub fn set_transferring(&self, conn: &Connection, server_uuid: &str, value: bool) -> DatabaseResult<()> {
        conn.execute(
            r#"
            UPDATE server_state
            SET is_transferring = ?2, updated_at = strftime('%s', 'now')
            WHERE server_uuid = ?1
            "#,
            rusqlite::params![server_uuid, value as i32],
        )?;
        Ok(())
    }

    /// Set restoring flag
    pub fn set_restoring(&self, conn: &Connection, server_uuid: &str, value: bool) -> DatabaseResult<()> {
        conn.execute(
            r#"
            UPDATE server_state
            SET is_restoring = ?2, updated_at = strftime('%s', 'now')
            WHERE server_uuid = ?1
            "#,
            rusqlite::params![server_uuid, value as i32],
        )?;
        Ok(())
    }
}

impl Default for StateStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE server_state (
                server_uuid TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                last_crash_time INTEGER,
                crash_count INTEGER DEFAULT 0,
                is_installing INTEGER DEFAULT 0,
                is_transferring INTEGER DEFAULT 0,
                is_restoring INTEGER DEFAULT 0,
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            );
            "#,
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_save_and_get() {
        let conn = setup_db();
        let store = StateStore::new();

        let state = ServerState::new("test-uuid").with_state("running");
        store.save(&conn, &state).unwrap();

        let loaded = store.get(&conn, "test-uuid").unwrap();
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.server_uuid, "test-uuid");
        assert_eq!(loaded.state, "running");
    }

    #[test]
    fn test_record_crash() {
        let conn = setup_db();
        let store = StateStore::new();

        let state = ServerState::new("test-uuid");
        store.save(&conn, &state).unwrap();

        store.record_crash(&conn, "test-uuid").unwrap();
        store.record_crash(&conn, "test-uuid").unwrap();

        let loaded = store.get(&conn, "test-uuid").unwrap().unwrap();
        assert_eq!(loaded.crash_count, 2);
        assert!(loaded.last_crash_time.is_some());
    }
}

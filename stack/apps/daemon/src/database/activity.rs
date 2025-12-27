//! Activity log persistence

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use super::DatabaseResult;

/// Activity action types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityAction {
    // Power actions
    ServerStart,
    ServerStop,
    ServerRestart,
    ServerKill,

    // File actions
    FileRead,
    FileWrite,
    FileDelete,
    FileRename,
    FileCompress,
    FileDecompress,
    FileDownload,
    FileUpload,

    // Directory actions
    DirectoryCreate,
    DirectoryDelete,

    // Backup actions
    BackupCreate,
    BackupRestore,
    BackupDelete,
    BackupDownload,

    // Console actions
    ConsoleCommand,

    // Schedule actions
    ScheduleCreate,
    ScheduleUpdate,
    ScheduleDelete,
    ScheduleExecute,

    // Subuser actions
    SubuserCreate,
    SubuserUpdate,
    SubuserDelete,

    // Settings actions
    SettingsUpdate,
    StartupUpdate,

    // Database actions
    DatabaseCreate,
    DatabaseDelete,
    DatabaseRotatePassword,

    // Allocation actions
    AllocationUpdate,

    // SFTP actions
    SftpConnect,
    SftpRead,
    SftpWrite,
    SftpDelete,

    // Other
    Custom(String),
}

impl std::fmt::Display for ActivityAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActivityAction::ServerStart => write!(f, "server:start"),
            ActivityAction::ServerStop => write!(f, "server:stop"),
            ActivityAction::ServerRestart => write!(f, "server:restart"),
            ActivityAction::ServerKill => write!(f, "server:kill"),
            ActivityAction::FileRead => write!(f, "file:read"),
            ActivityAction::FileWrite => write!(f, "file:write"),
            ActivityAction::FileDelete => write!(f, "file:delete"),
            ActivityAction::FileRename => write!(f, "file:rename"),
            ActivityAction::FileCompress => write!(f, "file:compress"),
            ActivityAction::FileDecompress => write!(f, "file:decompress"),
            ActivityAction::FileDownload => write!(f, "file:download"),
            ActivityAction::FileUpload => write!(f, "file:upload"),
            ActivityAction::DirectoryCreate => write!(f, "directory:create"),
            ActivityAction::DirectoryDelete => write!(f, "directory:delete"),
            ActivityAction::BackupCreate => write!(f, "backup:create"),
            ActivityAction::BackupRestore => write!(f, "backup:restore"),
            ActivityAction::BackupDelete => write!(f, "backup:delete"),
            ActivityAction::BackupDownload => write!(f, "backup:download"),
            ActivityAction::ConsoleCommand => write!(f, "console:command"),
            ActivityAction::ScheduleCreate => write!(f, "schedule:create"),
            ActivityAction::ScheduleUpdate => write!(f, "schedule:update"),
            ActivityAction::ScheduleDelete => write!(f, "schedule:delete"),
            ActivityAction::ScheduleExecute => write!(f, "schedule:execute"),
            ActivityAction::SubuserCreate => write!(f, "subuser:create"),
            ActivityAction::SubuserUpdate => write!(f, "subuser:update"),
            ActivityAction::SubuserDelete => write!(f, "subuser:delete"),
            ActivityAction::SettingsUpdate => write!(f, "settings:update"),
            ActivityAction::StartupUpdate => write!(f, "startup:update"),
            ActivityAction::DatabaseCreate => write!(f, "database:create"),
            ActivityAction::DatabaseDelete => write!(f, "database:delete"),
            ActivityAction::DatabaseRotatePassword => write!(f, "database:rotate-password"),
            ActivityAction::AllocationUpdate => write!(f, "allocation:update"),
            ActivityAction::SftpConnect => write!(f, "sftp:connect"),
            ActivityAction::SftpRead => write!(f, "sftp:read"),
            ActivityAction::SftpWrite => write!(f, "sftp:write"),
            ActivityAction::SftpDelete => write!(f, "sftp:delete"),
            ActivityAction::Custom(s) => write!(f, "{}", s),
        }
    }
}

/// Activity log entry
#[derive(Debug, Clone)]
pub struct ActivityLog {
    pub id: Option<i64>,
    pub server_uuid: String,
    pub user_uuid: Option<String>,
    pub action: ActivityAction,
    pub metadata: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub timestamp: i64,
    pub sent: bool,
}

impl ActivityLog {
    /// Create a new activity log entry
    pub fn new(server_uuid: impl Into<String>, action: ActivityAction) -> Self {
        Self {
            id: None,
            server_uuid: server_uuid.into(),
            user_uuid: None,
            action,
            metadata: None,
            ip_address: None,
            timestamp: chrono::Utc::now().timestamp(),
            sent: false,
        }
    }

    /// Set the user UUID
    pub fn with_user(mut self, user_uuid: impl Into<String>) -> Self {
        self.user_uuid = Some(user_uuid.into());
        self
    }

    /// Set metadata
    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Set IP address
    pub fn with_ip(mut self, ip: impl Into<String>) -> Self {
        self.ip_address = Some(ip.into());
        self
    }
}

/// Activity store for log persistence
pub struct ActivityStore;

impl ActivityStore {
    /// Create a new activity store
    pub fn new() -> Self {
        Self
    }

    /// Log an activity
    pub fn log(&self, conn: &Connection, activity: &ActivityLog) -> DatabaseResult<()> {
        let metadata_json = activity.metadata
            .as_ref()
            .map(|m| serde_json::to_string(m).unwrap_or_default());

        conn.execute(
            r#"
            INSERT INTO activity_log
                (server_uuid, user_uuid, action, metadata, ip_address, timestamp, sent)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            rusqlite::params![
                activity.server_uuid,
                activity.user_uuid,
                activity.action.to_string(),
                metadata_json,
                activity.ip_address,
                activity.timestamp,
                activity.sent as i32,
            ],
        )?;
        Ok(())
    }

    /// Get pending (unsent) activities
    pub fn get_pending(&self, conn: &Connection, limit: usize) -> DatabaseResult<Vec<ActivityLog>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, server_uuid, user_uuid, action, metadata, ip_address, timestamp
            FROM activity_log
            WHERE sent = 0
            ORDER BY timestamp ASC
            LIMIT ?1
            "#,
        )?;

        let activities = stmt.query_map([limit as i64], |row| {
            let action_str: String = row.get(3)?;
            let metadata_str: Option<String> = row.get(4)?;

            Ok(ActivityLog {
                id: Some(row.get(0)?),
                server_uuid: row.get(1)?,
                user_uuid: row.get(2)?,
                action: parse_action(&action_str),
                metadata: metadata_str.and_then(|s| serde_json::from_str(&s).ok()),
                ip_address: row.get(5)?,
                timestamp: row.get(6)?,
                sent: false,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(activities)
    }

    /// Mark activities as sent
    pub fn mark_sent(&self, conn: &Connection, ids: &[i64]) -> DatabaseResult<()> {
        if ids.is_empty() {
            return Ok(());
        }

        let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
        let query = format!(
            "UPDATE activity_log SET sent = 1 WHERE id IN ({})",
            placeholders.join(", ")
        );

        let mut stmt = conn.prepare(&query)?;

        for (i, id) in ids.iter().enumerate() {
            stmt.raw_bind_parameter(i + 1, *id)?;
        }

        stmt.raw_execute()?;
        Ok(())
    }

    /// Delete old sent activities
    pub fn cleanup(&self, conn: &Connection, older_than_secs: i64) -> DatabaseResult<usize> {
        let cutoff = chrono::Utc::now().timestamp() - older_than_secs;

        let deleted = conn.execute(
            "DELETE FROM activity_log WHERE sent = 1 AND timestamp < ?1",
            [cutoff],
        )?;

        Ok(deleted)
    }

    /// Get activities for a server
    pub fn get_for_server(
        &self,
        conn: &Connection,
        server_uuid: &str,
        limit: usize,
        offset: usize,
    ) -> DatabaseResult<Vec<ActivityLog>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, server_uuid, user_uuid, action, metadata, ip_address, timestamp, sent
            FROM activity_log
            WHERE server_uuid = ?1
            ORDER BY timestamp DESC
            LIMIT ?2 OFFSET ?3
            "#,
        )?;

        let activities = stmt.query_map(
            rusqlite::params![server_uuid, limit as i64, offset as i64],
            |row| {
                let action_str: String = row.get(3)?;
                let metadata_str: Option<String> = row.get(4)?;

                Ok(ActivityLog {
                    id: Some(row.get(0)?),
                    server_uuid: row.get(1)?,
                    user_uuid: row.get(2)?,
                    action: parse_action(&action_str),
                    metadata: metadata_str.and_then(|s| serde_json::from_str(&s).ok()),
                    ip_address: row.get(5)?,
                    timestamp: row.get(6)?,
                    sent: row.get::<_, i32>(7)? != 0,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(activities)
    }

    /// Count pending activities
    pub fn count_pending(&self, conn: &Connection) -> DatabaseResult<usize> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM activity_log WHERE sent = 0",
            [],
            |row| row.get(0),
        )?;
        Ok(count as usize)
    }
}

impl Default for ActivityStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse action string to ActivityAction
fn parse_action(s: &str) -> ActivityAction {
    match s {
        "server:start" => ActivityAction::ServerStart,
        "server:stop" => ActivityAction::ServerStop,
        "server:restart" => ActivityAction::ServerRestart,
        "server:kill" => ActivityAction::ServerKill,
        "file:read" => ActivityAction::FileRead,
        "file:write" => ActivityAction::FileWrite,
        "file:delete" => ActivityAction::FileDelete,
        "file:rename" => ActivityAction::FileRename,
        "file:compress" => ActivityAction::FileCompress,
        "file:decompress" => ActivityAction::FileDecompress,
        "file:download" => ActivityAction::FileDownload,
        "file:upload" => ActivityAction::FileUpload,
        "directory:create" => ActivityAction::DirectoryCreate,
        "directory:delete" => ActivityAction::DirectoryDelete,
        "backup:create" => ActivityAction::BackupCreate,
        "backup:restore" => ActivityAction::BackupRestore,
        "backup:delete" => ActivityAction::BackupDelete,
        "backup:download" => ActivityAction::BackupDownload,
        "console:command" => ActivityAction::ConsoleCommand,
        "schedule:create" => ActivityAction::ScheduleCreate,
        "schedule:update" => ActivityAction::ScheduleUpdate,
        "schedule:delete" => ActivityAction::ScheduleDelete,
        "schedule:execute" => ActivityAction::ScheduleExecute,
        "subuser:create" => ActivityAction::SubuserCreate,
        "subuser:update" => ActivityAction::SubuserUpdate,
        "subuser:delete" => ActivityAction::SubuserDelete,
        "settings:update" => ActivityAction::SettingsUpdate,
        "startup:update" => ActivityAction::StartupUpdate,
        "database:create" => ActivityAction::DatabaseCreate,
        "database:delete" => ActivityAction::DatabaseDelete,
        "database:rotate-password" => ActivityAction::DatabaseRotatePassword,
        "allocation:update" => ActivityAction::AllocationUpdate,
        "sftp:connect" => ActivityAction::SftpConnect,
        "sftp:read" => ActivityAction::SftpRead,
        "sftp:write" => ActivityAction::SftpWrite,
        "sftp:delete" => ActivityAction::SftpDelete,
        other => ActivityAction::Custom(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_uuid TEXT NOT NULL,
                user_uuid TEXT,
                action TEXT NOT NULL,
                metadata TEXT,
                ip_address TEXT,
                timestamp INTEGER DEFAULT (strftime('%s', 'now')),
                sent INTEGER DEFAULT 0
            );
            "#,
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_log_and_get_pending() {
        let conn = setup_db();
        let store = ActivityStore::new();

        let activity = ActivityLog::new("server-1", ActivityAction::ServerStart)
            .with_user("user-1")
            .with_ip("192.168.1.1");

        store.log(&conn, &activity).unwrap();

        let pending = store.get_pending(&conn, 10).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].server_uuid, "server-1");
    }

    #[test]
    fn test_mark_sent() {
        let conn = setup_db();
        let store = ActivityStore::new();

        let activity = ActivityLog::new("server-1", ActivityAction::ServerStart);
        store.log(&conn, &activity).unwrap();

        let pending = store.get_pending(&conn, 10).unwrap();
        assert_eq!(pending.len(), 1);

        let ids: Vec<i64> = pending.iter().filter_map(|a| a.id).collect();
        store.mark_sent(&conn, &ids).unwrap();

        let pending = store.get_pending(&conn, 10).unwrap();
        assert_eq!(pending.len(), 0);
    }
}

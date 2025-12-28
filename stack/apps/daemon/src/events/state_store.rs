//! Redis state store for daemon state persistence
//!
//! Stores daemon state in Redis so it can survive daemon restarts.
//! This includes server states, console logs, and active operations.

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

use super::ProcessState;

/// Maximum number of console log lines to store per server
const MAX_CONSOLE_LINES: usize = 500;

/// Maximum number of install log lines to store per server
const MAX_INSTALL_LINES: usize = 500;

/// TTL for server state keys (24 hours)
const STATE_TTL_SECONDS: u64 = 86400;

/// Cached server state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedServerState {
    /// Current process state
    pub state: String,

    /// Whether server is installing
    pub installing: bool,

    /// Last known container ID (if running)
    pub container_id: Option<String>,

    /// Timestamp of last state change
    pub last_updated: u64,
}

impl Default for CachedServerState {
    fn default() -> Self {
        Self {
            state: "offline".to_string(),
            installing: false,
            container_id: None,
            last_updated: 0,
        }
    }
}

/// Redis state store for daemon persistence
pub struct RedisStateStore {
    /// Redis connection manager
    connection: Arc<RwLock<Option<ConnectionManager>>>,

    /// Key prefix for state keys
    prefix: String,

    /// Whether Redis state storage is enabled
    enabled: bool,
}

impl RedisStateStore {
    /// Create a new state store (not yet connected)
    pub fn new(prefix: String, enabled: bool) -> Self {
        Self {
            connection: Arc::new(RwLock::new(None)),
            prefix,
            enabled,
        }
    }

    /// Connect to Redis
    pub async fn connect(&self, url: &str) -> Result<(), redis::RedisError> {
        if !self.enabled {
            debug!("Redis state store disabled, skipping connection");
            return Ok(());
        }

        info!("Connecting Redis state store to {}", url);

        let client = redis::Client::open(url)?;
        let connection = ConnectionManager::new(client).await?;

        *self.connection.write() = Some(connection);

        info!("Redis state store connected");
        Ok(())
    }

    /// Get a connection if available
    fn get_connection(&self) -> Option<ConnectionManager> {
        if !self.enabled {
            return None;
        }
        self.connection.read().clone()
    }

    // ========================================================================
    // Server State
    // ========================================================================

    /// Save server state
    pub async fn save_server_state(&self, server_id: &str, state: ProcessState, installing: bool) {
        let Some(mut conn) = self.get_connection() else {
            return;
        };

        let cached = CachedServerState {
            state: state.to_string(),
            installing,
            container_id: None,
            last_updated: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        };

        let key = format!("{}:state:{}", self.prefix, server_id);
        let value = match serde_json::to_string(&cached) {
            Ok(v) => v,
            Err(e) => {
                error!("Failed to serialize server state: {}", e);
                return;
            }
        };

        let result: Result<(), redis::RedisError> = conn.set_ex(&key, &value, STATE_TTL_SECONDS).await;
        if let Err(e) = result {
            warn!("Failed to save server state to Redis: {}", e);
        } else {
            debug!("Saved server {} state to Redis: {}", server_id, state);
        }
    }

    /// Get server state
    pub async fn get_server_state(&self, server_id: &str) -> Option<CachedServerState> {
        let Some(mut conn) = self.get_connection() else {
            return None;
        };

        let key = format!("{}:state:{}", self.prefix, server_id);
        let result: Result<Option<String>, redis::RedisError> = conn.get(&key).await;

        match result {
            Ok(Some(value)) => {
                match serde_json::from_str(&value) {
                    Ok(state) => Some(state),
                    Err(e) => {
                        warn!("Failed to deserialize server state: {}", e);
                        None
                    }
                }
            }
            Ok(None) => None,
            Err(e) => {
                warn!("Failed to get server state from Redis: {}", e);
                None
            }
        }
    }

    /// Get all cached server states
    pub async fn get_all_server_states(&self) -> HashMap<String, CachedServerState> {
        let Some(mut conn) = self.get_connection() else {
            return HashMap::new();
        };

        let pattern = format!("{}:state:*", self.prefix);
        let keys: Result<Vec<String>, redis::RedisError> = redis::cmd("KEYS")
            .arg(&pattern)
            .query_async(&mut conn)
            .await;

        let keys = match keys {
            Ok(k) => k,
            Err(e) => {
                warn!("Failed to get state keys from Redis: {}", e);
                return HashMap::new();
            }
        };

        let mut states = HashMap::new();
        let prefix_len = format!("{}:state:", self.prefix).len();

        for key in keys {
            let server_id = key[prefix_len..].to_string();
            if let Some(state) = self.get_server_state(&server_id).await {
                states.insert(server_id, state);
            }
        }

        states
    }

    /// Delete server state
    pub async fn delete_server_state(&self, server_id: &str) {
        let Some(mut conn) = self.get_connection() else {
            return;
        };

        let key = format!("{}:state:{}", self.prefix, server_id);
        let _: Result<(), redis::RedisError> = conn.del(&key).await;
    }

    // ========================================================================
    // Console Logs
    // ========================================================================

    /// Append console log line
    pub async fn append_console_log(&self, server_id: &str, line: &str) {
        let Some(mut conn) = self.get_connection() else {
            return;
        };

        let key = format!("{}:console:{}", self.prefix, server_id);

        // Push to list and trim to max size
        let _: Result<(), redis::RedisError> = redis::pipe()
            .rpush(&key, line)
            .ltrim(&key, -(MAX_CONSOLE_LINES as isize), -1)
            .expire(&key, STATE_TTL_SECONDS as i64)
            .query_async(&mut conn)
            .await;
    }

    /// Get console log history
    pub async fn get_console_logs(&self, server_id: &str) -> Vec<String> {
        let Some(mut conn) = self.get_connection() else {
            return Vec::new();
        };

        let key = format!("{}:console:{}", self.prefix, server_id);
        let result: Result<Vec<String>, redis::RedisError> = conn.lrange(&key, 0, -1).await;

        result.unwrap_or_default()
    }

    /// Clear console logs for a server
    pub async fn clear_console_logs(&self, server_id: &str) {
        let Some(mut conn) = self.get_connection() else {
            return;
        };

        let key = format!("{}:console:{}", self.prefix, server_id);
        let _: Result<(), redis::RedisError> = conn.del(&key).await;
    }

    // ========================================================================
    // Install Logs
    // ========================================================================

    /// Append install log line
    pub async fn append_install_log(&self, server_id: &str, line: &str) {
        let Some(mut conn) = self.get_connection() else {
            return;
        };

        let key = format!("{}:install:{}", self.prefix, server_id);

        let _: Result<(), redis::RedisError> = redis::pipe()
            .rpush(&key, line)
            .ltrim(&key, -(MAX_INSTALL_LINES as isize), -1)
            .expire(&key, STATE_TTL_SECONDS as i64)
            .query_async(&mut conn)
            .await;
    }

    /// Get install log history
    pub async fn get_install_logs(&self, server_id: &str) -> Vec<String> {
        let Some(mut conn) = self.get_connection() else {
            return Vec::new();
        };

        let key = format!("{}:install:{}", self.prefix, server_id);
        let result: Result<Vec<String>, redis::RedisError> = conn.lrange(&key, 0, -1).await;

        result.unwrap_or_default()
    }

    /// Clear install logs for a server
    pub async fn clear_install_logs(&self, server_id: &str) {
        let Some(mut conn) = self.get_connection() else {
            return;
        };

        let key = format!("{}:install:{}", self.prefix, server_id);
        let _: Result<(), redis::RedisError> = conn.del(&key).await;
    }

    // ========================================================================
    // Daemon State
    // ========================================================================

    /// Save daemon heartbeat (shows daemon is alive)
    pub async fn save_heartbeat(&self, daemon_id: &str) {
        let Some(mut conn) = self.get_connection() else {
            return;
        };

        let key = format!("{}:daemon:{}:heartbeat", self.prefix, daemon_id);
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let _: Result<(), redis::RedisError> = conn.set_ex(&key, timestamp, 60).await;
    }

    /// Check if connected to Redis
    pub fn is_connected(&self) -> bool {
        self.enabled && self.connection.read().is_some()
    }
}

impl Clone for RedisStateStore {
    fn clone(&self) -> Self {
        Self {
            connection: self.connection.clone(),
            prefix: self.prefix.clone(),
            enabled: self.enabled,
        }
    }
}

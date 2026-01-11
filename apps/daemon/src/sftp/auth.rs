//! SFTP authentication

use std::sync::Arc;

use tracing::{debug, info, warn};

use crate::api::{HttpClient, SftpAuthRequest};
use crate::server::Manager;
use super::{SftpError, SftpResult};

/// Authenticated SFTP user
#[derive(Debug, Clone)]
pub struct SftpUser {
    /// Server UUID
    pub server_uuid: String,

    /// User UUID
    pub user_uuid: String,

    /// User permissions
    pub permissions: Vec<String>,
}

impl SftpUser {
    /// Check if user has a specific permission
    pub fn has_permission(&self, permission: &str) -> bool {
        // Check for wildcard
        if self.permissions.contains(&"*".to_string()) {
            return true;
        }

        // Check exact match
        if self.permissions.contains(&permission.to_string()) {
            return true;
        }

        // Check prefix match (e.g., "file.*" matches "file.read")
        let parts: Vec<&str> = permission.split('.').collect();
        if parts.len() > 1 {
            let prefix = format!("{}.*", parts[0]);
            if self.permissions.contains(&prefix) {
                return true;
            }
        }

        false
    }

    /// Check if user can read files
    pub fn can_read(&self) -> bool {
        self.has_permission("file.read") || self.has_permission("file.read-content")
    }

    /// Check if user can write files
    pub fn can_write(&self) -> bool {
        self.has_permission("file.write") || self.has_permission("file.create")
    }

    /// Check if user can delete files
    pub fn can_delete(&self) -> bool {
        self.has_permission("file.delete")
    }

    /// Check if user can create directories
    pub fn can_create_dir(&self) -> bool {
        self.has_permission("file.create")
    }
}

/// SFTP authenticator
pub struct SftpAuthenticator {
    /// API client for panel communication
    api_client: Arc<HttpClient>,

    /// Server manager
    manager: Arc<Manager>,
}

impl SftpAuthenticator {
    /// Create a new authenticator
    pub fn new(api_client: Arc<HttpClient>, manager: Arc<Manager>) -> Self {
        Self { api_client, manager }
    }

    /// Authenticate a user
    ///
    /// Username format: `server_uuid.user_uuid` or `server_uuid.email`
    pub async fn authenticate(&self, username: &str, password: &str) -> SftpResult<SftpUser> {
        debug!("SFTP auth attempt for user: {}", username);

        // Parse username - split only on FIRST dot to support emails with dots
        let parts: Vec<&str> = username.splitn(2, '.').collect();
        if parts.len() != 2 {
            warn!("Invalid SFTP username format: {}", username);
            return Err(SftpError::AuthFailed(
                "Invalid username format. Expected: server_uuid.user_uuid or server_uuid.email".into()
            ));
        }

        let server_uuid = parts[0];
        let user_uuid = parts[1];

        // Check if server exists on this node
        if !self.manager.exists(server_uuid) {
            warn!("SFTP auth failed: server {} not found", server_uuid);
            return Err(SftpError::ServerNotFound(server_uuid.to_string()));
        }

        // Validate credentials with panel
        let request = SftpAuthRequest {
            username: username.to_string(),
            password: password.to_string(),
        };

        let response = self.api_client.validate_sftp_credentials(&request).await
            .map_err(|e| {
                warn!("SFTP auth failed for {}: {}", username, e);
                SftpError::AuthFailed(e.to_string())
            })?;

        // Verify server matches
        if response.server != server_uuid {
            warn!("SFTP server mismatch: {} != {}", response.server, server_uuid);
            return Err(SftpError::AuthFailed("Server mismatch".into()));
        }

        info!("SFTP auth successful for user {} on server {}", user_uuid, server_uuid);

        Ok(SftpUser {
            server_uuid: server_uuid.to_string(),
            user_uuid: user_uuid.to_string(),
            permissions: response.permissions,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_permissions() {
        let user = SftpUser {
            server_uuid: "test".to_string(),
            user_uuid: "user".to_string(),
            permissions: vec![
                "file.read".to_string(),
                "file.write".to_string(),
            ],
        };

        assert!(user.has_permission("file.read"));
        assert!(user.has_permission("file.write"));
        assert!(!user.has_permission("file.delete"));
        assert!(user.can_read());
        assert!(user.can_write());
        assert!(!user.can_delete());
    }

    #[test]
    fn test_wildcard_permission() {
        let user = SftpUser {
            server_uuid: "test".to_string(),
            user_uuid: "user".to_string(),
            permissions: vec!["*".to_string()],
        };

        assert!(user.has_permission("anything"));
        assert!(user.can_read());
        assert!(user.can_write());
        assert!(user.can_delete());
    }

    #[test]
    fn test_prefix_permission() {
        let user = SftpUser {
            server_uuid: "test".to_string(),
            user_uuid: "user".to_string(),
            permissions: vec!["file.*".to_string()],
        };

        assert!(user.has_permission("file.read"));
        assert!(user.has_permission("file.write"));
        assert!(user.has_permission("file.delete"));
    }
}

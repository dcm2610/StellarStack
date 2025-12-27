//! SFTP file handler
//!
//! Placeholder implementation - full SFTP support to be implemented

use std::sync::Arc;

use crate::filesystem::Filesystem;
use super::auth::SftpUser;

/// SFTP file operations handler (placeholder)
pub struct SftpFileHandler {
    /// Server filesystem
    #[allow(dead_code)]
    filesystem: Arc<Filesystem>,

    /// Authenticated user
    #[allow(dead_code)]
    user: SftpUser,

    /// Read-only mode
    #[allow(dead_code)]
    read_only: bool,
}

impl SftpFileHandler {
    /// Create a new SFTP file handler
    pub fn new(filesystem: Arc<Filesystem>, user: SftpUser, read_only: bool) -> Self {
        Self {
            filesystem,
            user,
            read_only,
        }
    }
}

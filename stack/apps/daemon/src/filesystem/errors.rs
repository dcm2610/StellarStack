//! Filesystem error types

use thiserror::Error;

/// Errors that can occur during filesystem operations
#[derive(Debug, Error)]
pub enum FilesystemError {
    /// Path traversal attempt detected
    #[error("Path traversal detected: attempted to access path outside root")]
    PathTraversal,

    /// File or directory not found
    #[error("Not found: {0}")]
    NotFound(String),

    /// File or directory already exists
    #[error("Already exists: {0}")]
    AlreadyExists(String),

    /// Access denied (denylist match or permissions)
    #[error("Access denied: {0}")]
    AccessDenied(String),

    /// Disk space exceeded
    #[error("Disk space limit exceeded (limit: {limit} bytes, used: {used} bytes)")]
    DiskSpaceExceeded { limit: u64, used: u64 },

    /// Invalid path
    #[error("Invalid path: {0}")]
    InvalidPath(String),

    /// Unsupported archive format
    #[error("Unsupported archive format: {0}")]
    UnsupportedArchive(String),

    /// Archive operation failed
    #[error("Archive operation failed: {0}")]
    ArchiveError(String),

    /// IO error
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Other errors
    #[error("{0}")]
    Other(String),
}

impl FilesystemError {
    /// Check if this is a "not found" error
    pub fn is_not_found(&self) -> bool {
        matches!(self, FilesystemError::NotFound(_))
    }

    /// Check if this is a permission/access error
    pub fn is_access_denied(&self) -> bool {
        matches!(self, FilesystemError::AccessDenied(_) | FilesystemError::PathTraversal)
    }

    /// Check if this is a disk space error
    pub fn is_disk_space(&self) -> bool {
        matches!(self, FilesystemError::DiskSpaceExceeded { .. })
    }

    /// Get HTTP status code for this error
    pub fn status_code(&self) -> u16 {
        match self {
            FilesystemError::NotFound(_) => 404,
            FilesystemError::PathTraversal => 403,
            FilesystemError::AccessDenied(_) => 403,
            FilesystemError::AlreadyExists(_) => 409,
            FilesystemError::DiskSpaceExceeded { .. } => 507,
            FilesystemError::InvalidPath(_) => 400,
            FilesystemError::UnsupportedArchive(_) => 400,
            _ => 500,
        }
    }
}

/// Result type for filesystem operations
pub type FilesystemResult<T> = Result<T, FilesystemError>;

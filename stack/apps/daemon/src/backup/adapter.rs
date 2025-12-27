//! Backup adapter trait

use std::path::Path;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::backup::BackupResult;

/// Type of backup adapter
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AdapterType {
    /// Local filesystem storage
    Local,
    /// S3-compatible object storage
    S3,
}

impl Default for AdapterType {
    fn default() -> Self {
        AdapterType::Local
    }
}

/// Trait for backup storage adapters
#[async_trait]
pub trait BackupAdapter: Send + Sync {
    /// Get the adapter type
    fn adapter_type(&self) -> AdapterType;

    /// Check if a backup exists
    async fn exists(&self, backup_uuid: &str) -> BackupResult<bool>;

    /// Write backup data
    async fn write(&self, backup_uuid: &str, data: &[u8]) -> BackupResult<()>;

    /// Write backup from file path (for large files)
    async fn write_from_path(&self, backup_uuid: &str, path: &Path) -> BackupResult<()>;

    /// Read backup data
    async fn read(&self, backup_uuid: &str) -> BackupResult<Vec<u8>>;

    /// Get a presigned URL for download (if supported)
    async fn presigned_url(&self, backup_uuid: &str, expires_in_secs: u64) -> BackupResult<Option<String>>;

    /// Delete a backup
    async fn delete(&self, backup_uuid: &str) -> BackupResult<()>;

    /// Get the size of a backup in bytes
    async fn size(&self, backup_uuid: &str) -> BackupResult<u64>;

    /// List all backups for a server
    async fn list(&self, server_uuid: &str) -> BackupResult<Vec<String>>;
}

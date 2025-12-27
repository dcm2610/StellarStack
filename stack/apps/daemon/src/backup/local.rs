//! Local filesystem backup adapter

use std::path::PathBuf;

use async_trait::async_trait;
use tokio::fs;
use tracing::debug;

use super::adapter::{AdapterType, BackupAdapter};
use super::backup::{BackupError, BackupResult};

/// Local filesystem backup adapter
pub struct LocalAdapter {
    /// Base directory for backups
    base_dir: PathBuf,
}

impl LocalAdapter {
    /// Create a new local adapter
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    /// Get the path for a backup file
    fn backup_path(&self, server_uuid: &str, backup_uuid: &str) -> PathBuf {
        self.base_dir.join(server_uuid).join(format!("{}.tar.gz", backup_uuid))
    }

    /// Ensure the server backup directory exists
    async fn ensure_dir(&self, server_uuid: &str) -> BackupResult<()> {
        let dir = self.base_dir.join(server_uuid);
        fs::create_dir_all(&dir).await?;
        Ok(())
    }
}

#[async_trait]
impl BackupAdapter for LocalAdapter {
    fn adapter_type(&self) -> AdapterType {
        AdapterType::Local
    }

    async fn exists(&self, backup_uuid: &str) -> BackupResult<bool> {
        // We need server_uuid but don't have it here
        // This is a limitation - we'll search all server directories
        let mut entries = fs::read_dir(&self.base_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            if entry.file_type().await?.is_dir() {
                let path = entry.path().join(format!("{}.tar.gz", backup_uuid));
                if path.exists() {
                    return Ok(true);
                }
            }
        }

        Ok(false)
    }

    async fn write(&self, backup_uuid: &str, data: &[u8]) -> BackupResult<()> {
        // Extract server_uuid from backup_uuid if formatted as server_uuid/backup_uuid
        let parts: Vec<&str> = backup_uuid.split('/').collect();
        let (server_uuid, backup_uuid) = if parts.len() == 2 {
            (parts[0], parts[1])
        } else {
            ("default", backup_uuid)
        };

        self.ensure_dir(server_uuid).await?;

        let path = self.backup_path(server_uuid, backup_uuid);
        fs::write(&path, data).await?;

        debug!("Wrote backup to {:?}", path);
        Ok(())
    }

    async fn write_from_path(&self, backup_uuid: &str, source_path: &std::path::Path) -> BackupResult<()> {
        // For local adapter, we can just copy/move the file
        let parts: Vec<&str> = backup_uuid.split('/').collect();
        let (server_uuid, backup_uuid) = if parts.len() == 2 {
            (parts[0], parts[1])
        } else {
            ("default", backup_uuid)
        };

        self.ensure_dir(server_uuid).await?;

        let dest_path = self.backup_path(server_uuid, backup_uuid);

        // If source and dest are the same, no need to copy
        if source_path == dest_path {
            return Ok(());
        }

        fs::copy(source_path, &dest_path).await?;
        debug!("Copied backup to {:?}", dest_path);

        Ok(())
    }

    async fn read(&self, backup_uuid: &str) -> BackupResult<Vec<u8>> {
        // Search for the backup
        let mut entries = fs::read_dir(&self.base_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            if entry.file_type().await?.is_dir() {
                let path = entry.path().join(format!("{}.tar.gz", backup_uuid));
                if path.exists() {
                    let data = fs::read(&path).await?;
                    return Ok(data);
                }
            }
        }

        Err(BackupError::NotFound(backup_uuid.to_string()))
    }

    async fn presigned_url(&self, _backup_uuid: &str, _expires_in_secs: u64) -> BackupResult<Option<String>> {
        // Local adapter doesn't support presigned URLs
        Ok(None)
    }

    async fn delete(&self, backup_uuid: &str) -> BackupResult<()> {
        // Search for and delete the backup
        let mut entries = fs::read_dir(&self.base_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            if entry.file_type().await?.is_dir() {
                let path = entry.path().join(format!("{}.tar.gz", backup_uuid));
                if path.exists() {
                    fs::remove_file(&path).await?;
                    debug!("Deleted backup {:?}", path);
                    return Ok(());
                }
            }
        }

        Ok(()) // Not an error if not found
    }

    async fn size(&self, backup_uuid: &str) -> BackupResult<u64> {
        // Search for the backup
        let mut entries = fs::read_dir(&self.base_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            if entry.file_type().await?.is_dir() {
                let path = entry.path().join(format!("{}.tar.gz", backup_uuid));
                if path.exists() {
                    let metadata = fs::metadata(&path).await?;
                    return Ok(metadata.len());
                }
            }
        }

        Err(BackupError::NotFound(backup_uuid.to_string()))
    }

    async fn list(&self, server_uuid: &str) -> BackupResult<Vec<String>> {
        let server_dir = self.base_dir.join(server_uuid);

        if !server_dir.exists() {
            return Ok(vec![]);
        }

        let mut backups = Vec::new();
        let mut entries = fs::read_dir(&server_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".tar.gz") {
                // Extract UUID from filename
                let uuid = name.trim_end_matches(".tar.gz").to_string();
                backups.push(uuid);
            }
        }

        Ok(backups)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_local_adapter_write_read() {
        let temp = TempDir::new().unwrap();
        let adapter = LocalAdapter::new(temp.path().to_path_buf());

        // Write
        adapter.write("server1/backup1", b"test data").await.unwrap();

        // Read
        let data = adapter.read("backup1").await.unwrap();
        assert_eq!(data, b"test data");
    }

    #[tokio::test]
    async fn test_local_adapter_list() {
        let temp = TempDir::new().unwrap();
        let adapter = LocalAdapter::new(temp.path().to_path_buf());

        // Write some backups
        adapter.write("server1/backup1", b"data1").await.unwrap();
        adapter.write("server1/backup2", b"data2").await.unwrap();

        // List
        let list = adapter.list("server1").await.unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.contains(&"backup1".to_string()));
        assert!(list.contains(&"backup2".to_string()));
    }
}

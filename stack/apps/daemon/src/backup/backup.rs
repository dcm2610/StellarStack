//! Backup creation and management

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use sha2::{Sha256, Digest};
use thiserror::Error;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tracing::{debug, error, info};

use crate::api::HttpClient;
use crate::events::{Event, EventBus};

use super::adapter::BackupAdapter;

/// Backup errors
#[derive(Debug, Error)]
pub enum BackupError {
    #[error("Backup not found: {0}")]
    NotFound(String),

    #[error("Backup already exists: {0}")]
    AlreadyExists(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Archive error: {0}")]
    Archive(String),

    #[error("Checksum mismatch")]
    ChecksumMismatch,

    #[error("Server is running")]
    ServerRunning,

    #[error("API error: {0}")]
    Api(#[from] crate::api::ApiError),

    #[error("{0}")]
    Other(String),
}

pub type BackupResult<T> = Result<T, BackupError>;

/// Backup configuration
#[derive(Debug, Clone)]
pub struct BackupConfig {
    /// Backup UUID
    pub uuid: String,

    /// Server UUID
    pub server_uuid: String,

    /// Files/directories to ignore (gitignore patterns)
    pub ignore: Vec<String>,

    /// Whether this is a locked backup (can't be deleted by user)
    pub is_locked: bool,
}

/// Backup manager for a server
pub struct Backup {
    /// Server UUID
    server_uuid: String,

    /// Server data directory
    server_dir: PathBuf,

    /// Backup storage directory
    backup_dir: PathBuf,

    /// Event bus
    event_bus: EventBus,

    /// API client
    api_client: Arc<HttpClient>,

    /// Backup adapter
    adapter: Arc<dyn BackupAdapter>,
}

impl Backup {
    /// Create a new backup manager
    pub fn new(
        server_uuid: String,
        server_dir: PathBuf,
        backup_dir: PathBuf,
        event_bus: EventBus,
        api_client: Arc<HttpClient>,
        adapter: Arc<dyn BackupAdapter>,
    ) -> Self {
        Self {
            server_uuid,
            server_dir,
            backup_dir,
            event_bus,
            api_client,
            adapter,
        }
    }

    /// Create a backup
    pub async fn create(&self, config: BackupConfig) -> BackupResult<BackupInfo> {
        info!("Creating backup {} for server {}", config.uuid, self.server_uuid);

        // Publish backup started event
        self.event_bus.publish(Event::BackupStarted {
            uuid: config.uuid.clone(),
        });

        let result = self.create_internal(&config).await;

        // Publish result
        match &result {
            Ok(info) => {
                self.event_bus.publish(Event::BackupCompleted {
                    uuid: config.uuid.clone(),
                    successful: true,
                    checksum: Some(info.checksum.clone()),
                    size: info.size,
                });
            }
            Err(e) => {
                error!("Backup creation failed: {}", e);
                self.event_bus.publish(Event::BackupCompleted {
                    uuid: config.uuid.clone(),
                    successful: false,
                    checksum: None,
                    size: 0,
                });
            }
        }

        result
    }

    /// Internal backup creation
    async fn create_internal(&self, config: &BackupConfig) -> BackupResult<BackupInfo> {
        // Ensure backup directory exists
        let server_backup_dir = self.backup_dir.join(&self.server_uuid);
        tokio::fs::create_dir_all(&server_backup_dir).await?;

        // Create temporary file for the archive
        let temp_path = server_backup_dir.join(format!("{}.tar.gz.tmp", config.uuid));
        let final_path = server_backup_dir.join(format!("{}.tar.gz", config.uuid));

        // Build ignore set
        let ignore_set: HashSet<String> = config.ignore.iter().cloned().collect();

        // Create tar.gz archive
        let size = self.create_archive(&temp_path, &ignore_set).await?;

        // Calculate checksum
        let checksum = self.calculate_checksum(&temp_path).await?;

        // Rename to final path
        tokio::fs::rename(&temp_path, &final_path).await?;

        // Upload to adapter if not local
        if self.adapter.adapter_type() != super::AdapterType::Local {
            self.adapter.write_from_path(&config.uuid, &final_path).await?;
            // Remove local copy after upload
            let _ = tokio::fs::remove_file(&final_path).await;
        }

        // Report to panel
        let _ = self.api_client.set_backup_status(
            &config.uuid,
            &crate::api::BackupRequest {
                successful: true,
                checksum: Some(checksum.clone()),
                checksum_type: Some("sha256".to_string()),
                size,
                parts: None,
            },
        ).await;

        info!("Backup {} created successfully ({} bytes)", config.uuid, size);

        Ok(BackupInfo {
            uuid: config.uuid.clone(),
            checksum,
            size,
        })
    }

    /// Create tar.gz archive of server data
    async fn create_archive(&self, output_path: &Path, ignore: &HashSet<String>) -> BackupResult<u64> {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use tar::Builder;

        let server_dir = self.server_dir.clone();
        let output = output_path.to_path_buf();
        let ignore = ignore.clone();

        // Run in blocking task
        let size = tokio::task::spawn_blocking(move || -> BackupResult<u64> {
            let file = std::fs::File::create(&output)?;
            let encoder = GzEncoder::new(file, Compression::default());
            let mut tar = Builder::new(encoder);

            // Walk the directory and add files
            add_directory_to_tar(&mut tar, &server_dir, &server_dir, &ignore)?;

            let encoder = tar.into_inner()
                .map_err(|e| BackupError::Archive(e.to_string()))?;

            encoder.finish()
                .map_err(|e| BackupError::Archive(e.to_string()))?;

            // Get final size
            let metadata = std::fs::metadata(&output)?;
            Ok(metadata.len())
        }).await
        .map_err(|e| BackupError::Other(e.to_string()))??;

        Ok(size)
    }

    /// Calculate SHA256 checksum
    async fn calculate_checksum(&self, path: &Path) -> BackupResult<String> {
        let mut file = File::open(path).await?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 64 * 1024]; // 64KB buffer

        loop {
            let n = file.read(&mut buffer).await?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }

        let hash = hasher.finalize();
        Ok(format!("{:x}", hash))
    }

    /// Restore from a backup
    pub async fn restore(&self, backup_uuid: &str, truncate: bool) -> BackupResult<()> {
        info!("Restoring backup {} for server {}", backup_uuid, self.server_uuid);

        // Publish restore started event
        self.event_bus.publish(Event::BackupRestoreStarted {
            uuid: backup_uuid.to_string(),
        });

        let result = self.restore_internal(backup_uuid, truncate).await;

        // Publish result
        self.event_bus.publish(Event::BackupRestoreCompleted {
            uuid: backup_uuid.to_string(),
            successful: result.is_ok(),
        });

        // Report to panel
        let _ = self.api_client.send_restoration_status(backup_uuid, result.is_ok()).await;

        result
    }

    /// Internal restore implementation
    async fn restore_internal(&self, backup_uuid: &str, truncate: bool) -> BackupResult<()> {
        // Get backup path
        let backup_path = self.backup_dir
            .join(&self.server_uuid)
            .join(format!("{}.tar.gz", backup_uuid));

        // Check if backup exists (local or remote)
        let local_exists = backup_path.exists();

        if !local_exists && !self.adapter.exists(backup_uuid).await? {
            return Err(BackupError::NotFound(backup_uuid.to_string()));
        }

        // Download from remote if needed
        let restore_path = if !local_exists {
            let temp_path = self.backup_dir
                .join(&self.server_uuid)
                .join(format!("{}.tar.gz.restore", backup_uuid));

            let data = self.adapter.read(backup_uuid).await?;
            tokio::fs::write(&temp_path, &data).await?;

            temp_path
        } else {
            backup_path
        };

        // Optionally truncate server data
        if truncate {
            self.truncate_server_data().await?;
        }

        // Extract archive
        self.extract_archive(&restore_path).await?;

        // Cleanup temp file if downloaded
        if !local_exists {
            let _ = tokio::fs::remove_file(&restore_path).await;
        }

        info!("Backup {} restored successfully", backup_uuid);
        Ok(())
    }

    /// Extract tar.gz archive
    async fn extract_archive(&self, archive_path: &Path) -> BackupResult<()> {
        use flate2::read::GzDecoder;
        use tar::Archive;

        let archive = archive_path.to_path_buf();
        let dest = self.server_dir.clone();

        tokio::task::spawn_blocking(move || -> BackupResult<()> {
            let file = std::fs::File::open(&archive)?;
            let decoder = GzDecoder::new(file);
            let mut tar = Archive::new(decoder);

            tar.unpack(&dest)
                .map_err(|e| BackupError::Archive(e.to_string()))?;

            Ok(())
        }).await
        .map_err(|e| BackupError::Other(e.to_string()))??;

        Ok(())
    }

    /// Truncate (clear) server data directory
    async fn truncate_server_data(&self) -> BackupResult<()> {
        let mut entries = tokio::fs::read_dir(&self.server_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_dir() {
                tokio::fs::remove_dir_all(&path).await?;
            } else {
                tokio::fs::remove_file(&path).await?;
            }
        }

        Ok(())
    }

    /// Delete a backup
    pub async fn delete(&self, backup_uuid: &str) -> BackupResult<()> {
        // Delete from adapter
        self.adapter.delete(backup_uuid).await?;

        // Also delete local file if exists
        let local_path = self.backup_dir
            .join(&self.server_uuid)
            .join(format!("{}.tar.gz", backup_uuid));

        if local_path.exists() {
            tokio::fs::remove_file(&local_path).await?;
        }

        info!("Backup {} deleted", backup_uuid);
        Ok(())
    }

    /// List all backups
    pub async fn list(&self) -> BackupResult<Vec<String>> {
        self.adapter.list(&self.server_uuid).await
    }

    /// Get backup info
    pub async fn info(&self, backup_uuid: &str) -> BackupResult<BackupInfo> {
        let size = self.adapter.size(backup_uuid).await?;

        // Try to read checksum from metadata file
        let checksum_path = self.backup_dir
            .join(&self.server_uuid)
            .join(format!("{}.sha256", backup_uuid));

        let checksum = if checksum_path.exists() {
            tokio::fs::read_to_string(&checksum_path).await?
        } else {
            String::new()
        };

        Ok(BackupInfo {
            uuid: backup_uuid.to_string(),
            checksum,
            size,
        })
    }
}

/// Backup information
#[derive(Debug, Clone)]
pub struct BackupInfo {
    pub uuid: String,
    pub checksum: String,
    pub size: u64,
}

/// Add a directory to tar archive recursively
fn add_directory_to_tar<W: std::io::Write>(
    tar: &mut tar::Builder<W>,
    base_path: &Path,
    current_path: &Path,
    ignore: &HashSet<String>,
) -> BackupResult<()> {
    let entries = std::fs::read_dir(current_path)?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let relative = path.strip_prefix(base_path)
            .map_err(|e| BackupError::Other(e.to_string()))?;

        let name = relative.to_string_lossy();

        // Check if should be ignored
        if should_ignore(&name, ignore) {
            debug!("Ignoring: {}", name);
            continue;
        }

        if path.is_dir() {
            add_directory_to_tar(tar, base_path, &path, ignore)?;
        } else {
            tar.append_path_with_name(&path, relative)
                .map_err(|e| BackupError::Archive(e.to_string()))?;
        }
    }

    Ok(())
}

/// Check if a path should be ignored
fn should_ignore(path: &str, ignore: &HashSet<String>) -> bool {
    for pattern in ignore {
        if let Ok(glob) = glob::Pattern::new(pattern) {
            if glob.matches(path) {
                return true;
            }
        }
        // Also check exact match
        if pattern == path {
            return true;
        }
    }
    false
}

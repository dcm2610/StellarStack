use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use bollard::exec::{CreateExecOptions, StartExecOptions, StartExecResults};
use chrono::Utc;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::Duration;
use tokio::fs;
use tokio::time::timeout;
use tracing::{debug, error, info};

use crate::docker::DockerService;
use crate::error::{DaemonError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub id: String,
    pub container_id: String,
    pub name: String,
    pub size: u64,
    pub hash: String,
    pub created_at: String,
    pub storage: String, // "local" or "s3"
    pub locked: bool,    // Prevents deletion until unlocked
}

#[derive(Debug, Deserialize)]
pub struct CreateBackupRequest {
    pub name: Option<String>,
    pub ignore: Option<Vec<String>>, // Files/directories to exclude from backup
    pub locked: Option<bool>,        // Lock backup to prevent deletion
}

#[derive(Debug, Deserialize)]
pub struct BackupQuery {
    pub id: String,
}

// Config for backup storage (loaded from environment)
#[derive(Debug, Clone)]
pub struct BackupConfig {
    pub storage_type: String, // "local" or "s3"
    pub local_path: PathBuf,
    pub s3_bucket: Option<String>,
    pub s3_region: Option<String>,
    pub s3_access_key: Option<String>,
    pub s3_secret_key: Option<String>,
}

impl BackupConfig {
    pub fn from_env() -> Self {
        Self {
            storage_type: std::env::var("BACKUP_STORAGE").unwrap_or_else(|_| "local".to_string()),
            local_path: PathBuf::from(
                std::env::var("BACKUP_LOCAL_PATH").unwrap_or_else(|_| "/var/backups".to_string()),
            ),
            s3_bucket: std::env::var("BACKUP_S3_BUCKET").ok(),
            s3_region: std::env::var("BACKUP_S3_REGION").ok(),
            s3_access_key: std::env::var("BACKUP_S3_ACCESS_KEY").ok(),
            s3_secret_key: std::env::var("BACKUP_S3_SECRET_KEY").ok(),
        }
    }
}

// Default timeout for exec commands (5 minutes)
const EXEC_TIMEOUT_SECS: u64 = 300;

// Helper to execute command in container with timeout
async fn exec_command(docker: &DockerService, container_id: &str, cmd: &[&str]) -> Result<Vec<u8>> {
    exec_command_with_timeout(docker, container_id, cmd, Duration::from_secs(EXEC_TIMEOUT_SECS)).await
}

async fn exec_command_with_timeout(
    docker: &DockerService,
    container_id: &str,
    cmd: &[&str],
    timeout_duration: Duration,
) -> Result<Vec<u8>> {
    let exec = docker
        .client()
        .create_exec(
            container_id,
            CreateExecOptions {
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                cmd: Some(cmd.to_vec()),
                ..Default::default()
            },
        )
        .await
        .map_err(DaemonError::Docker)?;

    let result = docker
        .client()
        .start_exec(
            &exec.id,
            Some(StartExecOptions {
                detach: false,
                tty: false,
                output_capacity: None,
            }),
        )
        .await
        .map_err(DaemonError::Docker)?;

    let collect_output = async {
        let mut output = Vec::new();

        if let StartExecResults::Attached { output: mut stream, .. } = result {
            while let Some(Ok(msg)) = stream.next().await {
                match msg {
                    bollard::container::LogOutput::StdOut { message } => {
                        output.extend_from_slice(&message);
                    }
                    bollard::container::LogOutput::StdErr { message } => {
                        // Log stderr for debugging
                        if let Ok(s) = std::str::from_utf8(&message) {
                            debug!(stderr = %s, "Container exec stderr");
                        }
                    }
                    _ => {}
                }
            }
        }

        output
    };

    match timeout(timeout_duration, collect_output).await {
        Ok(output) => Ok(output),
        Err(_) => {
            error!(
                container_id = %container_id,
                cmd = ?cmd,
                timeout_secs = timeout_duration.as_secs(),
                "Container exec command timed out"
            );
            Err(DaemonError::Internal(format!(
                "Command timed out after {} seconds",
                timeout_duration.as_secs()
            )))
        }
    }
}

// List backups for a container
pub async fn list_backups(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
) -> Result<Json<Vec<BackupInfo>>> {
    let config = BackupConfig::from_env();

    // Verify container exists
    docker.get_container(&container_id).await?;

    let backup_dir = config.local_path.join(&container_id);

    if !backup_dir.exists() {
        return Ok(Json(Vec::new()));
    }

    let mut backups = Vec::new();
    let mut entries = fs::read_dir(&backup_dir).await.map_err(|e| {
        DaemonError::Internal(format!("Failed to read backup directory: {}", e))
    })?;

    while let Some(entry) = entries.next_entry().await.map_err(|e| {
        DaemonError::Internal(format!("Failed to read directory entry: {}", e))
    })? {
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) == Some("gz") {
            // Check if it's a .tar.gz file
            let path_str = path.to_string_lossy();
            if !path_str.ends_with(".tar.gz") {
                continue;
            }

            let file_metadata = fs::metadata(&path).await.map_err(|e| {
                DaemonError::Internal(format!("Failed to read file metadata: {}", e))
            })?;

            let filename = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .trim_end_matches(".tar.gz");

            // Read hash from .sha256 file if exists
            let hash_path = backup_dir.join(format!("{}.tar.gz.sha256", filename));
            let hash = if hash_path.exists() {
                fs::read_to_string(&hash_path).await.unwrap_or_default().trim().to_string()
            } else {
                "unknown".to_string()
            };

            // Read metadata from .meta.json file if exists
            let meta_path = backup_dir.join(format!("{}.tar.gz.meta.json", filename));
            let locked = if meta_path.exists() {
                let meta_str = fs::read_to_string(&meta_path).await.unwrap_or_default();
                serde_json::from_str::<BackupMetadata>(&meta_str)
                    .map(|m| m.locked)
                    .unwrap_or(false)
            } else {
                false
            };

            // Parse backup info from filename: name_timestamp
            let parts: Vec<&str> = filename.rsplitn(2, '_').collect();
            let (name, timestamp) = if parts.len() == 2 {
                (parts[1].to_string(), parts[0].to_string())
            } else {
                (filename.to_string(), "unknown".to_string())
            };

            backups.push(BackupInfo {
                id: filename.to_string(),
                container_id: container_id.clone(),
                name,
                size: file_metadata.len(),
                hash,
                created_at: timestamp,
                storage: config.storage_type.clone(),
                locked,
            });
        }
    }

    // Sort by created_at descending
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(Json(backups))
}

// Backup metadata stored alongside the archive
#[derive(Debug, Clone, Serialize, Deserialize)]
struct BackupMetadata {
    locked: bool,
    ignored: Vec<String>,
}

// Create a backup
pub async fn create_backup(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Json(request): Json<CreateBackupRequest>,
) -> Result<Json<BackupInfo>> {
    let config = BackupConfig::from_env();

    debug!(
        container_id = %container_id,
        "Starting backup creation"
    );

    // Verify container exists
    docker.get_container(&container_id).await?;
    debug!(container_id = %container_id, "Container verified");

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_name = request.name.unwrap_or_else(|| "backup".to_string());
    let filename = format!("{}_{}.tar.gz", backup_name, timestamp);
    let locked = request.locked.unwrap_or(false);
    let ignore = request.ignore.unwrap_or_default();

    // Build exclude arguments for tar
    let exclude_args: Vec<String> = ignore
        .iter()
        .map(|p| format!("--exclude='{}'", p.trim_start_matches('/')))
        .collect();
    let exclude_str = exclude_args.join(" ");

    debug!(
        container_id = %container_id,
        backup_name = %backup_name,
        locked = %locked,
        exclude = %exclude_str,
        "Backup configuration prepared"
    );

    // Create backup archive in container - always backup /data
    let temp_backup = format!("/tmp/{}", filename);
    let cmd = if exclude_args.is_empty() {
        format!("cd /data && tar -czf {} .", temp_backup)
    } else {
        format!("cd /data && tar -czf {} {} .", temp_backup, exclude_str)
    };

    debug!(
        container_id = %container_id,
        temp_path = %temp_backup,
        cmd = %cmd,
        "Creating archive in container..."
    );

    exec_command(&docker, &container_id, &["sh", "-c", &cmd]).await?;
    debug!(container_id = %container_id, "Archive created in container");

    // Get the backup data from container
    debug!(container_id = %container_id, "Extracting backup data from container...");
    let backup_data = exec_command(
        &docker,
        &container_id,
        &["cat", &temp_backup],
    )
    .await?;
    debug!(
        container_id = %container_id,
        size_bytes = backup_data.len(),
        "Backup data extracted"
    );

    // Clean up temp file in container
    debug!(container_id = %container_id, "Cleaning up temp file in container...");
    let _ = exec_command(&docker, &container_id, &["rm", "-f", &temp_backup]).await;

    // Calculate hash
    debug!(container_id = %container_id, "Calculating SHA256 hash...");
    let mut hasher = Sha256::new();
    hasher.update(&backup_data);
    let hash = format!("{:x}", hasher.finalize());
    debug!(container_id = %container_id, hash = %hash, "Hash calculated");

    // Store backup
    let backup_dir = config.local_path.join(&container_id);
    debug!(
        container_id = %container_id,
        backup_dir = %backup_dir.display(),
        "Creating backup directory..."
    );
    fs::create_dir_all(&backup_dir).await.map_err(|e| {
        DaemonError::Internal(format!("Failed to create backup directory: {}", e))
    })?;

    let backup_path = backup_dir.join(&filename);
    let hash_path = backup_dir.join(format!("{}.sha256", filename));
    let meta_path = backup_dir.join(format!("{}.meta.json", filename));

    // Write backup file
    debug!(
        container_id = %container_id,
        path = %backup_path.display(),
        size_bytes = backup_data.len(),
        "Writing backup file to disk..."
    );
    fs::write(&backup_path, &backup_data).await.map_err(|e| {
        DaemonError::Internal(format!("Failed to write backup file: {}", e))
    })?;
    debug!(container_id = %container_id, "Backup file written");

    // Write hash file
    debug!(container_id = %container_id, "Writing hash file...");
    fs::write(&hash_path, &hash).await.map_err(|e| {
        DaemonError::Internal(format!("Failed to write hash file: {}", e))
    })?;

    // Write metadata file (lock status, ignored paths)
    let metadata = BackupMetadata {
        locked,
        ignored: ignore.clone(),
    };
    let meta_json = serde_json::to_string(&metadata).map_err(|e| {
        DaemonError::Internal(format!("Failed to serialize backup metadata: {}", e))
    })?;
    fs::write(&meta_path, &meta_json).await.map_err(|e| {
        DaemonError::Internal(format!("Failed to write metadata file: {}", e))
    })?;

    info!(
        container_id = %container_id,
        backup_name = %backup_name,
        filename = %filename,
        size_bytes = backup_data.len(),
        hash = %hash,
        locked = %locked,
        "Backup created successfully"
    );

    Ok(Json(BackupInfo {
        id: filename.trim_end_matches(".tar.gz").to_string(),
        container_id,
        name: backup_name,
        size: backup_data.len() as u64,
        hash,
        created_at: timestamp,
        storage: config.storage_type,
        locked,
    }))
}

// Download a backup
pub async fn download_backup(
    State(_docker): State<DockerService>,
    Path(container_id): Path<String>,
    Query(query): Query<BackupQuery>,
) -> Result<Response> {
    let config = BackupConfig::from_env();

    let backup_path = config
        .local_path
        .join(&container_id)
        .join(format!("{}.tar.gz", query.id));

    if !backup_path.exists() {
        return Err(DaemonError::Internal("Backup not found".to_string()));
    }

    let data = fs::read(&backup_path).await.map_err(|e| {
        DaemonError::Internal(format!("Failed to read backup file: {}", e))
    })?;

    let filename = format!("{}.tar.gz", query.id);

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/gzip"),
            (
                header::CONTENT_DISPOSITION,
                &format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        data,
    )
        .into_response())
}

// Delete a backup
pub async fn delete_backup(
    State(_docker): State<DockerService>,
    Path(container_id): Path<String>,
    Query(query): Query<BackupQuery>,
) -> Result<Json<serde_json::Value>> {
    let config = BackupConfig::from_env();

    let backup_path = config
        .local_path
        .join(&container_id)
        .join(format!("{}.tar.gz", query.id));

    let hash_path = config
        .local_path
        .join(&container_id)
        .join(format!("{}.tar.gz.sha256", query.id));

    let meta_path = config
        .local_path
        .join(&container_id)
        .join(format!("{}.tar.gz.meta.json", query.id));

    if !backup_path.exists() {
        return Err(DaemonError::NotFound("Backup not found".to_string()));
    }

    // Check if backup is locked
    if meta_path.exists() {
        let meta_str = fs::read_to_string(&meta_path).await.unwrap_or_default();
        if let Ok(metadata) = serde_json::from_str::<BackupMetadata>(&meta_str) {
            if metadata.locked {
                return Err(DaemonError::Internal(
                    "Cannot delete locked backup. Unlock it first.".to_string(),
                ));
            }
        }
    }

    fs::remove_file(&backup_path).await.map_err(|e| {
        DaemonError::Internal(format!("Failed to delete backup: {}", e))
    })?;

    // Also remove hash and metadata files if exists
    let _ = fs::remove_file(&hash_path).await;
    let _ = fs::remove_file(&meta_path).await;

    info!("Deleted backup {} for container {}", query.id, container_id);

    Ok(Json(serde_json::json!({
        "success": true,
        "id": query.id
    })))
}

// Lock/unlock a backup
#[derive(Debug, Deserialize)]
pub struct LockBackupRequest {
    pub locked: bool,
}

pub async fn lock_backup(
    State(_docker): State<DockerService>,
    Path(container_id): Path<String>,
    Query(query): Query<BackupQuery>,
    Json(request): Json<LockBackupRequest>,
) -> Result<Json<serde_json::Value>> {
    let config = BackupConfig::from_env();

    let backup_path = config
        .local_path
        .join(&container_id)
        .join(format!("{}.tar.gz", query.id));

    let meta_path = config
        .local_path
        .join(&container_id)
        .join(format!("{}.tar.gz.meta.json", query.id));

    if !backup_path.exists() {
        return Err(DaemonError::NotFound("Backup not found".to_string()));
    }

    // Read existing metadata or create new
    let mut metadata = if meta_path.exists() {
        let meta_str = fs::read_to_string(&meta_path).await.unwrap_or_default();
        serde_json::from_str::<BackupMetadata>(&meta_str).unwrap_or(BackupMetadata {
            locked: false,
            ignored: vec![],
        })
    } else {
        BackupMetadata {
            locked: false,
            ignored: vec![],
        }
    };

    metadata.locked = request.locked;

    let meta_json = serde_json::to_string(&metadata).map_err(|e| {
        DaemonError::Internal(format!("Failed to serialize backup metadata: {}", e))
    })?;
    fs::write(&meta_path, &meta_json).await.map_err(|e| {
        DaemonError::Internal(format!("Failed to write metadata file: {}", e))
    })?;

    info!(
        "Backup {} for container {} is now {}",
        query.id,
        container_id,
        if request.locked { "locked" } else { "unlocked" }
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "id": query.id,
        "locked": request.locked
    })))
}

// Restore a backup
pub async fn restore_backup(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Query(query): Query<BackupQuery>,
) -> Result<Json<serde_json::Value>> {
    let config = BackupConfig::from_env();

    debug!(
        container_id = %container_id,
        backup_id = %query.id,
        "Starting backup restore"
    );

    let backup_path = config
        .local_path
        .join(&container_id)
        .join(format!("{}.tar.gz", query.id));

    if !backup_path.exists() {
        debug!(
            container_id = %container_id,
            backup_id = %query.id,
            path = %backup_path.display(),
            "Backup file not found"
        );
        return Err(DaemonError::Internal("Backup not found".to_string()));
    }

    // Read backup data
    debug!(
        container_id = %container_id,
        path = %backup_path.display(),
        "Reading backup file from disk..."
    );
    let backup_data = fs::read(&backup_path).await.map_err(|e| {
        DaemonError::Internal(format!("Failed to read backup file: {}", e))
    })?;
    debug!(
        container_id = %container_id,
        size_bytes = backup_data.len(),
        "Backup file read"
    );

    // Base64 encode for transfer
    debug!(container_id = %container_id, "Encoding backup data...");
    let encoded = base64_encode(&backup_data);
    debug!(
        container_id = %container_id,
        encoded_size = encoded.len(),
        "Backup data encoded"
    );

    // Write to container temp directory
    let temp_path = "/tmp/restore.tar.gz";
    debug!(
        container_id = %container_id,
        temp_path = %temp_path,
        "Transferring backup to container..."
    );
    let cmd = format!("echo '{}' | base64 -d > {}", encoded, temp_path);

    exec_command(&docker, &container_id, &["sh", "-c", &cmd]).await?;
    debug!(container_id = %container_id, "Backup transferred to container");

    // Extract backup
    debug!(container_id = %container_id, "Extracting backup archive...");
    let extract_cmd = format!("tar -xzf {} -C /", temp_path);
    exec_command(&docker, &container_id, &["sh", "-c", &extract_cmd]).await?;
    debug!(container_id = %container_id, "Backup extracted");

    // Clean up
    debug!(container_id = %container_id, "Cleaning up temp file...");
    exec_command(&docker, &container_id, &["rm", "-f", temp_path]).await?;

    info!(
        container_id = %container_id,
        backup_id = %query.id,
        size_bytes = backup_data.len(),
        "Backup restored successfully"
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "id": query.id,
        "message": "Backup restored successfully"
    })))
}

fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut result = String::new();

    for chunk in data.chunks(3) {
        let mut buffer = 0u32;
        for (i, &byte) in chunk.iter().enumerate() {
            buffer |= (byte as u32) << (16 - i * 8);
        }

        let chars = match chunk.len() {
            3 => 4,
            2 => 3,
            1 => 2,
            _ => 0,
        };

        for i in 0..chars {
            let index = ((buffer >> (18 - i * 6)) & 0x3F) as usize;
            result.push(ALPHABET[index] as char);
        }

        for _ in chars..4 {
            result.push('=');
        }
    }

    result
}

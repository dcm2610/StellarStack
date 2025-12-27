//! Backup handlers

use std::sync::Arc;

use axum::{
    extract::Path,
    Extension, Json,
};
use serde::{Deserialize, Serialize};

use crate::server::Server;
use super::ApiError;

/// Backup list response
#[derive(Debug, Serialize)]
pub struct BackupListResponse {
    pub backups: Vec<BackupInfo>,
}

/// Backup information
#[derive(Debug, Serialize)]
pub struct BackupInfo {
    pub uuid: String,
    pub name: String,
    pub size: u64,
    pub checksum: String,
    pub created_at: String,
}

/// List backups
pub async fn list_backups(
    Extension(_server): Extension<Arc<Server>>,
) -> Json<BackupListResponse> {
    // TODO: Implement backup listing from disk/database
    Json(BackupListResponse { backups: vec![] })
}

/// Create backup request
#[derive(Debug, Deserialize)]
pub struct CreateBackupRequest {
    pub uuid: String,
    #[serde(default)]
    pub ignore: Vec<String>,
}

/// Create a backup
pub async fn create_backup(
    Extension(_server): Extension<Arc<Server>>,
    Json(_request): Json<CreateBackupRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // TODO: Implement backup creation
    // 1. Create tar.gz of server data (excluding ignored files)
    // 2. Calculate checksum
    // 3. Report to panel
    // 4. Upload if S3 is configured

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Backup creation started"
    })))
}

/// Restore backup request
#[derive(Debug, Deserialize)]
pub struct RestoreBackupRequest {
    pub uuid: String,
    #[serde(default)]
    pub truncate: bool,
}

/// Restore from backup
pub async fn restore_backup(
    Extension(_server): Extension<Arc<Server>>,
    Json(_request): Json<RestoreBackupRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // TODO: Implement backup restoration
    // 1. Check server is not running
    // 2. Optionally truncate server data
    // 3. Extract backup archive
    // 4. Report to panel

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Backup restoration started"
    })))
}

/// Delete a backup
pub async fn delete_backup(
    Extension(_server): Extension<Arc<Server>>,
    Path(_backup_id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // TODO: Implement backup deletion
    // 1. Delete local backup file
    // 2. Delete from S3 if applicable
    // 3. Report to panel

    Ok(Json(serde_json::json!({
        "success": true
    })))
}

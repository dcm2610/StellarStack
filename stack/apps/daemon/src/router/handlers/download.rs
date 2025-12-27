//! File and backup download handlers

use axum::{
    body::Body,
    extract::{Query, State},
    http::header,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

use super::super::AppState;
use super::ApiError;
use crate::filesystem::Filesystem;

/// Download file query parameters
#[derive(Debug, Deserialize)]
pub struct DownloadFileQuery {
    /// JWT token for authentication
    pub token: String,
}

/// Download file claims
#[derive(Debug, serde::Deserialize)]
pub struct DownloadClaims {
    pub server_uuid: String,
    pub file_path: String,
    pub exp: usize,
}

/// Download a file from a server
pub async fn download_file(
    State(state): State<AppState>,
    Query(query): Query<DownloadFileQuery>,
) -> Result<Response, ApiError> {
    // Validate JWT token
    let claims = validate_download_token(&query.token, &state.config.remote.token)
        .map_err(|e| ApiError::forbidden(e))?;

    // Get server
    let server = state.manager.get(&claims.server_uuid)
        .ok_or_else(|| ApiError::not_found("Server not found"))?;

    // Get filesystem
    let config = server.config();
    let fs = Filesystem::new(
        server.data_dir().clone(),
        config.disk_bytes(),
        config.egg.file_denylist.clone(),
    ).map_err(|e| ApiError::internal(e.to_string()))?;

    // Resolve path safely
    let safe_path = fs.safe_path(&claims.file_path)?;

    if !safe_path.exists() {
        return Err(ApiError::not_found("File not found"));
    }

    if !safe_path.is_file() {
        return Err(ApiError::bad_request("Path is not a file"));
    }

    // Open file
    let file = File::open(safe_path.resolved()).await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let metadata = file.metadata().await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    // Get filename
    let filename = safe_path.file_name().unwrap_or("download");

    // Determine content type
    let content_type = mime_guess::from_path(&claims.file_path)
        .first_or_octet_stream()
        .to_string();

    // Stream file
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (header::CONTENT_LENGTH, metadata.len().to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        body,
    )
        .into_response())
}

/// Download backup query parameters
#[derive(Debug, Deserialize)]
pub struct DownloadBackupQuery {
    /// JWT token for authentication
    pub token: String,
}

/// Download backup claims
#[derive(Debug, serde::Deserialize)]
pub struct BackupDownloadClaims {
    pub server_uuid: String,
    pub backup_uuid: String,
    pub exp: usize,
}

/// Download a backup
pub async fn download_backup(
    State(state): State<AppState>,
    Query(query): Query<DownloadBackupQuery>,
) -> Result<Response, ApiError> {
    // Validate JWT token
    let claims = validate_backup_token(&query.token, &state.config.remote.token)
        .map_err(|e| ApiError::forbidden(e))?;

    // Get backup file path
    let backup_path = state.config.system.backup_directory
        .join(&claims.server_uuid)
        .join(format!("{}.tar.gz", claims.backup_uuid));

    if !backup_path.exists() {
        return Err(ApiError::not_found("Backup not found"));
    }

    // Open file
    let file = File::open(&backup_path).await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let metadata = file.metadata().await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    // Stream file
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok((
        [
            (header::CONTENT_TYPE, "application/gzip".to_string()),
            (header::CONTENT_LENGTH, metadata.len().to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}.tar.gz\"", claims.backup_uuid),
            ),
        ],
        body,
    )
        .into_response())
}

/// Validate a download token
fn validate_download_token(token: &str, secret: &str) -> Result<DownloadClaims, &'static str> {
    use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};

    let validation = Validation::new(Algorithm::HS256);
    let key = DecodingKey::from_secret(secret.as_bytes());

    let token_data = decode::<DownloadClaims>(token, &key, &validation)
        .map_err(|_| "Invalid token")?;

    // Check expiration
    let now = chrono::Utc::now().timestamp() as usize;
    if token_data.claims.exp < now {
        return Err("Token expired");
    }

    Ok(token_data.claims)
}

/// Validate a backup download token
fn validate_backup_token(token: &str, secret: &str) -> Result<BackupDownloadClaims, &'static str> {
    use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};

    let validation = Validation::new(Algorithm::HS256);
    let key = DecodingKey::from_secret(secret.as_bytes());

    let token_data = decode::<BackupDownloadClaims>(token, &key, &validation)
        .map_err(|_| "Invalid token")?;

    // Check expiration
    let now = chrono::Utc::now().timestamp() as usize;
    if token_data.claims.exp < now {
        return Err("Token expired");
    }

    Ok(token_data.claims)
}

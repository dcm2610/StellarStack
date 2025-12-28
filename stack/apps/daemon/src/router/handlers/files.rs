//! File operation handlers

use std::sync::Arc;

use axum::{
    extract::Query,
    Extension, Json,
};
use serde::{Deserialize, Serialize};

use crate::filesystem::{FileInfo, Filesystem};
use crate::server::Server;
use super::ApiError;

/// List files request
#[derive(Debug, Deserialize)]
pub struct ListFilesQuery {
    #[serde(default)]
    pub directory: String,
}

/// List files in a directory
pub async fn list_files(
    Extension(server): Extension<Arc<Server>>,
    Query(query): Query<ListFilesQuery>,
) -> Result<Json<Vec<FileInfo>>, ApiError> {
    let fs = get_filesystem(&server)?;
    let files = fs.list_directory(&query.directory).await?;
    Ok(Json(files))
}

/// Read file request
#[derive(Debug, Deserialize)]
pub struct ReadFileQuery {
    pub file: String,
}

/// Read file contents
pub async fn read_file(
    Extension(server): Extension<Arc<Server>>,
    Query(query): Query<ReadFileQuery>,
) -> Result<String, ApiError> {
    let fs = get_filesystem(&server)?;
    let contents = fs.read_file_string(&query.file).await?;
    Ok(contents)
}

/// Write file request
#[derive(Debug, Deserialize)]
pub struct WriteFileRequest {
    pub file: String,
    pub content: String,
}

/// Write file contents
pub async fn write_file(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<WriteFileRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let fs = get_filesystem(&server)?;
    fs.write_file(&request.file, request.content.as_bytes()).await?;

    Ok(Json(serde_json::json!({
        "success": true
    })))
}

/// Create directory request
#[derive(Debug, Deserialize)]
pub struct CreateDirectoryRequest {
    pub name: String,
    #[serde(default)]
    pub root: String,
}

/// Create a directory
pub async fn create_directory(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<CreateDirectoryRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let fs = get_filesystem(&server)?;

    let path = if request.root.is_empty() {
        request.name
    } else {
        format!("{}/{}", request.root.trim_end_matches('/'), request.name)
    };

    fs.create_directory(&path).await?;

    Ok(Json(serde_json::json!({
        "success": true
    })))
}

/// Rename file request
#[derive(Debug, Deserialize)]
pub struct RenameFileRequest {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub root: String,
}

/// Rename a file or directory
pub async fn rename_file(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<RenameFileRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let fs = get_filesystem(&server)?;

    let from = if request.root.is_empty() {
        request.from
    } else {
        format!("{}/{}", request.root.trim_end_matches('/'), request.from)
    };

    let to = if request.root.is_empty() {
        request.to
    } else {
        format!("{}/{}", request.root.trim_end_matches('/'), request.to)
    };

    fs.rename(&from, &to).await?;

    Ok(Json(serde_json::json!({
        "success": true
    })))
}

/// Copy file request
#[derive(Debug, Deserialize)]
pub struct CopyFileRequest {
    pub location: String,
}

/// Copy a file or directory
pub async fn copy_file(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<CopyFileRequest>,
) -> Result<Json<CopyFileResponse>, ApiError> {
    let fs = get_filesystem(&server)?;
    let new_name = fs.copy(&request.location).await?;

    Ok(Json(CopyFileResponse { name: new_name }))
}

#[derive(Debug, Serialize)]
pub struct CopyFileResponse {
    pub name: String,
}

/// Delete files request
#[derive(Debug, Deserialize)]
pub struct DeleteFilesRequest {
    pub files: Vec<String>,
    #[serde(default)]
    pub root: String,
}

/// Delete files or directories
pub async fn delete_files(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<DeleteFilesRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let fs = get_filesystem(&server)?;

    for file in request.files {
        let path = if request.root.is_empty() {
            file
        } else {
            format!("{}/{}", request.root.trim_end_matches('/'), file)
        };

        fs.delete(&path).await?;
    }

    Ok(Json(serde_json::json!({
        "success": true
    })))
}

/// Compress files request
#[derive(Debug, Deserialize)]
pub struct CompressFilesRequest {
    pub files: Vec<String>,
    #[serde(default)]
    pub root: String,
}

/// Compress files into an archive
pub async fn compress_files(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<CompressFilesRequest>,
) -> Result<Json<FileInfo>, ApiError> {
    let fs = get_filesystem(&server)?;

    let root = if request.root.is_empty() {
        ".".to_string()
    } else {
        request.root
    };

    let info = fs.compress(&root, request.files).await?;

    Ok(Json(info))
}

/// Decompress file request
#[derive(Debug, Deserialize)]
pub struct DecompressFileRequest {
    pub file: String,
    #[serde(default)]
    pub root: String,
}

/// Decompress an archive
pub async fn decompress_file(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<DecompressFileRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let fs = get_filesystem(&server)?;

    let destination = if request.root.is_empty() {
        ".".to_string()
    } else {
        request.root
    };

    fs.decompress(&request.file, &destination).await?;

    Ok(Json(serde_json::json!({
        "success": true
    })))
}

/// Chmod request
#[derive(Debug, Deserialize)]
pub struct ChmodRequest {
    pub files: Vec<ChmodEntry>,
    #[serde(default)]
    pub root: String,
}

#[derive(Debug, Deserialize)]
pub struct ChmodEntry {
    pub file: String,
    pub mode: u32,
}

/// Change file permissions
pub async fn chmod_file(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<ChmodRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let fs = get_filesystem(&server)?;

    for entry in request.files {
        let path = if request.root.is_empty() {
            entry.file
        } else {
            format!("{}/{}", request.root.trim_end_matches('/'), entry.file)
        };

        fs.chmod(&path, entry.mode).await?;
    }

    Ok(Json(serde_json::json!({
        "success": true
    })))
}

/// Helper to get filesystem for a server
fn get_filesystem(server: &Server) -> Result<Filesystem, ApiError> {
    let config = server.config();

    Filesystem::new(
        server.data_dir().clone(),
        config.disk_bytes(),
        config.egg.file_denylist.clone(),
    ).map_err(|e| ApiError::internal(e.to_string()))
}

/// Disk usage response
#[derive(Debug, Serialize)]
pub struct DiskUsageResponse {
    pub used_bytes: u64,
    pub limit_bytes: u64,
    pub path: String,
}

/// Get disk usage for the server
pub async fn disk_usage(
    Extension(server): Extension<Arc<Server>>,
) -> Result<Json<DiskUsageResponse>, ApiError> {
    let fs = get_filesystem(&server)?;

    // Calculate actual disk usage
    let used = fs.disk_usage().calculate(server.data_dir()).await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let limit = server.config().disk_bytes();

    Ok(Json(DiskUsageResponse {
        used_bytes: used,
        limit_bytes: limit,
        path: "/".to_string(),
    }))
}

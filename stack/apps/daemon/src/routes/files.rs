use axum::{
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use bollard::exec::{CreateExecOptions, StartExecOptions, StartExecResults};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::docker::DockerService;
use crate::error::{DaemonError, Result};

// Base path for server files - all file operations are restricted to this directory
const BASE_PATH: &str = "/data";

// Validate and normalize path to ensure it stays within BASE_PATH
// Returns the internal path (with /data prefix) for use in container commands
fn validate_path(path: &str) -> Result<String> {
    // Handle empty or root path
    if path.is_empty() || path == "/" {
        return Ok(BASE_PATH.to_string());
    }

    // Build the full path
    let full_path = if path.starts_with(BASE_PATH) {
        PathBuf::from(path)
    } else if path.starts_with('/') {
        PathBuf::from(BASE_PATH).join(&path[1..])
    } else {
        PathBuf::from(BASE_PATH).join(path)
    };

    // Normalize the path (resolve .. and .)
    let mut normalized = PathBuf::new();
    for component in full_path.components() {
        match component {
            std::path::Component::ParentDir => {
                // Don't allow going above BASE_PATH
                if normalized.as_os_str().len() > BASE_PATH.len() {
                    normalized.pop();
                }
            }
            std::path::Component::Normal(c) => {
                normalized.push(c);
            }
            std::path::Component::RootDir => {
                normalized.push("/");
            }
            _ => {}
        }
    }

    let result = normalized.to_string_lossy().to_string();

    // Ensure the path starts with BASE_PATH
    if !result.starts_with(BASE_PATH) {
        return Err(DaemonError::Internal(format!(
            "Path must be within {}",
            BASE_PATH
        )));
    }

    Ok(result)
}

// Convert internal path to user-facing path (strip /data prefix)
fn to_user_path(internal_path: &str) -> String {
    if internal_path == BASE_PATH {
        "/".to_string()
    } else if let Some(stripped) = internal_path.strip_prefix(BASE_PATH) {
        if stripped.is_empty() {
            "/".to_string()
        } else {
            stripped.to_string()
        }
    } else {
        internal_path.to_string()
    }
}

#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: String, // "file" or "directory"
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub permissions: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DirectoryListing {
    pub path: String,
    pub files: Vec<FileInfo>,
}

#[derive(Debug, Deserialize)]
pub struct ListFilesQuery {
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FilePathQuery {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRequest {
    pub path: String,
    #[serde(rename = "type")]
    pub item_type: String, // "file" or "directory"
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WriteRequest {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct RenameRequest {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Deserialize)]
pub struct ArchiveRequest {
    pub path: String,
    pub destination: String,
    pub files: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExtractRequest {
    pub archive_path: String,
    pub destination: String,
}

// Helper to execute command in container and get output
async fn exec_command(docker: &DockerService, container_id: &str, cmd: &[&str]) -> Result<String> {
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

    let mut output = String::new();

    if let StartExecResults::Attached { output: mut stream, .. } = result {
        while let Some(Ok(msg)) = stream.next().await {
            match msg {
                bollard::container::LogOutput::StdOut { message } => {
                    output.push_str(&String::from_utf8_lossy(&message));
                }
                bollard::container::LogOutput::StdErr { message } => {
                    output.push_str(&String::from_utf8_lossy(&message));
                }
                _ => {}
            }
        }
    }

    Ok(output)
}

// List files in container directory
pub async fn list_files(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Query(query): Query<ListFilesQuery>,
) -> Result<Json<DirectoryListing>> {
    // Default to /data which is the standard server data directory
    let internal_path = validate_path(&query.path.unwrap_or_default())?;
    let user_path = to_user_path(&internal_path);

    // Use ls with detailed output
    let output = exec_command(
        &docker,
        &container_id,
        &["ls", "-la", "--time-style=+%Y-%m-%dT%H:%M:%S", &internal_path],
    )
    .await?;

    let mut files = Vec::new();

    for line in output.lines().skip(1) {
        // Skip "total" line
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 7 {
            let permissions = parts[0];
            let size: u64 = parts[4].parse().unwrap_or(0);
            let modified = parts[5].to_string();
            let name = parts[6..].join(" ");

            if name == "." || name == ".." {
                continue;
            }

            let file_type = if permissions.starts_with('d') {
                "directory"
            } else {
                "file"
            };

            // Build user-facing path (without /data prefix)
            let file_path = if user_path == "/" {
                format!("/{}", name)
            } else if user_path.ends_with('/') {
                format!("{}{}", user_path, name)
            } else {
                format!("{}/{}", user_path, name)
            };

            files.push(FileInfo {
                name,
                path: file_path,
                file_type: file_type.to_string(),
                size: Some(size),
                modified: Some(modified),
                permissions: Some(permissions.to_string()),
            });
        }
    }

    Ok(Json(DirectoryListing { path: user_path, files }))
}

// Get file contents
pub async fn get_file(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Query(query): Query<FilePathQuery>,
) -> Result<Response> {
    let path = validate_path(&query.path)?;
    let output = exec_command(&docker, &container_id, &["cat", &path]).await?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        output,
    )
        .into_response())
}

// Download file as binary
pub async fn download_file(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Query(query): Query<FilePathQuery>,
) -> Result<Response> {
    let path = validate_path(&query.path)?;
    // Use base64 encoding to safely transfer binary content
    let output = exec_command(&docker, &container_id, &["base64", &path]).await?;

    let filename = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");

    // Decode base64
    let bytes = base64_decode(&output.trim()).map_err(|_| {
        DaemonError::Internal("Failed to decode file content".to_string())
    })?;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (
                header::CONTENT_DISPOSITION,
                &format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        bytes,
    )
        .into_response())
}

fn base64_decode(input: &str) -> std::result::Result<Vec<u8>, ()> {
    // Simple base64 decoder
    use std::collections::HashMap;

    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let decode_map: HashMap<char, u8> = alphabet.chars().enumerate().map(|(i, c)| (c, i as u8)).collect();

    let input: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    let mut output = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0;

    for c in input.chars() {
        if c == '=' {
            break;
        }
        if let Some(&val) = decode_map.get(&c) {
            buffer = (buffer << 6) | val as u32;
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                output.push((buffer >> bits) as u8);
                buffer &= (1 << bits) - 1;
            }
        }
    }

    Ok(output)
}

// Write file contents
pub async fn write_file(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Json(request): Json<WriteRequest>,
) -> Result<Json<serde_json::Value>> {
    let internal_path = validate_path(&request.path)?;
    // Write content using echo and redirect
    // Escape content for shell
    let escaped_content = request.content.replace("'", "'\\''");

    let output = exec_command(
        &docker,
        &container_id,
        &["sh", "-c", &format!("echo '{}' > '{}'", escaped_content, internal_path)],
    )
    .await?;

    if !output.trim().is_empty() {
        return Err(DaemonError::Internal(format!("Write failed: {}", output)));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "path": to_user_path(&internal_path)
    })))
}

// Create file or directory
pub async fn create_item(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Json(request): Json<CreateRequest>,
) -> Result<Json<serde_json::Value>> {
    let internal_path = validate_path(&request.path)?;
    let cmd = if request.item_type == "directory" {
        format!("mkdir -p '{}'", internal_path)
    } else {
        let content = request.content.as_deref().unwrap_or("");
        let escaped = content.replace("'", "'\\''");
        format!("echo '{}' > '{}'", escaped, internal_path)
    };

    let output = exec_command(&docker, &container_id, &["sh", "-c", &cmd]).await?;

    if !output.trim().is_empty() && output.contains("error") {
        return Err(DaemonError::Internal(format!("Create failed: {}", output)));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "path": to_user_path(&internal_path),
        "type": request.item_type
    })))
}

// Delete file or directory
pub async fn delete_item(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Query(query): Query<FilePathQuery>,
) -> Result<Json<serde_json::Value>> {
    let internal_path = validate_path(&query.path)?;
    let output = exec_command(&docker, &container_id, &["rm", "-rf", &internal_path]).await?;

    if !output.trim().is_empty() && output.contains("error") {
        return Err(DaemonError::Internal(format!("Delete failed: {}", output)));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "path": to_user_path(&internal_path)
    })))
}

// Rename/move file or directory
pub async fn rename_item(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Json(request): Json<RenameRequest>,
) -> Result<Json<serde_json::Value>> {
    let from_internal = validate_path(&request.from)?;
    let to_internal = validate_path(&request.to)?;
    let output = exec_command(
        &docker,
        &container_id,
        &["mv", &from_internal, &to_internal],
    )
    .await?;

    if !output.trim().is_empty() && output.contains("error") {
        return Err(DaemonError::Internal(format!("Rename failed: {}", output)));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "from": to_user_path(&from_internal),
        "to": to_user_path(&to_internal)
    })))
}

// Create archive (tar.gz)
pub async fn create_archive(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Json(request): Json<ArchiveRequest>,
) -> Result<Json<serde_json::Value>> {
    let path_internal = validate_path(&request.path)?;
    let dest_internal = validate_path(&request.destination)?;
    let files = request.files.join(" ");
    let cmd = format!(
        "cd '{}' && tar -czf '{}' {}",
        path_internal, dest_internal, files
    );

    let output = exec_command(&docker, &container_id, &["sh", "-c", &cmd]).await?;

    if output.contains("error") || output.contains("Error") {
        return Err(DaemonError::Internal(format!("Archive failed: {}", output)));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "archive": to_user_path(&dest_internal)
    })))
}

// Extract archive
pub async fn extract_archive(
    State(docker): State<DockerService>,
    Path(container_id): Path<String>,
    Json(request): Json<ExtractRequest>,
) -> Result<Json<serde_json::Value>> {
    let archive_internal = validate_path(&request.archive_path)?;
    let dest_internal = validate_path(&request.destination)?;

    // Detect archive type and extract
    let cmd = if archive_internal.ends_with(".zip") {
        format!(
            "unzip -o '{}' -d '{}'",
            archive_internal, dest_internal
        )
    } else if archive_internal.ends_with(".tar.gz") || archive_internal.ends_with(".tgz") {
        format!(
            "tar -xzf '{}' -C '{}'",
            archive_internal, dest_internal
        )
    } else if archive_internal.ends_with(".tar") {
        format!(
            "tar -xf '{}' -C '{}'",
            archive_internal, dest_internal
        )
    } else {
        return Err(DaemonError::Internal("Unsupported archive format".to_string()));
    };

    let output = exec_command(&docker, &container_id, &["sh", "-c", &cmd]).await?;

    if output.contains("error") || output.contains("Error") {
        return Err(DaemonError::Internal(format!("Extract failed: {}", output)));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "extracted_to": to_user_path(&dest_internal)
    })))
}

// Upload file (multipart)
pub async fn upload_file(
    State(docker): State<DockerService>,
    Path((container_id, path)): Path<(String, String)>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>> {
    // Validate the upload directory
    let upload_dir = validate_path(&path)?;
    let mut uploaded_files = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        DaemonError::Internal(format!("Failed to read multipart: {}", e))
    })? {
        let filename = field.file_name().map(|s| s.to_string());
        let data = field.bytes().await.map_err(|e| {
            DaemonError::Internal(format!("Failed to read file data: {}", e))
        })?;

        if let Some(name) = filename {
            let dest_path = format!("{}/{}", upload_dir.trim_end_matches('/'), name);
            // Validate the final destination path
            let validated_dest = validate_path(&dest_path)?;

            // Base64 encode the data and write via exec
            let encoded = base64_encode(&data);

            let cmd = format!("echo '{}' | base64 -d > '{}'", encoded, validated_dest);
            let output = exec_command(&docker, &container_id, &["sh", "-c", &cmd]).await?;

            if output.contains("error") {
                return Err(DaemonError::Internal(format!("Upload failed: {}", output)));
            }

            // Return user-facing path
            uploaded_files.push(to_user_path(&validated_dest));
        }
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "uploaded": uploaded_files
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

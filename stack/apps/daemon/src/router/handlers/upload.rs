//! File upload handler

use axum::{
    extract::{Multipart, Query, State},
    Json,
};
use serde::Deserialize;

use super::super::AppState;
use super::ApiError;
use crate::filesystem::Filesystem;

/// Upload file query parameters
#[derive(Debug, Deserialize)]
pub struct UploadFileQuery {
    /// JWT token for authentication
    pub token: String,
    /// Directory to upload to
    #[serde(default)]
    pub directory: String,
}

/// Upload claims from JWT
#[derive(Debug, serde::Deserialize)]
pub struct UploadClaims {
    pub server_uuid: String,
    pub directory: Option<String>,
    pub exp: usize,
}

/// Upload a file to a server
pub async fn upload_file(
    State(state): State<AppState>,
    Query(query): Query<UploadFileQuery>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Validate JWT token
    let claims = validate_upload_token(&query.token, &state.config.remote.token)
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

    // Determine upload directory
    let directory = claims.directory
        .or_else(|| if query.directory.is_empty() { None } else { Some(query.directory.clone()) })
        .unwrap_or_default();

    let mut uploaded_files = Vec::new();

    // Process multipart form
    while let Some(field) = multipart.next_field().await
        .map_err(|e| ApiError::bad_request(e.to_string()))?
    {
        let filename = field.file_name()
            .map(|s| s.to_string())
            .ok_or_else(|| ApiError::bad_request("Missing filename"))?;

        let content_type = field.content_type()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "application/octet-stream".to_string());

        // Build file path
        let file_path = if directory.is_empty() {
            filename.clone()
        } else {
            format!("{}/{}", directory.trim_end_matches('/'), filename)
        };

        // Read file data
        let data = field.bytes().await
            .map_err(|e| ApiError::bad_request(e.to_string()))?;

        // Check disk space before writing
        fs.disk_usage().has_space_for(data.len() as u64)?;

        // Write file
        fs.write_file(&file_path, &data).await?;

        uploaded_files.push(serde_json::json!({
            "name": filename,
            "size": data.len(),
            "mime_type": content_type,
        }));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "files": uploaded_files
    })))
}

/// Validate an upload token
fn validate_upload_token(token: &str, secret: &str) -> Result<UploadClaims, &'static str> {
    use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};

    let validation = Validation::new(Algorithm::HS256);
    let key = DecodingKey::from_secret(secret.as_bytes());

    let token_data = decode::<UploadClaims>(token, &key, &validation)
        .map_err(|_| "Invalid token")?;

    // Check expiration
    let now = chrono::Utc::now().timestamp() as usize;
    if token_data.claims.exp < now {
        return Err("Token expired");
    }

    Ok(token_data.claims)
}

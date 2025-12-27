//! S3-compatible object storage backup adapter

use std::path::Path;
use std::time::Duration;

use async_trait::async_trait;
use reqwest::Client;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tracing::{debug, info, warn};

use super::adapter::{AdapterType, BackupAdapter};
use super::backup::{BackupError, BackupResult};

/// S3-compatible backup adapter
#[allow(dead_code)]
pub struct S3Adapter {
    /// S3 client (reqwest-based for simplicity)
    client: Client,

    /// Bucket name
    bucket: String,

    /// Endpoint URL
    endpoint: String,

    /// Access key
    access_key: String,

    /// Secret key
    secret_key: String,

    /// Region
    region: String,

    /// Use path-style addressing (for MinIO, etc.)
    use_path_style: bool,
}

/// S3 configuration
#[derive(Debug, Clone)]
pub struct S3Config {
    pub bucket: String,
    pub endpoint: String,
    pub access_key: String,
    pub secret_key: String,
    pub region: String,
    pub use_path_style: bool,
}

impl S3Adapter {
    /// Create a new S3 adapter
    pub fn new(config: S3Config) -> BackupResult<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| BackupError::Other(e.to_string()))?;

        Ok(Self {
            client,
            bucket: config.bucket,
            endpoint: config.endpoint.trim_end_matches('/').to_string(),
            access_key: config.access_key,
            secret_key: config.secret_key,
            region: config.region,
            use_path_style: config.use_path_style,
        })
    }

    /// Get the URL for an object
    fn object_url(&self, key: &str) -> String {
        if self.use_path_style {
            format!("{}/{}/{}", self.endpoint, self.bucket, key)
        } else {
            // Virtual-hosted style
            let endpoint_without_proto = self.endpoint
                .replace("https://", "")
                .replace("http://", "");
            let proto = if self.endpoint.starts_with("https://") { "https" } else { "http" };
            format!("{}://{}.{}/{}", proto, self.bucket, endpoint_without_proto, key)
        }
    }

    /// Get the object key for a backup
    #[allow(dead_code)]
    fn backup_key(&self, server_uuid: &str, backup_uuid: &str) -> String {
        format!("{}/{}.tar.gz", server_uuid, backup_uuid)
    }

    /// Sign a request using AWS Signature V4 (simplified)
    fn sign_request(&self, _method: &str, _url: &str, headers: &mut reqwest::header::HeaderMap) {
        use chrono::Utc;

        let now = Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();

        headers.insert("x-amz-date", amz_date.parse().unwrap());
        headers.insert("x-amz-content-sha256", "UNSIGNED-PAYLOAD".parse().unwrap());

        // Simplified signing - in production, use aws-sdk-s3 or similar
        // This is a basic implementation for demonstration
    }

    /// Upload a file using multipart upload
    async fn multipart_upload(&self, key: &str, path: &Path) -> BackupResult<()> {
        // For large files, use multipart upload
        // This is a simplified implementation

        let mut file = File::open(path).await?;
        let metadata = file.metadata().await?;
        let size = metadata.len();

        // For files < 5GB, use single PUT
        if size < 5 * 1024 * 1024 * 1024 {
            let mut data = Vec::with_capacity(size as usize);
            file.read_to_end(&mut data).await?;

            let url = self.object_url(key);
            let mut headers = reqwest::header::HeaderMap::new();
            self.sign_request("PUT", &url, &mut headers);

            let response = self.client.put(&url)
                .headers(headers)
                .body(data)
                .send()
                .await
                .map_err(|e| BackupError::Other(e.to_string()))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(BackupError::Other(format!("S3 upload failed: {} - {}", status, body)));
            }

            info!("Uploaded {} to S3 ({} bytes)", key, size);
        } else {
            // For very large files, implement multipart upload
            warn!("Large file upload (multipart) not fully implemented");
            return Err(BackupError::Other("File too large for single upload".into()));
        }

        Ok(())
    }
}

#[async_trait]
impl BackupAdapter for S3Adapter {
    fn adapter_type(&self) -> AdapterType {
        AdapterType::S3
    }

    async fn exists(&self, _backup_uuid: &str) -> BackupResult<bool> {
        // HEAD request to check if object exists
        // Need server_uuid for full key - this is a limitation
        // In practice, the backup manager would track this

        Ok(false) // Simplified - would need full key
    }

    async fn write(&self, backup_uuid: &str, data: &[u8]) -> BackupResult<()> {
        let parts: Vec<&str> = backup_uuid.split('/').collect();
        let key = if parts.len() == 2 {
            format!("{}/{}.tar.gz", parts[0], parts[1])
        } else {
            format!("backups/{}.tar.gz", backup_uuid)
        };

        let url = self.object_url(&key);
        let mut headers = reqwest::header::HeaderMap::new();
        self.sign_request("PUT", &url, &mut headers);

        let response = self.client.put(&url)
            .headers(headers)
            .body(data.to_vec())
            .send()
            .await
            .map_err(|e| BackupError::Other(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(BackupError::Other(format!("S3 upload failed: {} - {}", status, body)));
        }

        debug!("Uploaded {} to S3", key);
        Ok(())
    }

    async fn write_from_path(&self, backup_uuid: &str, path: &Path) -> BackupResult<()> {
        let parts: Vec<&str> = backup_uuid.split('/').collect();
        let key = if parts.len() == 2 {
            format!("{}/{}.tar.gz", parts[0], parts[1])
        } else {
            format!("backups/{}.tar.gz", backup_uuid)
        };

        self.multipart_upload(&key, path).await
    }

    async fn read(&self, backup_uuid: &str) -> BackupResult<Vec<u8>> {
        let parts: Vec<&str> = backup_uuid.split('/').collect();
        let key = if parts.len() == 2 {
            format!("{}/{}.tar.gz", parts[0], parts[1])
        } else {
            format!("backups/{}.tar.gz", backup_uuid)
        };

        let url = self.object_url(&key);
        let mut headers = reqwest::header::HeaderMap::new();
        self.sign_request("GET", &url, &mut headers);

        let response = self.client.get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| BackupError::Other(e.to_string()))?;

        if response.status().as_u16() == 404 {
            return Err(BackupError::NotFound(backup_uuid.to_string()));
        }

        if !response.status().is_success() {
            let status = response.status();
            return Err(BackupError::Other(format!("S3 download failed: {}", status)));
        }

        let data = response.bytes().await
            .map_err(|e| BackupError::Other(e.to_string()))?;

        Ok(data.to_vec())
    }

    async fn presigned_url(&self, backup_uuid: &str, _expires_in_secs: u64) -> BackupResult<Option<String>> {
        // Generate a presigned URL
        // This is a simplified implementation - in production, use proper AWS signature

        let parts: Vec<&str> = backup_uuid.split('/').collect();
        let key = if parts.len() == 2 {
            format!("{}/{}.tar.gz", parts[0], parts[1])
        } else {
            format!("backups/{}.tar.gz", backup_uuid)
        };

        let url = self.object_url(&key);

        // In production, this would generate a proper presigned URL with expiration
        // For now, just return the URL (requires public access or other auth)
        Ok(Some(url))
    }

    async fn delete(&self, backup_uuid: &str) -> BackupResult<()> {
        let parts: Vec<&str> = backup_uuid.split('/').collect();
        let key = if parts.len() == 2 {
            format!("{}/{}.tar.gz", parts[0], parts[1])
        } else {
            format!("backups/{}.tar.gz", backup_uuid)
        };

        let url = self.object_url(&key);
        let mut headers = reqwest::header::HeaderMap::new();
        self.sign_request("DELETE", &url, &mut headers);

        let response = self.client.delete(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| BackupError::Other(e.to_string()))?;

        // 204 No Content is success for DELETE
        if !response.status().is_success() && response.status().as_u16() != 204 {
            let status = response.status();
            return Err(BackupError::Other(format!("S3 delete failed: {}", status)));
        }

        debug!("Deleted {} from S3", key);
        Ok(())
    }

    async fn size(&self, backup_uuid: &str) -> BackupResult<u64> {
        let parts: Vec<&str> = backup_uuid.split('/').collect();
        let key = if parts.len() == 2 {
            format!("{}/{}.tar.gz", parts[0], parts[1])
        } else {
            format!("backups/{}.tar.gz", backup_uuid)
        };

        let url = self.object_url(&key);
        let mut headers = reqwest::header::HeaderMap::new();
        self.sign_request("HEAD", &url, &mut headers);

        let response = self.client.head(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| BackupError::Other(e.to_string()))?;

        if response.status().as_u16() == 404 {
            return Err(BackupError::NotFound(backup_uuid.to_string()));
        }

        let size = response.headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        Ok(size)
    }

    async fn list(&self, server_uuid: &str) -> BackupResult<Vec<String>> {
        // List objects with prefix
        // This is a simplified implementation - in production, use proper S3 list objects

        let prefix = format!("{}/", server_uuid);
        let url = format!("{}?list-type=2&prefix={}", self.object_url(""), prefix);

        let mut headers = reqwest::header::HeaderMap::new();
        self.sign_request("GET", &url, &mut headers);

        let response = self.client.get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| BackupError::Other(e.to_string()))?;

        if !response.status().is_success() {
            return Ok(vec![]); // Return empty on error
        }

        // Parse XML response (simplified)
        let body = response.text().await
            .map_err(|e| BackupError::Other(e.to_string()))?;

        // Basic XML parsing for keys
        let mut backups = Vec::new();
        for line in body.lines() {
            if line.contains("<Key>") {
                if let Some(start) = line.find("<Key>") {
                    if let Some(end) = line.find("</Key>") {
                        let key = &line[start + 5..end];
                        if key.ends_with(".tar.gz") {
                            let uuid = key
                                .strip_prefix(&prefix)
                                .unwrap_or(key)
                                .strip_suffix(".tar.gz")
                                .unwrap_or(key)
                                .to_string();
                            backups.push(uuid);
                        }
                    }
                }
            }
        }

        Ok(backups)
    }
}

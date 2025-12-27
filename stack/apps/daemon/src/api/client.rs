//! HTTP client with retry logic for Panel API communication

use std::time::Duration;
use reqwest::{Client, Method, RequestBuilder, Response, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use tracing::{debug, error, warn};

use super::errors::{ApiError, ApiResult};
use super::types::*;
use crate::config::RemoteConfiguration;

/// Maximum number of retry attempts
const MAX_RETRIES: u32 = 3;

/// Base delay between retries (will be exponentially increased)
const BASE_RETRY_DELAY: Duration = Duration::from_millis(500);

/// Maximum delay between retries
const MAX_RETRY_DELAY: Duration = Duration::from_secs(30);

/// HTTP client for communicating with the StellarStack Panel
#[allow(dead_code)]
pub struct HttpClient {
    client: Client,
    base_url: String,
    token_id: String,
    token: String,
    timeout: Duration,
}

impl HttpClient {
    /// Create a new HTTP client with the given configuration
    pub fn new(config: &RemoteConfiguration) -> ApiResult<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout))
            .connect_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(10)
            .build()
            .map_err(ApiError::Request)?;

        // Validate and normalize base URL
        let base_url = config.url.trim_end_matches('/').to_string();
        if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
            return Err(ApiError::InvalidUrl(
                "URL must start with http:// or https://".to_string(),
            ));
        }

        Ok(Self {
            client,
            base_url,
            token_id: config.token_id.clone(),
            token: config.token.clone(),
            timeout: Duration::from_secs(config.timeout),
        })
    }

    /// Build the authorization header value
    fn auth_header(&self) -> String {
        format!("Bearer {}.{}", self.token_id, self.token)
    }

    /// Build a full URL from a path
    fn url(&self, path: &str) -> String {
        let path = path.trim_start_matches('/');
        format!("{}/api/remote/{}", self.base_url, path)
    }

    /// Make a request with automatic retry on transient failures
    async fn request<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<impl Serialize>,
    ) -> ApiResult<T> {
        let url = self.url(path);
        let mut last_error: Option<ApiError> = None;

        for attempt in 0..=MAX_RETRIES {
            if attempt > 0 {
                let delay = self.calculate_backoff(attempt);
                debug!(
                    "Retrying request to {} (attempt {}/{}), waiting {:?}",
                    path,
                    attempt + 1,
                    MAX_RETRIES + 1,
                    delay
                );
                tokio::time::sleep(delay).await;
            }

            let mut request = self
                .client
                .request(method.clone(), &url)
                .header("Authorization", self.auth_header())
                .header("Accept", "application/json")
                .header("Content-Type", "application/json");

            if let Some(ref body) = body {
                request = request.json(body);
            }

            match self.execute_request(request).await {
                Ok(response) => {
                    return self.parse_response(response).await;
                }
                Err(e) => {
                    if e.is_retryable() && attempt < MAX_RETRIES {
                        warn!(
                            "Request to {} failed (attempt {}): {}",
                            path,
                            attempt + 1,
                            e
                        );
                        last_error = Some(e);
                        continue;
                    }
                    return Err(e);
                }
            }
        }

        Err(ApiError::RetryExhausted(
            last_error
                .map(|e| e.to_string())
                .unwrap_or_else(|| "Unknown error".to_string()),
        ))
    }

    /// Execute a single request
    async fn execute_request(&self, request: RequestBuilder) -> ApiResult<Response> {
        let response = request.send().await.map_err(|e| {
            if e.is_timeout() {
                ApiError::Timeout
            } else {
                ApiError::Request(e)
            }
        })?;

        let status = response.status();

        // Handle rate limiting
        if status == StatusCode::TOO_MANY_REQUESTS {
            let retry_after = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok());

            return Err(ApiError::RateLimited { retry_after });
        }

        // Handle authentication errors
        if status == StatusCode::UNAUTHORIZED {
            return Err(ApiError::Authentication(
                "Invalid node credentials".to_string(),
            ));
        }

        // Handle not found
        if status == StatusCode::NOT_FOUND {
            return Err(ApiError::NotFound("Resource not found".to_string()));
        }

        // Handle server errors (retryable)
        if status.is_server_error() {
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown server error".to_string());

            return Err(ApiError::Server {
                status: status.as_u16(),
                message,
            });
        }

        // Handle client errors (not retryable)
        if status.is_client_error() {
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown client error".to_string());

            return Err(ApiError::Server {
                status: status.as_u16(),
                message,
            });
        }

        Ok(response)
    }

    /// Parse a successful response
    async fn parse_response<T: DeserializeOwned>(&self, response: Response) -> ApiResult<T> {
        let text = response.text().await.map_err(ApiError::Request)?;

        serde_json::from_str(&text).map_err(|e| {
            error!("Failed to parse response: {} - Body: {}", e, text);
            ApiError::Parse(e)
        })
    }

    /// Calculate exponential backoff delay
    fn calculate_backoff(&self, attempt: u32) -> Duration {
        let delay = BASE_RETRY_DELAY * 2u32.pow(attempt - 1);
        std::cmp::min(delay, MAX_RETRY_DELAY)
    }

    // ========================================================================
    // Server Management API
    // ========================================================================

    /// Fetch all servers for this node
    pub async fn get_servers(&self, per_page: u32) -> ApiResult<Vec<RawServerData>> {
        let mut all_servers = Vec::new();
        let mut page = 1u32;

        loop {
            let response: PaginatedResponse<RawServerData> = self
                .request(
                    Method::GET,
                    &format!("servers?page={}&per_page={}", page, per_page),
                    None::<()>,
                )
                .await?;

            all_servers.extend(response.data);

            if page >= response.meta.last_page {
                break;
            }
            page += 1;
        }

        debug!("Fetched {} servers from panel", all_servers.len());
        Ok(all_servers)
    }

    /// Get configuration for a specific server
    pub async fn get_server_configuration(&self, uuid: &str) -> ApiResult<ServerConfiguration> {
        let response: ApiResponse<ServerConfiguration> = self
            .request(
                Method::GET,
                &format!("servers/{}", uuid),
                None::<()>,
            )
            .await?;

        Ok(response.data)
    }

    /// Update server status on the Panel
    pub async fn set_server_status(&self, uuid: &str, status: &str) -> ApiResult<()> {
        self.request::<serde_json::Value>(
            Method::POST,
            &format!("servers/{}/status", uuid),
            Some(serde_json::json!({ "status": status })),
        )
        .await?;

        Ok(())
    }

    // ========================================================================
    // Installation API
    // ========================================================================

    /// Get installation script for a server
    pub async fn get_installation_script(&self, uuid: &str) -> ApiResult<InstallationScript> {
        let response: ApiResponse<InstallationScript> = self
            .request(
                Method::GET,
                &format!("servers/{}/install", uuid),
                None::<()>,
            )
            .await?;

        Ok(response.data)
    }

    /// Report installation status to Panel
    pub async fn set_installation_status(&self, uuid: &str, successful: bool) -> ApiResult<()> {
        self.request::<serde_json::Value>(
            Method::POST,
            &format!("servers/{}/install", uuid),
            Some(serde_json::json!({
                "successful": successful,
                "reinstall": false
            })),
        )
        .await?;

        Ok(())
    }

    // ========================================================================
    // Backup API
    // ========================================================================

    /// Update backup status on Panel
    pub async fn set_backup_status(&self, backup_uuid: &str, data: &BackupRequest) -> ApiResult<()> {
        self.request::<serde_json::Value>(
            Method::POST,
            &format!("backups/{}", backup_uuid),
            Some(data),
        )
        .await?;

        Ok(())
    }

    /// Get pre-signed URLs for backup upload
    pub async fn get_backup_upload_urls(
        &self,
        backup_uuid: &str,
        size: u64,
    ) -> ApiResult<BackupUploadResponse> {
        self.request(
            Method::GET,
            &format!("backups/{}/upload?size={}", backup_uuid, size),
            None::<()>,
        )
        .await
    }

    /// Report backup restoration status
    pub async fn send_restoration_status(&self, backup_uuid: &str, successful: bool) -> ApiResult<()> {
        self.request::<serde_json::Value>(
            Method::POST,
            &format!("backups/{}/restore", backup_uuid),
            Some(serde_json::json!({ "successful": successful })),
        )
        .await?;

        Ok(())
    }

    // ========================================================================
    // Transfer API
    // ========================================================================

    /// Get server archive URL for transfer
    pub async fn get_server_archive(&self, uuid: &str) -> ApiResult<TransferArchiveResponse> {
        self.request(
            Method::GET,
            &format!("servers/{}/archive", uuid),
            None::<()>,
        )
        .await
    }

    /// Report archive status
    pub async fn set_archive_status(&self, uuid: &str, successful: bool) -> ApiResult<()> {
        self.request::<serde_json::Value>(
            Method::POST,
            &format!("servers/{}/archive", uuid),
            Some(serde_json::json!({ "successful": successful })),
        )
        .await?;

        Ok(())
    }

    /// Report transfer completion status
    pub async fn set_transfer_status(&self, uuid: &str, successful: bool) -> ApiResult<()> {
        self.request::<serde_json::Value>(
            Method::POST,
            &format!("servers/{}/transfer", uuid),
            Some(serde_json::json!({ "successful": successful })),
        )
        .await?;

        Ok(())
    }

    // ========================================================================
    // SFTP API
    // ========================================================================

    /// Validate SFTP credentials with Panel
    pub async fn validate_sftp_credentials(
        &self,
        request: &SftpAuthRequest,
    ) -> ApiResult<SftpAuthResponse> {
        self.request(
            Method::POST,
            "sftp/auth",
            Some(request),
        )
        .await
    }

    // ========================================================================
    // Activity API
    // ========================================================================

    /// Send activity logs to Panel
    pub async fn send_activity_logs(&self, logs: Vec<ActivityLog>) -> ApiResult<()> {
        if logs.is_empty() {
            return Ok(());
        }

        self.request::<serde_json::Value>(
            Method::POST,
            "activity",
            Some(serde_json::json!({ "data": logs })),
        )
        .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url_building() {
        let config = RemoteConfiguration {
            url: "https://panel.example.com/".to_string(),
            token_id: "abc".to_string(),
            token: "xyz".to_string(),
            timeout: 30,
            boot_servers_per_page: 50,
        };

        let client = HttpClient::new(&config).unwrap();

        assert_eq!(
            client.url("servers"),
            "https://panel.example.com/api/remote/servers"
        );
        assert_eq!(
            client.url("/servers"),
            "https://panel.example.com/api/remote/servers"
        );
    }

    #[test]
    fn test_auth_header() {
        let config = RemoteConfiguration {
            url: "https://panel.example.com".to_string(),
            token_id: "token-id".to_string(),
            token: "secret-token".to_string(),
            timeout: 30,
            boot_servers_per_page: 50,
        };

        let client = HttpClient::new(&config).unwrap();
        assert_eq!(client.auth_header(), "Bearer token-id.secret-token");
    }

    #[test]
    fn test_backoff_calculation() {
        let config = RemoteConfiguration {
            url: "https://panel.example.com".to_string(),
            token_id: "abc".to_string(),
            token: "xyz".to_string(),
            timeout: 30,
            boot_servers_per_page: 50,
        };

        let client = HttpClient::new(&config).unwrap();

        assert_eq!(client.calculate_backoff(1), Duration::from_millis(500));
        assert_eq!(client.calculate_backoff(2), Duration::from_millis(1000));
        assert_eq!(client.calculate_backoff(3), Duration::from_millis(2000));
        assert_eq!(client.calculate_backoff(4), Duration::from_millis(4000));
    }

    #[test]
    fn test_invalid_url() {
        let config = RemoteConfiguration {
            url: "panel.example.com".to_string(), // Missing protocol
            token_id: "abc".to_string(),
            token: "xyz".to_string(),
            timeout: 30,
            boot_servers_per_page: 50,
        };

        let result = HttpClient::new(&config);
        assert!(result.is_err());
    }
}

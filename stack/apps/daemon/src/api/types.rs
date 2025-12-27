//! API request and response types

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Server Configuration Types
// ============================================================================

/// Raw server data from Panel API
#[derive(Debug, Clone, Deserialize)]
pub struct RawServerData {
    pub uuid: String,
    pub settings: ServerConfiguration,
    pub process_configuration: ProcessConfiguration,
}

/// Server configuration from Panel
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerConfiguration {
    pub uuid: String,
    pub name: String,
    pub suspended: bool,

    #[serde(default)]
    pub invocation: String,

    pub skip_egg_scripts: bool,

    pub build: BuildConfiguration,
    pub container: ContainerConfiguration,
    pub allocations: AllocationConfiguration,
    pub egg: EggConfiguration,
    pub mounts: Vec<MountConfiguration>,
}

/// Build/resource limits configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BuildConfiguration {
    /// Memory limit in MB (-1 for unlimited)
    pub memory_limit: i64,

    /// Swap limit in MB (-1 for unlimited)
    pub swap: i64,

    /// I/O weight (10-1000)
    pub io_weight: u32,

    /// CPU limit as percentage (100 = 1 core, -1 for unlimited)
    pub cpu_limit: i64,

    /// Number of CPU threads to use (0 for all)
    pub threads: Option<String>,

    /// Disk space limit in MB (-1 for unlimited)
    pub disk_space: i64,

    /// OOM killer enabled
    pub oom_disabled: bool,
}

/// Container configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ContainerConfiguration {
    /// Docker image to use
    pub image: String,

    /// Whether OOM killer is disabled
    #[serde(default)]
    pub oom_disabled: bool,

    /// Whether to require rebuilding the container
    #[serde(default)]
    pub requires_rebuild: bool,
}

/// Network allocation configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AllocationConfiguration {
    /// Default allocation
    pub default: Allocation,

    /// Additional allocations
    #[serde(default)]
    pub mappings: HashMap<String, Vec<u16>>,
}

/// Single port allocation
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Allocation {
    /// IP address to bind to
    pub ip: String,

    /// Port number
    pub port: u16,
}

/// Egg configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EggConfiguration {
    /// Egg ID
    pub id: String,

    /// File denylist patterns
    #[serde(default)]
    pub file_denylist: Vec<String>,
}

/// Mount configuration for additional volumes
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MountConfiguration {
    /// Source path on host
    pub source: String,

    /// Target path in container
    pub target: String,

    /// Whether mount is read-only
    #[serde(default)]
    pub read_only: bool,
}

/// Process configuration (stop signals, etc.)
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProcessConfiguration {
    /// Startup configuration
    pub startup: StartupConfiguration,

    /// Stop configuration
    pub stop: StopConfiguration,

    /// Configuration file updates
    #[serde(default)]
    pub configs: Vec<ConfigFileConfiguration>,
}

/// Startup configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StartupConfiguration {
    /// Whether startup is complete
    #[serde(default)]
    pub done: Vec<String>,

    /// User interaction patterns
    #[serde(default)]
    pub user_interaction: Vec<String>,

    /// Strip ANSI codes
    #[serde(default)]
    pub strip_ansi: bool,
}

/// Stop configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StopConfiguration {
    /// Send a signal to stop
    Signal { value: String },

    /// Send a command to stop
    Command { value: String },

    /// No specific stop method
    None,
}

impl Default for StopConfiguration {
    fn default() -> Self {
        StopConfiguration::Signal {
            value: "SIGTERM".to_string(),
        }
    }
}

/// Configuration file to be modified
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ConfigFileConfiguration {
    /// Parser to use (yaml, json, ini, xml, properties, file)
    pub parser: String,

    /// File path relative to server root
    pub file: String,

    /// Key-value replacements
    pub replace: Vec<ConfigReplacement>,
}

/// Single config replacement
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ConfigReplacement {
    /// Match pattern or key
    #[serde(rename = "match")]
    pub match_pattern: String,

    /// Replacement value or regex
    pub replace_with: ReplaceValue,
}

/// Replacement value type
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum ReplaceValue {
    /// Simple string replacement
    String(String),

    /// Complex replacement with regex
    Complex {
        value: String,
        #[serde(default)]
        if_value: Option<String>,
    },
}

// ============================================================================
// Installation Types
// ============================================================================

/// Installation script from Panel
#[derive(Debug, Clone, Deserialize)]
pub struct InstallationScript {
    /// Docker image for installation
    pub container_image: String,

    /// Entrypoint command
    pub entrypoint: String,

    /// Installation script content
    pub script: String,
}

// ============================================================================
// Backup Types
// ============================================================================

/// Backup status request
#[derive(Debug, Clone, Serialize)]
pub struct BackupRequest {
    /// Whether backup completed successfully
    pub successful: bool,

    /// Checksum of backup file
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,

    /// Checksum type (sha256)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checksum_type: Option<String>,

    /// Size in bytes
    pub size: u64,

    /// Parts for multipart upload (S3)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parts: Option<Vec<BackupPart>>,
}

/// Multipart upload part
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupPart {
    /// Part number
    pub part_number: i32,

    /// ETag from upload
    pub etag: String,
}

/// Backup upload URL response
#[derive(Debug, Clone, Deserialize)]
pub struct BackupUploadResponse {
    /// Upload URL(s)
    pub parts: Vec<BackupUploadPart>,

    /// Multipart upload ID (for S3)
    #[serde(default)]
    pub upload_id: Option<String>,
}

/// Single upload part
#[derive(Debug, Clone, Deserialize)]
pub struct BackupUploadPart {
    /// Part number
    pub part_number: i32,

    /// Pre-signed URL for upload
    pub url: String,
}

// ============================================================================
// Transfer Types
// ============================================================================

/// Transfer archive response
#[derive(Debug, Clone, Deserialize)]
pub struct TransferArchiveResponse {
    /// Download URL for archive
    pub url: String,

    /// Checksum for verification
    pub checksum: String,
}

// ============================================================================
// SFTP Types
// ============================================================================

/// SFTP authentication request
#[derive(Debug, Clone, Serialize)]
pub struct SftpAuthRequest {
    /// Username (format: server_uuid.user_uuid)
    pub username: String,

    /// Password
    pub password: String,
}

/// SFTP authentication response
#[derive(Debug, Clone, Deserialize)]
pub struct SftpAuthResponse {
    /// Server UUID
    pub server: String,

    /// User permissions
    pub permissions: Vec<String>,
}

// ============================================================================
// Activity Types
// ============================================================================

/// Activity log entry
#[derive(Debug, Clone, Serialize)]
pub struct ActivityLog {
    /// Server UUID
    pub server: String,

    /// Event type
    pub event: String,

    /// Metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,

    /// IP address
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,

    /// Timestamp
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

// ============================================================================
// Response Wrappers
// ============================================================================

/// Paginated response from Panel
#[derive(Debug, Clone, Deserialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub meta: PaginationMeta,
}

/// Pagination metadata
#[derive(Debug, Clone, Deserialize)]
pub struct PaginationMeta {
    pub current_page: u32,
    pub last_page: u32,
    pub per_page: u32,
    pub total: u32,
}

/// Generic API response wrapper
#[derive(Debug, Clone, Deserialize)]
pub struct ApiResponse<T> {
    pub data: T,
}

/// Error response from Panel
#[derive(Debug, Clone, Deserialize)]
pub struct ErrorResponse {
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub errors: Option<Vec<ValidationError>>,
}

/// Validation error detail
#[derive(Debug, Clone, Deserialize)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

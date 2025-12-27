//! Configuration structures and loading

use std::collections::HashMap;
use std::path::PathBuf;
use anyhow::{Result, Context};
use serde::Deserialize;

/// Main daemon configuration
#[derive(Debug, Clone, Deserialize)]
pub struct Configuration {
    /// Enable debug mode
    #[serde(default)]
    pub debug: bool,

    /// API server configuration
    pub api: ApiConfiguration,

    /// System paths and settings
    pub system: SystemConfiguration,

    /// Docker configuration
    pub docker: DockerConfiguration,

    /// Remote panel configuration
    pub remote: RemoteConfiguration,

    /// SFTP server configuration
    pub sftp: SftpConfiguration,
}

impl Configuration {
    /// Load configuration from a YAML file
    pub fn load(path: &str) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {}", path))?;

        let config: Configuration = serde_yaml::from_str(&content)
            .with_context(|| "Failed to parse configuration")?;

        // Ensure directories exist
        std::fs::create_dir_all(&config.system.data_directory)?;
        std::fs::create_dir_all(&config.system.backup_directory)?;
        std::fs::create_dir_all(&config.system.archive_directory)?;
        std::fs::create_dir_all(&config.system.tmp_directory)?;
        std::fs::create_dir_all(&config.system.log_directory)?;

        Ok(config)
    }
}

/// API server configuration
#[derive(Debug, Clone, Deserialize)]
pub struct ApiConfiguration {
    /// Host to bind to
    #[serde(default = "default_api_host")]
    pub host: String,

    /// Port to listen on
    #[serde(default = "default_api_port")]
    pub port: u16,

    /// SSL configuration
    #[serde(default)]
    pub ssl: SslConfiguration,

    /// Maximum upload size in MB
    #[serde(default = "default_upload_limit")]
    pub upload_limit: u64,

    /// List of trusted proxy IPs
    #[serde(default)]
    pub trusted_proxies: Vec<String>,
}

fn default_api_host() -> String {
    "0.0.0.0".into()
}

fn default_api_port() -> u16 {
    8080
}

fn default_upload_limit() -> u64 {
    100
}

/// SSL configuration
#[derive(Debug, Clone, Default, Deserialize)]
pub struct SslConfiguration {
    /// Enable SSL
    #[serde(default)]
    pub enabled: bool,

    /// Path to certificate file
    #[serde(default)]
    pub cert: String,

    /// Path to key file
    #[serde(default)]
    pub key: String,
}

/// System paths and settings
#[derive(Debug, Clone, Deserialize)]
pub struct SystemConfiguration {
    /// Root directory for all data
    #[serde(default = "default_root_directory")]
    pub root_directory: PathBuf,

    /// Directory for server data volumes
    #[serde(default = "default_data_directory")]
    pub data_directory: PathBuf,

    /// Directory for backups
    #[serde(default = "default_backup_directory")]
    pub backup_directory: PathBuf,

    /// Directory for archives (transfers)
    #[serde(default = "default_archive_directory")]
    pub archive_directory: PathBuf,

    /// Temporary directory
    #[serde(default = "default_tmp_directory")]
    pub tmp_directory: PathBuf,

    /// Log directory
    #[serde(default = "default_log_directory")]
    pub log_directory: PathBuf,

    /// Username for file ownership
    #[serde(default = "default_username")]
    pub username: String,

    /// Timezone
    #[serde(default = "default_timezone")]
    pub timezone: String,

    /// Disk check interval in seconds
    #[serde(default = "default_disk_check_interval")]
    pub disk_check_interval: u64,

    /// User configuration for rootless mode
    #[serde(default)]
    pub user: UserConfiguration,
}

fn default_root_directory() -> PathBuf {
    PathBuf::from("/var/lib/stellar")
}

fn default_data_directory() -> PathBuf {
    PathBuf::from("/var/lib/stellar/volumes")
}

fn default_backup_directory() -> PathBuf {
    PathBuf::from("/var/lib/stellar/backups")
}

fn default_archive_directory() -> PathBuf {
    PathBuf::from("/var/lib/stellar/archives")
}

fn default_tmp_directory() -> PathBuf {
    PathBuf::from("/tmp/stellar")
}

fn default_log_directory() -> PathBuf {
    PathBuf::from("/var/log/stellar")
}

fn default_username() -> String {
    "stellar".into()
}

fn default_timezone() -> String {
    "UTC".into()
}

fn default_disk_check_interval() -> u64 {
    60
}

/// User configuration for container processes
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UserConfiguration {
    /// User ID for container processes
    #[serde(default = "default_uid")]
    pub uid: u32,

    /// Group ID for container processes
    #[serde(default = "default_gid")]
    pub gid: u32,
}

fn default_uid() -> u32 {
    1000
}

fn default_gid() -> u32 {
    1000
}

/// Docker configuration
#[derive(Debug, Clone, Deserialize)]
pub struct DockerConfiguration {
    /// Docker socket path
    #[serde(default = "default_docker_socket")]
    pub socket: String,

    /// Network configuration
    #[serde(default)]
    pub network: NetworkConfiguration,

    /// Size of tmpfs mount in MB
    #[serde(default = "default_tmpfs_size")]
    pub tmpfs_size: u64,

    /// PID limit for containers
    #[serde(default = "default_container_pid_limit")]
    pub container_pid_limit: i64,

    /// Resource limits for installer containers
    #[serde(default)]
    pub installer_limits: ResourceLimits,

    /// Memory overhead configuration
    #[serde(default)]
    pub overhead: OverheadConfiguration,

    /// DNS servers for containers
    #[serde(default)]
    pub dns: Vec<String>,
}

fn default_docker_socket() -> String {
    "/var/run/docker.sock".into()
}

fn default_tmpfs_size() -> u64 {
    100
}

fn default_container_pid_limit() -> i64 {
    512
}

/// Docker network configuration
#[derive(Debug, Clone, Default, Deserialize)]
pub struct NetworkConfiguration {
    /// Network name
    #[serde(default = "default_network_name")]
    pub name: String,

    /// Network interface
    #[serde(default = "default_network_interface")]
    pub interface: String,

    /// Network driver (bridge, host, overlay)
    #[serde(default = "default_network_driver")]
    pub driver: String,

    /// Whether the network is internal (no external access)
    #[serde(default)]
    pub is_internal: bool,
}

fn default_network_name() -> String {
    "stellar".into()
}

fn default_network_interface() -> String {
    "172.18.0.1".into()
}

fn default_network_driver() -> String {
    "bridge".into()
}

/// Resource limits for containers
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ResourceLimits {
    /// Memory limit in MB
    #[serde(default = "default_memory_limit")]
    pub memory: u64,

    /// CPU limit as percentage (100 = 1 core)
    #[serde(default = "default_cpu_limit")]
    pub cpu: u64,
}

fn default_memory_limit() -> u64 {
    1024
}

fn default_cpu_limit() -> u64 {
    100
}

/// Memory overhead configuration
#[derive(Debug, Clone, Default, Deserialize)]
pub struct OverheadConfiguration {
    /// Default overhead percentage
    #[serde(default)]
    pub default: u64,

    /// Per-egg overhead overrides
    #[serde(default)]
    pub r#override: HashMap<String, u64>,
}

/// Remote panel configuration
#[derive(Debug, Clone, Deserialize)]
pub struct RemoteConfiguration {
    /// Panel API URL
    pub url: String,

    /// Node token ID
    pub token_id: String,

    /// Node authentication token
    pub token: String,

    /// Request timeout in seconds
    #[serde(default = "default_timeout")]
    pub timeout: u64,

    /// Number of servers to fetch per page on boot
    #[serde(default = "default_boot_servers_per_page")]
    pub boot_servers_per_page: u32,
}

fn default_timeout() -> u64 {
    30
}

fn default_boot_servers_per_page() -> u32 {
    50
}

/// SFTP server configuration
#[derive(Debug, Clone, Deserialize)]
pub struct SftpConfiguration {
    /// Enable SFTP server
    #[serde(default = "default_sftp_enabled")]
    pub enabled: bool,

    /// Address to bind to
    #[serde(default = "default_sftp_bind_address")]
    pub bind_address: String,

    /// Port to listen on
    #[serde(default = "default_sftp_bind_port")]
    pub bind_port: u16,

    /// Read-only mode
    #[serde(default)]
    pub read_only: bool,
}

fn default_sftp_enabled() -> bool {
    true
}

fn default_sftp_bind_address() -> String {
    "0.0.0.0".into()
}

fn default_sftp_bind_port() -> u16 {
    2022
}

//! Process environment trait definitions

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::events::{EventBus, ProcessState};

/// Error type for environment operations
#[derive(Debug, thiserror::Error)]
pub enum EnvironmentError {
    #[error("Docker error: {0}")]
    Docker(#[from] bollard::errors::Error),

    #[error("Container not found: {0}")]
    ContainerNotFound(String),

    #[error("Container already exists: {0}")]
    ContainerExists(String),

    #[error("Container not running")]
    NotRunning,

    #[error("Container already running")]
    AlreadyRunning,

    #[error("Operation cancelled")]
    Cancelled,

    #[error("Operation timed out")]
    Timeout,

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Image pull failed: {0}")]
    ImagePull(String),

    #[error("Attach failed: {0}")]
    AttachFailed(String),

    #[error("{0}")]
    Other(String),
}

pub type EnvironmentResult<T> = Result<T, EnvironmentError>;

/// Configuration for the process environment
#[derive(Debug, Clone)]
pub struct EnvironmentConfiguration {
    /// Unique identifier (server UUID)
    pub id: String,

    /// Container image to use
    pub image: String,

    /// Startup command/invocation
    pub invocation: String,

    /// Environment variables
    pub env: HashMap<String, String>,

    /// Port mappings (container_port -> host_port)
    pub ports: HashMap<u16, u16>,

    /// Port mappings with specific bind IP
    pub port_bindings: HashMap<u16, (String, u16)>,

    /// Resource limits
    pub limits: ResourceLimits,

    /// Volume mounts
    pub mounts: Vec<MountConfig>,

    /// User/group for container process
    pub user: UserConfig,

    /// Stop configuration
    pub stop: StopConfig,

    /// Labels for the container
    pub labels: HashMap<String, String>,

    /// DNS servers
    pub dns: Vec<String>,

    /// Docker network name
    pub network: String,

    /// Tmpfs size in MB
    pub tmpfs_size: u64,

    /// Whether OOM killer is disabled
    pub oom_disabled: bool,
}

impl Default for EnvironmentConfiguration {
    fn default() -> Self {
        Self {
            id: String::new(),
            image: String::new(),
            invocation: String::new(),
            env: HashMap::new(),
            ports: HashMap::new(),
            port_bindings: HashMap::new(),
            limits: ResourceLimits::default(),
            mounts: Vec::new(),
            user: UserConfig::default(),
            stop: StopConfig::default(),
            labels: HashMap::new(),
            dns: Vec::new(),
            network: "stellar".to_string(),
            tmpfs_size: 100,
            oom_disabled: false,
        }
    }
}

/// Resource limits for the container
#[derive(Debug, Clone, Default)]
pub struct ResourceLimits {
    /// Memory limit in bytes (0 for unlimited)
    pub memory: u64,

    /// Memory + swap limit in bytes (0 for unlimited)
    pub memory_swap: i64,

    /// CPU quota in microseconds per period
    pub cpu_quota: i64,

    /// CPU period in microseconds
    pub cpu_period: i64,

    /// CPU shares (relative weight)
    pub cpu_shares: i64,

    /// Block I/O weight (10-1000)
    pub io_weight: u16,

    /// PIDs limit
    pub pids_limit: i64,

    /// Disk space limit in bytes (enforced by daemon, not Docker)
    pub disk_space: u64,
}

/// Volume mount configuration
#[derive(Debug, Clone)]
pub struct MountConfig {
    /// Source path on host
    pub source: String,

    /// Target path in container
    pub target: String,

    /// Read-only mount
    pub read_only: bool,
}

/// User configuration for container process
#[derive(Debug, Clone)]
pub struct UserConfig {
    /// User ID
    pub uid: u32,

    /// Group ID
    pub gid: u32,
}

impl Default for UserConfig {
    fn default() -> Self {
        Self { uid: 1000, gid: 1000 }
    }
}

impl UserConfig {
    /// Format as Docker user string
    pub fn to_docker_user(&self) -> String {
        format!("{}:{}", self.uid, self.gid)
    }
}

/// Stop configuration for the container
#[derive(Debug, Clone)]
pub enum StopConfig {
    /// Send a signal (e.g., SIGTERM, SIGINT)
    Signal(String),

    /// Send a command to stdin
    Command(String),

    /// Use Docker's native stop
    Native,
}

impl Default for StopConfig {
    fn default() -> Self {
        StopConfig::Signal("SIGTERM".to_string())
    }
}

/// Exit state information
#[derive(Debug, Clone)]
pub struct ExitState {
    /// Exit code (0 = success)
    pub exit_code: i64,

    /// Whether the process was killed by OOM
    pub oom_killed: bool,

    /// Error message if any
    pub error: Option<String>,
}

/// Callback type for log output
pub type LogCallback = Arc<dyn Fn(&[u8]) + Send + Sync>;

/// Trait defining the process environment interface
///
/// This trait abstracts container runtime operations, allowing the server
/// management code to be agnostic of the underlying container technology.
#[async_trait]
pub trait ProcessEnvironment: Send + Sync {
    // ========================================================================
    // Identification
    // ========================================================================

    /// Get the environment/container ID
    fn id(&self) -> &str;

    /// Get the environment configuration
    fn config(&self) -> &EnvironmentConfiguration;

    // ========================================================================
    // Lifecycle Management
    // ========================================================================

    /// Create the container (but don't start it)
    async fn create(&self) -> EnvironmentResult<()>;

    /// Destroy/remove the container
    async fn destroy(&self) -> EnvironmentResult<()>;

    /// Check if the container exists
    async fn exists(&self) -> EnvironmentResult<bool>;

    /// Recreate the container (destroy + create)
    async fn recreate(&self) -> EnvironmentResult<()> {
        if self.exists().await? {
            self.destroy().await?;
        }
        self.create().await
    }

    // ========================================================================
    // Power Operations
    // ========================================================================

    /// Start the container
    async fn start(&self, ctx: CancellationToken) -> EnvironmentResult<()>;

    /// Stop the container gracefully
    async fn stop(&self, ctx: CancellationToken) -> EnvironmentResult<()>;

    /// Wait for the container to stop with timeout
    ///
    /// If `terminate` is true and the timeout expires, the container will be killed.
    async fn wait_for_stop(
        &self,
        ctx: CancellationToken,
        timeout: Duration,
        terminate: bool,
    ) -> EnvironmentResult<()>;

    /// Send a signal to the container
    async fn terminate(&self, ctx: CancellationToken, signal: &str) -> EnvironmentResult<()>;

    // ========================================================================
    // State Management
    // ========================================================================

    /// Get the current process state
    fn state(&self) -> ProcessState;

    /// Set the process state
    fn set_state(&self, state: ProcessState);

    /// Check if the container is currently running
    async fn is_running(&self) -> EnvironmentResult<bool>;

    /// Get the exit state (exit code, OOM killed)
    async fn exit_state(&self) -> EnvironmentResult<ExitState>;

    /// Get the container uptime in milliseconds
    async fn uptime(&self) -> EnvironmentResult<i64>;

    // ========================================================================
    // I/O Operations
    // ========================================================================

    /// Attach to the container's stdin/stdout/stderr
    async fn attach(&self, ctx: CancellationToken) -> EnvironmentResult<()>;

    /// Send a command to the container's stdin
    async fn send_command(&self, cmd: &str) -> EnvironmentResult<()>;

    /// Set the callback for log output
    fn set_log_callback(&self, callback: LogCallback);

    /// Read recent log lines from the container
    async fn read_log(&self, lines: u32) -> EnvironmentResult<Vec<String>>;

    // ========================================================================
    // Resource Updates
    // ========================================================================

    /// Update container resources without restart (if possible)
    async fn in_situ_update(&self) -> EnvironmentResult<()>;

    // ========================================================================
    // Events
    // ========================================================================

    /// Get the event bus for this environment
    fn events(&self) -> &EventBus;

    // ========================================================================
    // Pre-boot Hook
    // ========================================================================

    /// Called before starting the container
    async fn on_before_start(&self, ctx: CancellationToken) -> EnvironmentResult<()>;
}

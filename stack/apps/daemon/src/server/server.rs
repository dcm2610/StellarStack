//! Server struct and implementation

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::RwLock;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use crate::api::HttpClient;
use crate::config::{DockerConfiguration, RedisConfiguration, SystemConfiguration};
use crate::environment::{DockerEnvironment, EnvironmentConfiguration, ProcessEnvironment};
use crate::events::{Event, EventBus, ProcessState, RedisPublisher};
use crate::system::{Locker, SinkPool};

use super::configuration::ServerConfig;
use super::crash::CrashHandler;
use super::install::{InstallationProcess, InstallError};
use super::power::{PowerAction, PowerError};
use super::state::ServerState;

/// A managed game server
pub struct Server {
    /// Server configuration
    config: RwLock<ServerConfig>,

    /// Process environment (Docker)
    environment: Arc<DockerEnvironment>,

    /// Server state flags
    state: ServerState,

    /// Power operation locker
    power_lock: Locker,

    /// Crash detection handler
    crash_handler: CrashHandler,

    /// Event bus
    event_bus: EventBus,

    /// Console output sink
    console_sink: SinkPool,

    /// Installation output sink
    install_sink: SinkPool,

    /// Cancellation token for server operations
    ctx: CancellationToken,

    /// Server data directory
    data_dir: PathBuf,

    /// Temporary directory
    tmp_dir: PathBuf,

    /// API client for panel communication
    api_client: Arc<HttpClient>,

    /// Redis publisher for event broadcasting
    redis_publisher: Option<RedisPublisher>,
}

impl Server {
    /// Create a new server instance
    pub fn new(
        config: ServerConfig,
        system_config: &SystemConfiguration,
        docker_config: &DockerConfiguration,
        api_client: Arc<HttpClient>,
        redis_config: Option<&RedisConfiguration>,
    ) -> Result<Self, ServerError> {
        let uuid = config.uuid.clone();
        let data_dir = system_config.data_directory.join(&uuid);
        let tmp_dir = system_config.tmp_directory.join(&uuid);

        // Ensure directories exist
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| ServerError::Io(e.to_string()))?;

        // Build environment configuration
        let env_config = Self::build_env_config(&config, &data_dir, docker_config)?;

        // Create Docker environment
        let environment = DockerEnvironment::new(env_config)
            .map_err(|e| ServerError::Environment(e.to_string()))?;

        let event_bus = environment.events().clone();

        // Create Redis publisher if enabled
        let redis_publisher = redis_config
            .filter(|c| c.enabled)
            .map(|c| RedisPublisher::new(uuid.clone(), c.prefix.clone(), true));

        Ok(Self {
            config: RwLock::new(config),
            environment: Arc::new(environment),
            state: ServerState::new(),
            power_lock: Locker::new(),
            crash_handler: CrashHandler::new(),
            event_bus,
            console_sink: SinkPool::new(),
            install_sink: SinkPool::new(),
            ctx: CancellationToken::new(),
            data_dir,
            tmp_dir,
            api_client,
            redis_publisher,
        })
    }

    /// Build environment configuration from server config
    fn build_env_config(
        config: &ServerConfig,
        data_dir: &PathBuf,
        docker_config: &DockerConfiguration,
    ) -> Result<EnvironmentConfiguration, ServerError> {
        let mut env_config = EnvironmentConfiguration {
            id: config.uuid.clone(),
            image: config.container.image.clone(),
            invocation: config.invocation.clone(),
            env: config.environment.clone(),
            ports: HashMap::new(),
            port_bindings: config.get_port_bindings(),
            limits: crate::environment::ResourceLimits {
                memory: config.memory_bytes(),
                memory_swap: config.swap_bytes(),
                cpu_quota: config.cpu_quota(),
                cpu_period: 100000,
                cpu_shares: 1024,
                io_weight: config.build.io_weight as u16,
                pids_limit: docker_config.container_pid_limit,
                disk_space: config.disk_bytes(),
            },
            mounts: vec![
                crate::environment::MountConfig {
                    source: data_dir.to_string_lossy().to_string(),
                    target: "/home/container".to_string(),
                    read_only: false,
                },
            ],
            user: crate::environment::UserConfig {
                uid: docker_config.system_user_uid(),
                gid: docker_config.system_user_gid(),
            },
            stop: config.process.stop.to_env_stop_config(),
            labels: {
                let mut labels = HashMap::new();
                labels.insert("Service".to_string(), "StellarStack".to_string());
                labels.insert("ServerUUID".to_string(), config.uuid.clone());
                labels
            },
            dns: docker_config.dns.clone(),
            network: docker_config.network.name.clone(),
            tmpfs_size: docker_config.tmpfs_size,
            oom_disabled: config.build.oom_disabled || config.container.oom_disabled,
        };

        // Add additional mounts
        for mount in &config.mounts {
            env_config.mounts.push(crate::environment::MountConfig {
                source: mount.source.clone(),
                target: mount.target.clone(),
                read_only: mount.read_only,
            });
        }

        Ok(env_config)
    }

    // ========================================================================
    // Getters
    // ========================================================================

    /// Get server UUID
    pub fn uuid(&self) -> String {
        self.config.read().uuid.clone()
    }

    /// Get server name
    pub fn name(&self) -> String {
        self.config.read().name.clone()
    }

    /// Get server configuration (read-only)
    pub fn config(&self) -> ServerConfig {
        self.config.read().clone()
    }

    /// Get event bus
    pub fn events(&self) -> &EventBus {
        &self.event_bus
    }

    /// Get console sink for subscribing to output
    pub fn console_sink(&self) -> &SinkPool {
        &self.console_sink
    }

    /// Get install sink for subscribing to install output
    pub fn install_sink(&self) -> &SinkPool {
        &self.install_sink
    }

    /// Get current process state
    pub fn process_state(&self) -> ProcessState {
        self.environment.state()
    }

    /// Get server state
    pub fn server_state(&self) -> &ServerState {
        &self.state
    }

    /// Get data directory path
    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    /// Read recent log lines from the container
    pub async fn read_logs(&self, lines: u32) -> Result<Vec<String>, ServerError> {
        self.environment
            .read_log(lines)
            .await
            .map_err(|e| ServerError::Environment(e.to_string()))
    }

    /// Get the Redis publisher if enabled
    pub fn redis_publisher(&self) -> Option<&RedisPublisher> {
        self.redis_publisher.as_ref()
    }

    /// Connect to Redis and start the event publisher
    pub async fn start_redis_publisher(&self, redis_url: &str) -> Result<(), ServerError> {
        if let Some(publisher) = &self.redis_publisher {
            // Connect to Redis
            publisher.connect(redis_url).await
                .map_err(|e| ServerError::Other(format!("Redis connection failed: {}", e)))?;

            // Start event forwarding task
            self.start_redis_event_forwarder();
        }
        Ok(())
    }

    /// Start a background task that forwards events to Redis
    fn start_redis_event_forwarder(&self) {
        if let Some(publisher) = self.redis_publisher.clone() {
            let mut events_rx = self.event_bus.subscribe();
            let uuid = self.uuid();

            tokio::spawn(async move {
                info!("Starting Redis event forwarder for server {}", uuid);

                while let Ok(event) = events_rx.recv().await {
                    publisher.publish(&event).await;
                }

                info!("Redis event forwarder ended for server {}", uuid);
            });
        }
    }

    // ========================================================================
    // State Checks
    // ========================================================================

    /// Check if server is installing
    pub fn is_installing(&self) -> bool {
        self.state.is_installing()
    }

    /// Check if server is transferring
    pub fn is_transferring(&self) -> bool {
        self.state.is_transferring()
    }

    /// Check if server is restoring
    pub fn is_restoring(&self) -> bool {
        self.state.is_restoring()
    }

    /// Check if server is suspended
    pub fn is_suspended(&self) -> bool {
        self.config.read().suspended
    }

    /// Check if any blocking operation is in progress
    pub fn is_busy(&self) -> bool {
        self.state.is_busy()
    }

    // ========================================================================
    // Power Operations
    // ========================================================================

    /// Handle a power action
    pub async fn handle_power_action(
        &self,
        action: PowerAction,
        wait_for_lock: bool,
    ) -> Result<(), PowerError> {
        // Check state flags
        if self.is_installing() {
            return Err(PowerError::Installing);
        }
        if self.is_transferring() {
            return Err(PowerError::Transferring);
        }
        if self.is_restoring() {
            return Err(PowerError::Restoring);
        }

        // Acquire power lock
        let _guard = if action == PowerAction::Kill {
            // Kill can use try_acquire to bypass waiting
            self.power_lock.try_acquire()
                .map_err(|_| PowerError::Busy)?
        } else if wait_for_lock {
            self.power_lock.acquire().await
                .map_err(|_| PowerError::Cancelled)?
        } else {
            self.power_lock.try_acquire()
                .map_err(|_| PowerError::Busy)?
        };

        match action {
            PowerAction::Start => self.start().await,
            PowerAction::Stop => self.stop().await,
            PowerAction::Restart => self.restart().await,
            PowerAction::Kill => self.kill().await,
        }
    }

    /// Start the server
    async fn start(&self) -> Result<(), PowerError> {
        info!("Starting server {}", self.uuid());

        // Check if already running
        if self.environment.is_running().await.unwrap_or(false) {
            info!("Server {} is already running", self.uuid());
            return Err(PowerError::AlreadyRunning);
        }

        // Pre-boot checks
        info!("Running pre-boot checks for {}", self.uuid());
        self.on_before_start().await?;

        // Record start for crash detection
        self.crash_handler.record_start();

        // Start environment (state will be Starting)
        info!("Starting container for {}", self.uuid());
        self.environment.start(self.ctx.clone()).await?;

        // Start startup detection watcher
        self.start_startup_detector();

        // Start state change watcher to sync with panel
        self.start_state_watcher();

        // Report status to panel as starting
        info!("Server {} container started, waiting for startup detection", self.uuid());
        let _ = self.api_client.set_server_status(&self.uuid(), "starting").await;

        Ok(())
    }

    /// Start watching console output for startup completion
    fn start_startup_detector(&self) {
        let done_patterns = self.config.read().process.startup.done.clone();

        // If no patterns, immediately mark as running
        if done_patterns.is_empty() {
            info!("No startup patterns configured, marking as running immediately");
            self.environment.set_state(crate::events::ProcessState::Running);
            let api_client = self.api_client.clone();
            let uuid = self.uuid();
            tokio::spawn(async move {
                let _ = api_client.set_server_status(&uuid, "running").await;
            });
            return;
        }

        let mut events_rx = self.event_bus.subscribe();
        let environment = self.environment.clone();
        let api_client = self.api_client.clone();
        let uuid = self.uuid();

        tokio::spawn(async move {
            while let Ok(event) = events_rx.recv().await {
                if let Event::ConsoleOutput(data) = event {
                    let line = String::from_utf8_lossy(&data);

                    // Check if any "done" pattern matches
                    for pattern in &done_patterns {
                        if line.contains(pattern) {
                            info!("Startup detection matched pattern '{}' for server {}", pattern, uuid);
                            environment.set_state(crate::events::ProcessState::Running);
                            let _ = api_client.set_server_status(&uuid, "running").await;
                            return;
                        }
                    }
                }

                // Stop watching if server is no longer starting
                if environment.state() != crate::events::ProcessState::Starting {
                    return;
                }
            }
        });
    }

    /// Start watching for state changes to sync with panel
    fn start_state_watcher(&self) {
        let mut events_rx = self.event_bus.subscribe();
        let environment = self.environment.clone();
        let api_client = self.api_client.clone();
        let uuid = self.uuid();

        tokio::spawn(async move {
            while let Ok(event) = events_rx.recv().await {
                if let Event::StateChange(new_state) = event {
                    // Update the environment's internal state
                    environment.set_state(new_state);

                    // Map state to API status string
                    let status = match new_state {
                        ProcessState::Offline => "offline",
                        ProcessState::Starting => "starting",
                        ProcessState::Running => "running",
                        ProcessState::Stopping => "stopping",
                    };

                    // Report to panel
                    info!("Server {} state changed to {} - syncing with panel", uuid, status);
                    match api_client.set_server_status(&uuid, status).await {
                        Ok(_) => info!("Server {} status synced to panel: {}", uuid, status),
                        Err(e) => warn!("Failed to sync server {} status to panel: {}", uuid, e),
                    }

                    // If server went offline, we can stop watching
                    if new_state == ProcessState::Offline {
                        info!("Server {} is offline, stopping state watcher", uuid);
                        break;
                    }
                }
            }
        });
    }

    /// Stop the server
    async fn stop(&self) -> Result<(), PowerError> {
        // Trigger stop
        self.environment.stop(self.ctx.clone()).await?;

        // Wait for stop with timeout
        let timeout = Duration::from_secs(600); // 10 minutes
        self.environment.wait_for_stop(self.ctx.clone(), timeout, true).await?;

        // Report status to panel
        match self.api_client.set_server_status(&self.uuid(), "offline").await {
            Ok(_) => info!("Server {} status updated to offline on panel", self.uuid()),
            Err(e) => warn!("Failed to update server {} status to offline on panel: {}", self.uuid(), e),
        }

        Ok(())
    }

    /// Restart the server
    async fn restart(&self) -> Result<(), PowerError> {
        // Stop first
        self.environment.stop(self.ctx.clone()).await?;

        let timeout = Duration::from_secs(600);
        self.environment.wait_for_stop(self.ctx.clone(), timeout, true).await?;

        // Pre-boot checks
        self.on_before_start().await?;

        // Start
        self.crash_handler.record_start();
        self.environment.start(self.ctx.clone()).await?;

        // Start startup detection watcher (same as regular start)
        self.start_startup_detector();

        // Start state change watcher to sync with panel
        self.start_state_watcher();

        // Report status to panel as starting (startup detector will update to running)
        info!("Server {} container restarted, waiting for startup detection", self.uuid());
        let _ = self.api_client.set_server_status(&self.uuid(), "starting").await;

        Ok(())
    }

    /// Force kill the server
    async fn kill(&self) -> Result<(), PowerError> {
        self.environment.terminate(self.ctx.clone(), "SIGKILL").await?;

        // Brief wait for cleanup
        tokio::time::sleep(Duration::from_millis(500)).await;

        match self.api_client.set_server_status(&self.uuid(), "offline").await {
            Ok(_) => info!("Server {} status updated to offline on panel", self.uuid()),
            Err(e) => warn!("Failed to update server {} status to offline on panel: {}", self.uuid(), e),
        }

        Ok(())
    }

    /// Pre-boot checks and preparation
    async fn on_before_start(&self) -> Result<(), PowerError> {
        let config = self.config.read().clone();
        info!("Pre-boot checks: suspended={}, invocation={}", config.suspended, config.invocation);

        // Check if suspended
        if config.suspended {
            return Err(PowerError::Suspended);
        }

        // TODO: Check disk space
        // TODO: Update configuration files
        // TODO: Fix permissions if needed

        // Recreate container with latest config
        info!("Recreating container for {}", self.uuid());
        match self.environment.on_before_start(self.ctx.clone()).await {
            Ok(_) => {
                info!("Container recreated successfully for {}", self.uuid());
                Ok(())
            }
            Err(e) => {
                error!("Failed to recreate container for {}: {}", self.uuid(), e);
                Err(PowerError::Environment(e))
            }
        }
    }

    /// Send a command to the server console
    pub async fn send_command(&self, command: &str) -> Result<(), PowerError> {
        self.environment.send_command(command).await
            .map_err(PowerError::Environment)
    }

    // ========================================================================
    // Installation
    // ========================================================================

    /// Run server installation
    pub async fn install(&self, reinstall: bool) -> Result<(), InstallError> {
        // Try to acquire installation lock
        if !self.state.try_start_installing() {
            return Err(InstallError::AlreadyInstalling);
        }

        // Ensure we clear the flag when done
        let _guard = scopeguard::guard((), |_| {
            self.state.set_installing(false);
        });

        let config = self.config.read().clone();

        // Skip if egg scripts are disabled and not reinstall
        if config.skip_egg_scripts && !reinstall {
            info!("Skipping installation for {} (egg scripts disabled)", config.uuid);
            return Ok(());
        }

        // Fetch installation script
        let script = self.api_client.get_installation_script(&config.uuid).await?;

        // Run installation
        let process = InstallationProcess::new(
            config.uuid.clone(),
            script,
            self.data_dir.clone(),
            self.tmp_dir.clone(),
            self.event_bus.clone(),
            self.install_sink.clone(),
        )?;

        let result = process.run().await;

        // Report to panel
        let _ = self.api_client.set_installation_status(
            &config.uuid,
            result.is_ok(),
        ).await;

        result
    }

    // ========================================================================
    // Configuration
    // ========================================================================

    /// Update server configuration
    pub fn update_config(&self, new_config: ServerConfig) {
        *self.config.write() = new_config;
    }

    /// Check the actual container status and sync it with the panel
    /// This is called on daemon startup to ensure the panel has accurate status
    pub async fn sync_status_to_panel(&self) -> Result<(), ServerError> {
        let uuid = self.uuid();

        // Check if the container exists and what state it's in
        let (exists, is_running) = match (
            self.environment.exists().await,
            self.environment.is_running().await,
        ) {
            (Ok(exists), Ok(running)) => (exists, running),
            (Ok(exists), Err(_)) => (exists, false),
            (Err(_), _) => (false, false),
        };

        // Determine the status to report
        let status = if !exists {
            // Container doesn't exist yet - mark as offline
            self.environment.set_state(ProcessState::Offline);
            "offline"
        } else if is_running {
            // Container is running - attach to it so console commands work
            self.environment.set_state(ProcessState::Running);

            // Attach to the running container to enable console input/output
            info!("Attaching to running container for server {}", uuid);
            if let Err(e) = self.environment.attach(self.ctx.clone()).await {
                error!("Failed to attach to running container {}: {}", uuid, e);
            }

            // Start watching for state changes
            self.start_state_watcher();

            // Start the exit watcher to detect when container stops
            let environment = self.environment.clone();
            let event_bus = self.event_bus.clone();
            let ctx = self.ctx.clone();
            tokio::spawn(async move {
                use crate::environment::docker::power::wait_for_container_exit;
                let _ = wait_for_container_exit(&environment, ctx).await;
                event_bus.publish_state(ProcessState::Offline);
            });

            "running"
        } else {
            // Container exists but is not running
            self.environment.set_state(ProcessState::Offline);
            "offline"
        };

        info!("Server {} container status on startup: {} (exists={}, running={})", uuid, status, exists, is_running);

        // Report to panel
        self.api_client.set_server_status(&uuid, status).await
            .map_err(|e| ServerError::Api(e.to_string()))?;

        Ok(())
    }

    /// Sync configuration with panel
    pub async fn sync(&self) -> Result<(), ServerError> {
        let uuid = self.uuid();

        let api_config = self.api_client.get_server_configuration(&uuid).await
            .map_err(|e| ServerError::Api(e.to_string()))?;

        // Update config in place (keeps existing process config with startup patterns)
        self.config.write().update_from_api(&api_config);

        self.event_bus.publish(Event::ServerSynced);

        Ok(())
    }

    // ========================================================================
    // Lifecycle
    // ========================================================================

    /// Destroy the server (cleanup)
    pub async fn destroy(&self) -> Result<(), ServerError> {
        // Cancel ongoing operations
        self.ctx.cancel();

        // Destroy container
        let _ = self.environment.destroy().await;

        Ok(())
    }
}

/// Server errors
#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    #[error("IO error: {0}")]
    Io(String),

    #[error("Environment error: {0}")]
    Environment(String),

    #[error("API error: {0}")]
    Api(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("{0}")]
    Other(String),
}

// Helper trait for DockerConfiguration
trait DockerConfigExt {
    fn system_user_uid(&self) -> u32;
    fn system_user_gid(&self) -> u32;
}

impl DockerConfigExt for DockerConfiguration {
    fn system_user_uid(&self) -> u32 {
        1000 // Default, would come from system.user config
    }

    fn system_user_gid(&self) -> u32 {
        1000 // Default
    }
}

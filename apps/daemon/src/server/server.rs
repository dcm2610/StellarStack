//! Server struct and implementation

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::RwLock;
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

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

    /// Cancellation token for background watchers (forwarder, state watcher, etc.)
    /// This is cancelled when the server stops to prevent duplicate watchers on restart
    watcher_ctx: RwLock<CancellationToken>,

    /// Server data directory
    data_dir: PathBuf,

    /// Temporary directory
    tmp_dir: PathBuf,

    /// API client for panel communication
    api_client: Arc<HttpClient>,

    /// Redis publisher for event broadcasting
    redis_publisher: Option<RedisPublisher>,

    /// Docker socket path
    docker_socket: String,

    /// Redis state store for persistence
    state_store: Option<Arc<crate::events::RedisStateStore>>,
}

impl Server {
    /// Create a new server instance
    pub fn new(
        config: ServerConfig,
        system_config: &SystemConfiguration,
        docker_config: &DockerConfiguration,
        api_client: Arc<HttpClient>,
        redis_config: Option<&RedisConfiguration>,
        state_store: Option<Arc<crate::events::RedisStateStore>>,
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
            watcher_ctx: RwLock::new(CancellationToken::new()),
            data_dir,
            tmp_dir,
            api_client,
            redis_publisher,
            docker_socket: docker_config.socket.clone(),
            state_store,
        })
    }

    /// Build environment configuration from server config
    fn build_env_config(
        config: &ServerConfig,
        data_dir: &PathBuf,
        docker_config: &DockerConfiguration,
    ) -> Result<EnvironmentConfiguration, ServerError> {
        // Calculate memory with overhead
        // Overhead can be specified per-egg or use the default
        let overhead_percent = docker_config.overhead.r#override
            .get(&config.egg.id)
            .copied()
            .unwrap_or(docker_config.overhead.default);

        let base_memory = config.memory_bytes();
        let memory_with_overhead = if base_memory > 0 && overhead_percent > 0 {
            // Add overhead percentage to memory limit
            base_memory + (base_memory * overhead_percent / 100)
        } else {
            base_memory
        };

        let mut env_config = EnvironmentConfiguration {
            id: config.uuid.clone(),
            image: config.container.image.clone(),
            invocation: config.invocation.clone(),
            env: config.environment.clone(),
            ports: HashMap::new(),
            port_bindings: config.get_port_bindings(),
            limits: crate::environment::ResourceLimits {
                memory: memory_with_overhead,
                memory_swap: config.swap_bytes(),
                cpu_quota: config.cpu_quota(),
                cpu_period: 100000,
                cpu_shares: 1024,
                cpuset_cpus: config.build.threads.clone(),
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
            docker_socket: docker_config.socket.clone(),
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

        // Cancel any existing watchers from previous runs and create new token
        {
            let old_ctx = self.watcher_ctx.read().clone();
            old_ctx.cancel();
        }
        {
            let mut watcher_ctx = self.watcher_ctx.write();
            *watcher_ctx = CancellationToken::new();
        }
        let watcher_token = self.watcher_ctx.read().clone();

        // Clear console buffer for fresh start (before starting watchers)
        self.console_sink.clear_buffer();

        // IMPORTANT: Start watchers BEFORE starting container
        // This prevents race condition where "done" message is printed before we subscribe
        self.start_startup_detector(watcher_token.clone());
        self.start_state_watcher(watcher_token.clone());
        self.start_console_forwarder(watcher_token);

        // Clear Redis console logs for fresh start
        if let Some(ref store) = self.state_store {
            store.clear_console_logs(&self.uuid()).await;
        }

        // Start environment (state will be Starting)
        info!("Starting container for {}", self.uuid());
        self.environment.start(self.ctx.clone()).await?;

        // Report status to panel as starting
        info!("Server {} container started, waiting for startup detection", self.uuid());
        let _ = self.api_client.set_server_status(&self.uuid(), "starting").await;

        Ok(())
    }

    /// Start watching console output for startup completion
    fn start_startup_detector(&self, cancel_token: CancellationToken) {
        // Sanitize patterns - remove Windows line endings (\r\n -> \n, remove stray \r)
        let done_patterns: Vec<String> = self.config.read().process.startup.done
            .iter()
            .map(|p| p.replace("\r\n", "\n").replace('\r', ""))
            .collect();
        let strip_ansi = self.config.read().process.startup.strip_ansi;

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

        // Log the raw patterns for debugging - show full details
        info!("=== Startup detection patterns for server {} ===", self.uuid());
        info!("Number of patterns: {}", done_patterns.len());
        info!("Strip ANSI codes: {}", strip_ansi);
        for (i, pattern) in done_patterns.iter().enumerate() {
            // Log with debug representation to see escape sequences
            info!("  Pattern {}: {:?}", i, pattern);
            // Also log the actual string length
            info!("  Pattern {} length: {} chars", i, pattern.len());
        }
        info!("=== End of startup patterns ===");

        // Compile regex patterns
        let compiled_patterns: Vec<(String, Option<regex::Regex>)> = done_patterns
            .iter()
            .map(|p| {
                match regex::Regex::new(p) {
                    Ok(regex) => {
                        info!("Successfully compiled startup regex: {:?}", p);
                        (p.clone(), Some(regex))
                    }
                    Err(e) => {
                        warn!("Invalid startup regex pattern {:?}: {} - will use literal match", p, e);
                        (p.clone(), None)
                    }
                }
            })
            .collect();

        info!("Startup detector initialized with {} patterns ({} compiled as regex) for server {}",
            compiled_patterns.len(),
            compiled_patterns.iter().filter(|(_, r)| r.is_some()).count(),
            self.uuid());

        let mut events_rx = self.event_bus.subscribe();
        let environment = self.environment.clone();
        let api_client = self.api_client.clone();
        let uuid = self.uuid();

        tokio::spawn(async move {
            let mut line_count = 0u64;
            info!("Startup detector now listening for console output on server {}", uuid);

            loop {
                tokio::select! {
                    _ = cancel_token.cancelled() => {
                        info!("Startup detector cancelled for server {}", uuid);
                        return;
                    }
                    result = events_rx.recv() => {
                        match result {
                            Ok(Event::ConsoleOutput(data)) => {
                                line_count += 1;
                                let mut line = String::from_utf8_lossy(&data).to_string();

                                // Strip ANSI codes if configured
                                if strip_ansi {
                                    line = strip_ansi_codes(&line);
                                }

                                // Log first few lines and then periodically
                                if line_count <= 5 || line_count % 20 == 0 {
                                    let preview: String = line.chars().take(100).collect();
                                    debug!("Startup detector [{}] checking line {}: {:?}", uuid, line_count, preview);
                                }

                                // Check if any "done" pattern matches
                                for (pattern_str, compiled) in &compiled_patterns {
                                    let matched = if let Some(regex) = compiled {
                                        regex.is_match(&line)
                                    } else {
                                        // Fallback to literal match if regex failed to compile
                                        line.contains(pattern_str)
                                    };

                                    if matched {
                                        info!("Startup detection MATCHED pattern {:?} for server {} on line {}", pattern_str, uuid, line_count);
                                        info!("Matched line content: {:?}", line);
                                        environment.set_state(crate::events::ProcessState::Running);
                                        let _ = api_client.set_server_status(&uuid, "running").await;
                                        return;
                                    }
                                }

                                // Stop watching if server is no longer starting
                                if environment.state() != crate::events::ProcessState::Starting {
                                    debug!("Server {} no longer in starting state after {} lines, stopping startup detector", uuid, line_count);
                                    return;
                                }
                            }
                            Ok(_) => {} // Ignore other events
                            Err(_) => {
                                info!("Startup detector ended (event bus closed) for server {} after {} lines", uuid, line_count);
                                return;
                            }
                        }
                    }
                }
            }
        });
    }

    /// Start watching for state changes to sync with panel and Redis
    fn start_state_watcher(&self, cancel_token: CancellationToken) {
        let mut events_rx = self.event_bus.subscribe();
        let environment = self.environment.clone();
        let api_client = self.api_client.clone();
        let state_store = self.state_store.clone();
        let uuid = self.uuid();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = cancel_token.cancelled() => {
                        info!("State watcher cancelled for server {}", uuid);
                        return;
                    }
                    result = events_rx.recv() => {
                        match result {
                            Ok(Event::StateChange(new_state)) => {
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

                                // Save state to Redis for persistence
                                if let Some(ref store) = state_store {
                                    store.save_server_state(&uuid, new_state, false).await;
                                }

                                // If server went offline, we can stop watching
                                if new_state == ProcessState::Offline {
                                    info!("Server {} is offline, stopping state watcher", uuid);
                                    return;
                                }
                            }
                            Ok(_) => {} // Ignore other events
                            Err(_) => return, // Channel closed
                        }
                    }
                }
            }
        });
    }

    /// Start forwarding console output to the console_sink for buffering
    fn start_console_forwarder(&self, cancel_token: CancellationToken) {
        let mut events_rx = self.event_bus.subscribe();
        let console_sink = self.console_sink.clone();
        let state_store = self.state_store.clone();
        let uuid = self.uuid();

        tokio::spawn(async move {
            info!("Console forwarder started for server {}", uuid);
            let mut line_count = 0u64;

            loop {
                tokio::select! {
                    _ = cancel_token.cancelled() => {
                        info!("Console forwarder cancelled for server {} after {} lines", uuid, line_count);
                        return;
                    }
                    result = events_rx.recv() => {
                        match result {
                            Ok(Event::ConsoleOutput(data)) => {
                                line_count += 1;

                                // Log EVERY line for debugging
                                let preview = String::from_utf8_lossy(&data);
                                let preview_short: String = preview.chars().take(80).collect();
                                info!("Console forwarder [{}] line {}: {} (pushing to sink, {} subscribers)",
                                    uuid, line_count, preview_short, console_sink.subscriber_count());

                                // Push to console_sink for buffering (WebSocket clients can get history)
                                console_sink.push(data.clone());

                                debug!("Console forwarder [{}] pushed line {} to sink (buffer len: {})",
                                    uuid, line_count, console_sink.buffer_len());

                                // Save to Redis for persistence across daemon restarts
                                if let Some(ref store) = state_store {
                                    let line = String::from_utf8_lossy(&data).to_string();
                                    store.append_console_log(&uuid, &line).await;
                                }
                            }
                            Ok(_) => {} // Ignore other events
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                                // Subscriber fell behind, log but continue
                                warn!("Console forwarder [{}] lagged by {} messages, continuing", uuid, n);
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                                warn!("Console forwarder stopped for server {} after {} lines (channel closed)", uuid, line_count);
                                return;
                            }
                        }
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

        // Cancel any existing watchers and create new token
        {
            let old_ctx = self.watcher_ctx.read().clone();
            old_ctx.cancel();
        }
        {
            let mut watcher_ctx = self.watcher_ctx.write();
            *watcher_ctx = CancellationToken::new();
        }
        let watcher_token = self.watcher_ctx.read().clone();

        // Clear console buffer for fresh restart (before starting watchers)
        self.console_sink.clear_buffer();

        // IMPORTANT: Start watchers BEFORE starting container to avoid race condition
        self.crash_handler.record_start();
        self.start_startup_detector(watcher_token.clone());
        self.start_state_watcher(watcher_token.clone());
        self.start_console_forwarder(watcher_token);

        // Clear Redis console logs for fresh restart
        if let Some(ref store) = self.state_store {
            store.clear_console_logs(&self.uuid()).await;
        }

        // Start the container
        self.environment.start(self.ctx.clone()).await?;

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

        // Fix permissions on the server data directory
        // This ensures the container user (uid/gid 1000) can write to it
        self.fix_permissions().await?;

        // TODO: Check disk space
        // TODO: Update configuration files

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

    /// Fix ownership permissions on the server data directory
    async fn fix_permissions(&self) -> Result<(), PowerError> {
        use std::process::Command;

        let data_dir = &self.data_dir;
        let uid = 1000u32; // Container user ID
        let gid = 1000u32; // Container group ID

        // Check if directory exists
        if !data_dir.exists() {
            debug!("Data directory doesn't exist yet, skipping permission fix");
            return Ok(());
        }

        info!("Fixing permissions on {} (uid={}, gid={})", data_dir.display(), uid, gid);

        // Use chown command for recursive ownership change (more reliable than walking manually)
        let output = Command::new("chown")
            .args(["-R", &format!("{}:{}", uid, gid), &data_dir.to_string_lossy()])
            .output();

        match output {
            Ok(result) => {
                if result.status.success() {
                    debug!("Permissions fixed successfully on {}", data_dir.display());
                    Ok(())
                } else {
                    let stderr = String::from_utf8_lossy(&result.stderr);
                    warn!("Failed to fix permissions on {}: {}", data_dir.display(), stderr);
                    // Don't fail the start - the container might still work if permissions are already correct
                    Ok(())
                }
            }
            Err(e) => {
                warn!("Failed to run chown command: {}", e);
                // Don't fail the start
                Ok(())
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
            &self.docker_socket,
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

            // Restore cached console logs from Redis
            if let Some(ref store) = self.state_store {
                let cached_logs = store.get_console_logs(&uuid).await;
                if !cached_logs.is_empty() {
                    info!("Restoring {} cached console lines for server {}", cached_logs.len(), uuid);
                    for line in cached_logs {
                        self.console_sink.push(line.into_bytes());
                    }
                }
            }

            // Cancel any existing watchers and create new token for this running server
            {
                let old_ctx = self.watcher_ctx.read().clone();
                old_ctx.cancel();
            }
            let watcher_token = {
                let mut watcher_ctx = self.watcher_ctx.write();
                *watcher_ctx = CancellationToken::new();
                watcher_ctx.clone()
            };

            // Start watching for state changes and forwarding console output
            self.start_state_watcher(watcher_token.clone());
            self.start_console_forwarder(watcher_token);

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

    /// Report current container status to panel (lightweight, for periodic sync)
    /// Unlike sync_status_to_panel, this doesn't attach to containers or start watchers
    pub async fn report_status(&self) -> Result<(), ServerError> {
        let uuid = self.uuid();

        // Get current state from Docker
        let is_running = self.environment.is_running().await.unwrap_or(false);
        let current_state = self.environment.state();

        // Determine the status based on Docker state
        let status = if is_running {
            // If Docker says running, trust that
            "running"
        } else {
            // Map internal state to API status
            match current_state {
                ProcessState::Starting => "starting",
                ProcessState::Stopping => "stopping",
                _ => "offline",
            }
        };

        // Only report if status differs from what we expect
        // to avoid spamming the panel with unchanged statuses
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

/// Strip ANSI escape codes from a string
fn strip_ansi_codes(input: &str) -> String {
    // Matches ANSI escape sequences: ESC [ ... m (color codes) and other control sequences
    static ANSI_REGEX: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let regex = ANSI_REGEX.get_or_init(|| {
        regex::Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07").unwrap()
    });
    regex.replace_all(input, "").to_string()
}

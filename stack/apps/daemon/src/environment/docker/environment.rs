//! Docker environment implementation

use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;

use async_trait::async_trait;
use bollard::Docker;
use parking_lot::RwLock;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use crate::events::{EventBus, ProcessState};
use super::super::traits::{
    EnvironmentConfiguration, EnvironmentError, EnvironmentResult,
    ExitState, LogCallback, ProcessEnvironment,
};

/// Attached stream for container I/O
#[allow(dead_code)]
pub struct AttachStream {
    pub output: Box<dyn AsyncRead + Send + Unpin>,
    pub input: Option<Box<dyn AsyncWrite + Send + Unpin>>,
}

/// Docker implementation of ProcessEnvironment
pub struct DockerEnvironment {
    /// Container/server ID (UUID)
    id: String,

    /// Environment configuration
    config: EnvironmentConfiguration,

    /// Docker client
    client: Docker,

    /// Container name
    container_name: String,

    /// Current process state
    state: AtomicU8,

    /// Event bus for publishing events
    event_bus: EventBus,

    /// Log callback
    log_callback: RwLock<Option<LogCallback>>,

    /// Command sender for stdin
    command_tx: RwLock<Option<mpsc::Sender<String>>>,

    /// Whether currently attached
    attached: RwLock<bool>,
}

impl DockerEnvironment {
    /// Create a new Docker environment
    pub fn new(config: EnvironmentConfiguration) -> EnvironmentResult<Self> {
        let client = Docker::connect_with_local_defaults()
            .map_err(EnvironmentError::Docker)?;

        let container_name = format!("{}_server", &config.id);

        Ok(Self {
            id: config.id.clone(),
            config,
            client,
            container_name,
            state: AtomicU8::new(ProcessState::Offline as u8),
            event_bus: EventBus::new(),
            log_callback: RwLock::new(None),
            command_tx: RwLock::new(None),
            attached: RwLock::new(false),
        })
    }

    /// Create from existing configuration with custom Docker client
    pub fn with_client(config: EnvironmentConfiguration, client: Docker) -> Self {
        let container_name = format!("{}_server", &config.id);

        Self {
            id: config.id.clone(),
            config,
            client,
            container_name,
            state: AtomicU8::new(ProcessState::Offline as u8),
            event_bus: EventBus::new(),
            log_callback: RwLock::new(None),
            command_tx: RwLock::new(None),
            attached: RwLock::new(false),
        }
    }

    /// Get the Docker client
    pub fn docker(&self) -> &Docker {
        &self.client
    }

    /// Get the container name
    pub fn container_name(&self) -> &str {
        &self.container_name
    }

    /// Convert u8 to ProcessState
    fn u8_to_state(value: u8) -> ProcessState {
        match value {
            0 => ProcessState::Offline,
            1 => ProcessState::Starting,
            2 => ProcessState::Running,
            3 => ProcessState::Stopping,
            _ => ProcessState::Offline,
        }
    }

    /// Process output data from container
    #[allow(dead_code)]
    pub(crate) fn process_output(&self, data: &[u8]) {
        // Call log callback if set
        if let Some(callback) = self.log_callback.read().as_ref() {
            callback(data);
        }

        // Publish to event bus
        self.event_bus.publish(crate::events::Event::ConsoleOutput(data.to_vec()));
    }

    /// Get capabilities to drop (security hardening)
    pub(crate) fn dropped_capabilities() -> Vec<String> {
        vec![
            "setpcap",
            "mknod",
            "audit_write",
            "net_raw",
            "dac_override",
            "fowner",
            "fsetid",
            "net_bind_service",
            "sys_chroot",
            "setfcap",
            "audit_control",
            "audit_read",
            "block_suspend",
            "dac_read_search",
            "ipc_lock",
            "ipc_owner",
            "lease",
            "linux_immutable",
            "mac_admin",
            "mac_override",
            "net_admin",
            "net_broadcast",
            "syslog",
            "sys_admin",
            "sys_boot",
            "sys_module",
            "sys_nice",
            "sys_pacct",
            "sys_ptrace",
            "sys_rawio",
            "sys_resource",
            "sys_time",
            "sys_tty_config",
            "wake_alarm",
        ]
        .into_iter()
        .map(|s| s.to_uppercase())
        .collect()
    }
}

#[async_trait]
impl ProcessEnvironment for DockerEnvironment {
    fn id(&self) -> &str {
        &self.id
    }

    fn config(&self) -> &EnvironmentConfiguration {
        &self.config
    }

    fn state(&self) -> ProcessState {
        Self::u8_to_state(self.state.load(Ordering::SeqCst))
    }

    fn set_state(&self, state: ProcessState) {
        let old_state = self.state.swap(state as u8, Ordering::SeqCst);
        let old = Self::u8_to_state(old_state);

        if old != state {
            debug!("State change: {} -> {}", old, state);
            self.event_bus.publish_state(state);
        }
    }

    fn events(&self) -> &EventBus {
        &self.event_bus
    }

    fn set_log_callback(&self, callback: LogCallback) {
        *self.log_callback.write() = Some(callback);
    }

    async fn exists(&self) -> EnvironmentResult<bool> {
        match self.client.inspect_container(&self.container_name, None).await {
            Ok(_) => Ok(true),
            Err(bollard::errors::Error::DockerResponseServerError { status_code: 404, .. }) => {
                Ok(false)
            }
            Err(e) => Err(EnvironmentError::Docker(e)),
        }
    }

    async fn is_running(&self) -> EnvironmentResult<bool> {
        let info = self.client.inspect_container(&self.container_name, None).await
            .map_err(|e| {
                if let bollard::errors::Error::DockerResponseServerError { status_code: 404, .. } = e {
                    return EnvironmentError::ContainerNotFound(self.container_name.clone());
                }
                EnvironmentError::Docker(e)
            })?;

        Ok(info.state
            .and_then(|s| s.running)
            .unwrap_or(false))
    }

    async fn exit_state(&self) -> EnvironmentResult<ExitState> {
        let info = self.client.inspect_container(&self.container_name, None).await
            .map_err(EnvironmentError::Docker)?;

        let state = info.state.unwrap_or_default();

        Ok(ExitState {
            exit_code: state.exit_code.unwrap_or(0),
            oom_killed: state.oom_killed.unwrap_or(false),
            error: state.error.filter(|s| !s.is_empty()),
        })
    }

    async fn uptime(&self) -> EnvironmentResult<i64> {
        let info = self.client.inspect_container(&self.container_name, None).await
            .map_err(EnvironmentError::Docker)?;

        let started_at = info.state
            .and_then(|s| s.started_at)
            .unwrap_or_default();

        if started_at.is_empty() || started_at == "0001-01-01T00:00:00Z" {
            return Ok(0);
        }

        // Parse ISO 8601 timestamp
        let started = chrono::DateTime::parse_from_rfc3339(&started_at)
            .map_err(|e| EnvironmentError::Other(format!("Failed to parse start time: {}", e)))?;

        let now = chrono::Utc::now();
        let duration = now.signed_duration_since(started);

        Ok(duration.num_milliseconds())
    }

    async fn read_log(&self, lines: u32) -> EnvironmentResult<Vec<String>> {
        use bollard::container::LogsOptions;
        use futures_util::StreamExt;

        let options = LogsOptions::<String> {
            stdout: true,
            stderr: true,
            tail: lines.to_string(),
            ..Default::default()
        };

        let mut logs = self.client.logs(&self.container_name, Some(options));
        let mut result = Vec::new();

        while let Some(log) = logs.next().await {
            match log {
                Ok(output) => {
                    let line = output.to_string();
                    if !line.is_empty() {
                        result.push(line);
                    }
                }
                Err(e) => {
                    warn!("Error reading logs: {}", e);
                    break;
                }
            }
        }

        Ok(result)
    }

    async fn on_before_start(&self, _ctx: CancellationToken) -> EnvironmentResult<()> {
        // Recreate container before starting to apply any config changes
        self.recreate().await
    }

    // create, destroy, start, stop, etc. are implemented in separate files
    // and imported via the container.rs and power.rs modules

    async fn create(&self) -> EnvironmentResult<()> {
        super::container::create_container(self).await
    }

    async fn destroy(&self) -> EnvironmentResult<()> {
        super::container::destroy_container(self).await
    }

    async fn start(&self, ctx: CancellationToken) -> EnvironmentResult<()> {
        super::power::start_container(self, ctx).await
    }

    async fn stop(&self, ctx: CancellationToken) -> EnvironmentResult<()> {
        super::power::stop_container(self, ctx).await
    }

    async fn wait_for_stop(
        &self,
        ctx: CancellationToken,
        timeout: Duration,
        terminate: bool,
    ) -> EnvironmentResult<()> {
        super::power::wait_for_stop(self, ctx, timeout, terminate).await
    }

    async fn terminate(&self, ctx: CancellationToken, signal: &str) -> EnvironmentResult<()> {
        super::power::terminate_container(self, ctx, signal).await
    }

    async fn attach(&self, ctx: CancellationToken) -> EnvironmentResult<()> {
        super::power::attach_container(self, ctx).await
    }

    async fn send_command(&self, cmd: &str) -> EnvironmentResult<()> {
        // Clone the sender out of the lock to avoid holding guard across await
        let sender = {
            let tx = self.command_tx.read();
            tx.as_ref().cloned()
        };

        if let Some(sender) = sender {
            sender.send(format!("{}\n", cmd)).await
                .map_err(|_| EnvironmentError::NotRunning)?;
            Ok(())
        } else {
            Err(EnvironmentError::NotRunning)
        }
    }

    async fn in_situ_update(&self) -> EnvironmentResult<()> {
        use bollard::container::UpdateContainerOptions;

        let options: UpdateContainerOptions<String> = UpdateContainerOptions {
            memory: Some(self.config.limits.memory as i64),
            memory_swap: Some(self.config.limits.memory_swap),
            cpu_quota: Some(self.config.limits.cpu_quota),
            cpu_period: Some(self.config.limits.cpu_period),
            ..Default::default()
        };

        self.client.update_container(&self.container_name, options).await
            .map_err(EnvironmentError::Docker)?;

        info!("Updated container {} resources in-place", self.container_name);
        Ok(())
    }
}

impl DockerEnvironment {
    /// Set command sender (called from attach)
    pub(crate) fn set_command_sender(&self, sender: mpsc::Sender<String>) {
        *self.command_tx.write() = Some(sender);
    }

    /// Clear command sender
    pub(crate) fn clear_command_sender(&self) {
        *self.command_tx.write() = None;
    }

    /// Set attached state
    pub(crate) fn set_attached(&self, attached: bool) {
        *self.attached.write() = attached;
    }

    /// Check if attached
    pub(crate) fn is_attached(&self) -> bool {
        *self.attached.read()
    }
}

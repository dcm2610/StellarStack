//! Server installation process

use std::collections::HashMap;
use std::path::PathBuf;

use bollard::container::{
    Config, CreateContainerOptions, RemoveContainerOptions,
    AttachContainerOptions, AttachContainerResults,
};
use bollard::models::{HostConfig, Mount, MountTypeEnum};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use futures_util::StreamExt;
use thiserror::Error;
use tracing::{debug, error, info, warn};

use crate::api::InstallationScript;
use crate::events::{Event, EventBus};
use crate::system::SinkPool;

/// Errors during installation
#[derive(Debug, Error)]
pub enum InstallError {
    #[error("Already installing")]
    AlreadyInstalling,

    #[error("Docker error: {0}")]
    Docker(#[from] bollard::errors::Error),

    #[error("Failed to pull image: {0}")]
    ImagePull(String),

    #[error("Installation failed with exit code {0}")]
    Failed(i64),

    #[error("Installation timed out")]
    Timeout,

    #[error("Installation cancelled")]
    Cancelled,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("API error: {0}")]
    Api(#[from] crate::api::ApiError),

    #[error("{0}")]
    Other(String),
}

pub type InstallResult<T> = Result<T, InstallError>;

/// Installation process for a server
pub struct InstallationProcess {
    /// Server UUID
    server_uuid: String,

    /// Installation script
    script: InstallationScript,

    /// Docker client
    docker: Docker,

    /// Server data directory
    server_dir: PathBuf,

    /// Temporary directory for install files
    install_dir: PathBuf,

    /// Event bus for publishing events
    event_bus: EventBus,

    /// Sink pool for install output
    install_sink: SinkPool,

    /// Resource limits for installer container
    memory_limit: u64,
    cpu_limit: u64,
}

impl InstallationProcess {
    /// Create a new installation process
    pub fn new(
        server_uuid: String,
        script: InstallationScript,
        server_dir: PathBuf,
        tmp_dir: PathBuf,
        event_bus: EventBus,
        install_sink: SinkPool,
        docker_socket: &str,
    ) -> InstallResult<Self> {
        let docker = Self::connect_docker(docker_socket)?;

        let install_dir = tmp_dir.join(&server_uuid).join("install");

        Ok(Self {
            server_uuid,
            script,
            docker,
            server_dir,
            install_dir,
            event_bus,
            install_sink,
            memory_limit: 1024 * 1024 * 1024, // 1GB
            cpu_limit: 100,                   // 100% of one core
        })
    }

    /// Connect to Docker using the configured socket path
    fn connect_docker(socket: &str) -> InstallResult<Docker> {
        if socket.is_empty() {
            return Docker::connect_with_local_defaults()
                .map_err(InstallError::Docker);
        }

        // Parse socket URI based on protocol
        if let Some(path) = socket.strip_prefix("unix://") {
            // Unix socket (Linux/macOS)
            Docker::connect_with_socket(path, 120, bollard::API_DEFAULT_VERSION)
                .map_err(InstallError::Docker)
        } else if socket.starts_with("npipe://") {
            // Windows named pipe
            #[cfg(target_os = "windows")]
            {
                Docker::connect_with_named_pipe(socket, 120, bollard::API_DEFAULT_VERSION)
                    .map_err(InstallError::Docker)
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err(InstallError::Other("Named pipes are only supported on Windows".into()))
            }
        } else if socket.starts_with("http://") || socket.starts_with("https://") || socket.starts_with("tcp://") {
            // HTTP/TCP connection
            Docker::connect_with_http(socket, 120, bollard::API_DEFAULT_VERSION)
                .map_err(InstallError::Docker)
        } else if socket.starts_with('/') || socket.starts_with('.') {
            // Bare Unix socket path
            Docker::connect_with_socket(socket, 120, bollard::API_DEFAULT_VERSION)
                .map_err(InstallError::Docker)
        } else {
            // Try local defaults as fallback
            Docker::connect_with_local_defaults()
                .map_err(InstallError::Docker)
        }
    }

    /// Set resource limits for installer container
    pub fn with_limits(mut self, memory_mb: u64, cpu_percent: u64) -> Self {
        self.memory_limit = memory_mb * 1024 * 1024;
        self.cpu_limit = cpu_percent;
        self
    }

    /// Run the installation process
    pub async fn run(&self) -> InstallResult<()> {
        info!("Starting installation for server {}", self.server_uuid);

        // Publish install started event
        self.event_bus.publish(Event::InstallStarted);

        // Phase 1: Prepare
        if let Err(e) = self.before_execute().await {
            error!("Installation preparation failed: {}", e);
            self.event_bus.publish(Event::InstallCompleted { successful: false });
            return Err(e);
        }

        // Phase 2: Execute
        let result = self.execute().await;

        // Phase 3: Cleanup (always run)
        if let Err(e) = self.after_execute().await {
            warn!("Installation cleanup failed: {}", e);
        }

        // Publish result
        match &result {
            Ok(_) => {
                info!("Installation completed successfully for {}", self.server_uuid);
                self.event_bus.publish(Event::InstallCompleted { successful: true });
            }
            Err(e) => {
                error!("Installation failed for {}: {}", self.server_uuid, e);
                self.event_bus.publish(Event::InstallCompleted { successful: false });
            }
        }

        result
    }

    /// Prepare for installation
    async fn before_execute(&self) -> InstallResult<()> {
        // Create install directory
        tokio::fs::create_dir_all(&self.install_dir).await?;

        // Write installation script with Unix line endings (LF, not CRLF)
        // This is critical on Windows where files are written with CRLF by default
        let script_path = self.install_dir.join("install.sh");
        let script_content = self.script.script.replace("\r\n", "\n").replace('\r', "\n");
        tokio::fs::write(&script_path, script_content).await?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755)).await?;
        }

        debug!("Wrote install script to {:?}", script_path);
        debug!("Script content (first 200 chars): {:?}", &self.script.script.chars().take(200).collect::<String>());
        info!("Install image: {}, entrypoint: {}", self.script.container_image, self.script.entrypoint);
        info!("Server dir mount: {:?}", self.server_dir);
        info!("Install dir mount: {:?}", self.install_dir);

        // Verify paths exist
        if !self.server_dir.exists() {
            error!("Server directory does not exist: {:?}", self.server_dir);
            return Err(InstallError::Other(format!("Server directory does not exist: {:?}", self.server_dir)));
        }

        // On non-Windows, verify install script mount paths
        #[cfg(not(windows))]
        {
            if !self.install_dir.exists() {
                error!("Install directory does not exist: {:?}", self.install_dir);
                return Err(InstallError::Other(format!("Install directory does not exist: {:?}", self.install_dir)));
            }
            let script_path_check = self.install_dir.join("install.sh");
            if !script_path_check.exists() {
                error!("Install script does not exist: {:?}", script_path_check);
                return Err(InstallError::Other(format!("Install script does not exist: {:?}", script_path_check)));
            }
        }
        info!("All paths verified successfully");

        // Pull installation image
        self.pull_image(&self.script.container_image).await?;

        // Remove any existing installer container
        let container_name = self.container_name();
        let _ = self.docker.remove_container(
            &container_name,
            Some(RemoveContainerOptions {
                force: true,
                ..Default::default()
            }),
        ).await;

        Ok(())
    }

    /// Execute the installation
    async fn execute(&self) -> InstallResult<()> {
        let container_name = self.container_name();

        // Build environment variables
        let env_vars = self.build_env_vars();

        // Build container config
        // Note: On Windows, we use -c to pass the script inline instead of mounting
        // because Windows bind mounts can be unreliable with file permissions
        #[cfg(windows)]
        let (entrypoint, cmd) = {
            let normalized_script = self.script.script
                .replace("\r\n", "\n")
                .replace('\r', "\n");
            info!("Windows: passing script inline ({} chars)", normalized_script.len());
            debug!("Script to execute: {}", normalized_script);
            (
                vec!["/bin/sh".to_string(), "-c".to_string()],
                vec![normalized_script],
            )
        };

        #[cfg(not(windows))]
        let (entrypoint, cmd) = {
            info!("Unix: using mounted script at /mnt/install/install.sh");
            (
                vec!["/bin/sh".to_string(), "-c".to_string()],
                vec!["/mnt/install/install.sh".to_string()],
            )
        };

        let config = Config {
            hostname: Some("installer".to_string()),
            image: Some(self.script.container_image.clone()),
            env: Some(env_vars),
            entrypoint: Some(entrypoint),
            cmd: Some(cmd),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            open_stdin: Some(true),
            tty: Some(true),
            working_dir: Some("/mnt/server".to_string()),
            user: Some("root".to_string()), // Installer runs as root
            host_config: Some(HostConfig {
                mounts: Some({
                    #[allow(unused_mut)]
                    let mut mounts = vec![
                        // Server data volume
                        Mount {
                            target: Some("/mnt/server".to_string()),
                            source: Some(self.server_dir.to_string_lossy().to_string()),
                            typ: Some(MountTypeEnum::BIND),
                            read_only: Some(false),
                            ..Default::default()
                        },
                    ];

                    // On non-Windows, also mount the install script directory
                    #[cfg(not(windows))]
                    mounts.push(Mount {
                        target: Some("/mnt/install".to_string()),
                        source: Some(self.install_dir.to_string_lossy().to_string()),
                        typ: Some(MountTypeEnum::BIND),
                        read_only: Some(true),
                        ..Default::default()
                    });

                    mounts
                }),
                // Resource limits
                memory: Some(self.memory_limit as i64),
                cpu_quota: Some((self.cpu_limit * 1000) as i64),
                cpu_period: Some(100000),
                // Tmpfs for /tmp
                tmpfs: Some({
                    let mut map = HashMap::new();
                    map.insert("/tmp".to_string(), "rw,exec,nosuid,size=100M".to_string());
                    map
                }),
                // Network - use host network for package downloads
                network_mode: Some("host".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };

        // Create container
        let options = CreateContainerOptions {
            name: &container_name,
            platform: None,
        };

        self.docker.create_container(Some(options), config).await?;
        debug!("Created installer container: {}", container_name);

        // Attach to output
        let attach_options = AttachContainerOptions::<String> {
            stdout: Some(true),
            stderr: Some(true),
            stream: Some(true),
            ..Default::default()
        };

        let AttachContainerResults { mut output, .. } = self.docker
            .attach_container(&container_name, Some(attach_options))
            .await?;

        // Start container
        self.docker.start_container::<String>(&container_name, None).await?;
        info!("Started installer container: {}", container_name);

        // Stream output
        let sink = self.install_sink.clone();
        let server_uuid = self.server_uuid.clone();
        let output_handle = tokio::spawn(async move {
            while let Some(result) = output.next().await {
                match result {
                    Ok(log) => {
                        let bytes = log.into_bytes();
                        if !bytes.is_empty() {
                            // Log the output for debugging
                            let output_str = String::from_utf8_lossy(&bytes);
                            debug!("[{}] Install output: {}", server_uuid, output_str.trim());
                            sink.push(bytes.to_vec());
                        }
                    }
                    Err(e) => {
                        warn!("Error reading installer output: {}", e);
                        break;
                    }
                }
            }
        });

        // Wait for completion using polling (more reliable on Windows)
        let exit_code = loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

            match self.docker.inspect_container(&container_name, None).await {
                Ok(info) => {
                    if let Some(state) = info.state {
                        let running = state.running.unwrap_or(false);
                        if !running {
                            let code = state.exit_code.unwrap_or(0);
                            let status = state.status.map(|s| format!("{:?}", s)).unwrap_or_else(|| "unknown".to_string());
                            info!("Container {} exited with code {} (status: {})", container_name, code, status);

                            if let Some(err) = state.error.as_ref().filter(|e| !e.is_empty()) {
                                error!("Container error message: {}", err);
                            }

                            // Log OOMKilled status
                            if state.oom_killed.unwrap_or(false) {
                                error!("Container was killed due to out of memory");
                            }

                            break code;
                        }
                    }
                }
                Err(e) => {
                    // Container might not exist anymore - check if it completed
                    error!("Failed to inspect container: {}", e);
                    // Assume it finished with error
                    break 1;
                }
            }
        };

        // Wait for output streaming to finish
        let _ = output_handle.await;

        if exit_code != 0 {
            return Err(InstallError::Failed(exit_code));
        }

        Ok(())
    }

    /// Cleanup after installation
    async fn after_execute(&self) -> InstallResult<()> {
        let container_name = self.container_name();

        // Remove container
        let _ = self.docker.remove_container(
            &container_name,
            Some(RemoveContainerOptions {
                force: true,
                v: true,
                ..Default::default()
            }),
        ).await;

        // Remove install directory
        if self.install_dir.exists() {
            let _ = tokio::fs::remove_dir_all(&self.install_dir).await;
        }

        debug!("Cleaned up installer for {}", self.server_uuid);
        Ok(())
    }

    /// Pull a Docker image
    async fn pull_image(&self, image: &str) -> InstallResult<()> {
        // Check if image exists
        if self.docker.inspect_image(image).await.is_ok() {
            debug!("Image {} already exists", image);
            return Ok(());
        }

        info!("Pulling image: {}", image);

        let options = CreateImageOptions {
            from_image: image,
            ..Default::default()
        };

        let mut stream = self.docker.create_image(Some(options), None, None);

        while let Some(result) = stream.next().await {
            match result {
                Ok(info) => {
                    if let Some(status) = info.status {
                        debug!("Pull {}: {}", image, status);
                    }
                }
                Err(e) => {
                    return Err(InstallError::ImagePull(e.to_string()));
                }
            }
        }

        info!("Successfully pulled image: {}", image);
        Ok(())
    }

    /// Get installer container name
    fn container_name(&self) -> String {
        format!("{}_installer", self.server_uuid)
    }

    /// Build environment variables for installer
    fn build_env_vars(&self) -> Vec<String> {
        let mut env_vars = vec![
            format!("SERVER_UUID={}", self.server_uuid),
            "CONTAINER_HOME=/mnt/server".to_string(),
            "HOME=/mnt/server".to_string(),
            "TERM=xterm-256color".to_string(),
        ];

        // Add environment variables from the installation script
        for (key, value) in &self.script.environment {
            env_vars.push(format!("{}={}", key, value));
            debug!("Install env: {}={}", key, value);
        }

        info!("Install container will have {} environment variables", env_vars.len());
        env_vars
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_container_name() {
        let process = InstallationProcess {
            server_uuid: "test-uuid-123".to_string(),
            script: InstallationScript {
                container_image: "test".to_string(),
                entrypoint: "/bin/bash".to_string(),
                script: "echo test".to_string(),
                environment: std::collections::HashMap::new(),
            },
            docker: Docker::connect_with_local_defaults().unwrap(),
            server_dir: PathBuf::from("/tmp/server"),
            install_dir: PathBuf::from("/tmp/install"),
            event_bus: EventBus::new(),
            install_sink: SinkPool::new(),
            memory_limit: 1024 * 1024 * 1024,
            cpu_limit: 100,
        };

        assert_eq!(process.container_name(), "test-uuid-123_installer");
    }
}

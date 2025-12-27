//! Server installation process

use std::collections::HashMap;
use std::path::PathBuf;

use bollard::container::{
    Config, CreateContainerOptions, RemoveContainerOptions,
    AttachContainerOptions, AttachContainerResults, WaitContainerOptions,
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
    ) -> InstallResult<Self> {
        let docker = Docker::connect_with_local_defaults()
            .map_err(InstallError::Docker)?;

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

        // Write installation script
        let script_path = self.install_dir.join("install.sh");
        tokio::fs::write(&script_path, &self.script.script).await?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755)).await?;
        }

        debug!("Wrote install script to {:?}", script_path);

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
        let config = Config {
            hostname: Some("installer".to_string()),
            image: Some(self.script.container_image.clone()),
            env: Some(env_vars),
            entrypoint: Some(vec![self.script.entrypoint.clone()]),
            cmd: Some(vec!["/mnt/install/install.sh".to_string()]),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            open_stdin: Some(true),
            tty: Some(true),
            working_dir: Some("/mnt/server".to_string()),
            user: Some("root".to_string()), // Installer runs as root
            host_config: Some(HostConfig {
                mounts: Some(vec![
                    // Server data volume
                    Mount {
                        target: Some("/mnt/server".to_string()),
                        source: Some(self.server_dir.to_string_lossy().to_string()),
                        typ: Some(MountTypeEnum::BIND),
                        read_only: Some(false),
                        ..Default::default()
                    },
                    // Install script directory
                    Mount {
                        target: Some("/mnt/install".to_string()),
                        source: Some(self.install_dir.to_string_lossy().to_string()),
                        typ: Some(MountTypeEnum::BIND),
                        read_only: Some(true),
                        ..Default::default()
                    },
                ]),
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
        let output_handle = tokio::spawn(async move {
            while let Some(result) = output.next().await {
                match result {
                    Ok(log) => {
                        let bytes = log.into_bytes();
                        if !bytes.is_empty() {
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

        // Wait for completion
        let wait_options = WaitContainerOptions {
            condition: "not-running",
        };

        let mut wait_stream = self.docker.wait_container(&container_name, Some(wait_options));

        let exit_code = loop {
            match wait_stream.next().await {
                Some(Ok(result)) => {
                    break result.status_code;
                }
                Some(Err(e)) => {
                    return Err(InstallError::Docker(e));
                }
                None => {
                    return Err(InstallError::Other("Wait stream ended unexpectedly".into()));
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
        vec![
            format!("SERVER_UUID={}", self.server_uuid),
            "CONTAINER_HOME=/mnt/server".to_string(),
            "HOME=/mnt/server".to_string(),
            "TERM=xterm-256color".to_string(),
        ]
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

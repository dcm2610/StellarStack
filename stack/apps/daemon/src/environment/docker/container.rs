//! Container creation and destruction

use std::collections::HashMap;

use bollard::container::{Config, CreateContainerOptions, RemoveContainerOptions};
use bollard::models::{
    HostConfig, Mount, MountTypeEnum, PortBinding, RestartPolicy,
    RestartPolicyNameEnum,
};
use bollard::image::CreateImageOptions;
use futures_util::StreamExt;
use tracing::{debug, error, info, warn};

use super::environment::DockerEnvironment;
use super::super::traits::{EnvironmentError, EnvironmentResult, ProcessEnvironment};

/// Create the container with all configuration applied
pub async fn create_container(env: &DockerEnvironment) -> EnvironmentResult<()> {
    let config = env.config();
    let container_name = env.container_name();

    // Ensure image exists
    ensure_image_exists(env, &config.image).await?;

    // Build environment variables
    let env_vars: Vec<String> = config.env
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect();

    // Build exposed ports
    let mut exposed_ports = HashMap::new();
    for port in config.ports.keys() {
        exposed_ports.insert(format!("{}/tcp", port), HashMap::new());
        exposed_ports.insert(format!("{}/udp", port), HashMap::new());
    }

    // Build port bindings
    let mut port_bindings: HashMap<String, Option<Vec<PortBinding>>> = HashMap::new();
    for (container_port, (host_ip, host_port)) in &config.port_bindings {
        let tcp_key = format!("{}/tcp", container_port);
        let udp_key = format!("{}/udp", container_port);

        let binding = vec![PortBinding {
            host_ip: Some(host_ip.clone()),
            host_port: Some(host_port.to_string()),
        }];

        port_bindings.insert(tcp_key, Some(binding.clone()));
        port_bindings.insert(udp_key, Some(binding));
    }

    // Build mounts
    let mut mounts = Vec::new();

    // Server data volume
    for mount_cfg in &config.mounts {
        mounts.push(Mount {
            target: Some(mount_cfg.target.clone()),
            source: Some(mount_cfg.source.clone()),
            typ: Some(MountTypeEnum::BIND),
            read_only: Some(mount_cfg.read_only),
            ..Default::default()
        });
    }

    // Tmpfs for /tmp
    let mut tmpfs = HashMap::new();
    tmpfs.insert(
        "/tmp".to_string(),
        format!("rw,exec,nosuid,size={}M", config.tmpfs_size),
    );

    // Build labels
    let mut labels = config.labels.clone();
    labels.insert("Service".to_string(), "StellarStack".to_string());
    labels.insert("ContainerType".to_string(), "server_process".to_string());

    // Build host config
    let host_config = HostConfig {
        // Port bindings
        port_bindings: Some(port_bindings),

        // Mounts
        mounts: Some(mounts),

        // Tmpfs
        tmpfs: Some(tmpfs),

        // Resource limits
        memory: if config.limits.memory > 0 {
            Some(config.limits.memory as i64)
        } else {
            None
        },
        memory_swap: if config.limits.memory_swap != 0 {
            Some(config.limits.memory_swap)
        } else {
            None
        },
        memory_reservation: if config.limits.memory > 0 {
            // Reserve 90% of memory limit
            Some((config.limits.memory as f64 * 0.9) as i64)
        } else {
            None
        },
        cpu_quota: if config.limits.cpu_quota > 0 {
            Some(config.limits.cpu_quota)
        } else {
            None
        },
        cpu_period: if config.limits.cpu_period > 0 {
            Some(config.limits.cpu_period)
        } else {
            None
        },
        cpu_shares: if config.limits.cpu_shares > 0 {
            Some(config.limits.cpu_shares)
        } else {
            None
        },
        blkio_weight: Some(config.limits.io_weight),
        pids_limit: if config.limits.pids_limit > 0 {
            Some(config.limits.pids_limit)
        } else {
            None
        },

        // OOM killer
        oom_kill_disable: Some(config.oom_disabled),

        // Security options
        security_opt: Some(vec!["no-new-privileges".to_string()]),
        cap_drop: Some(DockerEnvironment::dropped_capabilities()),

        // DNS
        dns: if config.dns.is_empty() {
            None
        } else {
            Some(config.dns.clone())
        },

        // Network
        network_mode: Some(config.network.clone()),

        // Restart policy (never restart automatically)
        restart_policy: Some(RestartPolicy {
            name: Some(RestartPolicyNameEnum::NO),
            ..Default::default()
        }),

        // Log driver
        log_config: Some(bollard::models::HostConfigLogConfig {
            typ: Some("local".to_string()),
            config: Some({
                let mut cfg = HashMap::new();
                cfg.insert("max-size".to_string(), "5m".to_string());
                cfg.insert("max-file".to_string(), "1".to_string());
                cfg.insert("compress".to_string(), "false".to_string());
                cfg
            }),
        }),

        // Read-only root filesystem (server writes to mounted volume)
        readonly_rootfs: Some(false), // Set to true if desired

        ..Default::default()
    };

    // Build container config
    let container_config = Config {
        hostname: Some(config.id.clone()),
        user: Some(config.user.to_docker_user()),
        env: Some(env_vars),
        image: Some(config.image.clone()),
        cmd: Some(shell_words::split(&config.invocation)
            .map_err(|e| EnvironmentError::Other(format!("Invalid invocation: {}", e)))?),
        exposed_ports: Some(exposed_ports),
        labels: Some(labels),
        attach_stdin: Some(true),
        attach_stdout: Some(true),
        attach_stderr: Some(true),
        open_stdin: Some(true),
        stdin_once: Some(false),
        tty: Some(true),
        host_config: Some(host_config),
        working_dir: Some("/home/container".to_string()),
        ..Default::default()
    };

    // Create container
    let options = CreateContainerOptions {
        name: container_name,
        platform: None,
    };

    env.docker()
        .create_container(Some(options), container_config)
        .await
        .map_err(|e| {
            if let bollard::errors::Error::DockerResponseServerError { status_code: 409, .. } = e {
                return EnvironmentError::ContainerExists(container_name.to_string());
            }
            EnvironmentError::Docker(e)
        })?;

    info!("Created container {}", container_name);
    Ok(())
}

/// Destroy/remove the container
pub async fn destroy_container(env: &DockerEnvironment) -> EnvironmentResult<()> {
    let container_name = env.container_name();

    let options = RemoveContainerOptions {
        force: true,
        v: false, // Don't remove volumes
        ..Default::default()
    };

    match env.docker().remove_container(container_name, Some(options)).await {
        Ok(_) => {
            info!("Destroyed container {}", container_name);
            Ok(())
        }
        Err(bollard::errors::Error::DockerResponseServerError { status_code: 404, .. }) => {
            debug!("Container {} doesn't exist, nothing to destroy", container_name);
            Ok(())
        }
        Err(e) => Err(EnvironmentError::Docker(e)),
    }
}

/// Ensure the Docker image exists, pulling if necessary
async fn ensure_image_exists(env: &DockerEnvironment, image: &str) -> EnvironmentResult<()> {
    // Check if image exists
    match env.docker().inspect_image(image).await {
        Ok(_) => {
            debug!("Image {} already exists", image);
            return Ok(());
        }
        Err(bollard::errors::Error::DockerResponseServerError { status_code: 404, .. }) => {
            info!("Image {} not found, pulling...", image);
        }
        Err(e) => {
            warn!("Error inspecting image {}: {}", image, e);
            // Try to pull anyway
        }
    }

    // Pull the image
    pull_image(env, image).await
}

/// Pull a Docker image
async fn pull_image(env: &DockerEnvironment, image: &str) -> EnvironmentResult<()> {
    let options = CreateImageOptions {
        from_image: image,
        ..Default::default()
    };

    let mut stream = env.docker().create_image(Some(options), None, None);

    while let Some(result) = stream.next().await {
        match result {
            Ok(info) => {
                if let Some(status) = info.status {
                    debug!("Pull {}: {}", image, status);
                }
            }
            Err(e) => {
                error!("Failed to pull image {}: {}", image, e);
                return Err(EnvironmentError::ImagePull(e.to_string()));
            }
        }
    }

    info!("Successfully pulled image {}", image);
    Ok(())
}

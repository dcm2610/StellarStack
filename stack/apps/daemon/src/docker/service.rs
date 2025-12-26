use std::collections::HashMap;
use std::sync::Arc;

use bollard::container::{
    AttachContainerOptions, AttachContainerResults, Config, CreateContainerOptions,
    ListContainersOptions, LogsOptions, RemoveContainerOptions, StatsOptions, StopContainerOptions,
};
use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::image::CreateImageOptions;
use bollard::models::{
    ContainerStateStatusEnum, HostConfig, MountTypeEnum, PortBinding, RestartPolicy as DockerRestartPolicy,
    RestartPolicyNameEnum,
};
use bollard::Docker;
use chrono::Utc;
use futures_util::stream::StreamExt;
use tokio::sync::broadcast;
use tracing::{error, info};

use crate::error::{DaemonError, Result};
use crate::types::{
    Blueprint, BlockIoStats, ConsoleMessage, ConsoleMessageType, ContainerInfo, ContainerState,
    ContainerStats, CpuStats, CreateContainerResponse, MemoryStats, NetworkStats, PortInfo,
    RestartPolicy,
};

#[derive(Clone)]
pub struct DockerService {
    client: Arc<Docker>,
}

impl DockerService {
    pub fn new() -> Result<Self> {
        let client = Docker::connect_with_local_defaults()
            .map_err(|e| DaemonError::Docker(e))?;

        Ok(Self {
            client: Arc::new(client),
        })
    }

    pub fn with_socket(socket_path: &str) -> Result<Self> {
        let client = Docker::connect_with_socket(socket_path, 120, bollard::API_DEFAULT_VERSION)
            .map_err(|e| DaemonError::Docker(e))?;

        Ok(Self {
            client: Arc::new(client),
        })
    }

    pub fn client(&self) -> &Docker {
        &self.client
    }

    pub async fn ping(&self) -> Result<()> {
        self.client.ping().await.map_err(DaemonError::Docker)?;
        Ok(())
    }

    pub async fn pull_image(&self, image: &str) -> Result<()> {
        let options = Some(CreateImageOptions {
            from_image: image,
            ..Default::default()
        });

        let mut stream = self.client.create_image(options, None, None);

        while let Some(result) = stream.next().await {
            match result {
                Ok(info) => {
                    if let Some(status) = info.status {
                        info!("Pull: {}", status);
                    }
                }
                Err(e) => {
                    error!("Pull error: {}", e);
                    return Err(DaemonError::Docker(e));
                }
            }
        }

        Ok(())
    }

    pub async fn create_container(
        &self,
        blueprint: &Blueprint,
        container_name: Option<String>,
    ) -> Result<CreateContainerResponse> {
        let image = blueprint.image.full_name();

        // Pull image first
        self.pull_image(&image).await?;

        // Build port bindings
        let port_bindings = blueprint.ports.as_ref().map(|ports| {
            let mut bindings: HashMap<String, Option<Vec<PortBinding>>> = HashMap::new();
            for port in ports {
                let protocol = port.protocol.as_deref().unwrap_or("tcp");
                let key = format!("{}/{}", port.container_port, protocol);
                let binding = PortBinding {
                    host_ip: port.host_ip.clone(),
                    host_port: port.host_port.map(|p| p.to_string()),
                };
                bindings.insert(key, Some(vec![binding]));
            }
            bindings
        });

        // Build exposed ports
        let exposed_ports = blueprint.ports.as_ref().map(|ports| {
            let mut exposed: HashMap<String, HashMap<(), ()>> = HashMap::new();
            for port in ports {
                let protocol = port.protocol.as_deref().unwrap_or("tcp");
                let key = format!("{}/{}", port.container_port, protocol);
                exposed.insert(key, HashMap::new());
            }
            exposed
        });

        // Build mounts
        let mounts = blueprint.mounts.as_ref().map(|m| {
            m.iter()
                .map(|mount| bollard::models::Mount {
                    target: Some(mount.target.clone()),
                    source: Some(mount.source.clone()),
                    typ: Some(MountTypeEnum::BIND),
                    read_only: mount.read_only,
                    ..Default::default()
                })
                .collect::<Vec<_>>()
        });

        // Build volume mounts
        let mut all_mounts = mounts.unwrap_or_default();
        if let Some(volumes) = &blueprint.volumes {
            for vol in volumes {
                all_mounts.push(bollard::models::Mount {
                    target: Some(vol.target.clone()),
                    source: Some(vol.name.clone()),
                    typ: Some(MountTypeEnum::VOLUME),
                    read_only: vol.read_only,
                    ..Default::default()
                });
            }
        }

        // Build restart policy
        let restart_policy = blueprint.restart_policy.as_ref().map(|policy| {
            let name = match policy {
                RestartPolicy::No => RestartPolicyNameEnum::NO,
                RestartPolicy::Always => RestartPolicyNameEnum::ALWAYS,
                RestartPolicy::OnFailure => RestartPolicyNameEnum::ON_FAILURE,
                RestartPolicy::UnlessStopped => RestartPolicyNameEnum::UNLESS_STOPPED,
            };
            DockerRestartPolicy {
                name: Some(name),
                maximum_retry_count: None,
            }
        });

        // Build host config
        let host_config = HostConfig {
            port_bindings,
            mounts: if all_mounts.is_empty() {
                None
            } else {
                Some(all_mounts)
            },
            memory: blueprint.resources.as_ref().and_then(|r| r.memory),
            memory_swap: blueprint.resources.as_ref().and_then(|r| r.memory_swap),
            cpu_shares: blueprint.resources.as_ref().and_then(|r| r.cpu_shares),
            cpu_period: blueprint.resources.as_ref().and_then(|r| r.cpu_period),
            cpu_quota: blueprint.resources.as_ref().and_then(|r| r.cpu_quota),
            cpuset_cpus: blueprint.resources.as_ref().and_then(|r| r.cpuset_cpus.clone()),
            cpuset_mems: blueprint.resources.as_ref().and_then(|r| r.cpuset_mems.clone()),
            // Use cpus field (converted to nano_cpus) or fall back to nano_cpus directly
            nano_cpus: blueprint.resources.as_ref().and_then(|r| {
                r.cpus.map(|c| (c * 1_000_000_000.0) as i64).or(r.nano_cpus)
            }),
            network_mode: blueprint.network_mode.clone(),
            restart_policy,
            ..Default::default()
        };

        // Build container config
        let config = Config {
            image: Some(image),
            hostname: blueprint.hostname.clone(),
            user: blueprint.user.clone(),
            env: blueprint.environment.as_ref().map(|env| {
                env.iter()
                    .map(|(k, v)| format!("{}={}", k, v))
                    .collect::<Vec<_>>()
            }),
            cmd: blueprint.command.clone(),
            entrypoint: blueprint.entrypoint.clone(),
            working_dir: blueprint.working_dir.clone(),
            labels: blueprint.labels.clone(),
            exposed_ports,
            host_config: Some(host_config),
            tty: blueprint.tty,
            open_stdin: blueprint.stdin_open,
            attach_stdin: blueprint.stdin_open,
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            ..Default::default()
        };

        // Create container
        let name = container_name.unwrap_or_else(|| {
            format!("{}-{}", blueprint.name, uuid::Uuid::new_v4().to_string()[..8].to_string())
        });

        let options = Some(CreateContainerOptions {
            name: name.clone(),
            platform: None,
        });

        let response = self
            .client
            .create_container(options, config)
            .await
            .map_err(DaemonError::Docker)?;

        // Start the container
        self.client
            .start_container::<String>(&response.id, None)
            .await
            .map_err(DaemonError::Docker)?;

        Ok(CreateContainerResponse {
            id: response.id,
            name,
            warnings: response.warnings,
        })
    }

    pub async fn list_containers(&self, all: bool) -> Result<Vec<ContainerInfo>> {
        let options = Some(ListContainersOptions::<String> {
            all,
            ..Default::default()
        });

        let containers = self
            .client
            .list_containers(options)
            .await
            .map_err(DaemonError::Docker)?;

        let mut result = Vec::new();
        for container in containers {
            let id = container.id.unwrap_or_default();
            let name = container
                .names
                .and_then(|n| n.first().cloned())
                .unwrap_or_default()
                .trim_start_matches('/')
                .to_string();

            let state = container
                .state
                .as_deref()
                .map(ContainerState::from)
                .unwrap_or(ContainerState::Dead);

            let ports = container
                .ports
                .unwrap_or_default()
                .into_iter()
                .map(|p| PortInfo {
                    container_port: p.private_port,
                    host_port: p.public_port,
                    host_ip: p.ip,
                    protocol: p.typ.map(|t| format!("{:?}", t).to_lowercase()).unwrap_or_else(|| "tcp".to_string()),
                })
                .collect();

            result.push(ContainerInfo {
                id,
                name,
                image: container.image.unwrap_or_default(),
                state,
                status: container.status.unwrap_or_default(),
                created: chrono::DateTime::from_timestamp(container.created.unwrap_or(0), 0)
                    .unwrap_or_else(|| Utc::now()),
                ports,
                labels: container.labels.unwrap_or_default(),
            });
        }

        Ok(result)
    }

    pub async fn get_container(&self, id: &str) -> Result<ContainerInfo> {
        let inspect = self
            .client
            .inspect_container(id, None)
            .await
            .map_err(|e| match e {
                bollard::errors::Error::DockerResponseServerError {
                    status_code: 404, ..
                } => DaemonError::ContainerNotFound(id.to_string()),
                _ => DaemonError::Docker(e),
            })?;

        let state = inspect
            .state
            .as_ref()
            .and_then(|s| s.status)
            .map(|s| match s {
                ContainerStateStatusEnum::CREATED => ContainerState::Created,
                ContainerStateStatusEnum::RUNNING => ContainerState::Running,
                ContainerStateStatusEnum::PAUSED => ContainerState::Paused,
                ContainerStateStatusEnum::RESTARTING => ContainerState::Restarting,
                ContainerStateStatusEnum::REMOVING => ContainerState::Removing,
                ContainerStateStatusEnum::EXITED => ContainerState::Exited,
                ContainerStateStatusEnum::DEAD => ContainerState::Dead,
                _ => ContainerState::Dead,
            })
            .unwrap_or(ContainerState::Dead);

        let name = inspect
            .name
            .unwrap_or_default()
            .trim_start_matches('/')
            .to_string();

        let created = inspect
            .created
            .and_then(|c| chrono::DateTime::parse_from_rfc3339(&c).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let ports = inspect
            .network_settings
            .and_then(|ns| ns.ports)
            .map(|p| {
                p.into_iter()
                    .filter_map(|(key, bindings)| {
                        let parts: Vec<&str> = key.split('/').collect();
                        let container_port = parts.first()?.parse().ok()?;
                        let protocol = parts.get(1).unwrap_or(&"tcp").to_string();

                        let (host_port, host_ip) = bindings
                            .and_then(|b| b.first().cloned())
                            .map(|b| (b.host_port.and_then(|p| p.parse().ok()), b.host_ip))
                            .unwrap_or((None, None));

                        Some(PortInfo {
                            container_port,
                            host_port,
                            host_ip,
                            protocol,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(ContainerInfo {
            id: inspect.id.unwrap_or_default(),
            name,
            image: inspect
                .config
                .and_then(|c| c.image)
                .unwrap_or_default(),
            state,
            status: inspect
                .state
                .and_then(|s| s.status)
                .map(|s| format!("{:?}", s))
                .unwrap_or_default(),
            created,
            ports,
            labels: HashMap::new(),
        })
    }

    pub async fn stop_container(&self, id: &str, timeout: Option<i64>) -> Result<()> {
        let options = Some(StopContainerOptions {
            t: timeout.unwrap_or(10),
        });

        self.client
            .stop_container(id, options)
            .await
            .map_err(|e| match e {
                bollard::errors::Error::DockerResponseServerError {
                    status_code: 404, ..
                } => DaemonError::ContainerNotFound(id.to_string()),
                _ => DaemonError::Docker(e),
            })?;

        Ok(())
    }

    pub async fn start_container(&self, id: &str) -> Result<()> {
        self.client
            .start_container::<String>(id, None)
            .await
            .map_err(|e| match e {
                bollard::errors::Error::DockerResponseServerError {
                    status_code: 404, ..
                } => DaemonError::ContainerNotFound(id.to_string()),
                _ => DaemonError::Docker(e),
            })?;

        Ok(())
    }

    pub async fn restart_container(&self, id: &str, timeout: Option<i64>) -> Result<()> {
        let options = timeout.map(|t| bollard::container::RestartContainerOptions { t: t as isize });

        self.client
            .restart_container(id, options)
            .await
            .map_err(|e| match e {
                bollard::errors::Error::DockerResponseServerError {
                    status_code: 404, ..
                } => DaemonError::ContainerNotFound(id.to_string()),
                _ => DaemonError::Docker(e),
            })?;

        Ok(())
    }

    pub async fn kill_container(&self, id: &str, signal: Option<&str>) -> Result<()> {
        let options = signal.map(|s| bollard::container::KillContainerOptions { signal: s });

        self.client
            .kill_container(id, options)
            .await
            .map_err(|e| match e {
                bollard::errors::Error::DockerResponseServerError {
                    status_code: 404, ..
                } => DaemonError::ContainerNotFound(id.to_string()),
                _ => DaemonError::Docker(e),
            })?;

        Ok(())
    }

    pub async fn remove_container(&self, id: &str, force: bool) -> Result<()> {
        let options = Some(RemoveContainerOptions {
            force,
            v: true,
            ..Default::default()
        });

        self.client
            .remove_container(id, options)
            .await
            .map_err(|e| match e {
                bollard::errors::Error::DockerResponseServerError {
                    status_code: 404, ..
                } => DaemonError::ContainerNotFound(id.to_string()),
                _ => DaemonError::Docker(e),
            })?;

        Ok(())
    }

    pub async fn get_container_stats(&self, id: &str) -> Result<ContainerStats> {
        let options = Some(StatsOptions {
            stream: false,
            one_shot: true,
        });

        let mut stream = self.client.stats(id, options);

        if let Some(result) = stream.next().await {
            let stats = result.map_err(|e| match e {
                bollard::errors::Error::DockerResponseServerError {
                    status_code: 404, ..
                } => DaemonError::ContainerNotFound(id.to_string()),
                _ => DaemonError::Docker(e),
            })?;

            let cpu_delta = stats
                .cpu_stats
                .cpu_usage
                .total_usage
                .saturating_sub(stats.precpu_stats.cpu_usage.total_usage);
            let system_delta = stats
                .cpu_stats
                .system_cpu_usage
                .unwrap_or(0)
                .saturating_sub(stats.precpu_stats.system_cpu_usage.unwrap_or(0));
            let online_cpus = stats.cpu_stats.online_cpus.unwrap_or(1);

            let cpu_percent = if system_delta > 0 && online_cpus > 0 {
                (cpu_delta as f64 / system_delta as f64) * online_cpus as f64 * 100.0
            } else {
                0.0
            };

            let memory_usage = stats.memory_stats.usage.unwrap_or(0);
            let memory_limit = stats.memory_stats.limit.unwrap_or(1);
            let memory_percent = (memory_usage as f64 / memory_limit as f64) * 100.0;

            let (rx_bytes, tx_bytes, rx_packets, tx_packets, rx_errors, tx_errors) = stats
                .networks
                .map(|networks| {
                    networks.values().fold(
                        (0u64, 0u64, 0u64, 0u64, 0u64, 0u64),
                        |(rx_b, tx_b, rx_p, tx_p, rx_e, tx_e), net| {
                            (
                                rx_b + net.rx_bytes,
                                tx_b + net.tx_bytes,
                                rx_p + net.rx_packets,
                                tx_p + net.tx_packets,
                                rx_e + net.rx_errors,
                                tx_e + net.tx_errors,
                            )
                        },
                    )
                })
                .unwrap_or((0, 0, 0, 0, 0, 0));

            let (read_bytes, write_bytes) = stats
                .blkio_stats
                .io_service_bytes_recursive
                .map(|io| {
                    io.iter().fold((0u64, 0u64), |(r, w), entry| {
                        match entry.op.as_str() {
                            "read" | "Read" => (r + entry.value, w),
                            "write" | "Write" => (r, w + entry.value),
                            _ => (r, w),
                        }
                    })
                })
                .unwrap_or((0, 0));

            return Ok(ContainerStats {
                id: id.to_string(),
                name: stats.name.trim_start_matches('/').to_string(),
                cpu: CpuStats {
                    usage_percent: cpu_percent,
                    system_cpu_usage: stats.cpu_stats.system_cpu_usage.unwrap_or(0),
                    online_cpus,
                },
                memory: MemoryStats {
                    usage: memory_usage,
                    limit: memory_limit,
                    usage_percent: memory_percent,
                    cache: 0,
                },
                network: NetworkStats {
                    rx_bytes,
                    tx_bytes,
                    rx_packets,
                    tx_packets,
                    rx_errors,
                    tx_errors,
                },
                block_io: BlockIoStats {
                    read_bytes,
                    write_bytes,
                },
                pids: stats.pids_stats.current.unwrap_or(0),
                timestamp: Utc::now(),
            });
        }

        Err(DaemonError::Internal("Failed to get stats".to_string()))
    }

    pub async fn stream_stats(
        &self,
        id: &str,
        tx: broadcast::Sender<ContainerStats>,
    ) -> Result<()> {
        let options = Some(StatsOptions {
            stream: true,
            one_shot: false,
        });

        let mut stream = self.client.stats(id, options);

        while let Some(result) = stream.next().await {
            match result {
                Ok(stats) => {
                    let cpu_delta = stats
                        .cpu_stats
                        .cpu_usage
                        .total_usage
                        .saturating_sub(stats.precpu_stats.cpu_usage.total_usage);
                    let system_delta = stats
                        .cpu_stats
                        .system_cpu_usage
                        .unwrap_or(0)
                        .saturating_sub(stats.precpu_stats.system_cpu_usage.unwrap_or(0));
                    let online_cpus = stats.cpu_stats.online_cpus.unwrap_or(1);

                    let cpu_percent = if system_delta > 0 && online_cpus > 0 {
                        (cpu_delta as f64 / system_delta as f64) * online_cpus as f64 * 100.0
                    } else {
                        0.0
                    };

                    let memory_usage = stats.memory_stats.usage.unwrap_or(0);
                    let memory_limit = stats.memory_stats.limit.unwrap_or(1);
                    let memory_percent = (memory_usage as f64 / memory_limit as f64) * 100.0;

                    let (rx_bytes, tx_bytes, rx_packets, tx_packets, rx_errors, tx_errors) = stats
                        .networks
                        .map(|networks| {
                            networks.values().fold(
                                (0u64, 0u64, 0u64, 0u64, 0u64, 0u64),
                                |(rx_b, tx_b, rx_p, tx_p, rx_e, tx_e), net| {
                                    (
                                        rx_b + net.rx_bytes,
                                        tx_b + net.tx_bytes,
                                        rx_p + net.rx_packets,
                                        tx_p + net.tx_packets,
                                        rx_e + net.rx_errors,
                                        tx_e + net.tx_errors,
                                    )
                                },
                            )
                        })
                        .unwrap_or((0, 0, 0, 0, 0, 0));

                    let (read_bytes, write_bytes) = stats
                        .blkio_stats
                        .io_service_bytes_recursive
                        .map(|io| {
                            io.iter().fold((0u64, 0u64), |(r, w), entry| {
                                match entry.op.as_str() {
                                    "read" | "Read" => (r + entry.value, w),
                                    "write" | "Write" => (r, w + entry.value),
                                    _ => (r, w),
                                }
                            })
                        })
                        .unwrap_or((0, 0));

                    let container_stats = ContainerStats {
                        id: id.to_string(),
                        name: stats.name.trim_start_matches('/').to_string(),
                        cpu: CpuStats {
                            usage_percent: cpu_percent,
                            system_cpu_usage: stats.cpu_stats.system_cpu_usage.unwrap_or(0),
                            online_cpus,
                        },
                        memory: MemoryStats {
                            usage: memory_usage,
                            limit: memory_limit,
                            usage_percent: memory_percent,
                            cache: 0,
                        },
                        network: NetworkStats {
                            rx_bytes,
                            tx_bytes,
                            rx_packets,
                            tx_packets,
                            rx_errors,
                            tx_errors,
                        },
                        block_io: BlockIoStats {
                            read_bytes,
                            write_bytes,
                        },
                        pids: stats.pids_stats.current.unwrap_or(0),
                        timestamp: Utc::now(),
                    };

                    if tx.send(container_stats).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    error!("Stats stream error: {}", e);
                    break;
                }
            }
        }

        Ok(())
    }

    pub async fn attach_container(
        &self,
        id: &str,
    ) -> Result<AttachContainerResults> {
        let options = Some(AttachContainerOptions::<String> {
            stdin: Some(true),
            stdout: Some(true),
            stderr: Some(true),
            stream: Some(true),
            logs: Some(true),
            ..Default::default()
        });

        let result = self
            .client
            .attach_container(id, options)
            .await
            .map_err(|e| match e {
                bollard::errors::Error::DockerResponseServerError {
                    status_code: 404, ..
                } => DaemonError::ContainerNotFound(id.to_string()),
                _ => DaemonError::Docker(e),
            })?;

        Ok(result)
    }

    pub async fn get_container_logs(
        &self,
        id: &str,
        tail: Option<&str>,
    ) -> Result<Vec<ConsoleMessage>> {
        let options = Some(LogsOptions::<String> {
            stdout: true,
            stderr: true,
            tail: tail.unwrap_or("100").to_string(),
            timestamps: true,
            ..Default::default()
        });

        let mut stream = self.client.logs(id, options);
        let mut logs = Vec::new();

        while let Some(result) = stream.next().await {
            match result {
                Ok(output) => {
                    let (msg_type, data) = match output {
                        bollard::container::LogOutput::StdOut { message } => {
                            (ConsoleMessageType::Stdout, String::from_utf8_lossy(&message).to_string())
                        }
                        bollard::container::LogOutput::StdErr { message } => {
                            (ConsoleMessageType::Stderr, String::from_utf8_lossy(&message).to_string())
                        }
                        bollard::container::LogOutput::Console { message } => {
                            (ConsoleMessageType::Stdout, String::from_utf8_lossy(&message).to_string())
                        }
                        bollard::container::LogOutput::StdIn { message } => {
                            (ConsoleMessageType::Stdin, String::from_utf8_lossy(&message).to_string())
                        }
                    };

                    logs.push(ConsoleMessage {
                        msg_type,
                        data,
                        timestamp: Utc::now(),
                    });
                }
                Err(e) => {
                    error!("Log stream error: {}", e);
                    break;
                }
            }
        }

        Ok(logs)
    }

    pub async fn exec_command(&self, id: &str, cmd: Vec<&str>) -> Result<StartExecResults> {
        let exec = self
            .client
            .create_exec(
                id,
                CreateExecOptions {
                    attach_stdout: Some(true),
                    attach_stderr: Some(true),
                    attach_stdin: Some(true),
                    tty: Some(true),
                    cmd: Some(cmd),
                    ..Default::default()
                },
            )
            .await
            .map_err(DaemonError::Docker)?;

        let result = self
            .client
            .start_exec(&exec.id, None)
            .await
            .map_err(DaemonError::Docker)?;

        Ok(result)
    }
}

//! Power operations (start, stop, attach, terminate)

use std::time::Duration;

use bollard::container::{
    AttachContainerOptions, AttachContainerResults, KillContainerOptions,
    StartContainerOptions, StatsOptions, StopContainerOptions, WaitContainerOptions,
};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

use crate::events::{Event, NetworkStats, ProcessState, Stats};
use crate::filesystem::disk::calculate_dir_size_sync;
use super::environment::DockerEnvironment;
use super::super::traits::{EnvironmentError, EnvironmentResult, ProcessEnvironment, StopConfig};

/// Start the container
pub async fn start_container(
    env: &DockerEnvironment,
    ctx: CancellationToken,
) -> EnvironmentResult<()> {
    let container_name = env.container_name();

    // Check if already running
    if env.is_running().await? {
        env.set_state(ProcessState::Running);

        // Re-attach if not already attached
        if !env.is_attached() {
            attach_container(env, ctx).await?;
            // Start stats polling for already running container
            start_stats_poller(env);
        }

        return Ok(());
    }

    env.set_state(ProcessState::Starting);

    // Attach BEFORE starting (critical for capturing early output)
    attach_container(env, ctx.clone()).await?;

    // Start the container
    let options = StartContainerOptions::<String> {
        ..Default::default()
    };

    env.docker()
        .start_container(container_name, Some(options))
        .await
        .map_err(|e| {
            env.set_state(ProcessState::Offline);
            EnvironmentError::Docker(e)
        })?;

    // Keep state as Starting - the server will set it to Running when startup is detected
    info!("Started container {}", container_name);

    // Start stats polling
    start_stats_poller(env);

    // Start exit watcher to update state when container exits unexpectedly
    start_exit_watcher(env);

    Ok(())
}

/// Start a background task to poll container stats
fn start_stats_poller(env: &DockerEnvironment) {
    let container_name = env.container_name().to_string();
    let docker = env.docker().clone();
    let event_bus = env.events().clone();
    let config = env.config().clone();

    tokio::spawn(async move {
        let options = StatsOptions {
            stream: true,
            one_shot: false,
        };

        let mut stream = docker.stats(&container_name, Some(options));

        let mut prev_cpu: Option<u64> = None;
        let mut prev_system: Option<u64> = None;

        while let Some(result) = stream.next().await {
            match result {
                Ok(docker_stats) => {
                    // Calculate memory usage
                    let memory = docker_stats.memory_stats.usage.unwrap_or(0);
                    let memory_limit = docker_stats.memory_stats.limit.unwrap_or(0);

                    // Calculate CPU percentage
                    let current_cpu = docker_stats.cpu_stats.cpu_usage.total_usage;
                    let current_system = docker_stats.cpu_stats.system_cpu_usage.unwrap_or(0);
                    let num_cpus = docker_stats.cpu_stats.online_cpus.unwrap_or(1) as f64;

                    let cpu = if let (Some(prev_c), Some(prev_s)) = (prev_cpu, prev_system) {
                        let cpu_delta = current_cpu.saturating_sub(prev_c);
                        let system_delta = current_system.saturating_sub(prev_s);

                        if system_delta > 0 && cpu_delta > 0 {
                            let raw_cpu = (cpu_delta as f64 / system_delta as f64) * 100.0 * num_cpus;
                            // Cap CPU at 100% per core * number of cores
                            raw_cpu.min(100.0 * num_cpus)
                        } else {
                            0.0
                        }
                    } else {
                        0.0
                    };

                    prev_cpu = Some(current_cpu);
                    prev_system = Some(current_system);

                    // Calculate network stats
                    let mut rx_bytes = 0u64;
                    let mut tx_bytes = 0u64;
                    if let Some(nets) = &docker_stats.networks {
                        for (_name, stats) in nets {
                            rx_bytes += stats.rx_bytes;
                            tx_bytes += stats.tx_bytes;
                        }
                    }

                    // Get uptime from container start time
                    let uptime = 0i64; // Will be calculated from container inspect if needed

                    // Calculate disk usage from server data directory
                    let (disk_bytes, disk_limit_bytes) = if let Some(mount) = config.mounts.first() {
                        let data_dir = std::path::Path::new(&mount.source);
                        let disk_limit = config.limits.disk_space;

                        // Calculate actual disk usage (synchronous)
                        let disk_usage = calculate_dir_size_sync(data_dir).unwrap_or(0);
                        (disk_usage, disk_limit)
                    } else {
                        (0, config.limits.disk_space)
                    };

                    let stats = Stats {
                        memory_bytes: memory,
                        memory_limit_bytes: memory_limit,
                        cpu_absolute: cpu,
                        network: NetworkStats { rx_bytes, tx_bytes },
                        uptime,
                        disk_bytes,
                        disk_limit_bytes,
                    };

                    event_bus.publish(Event::Stats(stats));
                }
                Err(e) => {
                    // Container might have stopped - check various error conditions
                    let error_str = e.to_string();

                    // Check for known "container stopped" errors
                    let is_stopped = matches!(
                        &e,
                        bollard::errors::Error::DockerResponseServerError { status_code: 404, .. } |
                        bollard::errors::Error::DockerResponseServerError { status_code: 409, .. }
                    ) || error_str.contains("container is stopped")
                      || error_str.contains("not running")
                      || error_str.contains("No such container");

                    // JSON deserialization errors typically happen when Docker sends incomplete
                    // stats as the container is exiting - treat these as normal stop conditions
                    let is_json_error = matches!(&e, bollard::errors::Error::JsonDataError { .. })
                        || error_str.contains("missing field")
                        || error_str.contains("Failed to deserialize");

                    if is_stopped || is_json_error {
                        debug!("Container {} stopped or sent incomplete stats, ending stats poller", container_name);
                        break;
                    }
                    warn!("Stats error for {}: {}", container_name, e);
                }
            }
        }

        debug!("Stats poller ended for {}", container_name);
    });
}

/// Start a background task to watch for container exit
fn start_exit_watcher(env: &DockerEnvironment) {
    let container_name = env.container_name().to_string();
    let docker = env.docker().clone();
    let event_bus = env.events().clone();

    tokio::spawn(async move {
        let options = WaitContainerOptions {
            condition: "not-running",
        };

        let mut stream = docker.wait_container(&container_name, Some(options));

        while let Some(result) = stream.next().await {
            match result {
                Ok(response) => {
                    let exit_code = response.status_code;
                    info!(
                        "Container {} exited with code {} - publishing state change",
                        container_name,
                        exit_code
                    );

                    // Publish offline state through event bus
                    event_bus.publish_state(crate::events::ProcessState::Offline);

                    // Log if it was an OOM kill or error
                    if exit_code != 0 {
                        if exit_code == 137 {
                            warn!("Container {} was killed (SIGKILL/OOM)", container_name);
                        } else {
                            warn!("Container {} exited with error code {}", container_name, exit_code);
                        }
                    }
                    break;
                }
                Err(e) => {
                    // Container might have been removed or doesn't exist
                    let error_str = e.to_string();
                    if error_str.contains("No such container") || error_str.contains("404") {
                        debug!("Container {} no longer exists, ending exit watcher", container_name);
                    } else {
                        warn!("Error watching container {}: {}", container_name, e);
                    }
                    break;
                }
            }
        }

        debug!("Exit watcher ended for {}", container_name);
    });
}

/// Stop the container gracefully
pub async fn stop_container(
    env: &DockerEnvironment,
    _ctx: CancellationToken,
) -> EnvironmentResult<()> {
    let container_name = env.container_name();
    let config = env.config();

    if !env.is_running().await? {
        env.set_state(ProcessState::Offline);
        return Ok(());
    }

    env.set_state(ProcessState::Stopping);

    match &config.stop {
        StopConfig::Signal(signal) => {
            // Send signal to container
            debug!("Sending {} to container {}", signal, container_name);
            let options = KillContainerOptions { signal };

            if let Err(e) = env.docker().kill_container(container_name, Some(options)).await {
                warn!("Failed to send signal to container: {}", e);
            }
        }
        StopConfig::Command(cmd) => {
            // Send command to stdin
            debug!("Sending stop command to container {}: {}", container_name, cmd);
            if let Err(e) = env.send_command(cmd).await {
                warn!("Failed to send stop command: {} - falling back to SIGTERM", e);
                // Fall back to SIGTERM if we can't send the command
                let options = KillContainerOptions { signal: "SIGTERM" };
                if let Err(e) = env.docker().kill_container(container_name, Some(options)).await {
                    warn!("Failed to send SIGTERM to container: {}", e);
                }
            }
        }
        StopConfig::Native => {
            // Use Docker's native stop
            debug!("Using native Docker stop for {}", container_name);
            let options = StopContainerOptions { t: 30 };

            if let Err(e) = env.docker().stop_container(container_name, Some(options)).await {
                warn!("Docker stop failed: {}", e);
            }
        }
    }

    Ok(())
}

/// Wait for the container to stop with timeout
pub async fn wait_for_stop(
    env: &DockerEnvironment,
    ctx: CancellationToken,
    timeout: Duration,
    terminate: bool,
) -> EnvironmentResult<()> {
    let container_name = env.container_name();

    // First check if already stopped
    if !env.is_running().await.unwrap_or(false) {
        env.set_state(ProcessState::Offline);
        return Ok(());
    }

    // Wait for container with timeout
    let wait_result = tokio::select! {
        result = wait_for_container_exit(env, ctx.clone()) => {
            match result {
                Ok(_) => {
                    debug!("Container {} exited normally", container_name);
                    Ok(())
                }
                Err(e) => {
                    warn!("Error waiting for container: {}", e);
                    Err(e)
                }
            }
        }
        _ = tokio::time::sleep(timeout) => {
            warn!("Timeout waiting for container {} to stop", container_name);
            Err(EnvironmentError::Timeout)
        }
        _ = ctx.cancelled() => {
            debug!("Wait cancelled for container {}", container_name);
            Err(EnvironmentError::Cancelled)
        }
    };

    // If timeout/error and terminate requested, force kill
    if wait_result.is_err() && terminate {
        info!("Force killing container {}", container_name);
        terminate_container(env, ctx, "SIGKILL").await?;

        // Brief wait for cleanup
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    env.set_state(ProcessState::Offline);
    env.set_attached(false);
    env.clear_command_sender();

    Ok(())
}

/// Wait for container to exit
pub async fn wait_for_container_exit(env: &DockerEnvironment, _ctx: CancellationToken) -> EnvironmentResult<()> {
    let container_name = env.container_name();

    let options = WaitContainerOptions {
        condition: "not-running",
    };

    let mut stream = env.docker().wait_container(container_name, Some(options));

    while let Some(result) = stream.next().await {
        match result {
            Ok(response) => {
                debug!("Container {} exited with code {}", container_name, response.status_code);
                return Ok(());
            }
            Err(e) => {
                return Err(EnvironmentError::Docker(e));
            }
        }
    }

    Ok(())
}

/// Terminate the container with a signal
pub async fn terminate_container(
    env: &DockerEnvironment,
    _ctx: CancellationToken,
    signal: &str,
) -> EnvironmentResult<()> {
    let container_name = env.container_name();

    let options = KillContainerOptions { signal };

    match env.docker().kill_container(container_name, Some(options)).await {
        Ok(_) => {
            info!("Sent {} to container {}", signal, container_name);
            Ok(())
        }
        Err(bollard::errors::Error::DockerResponseServerError { status_code: 404, .. }) => {
            debug!("Container {} not found for kill", container_name);
            Ok(())
        }
        Err(bollard::errors::Error::DockerResponseServerError { status_code: 409, message }) => {
            // Container not running
            debug!("Container {} not running: {}", container_name, message);
            Ok(())
        }
        Err(e) => Err(EnvironmentError::Docker(e)),
    }
}

/// Attach to the container's stdin/stdout/stderr
pub async fn attach_container(
    env: &DockerEnvironment,
    _ctx: CancellationToken,
) -> EnvironmentResult<()> {
    let container_name = env.container_name();

    if env.is_attached() {
        debug!("Already attached to container {}", container_name);
        return Ok(());
    }

    let options = AttachContainerOptions::<String> {
        stdin: Some(true),
        stdout: Some(true),
        stderr: Some(true),
        stream: Some(true),
        logs: Some(false),
        ..Default::default()
    };

    let AttachContainerResults { mut output, mut input } = env
        .docker()
        .attach_container(container_name, Some(options))
        .await
        .map_err(|e| {
            error!("Failed to attach to container {}: {}", container_name, e);
            EnvironmentError::AttachFailed(e.to_string())
        })?;

    env.set_attached(true);

    // Create channel for sending commands
    let (cmd_tx, mut cmd_rx) = mpsc::channel::<String>(32);
    env.set_command_sender(cmd_tx);

    // Clone what we need for the spawned task
    let container_name_clone = container_name.to_string();

    // Spawn task to handle output
    let event_bus = env.events().clone();

    tokio::spawn(async move {
        info!("Attach output task started for {}", container_name_clone);
        let mut line_count = 0u64;

        // Handle output
        while let Some(result) = output.next().await {
            match result {
                Ok(log_output) => {
                    let bytes = log_output.into_bytes();
                    if !bytes.is_empty() {
                        line_count += 1;

                        // Log every line for debugging (with preview)
                        let preview = String::from_utf8_lossy(&bytes);
                        let preview_short: String = preview.chars().take(100).collect();
                        debug!("Attach output [{}] line {}: {}", container_name_clone, line_count, preview_short);

                        // Publish to event bus
                        event_bus.publish(crate::events::Event::ConsoleOutput(bytes.to_vec()));
                    }
                }
                Err(e) => {
                    warn!("Error reading output from {} after {} lines: {}", container_name_clone, line_count, e);
                    break;
                }
            }
        }
        warn!("Output stream ended for {} after {} lines", container_name_clone, line_count);
    });

    // Spawn task to handle input
    let container_name_clone2 = container_name.to_string();
    tokio::spawn(async move {
        while let Some(cmd) = cmd_rx.recv().await {
            if let Err(e) = input.write_all(cmd.as_bytes()).await {
                warn!("Error writing to {}: {}", container_name_clone2, e);
                break;
            }
            if let Err(e) = input.flush().await {
                warn!("Error flushing stdin for {}: {}", container_name_clone2, e);
                break;
            }
        }
        debug!("Input handler ended for {}", container_name_clone2);
    });

    info!("Attached to container {}", container_name);
    Ok(())
}

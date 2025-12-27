//! Power operations (start, stop, attach, terminate)

use std::time::Duration;

use bollard::container::{
    AttachContainerOptions, AttachContainerResults, KillContainerOptions,
    StartContainerOptions, StopContainerOptions, WaitContainerOptions,
};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

use crate::events::ProcessState;
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

    env.set_state(ProcessState::Running);
    info!("Started container {}", container_name);

    Ok(())
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
                warn!("Failed to send stop command: {}", e);
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
        result = wait_for_container_exit(env) => {
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
async fn wait_for_container_exit(env: &DockerEnvironment) -> EnvironmentResult<()> {
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
        // Handle output
        while let Some(result) = output.next().await {
            match result {
                Ok(log_output) => {
                    let bytes = log_output.into_bytes();
                    if !bytes.is_empty() {
                        // Publish to event bus
                        event_bus.publish(crate::events::Event::ConsoleOutput(bytes.to_vec()));
                    }
                }
                Err(e) => {
                    warn!("Error reading output from {}: {}", container_name_clone, e);
                    break;
                }
            }
        }
        debug!("Output stream ended for {}", container_name_clone);
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

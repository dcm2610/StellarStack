use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::Response,
};
use bollard::container::{AttachContainerOptions, LogOutput};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast;
use tracing::{error, info};

use crate::docker::DockerService;
use crate::types::{ConsoleMessage, ConsoleMessageType, ContainerStats};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum WsMessage {
    #[serde(rename = "log")]
    Log(ConsoleMessage),
    #[serde(rename = "stats")]
    Stats(ContainerStats),
    #[serde(rename = "command")]
    Command(String),
    #[serde(rename = "error")]
    Error(String),
    #[serde(rename = "connected")]
    Connected { container_id: String },
}

pub async fn console_ws(
    ws: WebSocketUpgrade,
    State(docker): State<DockerService>,
    Path(id): Path<String>,
) -> Response {
    ws.on_upgrade(move |socket| handle_console_ws(socket, docker, id))
}

async fn handle_console_ws(socket: WebSocket, docker: DockerService, container_id: String) {
    let (mut sender, mut receiver) = socket.split();

    // Send connected message
    let connected_msg = WsMessage::Connected {
        container_id: container_id.clone(),
    };
    if let Ok(json) = serde_json::to_string(&connected_msg) {
        if sender.send(Message::Text(json.into())).await.is_err() {
            return;
        }
    }

    // Verify container exists
    if docker.get_container(&container_id).await.is_err() {
        let error_msg = WsMessage::Error(format!("Container not found: {}", container_id));
        if let Ok(json) = serde_json::to_string(&error_msg) {
            let _ = sender.send(Message::Text(json.into())).await;
        }
        return;
    }

    // Attach to container for stdin
    let attach_options = Some(AttachContainerOptions::<String> {
        stdin: Some(true),
        stdout: Some(true),
        stderr: Some(true),
        stream: Some(true),
        logs: Some(true),
        ..Default::default()
    });

    let attach_result = docker.client().attach_container(&container_id, attach_options).await;

    let (mut docker_input, mut docker_output) = match attach_result {
        Ok(attach) => (attach.input, attach.output),
        Err(e) => {
            let error_msg = WsMessage::Error(format!("Failed to attach to container: {}", e));
            if let Ok(json) = serde_json::to_string(&error_msg) {
                let _ = sender.send(Message::Text(json.into())).await;
            }
            return;
        }
    };

    // Spawn task to read from container and send to WebSocket
    let container_id_clone = container_id.clone();
    let send_task = tokio::spawn(async move {
        while let Some(result) = docker_output.next().await {
            match result {
                Ok(output) => {
                    let (msg_type, data) = match output {
                        LogOutput::StdOut { message } => {
                            (ConsoleMessageType::Stdout, String::from_utf8_lossy(&message).to_string())
                        }
                        LogOutput::StdErr { message } => {
                            (ConsoleMessageType::Stderr, String::from_utf8_lossy(&message).to_string())
                        }
                        LogOutput::Console { message } => {
                            (ConsoleMessageType::Stdout, String::from_utf8_lossy(&message).to_string())
                        }
                        LogOutput::StdIn { message } => {
                            (ConsoleMessageType::Stdin, String::from_utf8_lossy(&message).to_string())
                        }
                    };

                    let console_msg = ConsoleMessage {
                        msg_type,
                        data,
                        timestamp: Utc::now(),
                    };

                    let ws_msg = WsMessage::Log(console_msg);
                    if let Ok(json) = serde_json::to_string(&ws_msg) {
                        if sender.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                }
                Err(e) => {
                    error!("Docker output error: {}", e);
                    break;
                }
            }
        }
        info!("Output stream ended for container {}", container_id_clone);
    });

    // Read from WebSocket and send to container stdin
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let command = if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    match ws_msg {
                        WsMessage::Command(cmd) => Some(cmd),
                        _ => None,
                    }
                } else {
                    Some(text.to_string())
                };

                if let Some(cmd) = command {
                    // Send command to container stdin with newline
                    let cmd_with_newline = if cmd.ends_with('\n') {
                        cmd
                    } else {
                        format!("{}\n", cmd)
                    };

                    if let Err(e) = docker_input.write_all(cmd_with_newline.as_bytes()).await {
                        error!("Failed to write to container stdin: {}", e);
                        break;
                    }
                    if let Err(e) = docker_input.flush().await {
                        error!("Failed to flush container stdin: {}", e);
                        break;
                    }
                }
            }
            Ok(Message::Binary(data)) => {
                if let Err(e) = docker_input.write_all(&data).await {
                    error!("Failed to write binary to container stdin: {}", e);
                    break;
                }
            }
            Ok(Message::Close(_)) => break,
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    info!("Console WebSocket closed for container {}", container_id);
    send_task.abort();
}

pub async fn stats_ws(
    ws: WebSocketUpgrade,
    State(docker): State<DockerService>,
    Path(id): Path<String>,
) -> Response {
    ws.on_upgrade(move |socket| handle_stats_ws(socket, docker, id))
}

async fn handle_stats_ws(socket: WebSocket, docker: DockerService, container_id: String) {
    let (mut sender, mut receiver) = socket.split();

    // Send connected message
    let connected_msg = WsMessage::Connected {
        container_id: container_id.clone(),
    };
    if let Ok(json) = serde_json::to_string(&connected_msg) {
        if sender.send(Message::Text(json.into())).await.is_err() {
            return;
        }
    }

    // Verify container exists
    if docker.get_container(&container_id).await.is_err() {
        let error_msg = WsMessage::Error(format!("Container not found: {}", container_id));
        if let Ok(json) = serde_json::to_string(&error_msg) {
            let _ = sender.send(Message::Text(json.into())).await;
        }
        return;
    }

    // Create channel for stats
    let (tx, mut rx) = broadcast::channel::<ContainerStats>(16);

    // Spawn task to stream stats from Docker
    let docker_clone = docker.clone();
    let container_id_clone = container_id.clone();
    let stats_task = tokio::spawn(async move {
        if let Err(e) = docker_clone.stream_stats(&container_id_clone, tx).await {
            error!("Stats stream error: {}", e);
        }
    });

    // Spawn task to send stats to WebSocket
    let send_task = tokio::spawn(async move {
        while let Ok(stats) = rx.recv().await {
            let ws_msg = WsMessage::Stats(stats);
            if let Ok(json) = serde_json::to_string(&ws_msg) {
                if sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
        sender
    });

    // Wait for client to close
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }

    info!("Stats WebSocket closed for container {}", container_id);
    stats_task.abort();
    send_task.abort();
}

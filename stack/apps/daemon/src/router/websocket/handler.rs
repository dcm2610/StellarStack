//! WebSocket handler implementation

use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::Response,
    Extension,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{debug, error, info, warn};

use crate::events::Event;
use crate::server::{PowerAction, Server};
use super::super::middleware::auth::{validate_websocket_token, WebsocketClaims};
use super::super::AppState;

/// WebSocket query parameters
#[derive(Debug, Deserialize)]
pub struct WsQuery {
    /// JWT token for authentication
    pub token: String,
}

/// WebSocket message structure
#[derive(Debug, Deserialize)]
pub struct WsIncoming {
    pub event: String,
    #[serde(default)]
    pub args: Vec<serde_json::Value>,
}

/// WebSocket message to send
#[derive(Debug, Serialize)]
pub struct WsOutgoing {
    pub event: String,
    pub args: Vec<serde_json::Value>,
}

impl WsOutgoing {
    pub fn new(event: &str, data: serde_json::Value) -> Self {
        Self {
            event: event.to_string(),
            args: vec![data],
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

/// WebSocket upgrade handler
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Extension(server): Extension<Arc<Server>>,
    Query(query): Query<WsQuery>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, server, query.token))
}

/// Handle WebSocket connection
async fn handle_socket(socket: WebSocket, state: AppState, server: Arc<Server>, token: String) {
    let (mut sender, mut receiver) = socket.split();

    // Validate token
    let claims = match validate_websocket_token(&token, &state.config.remote.token) {
        Ok(claims) => claims,
        Err(e) => {
            let _ = sender.send(Message::Text(
                WsOutgoing::new("jwt error", json!({ "message": e })).to_json()
            )).await;
            return;
        }
    };

    // Check server UUID matches
    if claims.server_uuid != server.uuid() {
        let _ = sender.send(Message::Text(
            WsOutgoing::new("jwt error", json!({ "message": "Server UUID mismatch" })).to_json()
        )).await;
        return;
    }

    // Check websocket permission
    if !claims.has_permission("websocket.connect") {
        let _ = sender.send(Message::Text(
            WsOutgoing::new("jwt error", json!({ "message": "Missing websocket.connect permission" })).to_json()
        )).await;
        return;
    }

    info!("WebSocket connected for server {}", server.uuid());

    // Send auth success
    let _ = sender.send(Message::Text(
        WsOutgoing::new("auth success", json!({})).to_json()
    )).await;

    // Subscribe to events
    let mut console_rx = server.console_sink().subscribe();
    let mut install_rx = server.install_sink().subscribe();
    let mut events_rx = server.events().subscribe();

    // Create handler
    let handler = WebsocketHandler {
        server: server.clone(),
        claims,
    };

    // Send initial status
    let _ = sender.send(Message::Text(
        WsOutgoing::new("status", json!({
            "state": server.process_state().to_string()
        })).to_json()
    )).await;

    // Main loop
    loop {
        tokio::select! {
            // Handle incoming messages
            Some(msg) = receiver.next() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(incoming) = serde_json::from_str::<WsIncoming>(&text) {
                            if let Some(response) = handler.handle_message(incoming).await {
                                let _ = sender.send(Message::Text(response.to_json())).await;
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        debug!("WebSocket closed for server {}", server.uuid());
                        break;
                    }
                    Ok(Message::Ping(data)) => {
                        let _ = sender.send(Message::Pong(data)).await;
                    }
                    Err(e) => {
                        warn!("WebSocket error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }

            // Forward console output
            Ok(data) = console_rx.recv() => {
                let line = String::from_utf8_lossy(&data).to_string();
                let msg = WsOutgoing::new("console output", json!({ "line": line }));
                let _ = sender.send(Message::Text(msg.to_json())).await;
            }

            // Forward install output (if permitted)
            Ok(data) = install_rx.recv() => {
                if handler.claims.has_permission("admin.websocket.install") {
                    let line = String::from_utf8_lossy(&data).to_string();
                    let msg = WsOutgoing::new("install output", json!({ "line": line }));
                    let _ = sender.send(Message::Text(msg.to_json())).await;
                }
            }

            // Forward server events
            Ok(event) = events_rx.recv() => {
                if let Some(msg) = handler.handle_event(event) {
                    let _ = sender.send(Message::Text(msg.to_json())).await;
                }
            }
        }
    }

    info!("WebSocket disconnected for server {}", server.uuid());
}

/// WebSocket handler with state
pub struct WebsocketHandler {
    server: Arc<Server>,
    claims: WebsocketClaims,
}

impl WebsocketHandler {
    /// Handle an incoming WebSocket message
    async fn handle_message(&self, msg: WsIncoming) -> Option<WsOutgoing> {
        match msg.event.as_str() {
            "set state" => {
                self.handle_set_state(&msg.args).await
            }
            "send command" => {
                self.handle_send_command(&msg.args).await
            }
            "send logs" => {
                self.handle_send_logs().await
            }
            "send stats" => {
                // Stats are sent automatically via events
                None
            }
            _ => {
                debug!("Unknown WebSocket event: {}", msg.event);
                None
            }
        }
    }

    /// Handle power state change request
    async fn handle_set_state(&self, args: &[serde_json::Value]) -> Option<WsOutgoing> {
        let action_str = args.get(0)?.as_str()?;

        let permission = match action_str {
            "start" => "control.start",
            "stop" | "kill" => "control.stop",
            "restart" => "control.restart",
            _ => return None,
        };

        if !self.claims.has_permission(permission) {
            return Some(WsOutgoing::new("error", json!({
                "message": format!("Missing permission: {}", permission)
            })));
        }

        let action = PowerAction::from_str(action_str)?;

        // Execute power action in background
        let server = self.server.clone();
        tokio::spawn(async move {
            if let Err(e) = server.handle_power_action(action, true).await {
                error!("Power action failed: {}", e);
            }
        });

        None
    }

    /// Handle send command request
    async fn handle_send_command(&self, args: &[serde_json::Value]) -> Option<WsOutgoing> {
        if !self.claims.has_permission("control.console") {
            return Some(WsOutgoing::new("error", json!({
                "message": "Missing permission: control.console"
            })));
        }

        let command = args.get(0)?.as_str()?;

        if let Err(e) = self.server.send_command(command).await {
            return Some(WsOutgoing::new("error", json!({
                "message": format!("Failed to send command: {}", e)
            })));
        }

        None
    }

    /// Handle send logs request
    async fn handle_send_logs(&self) -> Option<WsOutgoing> {
        // This would need to read recent logs from the container
        // For now, just acknowledge the request
        None
    }

    /// Convert a server event to WebSocket message
    fn handle_event(&self, event: Event) -> Option<WsOutgoing> {
        match event {
            Event::StateChange(state) => {
                Some(WsOutgoing::new("status", json!({
                    "state": state.to_string()
                })))
            }

            Event::Stats(stats) => {
                Some(WsOutgoing::new("stats", json!({
                    "memory_bytes": stats.memory_bytes,
                    "memory_limit_bytes": stats.memory_limit_bytes,
                    "cpu_absolute": stats.cpu_absolute,
                    "network": {
                        "rx_bytes": stats.network.rx_bytes,
                        "tx_bytes": stats.network.tx_bytes,
                    },
                    "uptime": stats.uptime,
                })))
            }

            Event::ConsoleOutput(_) => {
                // Handled separately via console_sink
                None
            }

            Event::InstallStarted => {
                if self.claims.has_permission("admin.websocket.install") {
                    Some(WsOutgoing::new("install started", json!({})))
                } else {
                    None
                }
            }

            Event::InstallCompleted { successful } => {
                Some(WsOutgoing::new("install completed", json!({
                    "successful": successful
                })))
            }

            Event::InstallOutput(_) => {
                // Handled separately via install_sink
                None
            }

            Event::BackupStarted { uuid } => {
                Some(WsOutgoing::new("backup started", json!({
                    "uuid": uuid
                })))
            }

            Event::BackupCompleted { uuid, successful, checksum, size } => {
                Some(WsOutgoing::new("backup completed", json!({
                    "uuid": uuid,
                    "successful": successful,
                    "checksum": checksum,
                    "size": size,
                })))
            }

            Event::BackupRestoreStarted { uuid } => {
                Some(WsOutgoing::new("backup restore started", json!({
                    "uuid": uuid
                })))
            }

            Event::BackupRestoreCompleted { uuid, successful } => {
                Some(WsOutgoing::new("backup restore completed", json!({
                    "uuid": uuid,
                    "successful": successful,
                })))
            }

            Event::TransferStarted => {
                Some(WsOutgoing::new("transfer started", json!({})))
            }

            Event::TransferProgress { progress } => {
                Some(WsOutgoing::new("transfer progress", json!({
                    "progress": progress
                })))
            }

            Event::TransferCompleted { successful } => {
                Some(WsOutgoing::new("transfer completed", json!({
                    "successful": successful
                })))
            }

            _ => None,
        }
    }
}

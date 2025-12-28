//! Server management handlers

use std::sync::Arc;

use axum::{
    extract::State,
    Extension, Json,
};
use serde::{Deserialize, Serialize};

use crate::server::{PowerAction, Server, ServerConfig};
use super::super::AppState;
use super::ApiError;

/// Server list response
#[derive(Debug, Serialize)]
pub struct ServerListResponse {
    pub servers: Vec<ServerSummary>,
}

/// Server summary for list
#[derive(Debug, Serialize)]
pub struct ServerSummary {
    pub uuid: String,
    pub name: String,
    pub state: String,
    pub is_installing: bool,
    pub is_transferring: bool,
    pub is_restoring: bool,
    pub suspended: bool,
}

/// Full server response
#[derive(Debug, Serialize)]
pub struct ServerResponse {
    pub uuid: String,
    pub name: String,
    pub state: String,
    pub is_installing: bool,
    pub is_transferring: bool,
    pub is_restoring: bool,
    pub suspended: bool,
    pub invocation: String,
    pub container: ContainerInfo,
}

#[derive(Debug, Serialize)]
pub struct ContainerInfo {
    pub image: String,
}

impl From<&Server> for ServerSummary {
    fn from(server: &Server) -> Self {
        let config = server.config();
        Self {
            uuid: config.uuid.clone(),
            name: config.name.clone(),
            state: server.process_state().to_string(),
            is_installing: server.is_installing(),
            is_transferring: server.is_transferring(),
            is_restoring: server.is_restoring(),
            suspended: config.suspended,
        }
    }
}

impl From<&Server> for ServerResponse {
    fn from(server: &Server) -> Self {
        let config = server.config();
        Self {
            uuid: config.uuid.clone(),
            name: config.name.clone(),
            state: server.process_state().to_string(),
            is_installing: server.is_installing(),
            is_transferring: server.is_transferring(),
            is_restoring: server.is_restoring(),
            suspended: config.suspended,
            invocation: config.invocation.clone(),
            container: ContainerInfo {
                image: config.container.image.clone(),
            },
        }
    }
}

/// List all servers
pub async fn list_servers(State(state): State<AppState>) -> Json<ServerListResponse> {
    let servers: Vec<ServerSummary> = state
        .manager
        .all()
        .iter()
        .map(|s| ServerSummary::from(s.as_ref()))
        .collect();

    Json(ServerListResponse { servers })
}

/// Create a new server
#[derive(Debug, Deserialize)]
pub struct CreateServerRequest {
    pub uuid: String,
    pub name: String,
    pub suspended: bool,
    pub invocation: String,
    pub skip_egg_scripts: bool,
    pub build: BuildConfigRequest,
    pub container: ContainerConfigRequest,
    pub allocations: AllocationsConfigRequest,
    pub egg: EggConfigRequest,
    #[serde(default)]
    pub mounts: Vec<MountConfigRequest>,
    #[serde(default)]
    pub process_configuration: Option<ProcessConfigRequest>,
}

#[derive(Debug, Deserialize, Default)]
pub struct ProcessConfigRequest {
    #[serde(default)]
    pub startup: StartupConfigRequest,
    #[serde(default)]
    pub stop: StopConfigRequest,
    #[serde(default)]
    pub configs: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize, Default)]
pub struct StartupConfigRequest {
    #[serde(default)]
    pub done: Vec<String>,
    #[serde(default)]
    pub user_interaction: Vec<String>,
    #[serde(default)]
    pub strip_ansi: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StopConfigRequest {
    Signal { value: String },
    Command { value: String },
    #[serde(other)]
    None,
}

impl Default for StopConfigRequest {
    fn default() -> Self {
        StopConfigRequest::Signal { value: "SIGTERM".to_string() }
    }
}

#[derive(Debug, Deserialize)]
pub struct BuildConfigRequest {
    pub memory_limit: i64,
    pub swap: i64,
    pub io_weight: u32,
    pub cpu_limit: i64,
    pub disk_space: i64,
    #[serde(default)]
    pub oom_disabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct ContainerConfigRequest {
    pub image: String,
    #[serde(default)]
    pub oom_disabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct AllocationsConfigRequest {
    pub default: AllocationRequest,
    #[serde(default)]
    pub mappings: std::collections::HashMap<String, Vec<u16>>,
}

#[derive(Debug, Deserialize)]
pub struct AllocationRequest {
    pub ip: String,
    pub port: u16,
}

#[derive(Debug, Deserialize)]
pub struct EggConfigRequest {
    pub id: String,
    #[serde(default)]
    pub file_denylist: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct MountConfigRequest {
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub read_only: bool,
}

pub async fn create_server(
    State(state): State<AppState>,
    Json(request): Json<CreateServerRequest>,
) -> Result<Json<ServerResponse>, ApiError> {
    // Build environment variables first (before values are moved)
    let environment = {
        let mut env = std::collections::HashMap::new();
        // Set standard environment variables required by Pterodactyl-compatible images
        env.insert("STARTUP".to_string(), request.invocation.clone());
        env.insert("SERVER_IP".to_string(), request.allocations.default.ip.clone());
        env.insert("SERVER_PORT".to_string(), request.allocations.default.port.to_string());
        env.insert("P_SERVER_UUID".to_string(), request.uuid.clone());
        env
    };

    // Build server config
    let config = ServerConfig {
        uuid: request.uuid,
        name: request.name,
        suspended: request.suspended,
        invocation: request.invocation,
        skip_egg_scripts: request.skip_egg_scripts,
        build: crate::server::BuildConfig {
            memory_limit: request.build.memory_limit,
            swap: request.build.swap,
            io_weight: request.build.io_weight,
            cpu_limit: request.build.cpu_limit,
            threads: None,
            disk_space: request.build.disk_space,
            oom_disabled: request.build.oom_disabled,
        },
        container: crate::server::ContainerConfig {
            image: request.container.image,
            oom_disabled: request.container.oom_disabled,
            requires_rebuild: false,
        },
        allocations: crate::server::AllocationsConfig {
            default: crate::server::Allocation {
                ip: request.allocations.default.ip,
                port: request.allocations.default.port,
            },
            mappings: request.allocations.mappings,
        },
        egg: crate::server::EggConfig {
            id: request.egg.id,
            file_denylist: request.egg.file_denylist,
            fix_permissions: false,
        },
        mounts: request.mounts.into_iter().map(|m| crate::server::MountConfig {
            source: m.source,
            target: m.target,
            read_only: m.read_only,
        }).collect(),
        process: match request.process_configuration {
            Some(pc) => crate::server::ProcessConfig {
                startup: crate::server::StartupConfig {
                    done: pc.startup.done,
                    user_interaction: pc.startup.user_interaction,
                    strip_ansi: pc.startup.strip_ansi,
                },
                stop: match pc.stop {
                    StopConfigRequest::Signal { value } => crate::server::StopConfig::Signal { value },
                    StopConfigRequest::Command { value } => crate::server::StopConfig::Command { value },
                    StopConfigRequest::None => crate::server::StopConfig::None,
                },
                configs: Vec::new(),
            },
            None => crate::server::ProcessConfig::default(),
        },
        environment,
    };

    let server = state.manager.add(config).await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ServerResponse::from(server.as_ref())))
}

/// Get a single server
pub async fn get_server(
    Extension(server): Extension<Arc<Server>>,
) -> Json<ServerResponse> {
    Json(ServerResponse::from(server.as_ref()))
}

/// Delete a server
pub async fn delete_server(
    State(state): State<AppState>,
    Extension(server): Extension<Arc<Server>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let uuid = server.uuid();

    state.manager.remove(&uuid).await;

    Ok(Json(serde_json::json!({
        "success": true
    })))
}

/// Power action request
#[derive(Debug, Deserialize)]
pub struct PowerActionRequest {
    pub action: String,
    #[serde(default)]
    pub wait_for_lock: bool,
}

/// Execute a power action
pub async fn power_action(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<PowerActionRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    tracing::info!("Power action request: {:?} for server {}", request.action, server.uuid());

    let action = PowerAction::from_str(&request.action)
        .ok_or_else(|| ApiError::bad_request(format!("Invalid action: {}", request.action)))?;

    tracing::info!("Executing power action: {:?}, is_installing: {}, is_busy: {}",
        action, server.is_installing(), server.is_busy());

    match server.handle_power_action(action, request.wait_for_lock).await {
        Ok(_) => {
            tracing::info!("Power action {:?} succeeded for {}", action, server.uuid());
            Ok(Json(serde_json::json!({
                "success": true
            })))
        }
        Err(e) => {
            tracing::error!("Power action {:?} failed for {}: {}", action, server.uuid(), e);
            Err(e.into())
        }
    }
}

/// Send command request
#[derive(Debug, Deserialize)]
pub struct SendCommandRequest {
    pub command: String,
}

/// Send a command to the server console
pub async fn send_command(
    Extension(server): Extension<Arc<Server>>,
    Json(request): Json<SendCommandRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    tracing::info!("Sending command to server {}: {}", server.uuid(), request.command);

    match server.send_command(&request.command).await {
        Ok(_) => {
            tracing::info!("Command sent successfully to {}", server.uuid());
            Ok(Json(serde_json::json!({
                "success": true
            })))
        }
        Err(e) => {
            tracing::error!("Failed to send command to {}: {}", server.uuid(), e);
            Err(e.into())
        }
    }
}

/// Get server logs
pub async fn get_logs(
    Extension(_server): Extension<Arc<Server>>,
) -> Result<Json<Vec<String>>, ApiError> {
    // Get last 100 lines
    // This would need access to the environment's read_log method
    // For now, return empty
    Ok(Json(vec![]))
}

/// Install server
pub async fn install_server(
    Extension(server): Extension<Arc<Server>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Run installation in background
    let server_clone = server.clone();
    tokio::spawn(async move {
        if let Err(e) = server_clone.install(false).await {
            tracing::error!("Installation failed: {}", e);
        }
    });

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Installation started"
    })))
}

/// Reinstall server
pub async fn reinstall_server(
    Extension(server): Extension<Arc<Server>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let server_clone = server.clone();
    tokio::spawn(async move {
        if let Err(e) = server_clone.install(true).await {
            tracing::error!("Reinstallation failed: {}", e);
        }
    });

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Reinstallation started"
    })))
}

/// Sync server with panel
pub async fn sync_server(
    Extension(server): Extension<Arc<Server>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    server.sync().await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true
    })))
}

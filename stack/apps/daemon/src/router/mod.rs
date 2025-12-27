//! HTTP router module
//!
//! Provides the REST API for server management, file operations,
//! backups, and WebSocket connections.

mod handlers;
mod middleware;
mod websocket;

pub use handlers::*;
pub use middleware::*;
pub use websocket::WebsocketHandler;

use std::sync::Arc;

use axum::{
    Router,
    routing::{get, post, delete},
};
use tower_http::{
    cors::{CorsLayer, Any},
    trace::TraceLayer,
};

use crate::api::HttpClient;
use crate::config::Configuration;
use crate::server::Manager;

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    /// Server manager
    pub manager: Arc<Manager>,

    /// API client for panel communication
    pub api_client: Arc<HttpClient>,

    /// Global configuration
    pub config: Arc<Configuration>,
}

/// Build the HTTP router with all routes
pub fn build_router(state: AppState) -> Router {
    let api_routes = Router::new()
        // System routes
        .route("/system", get(handlers::system::system_info))

        // Server collection routes
        .route("/servers", get(handlers::servers::list_servers))
        .route("/servers", post(handlers::servers::create_server))

        // Individual server routes
        .nest("/servers/:server_id", server_routes())

        // Apply auth middleware to all API routes
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::require_auth,
        ));

    Router::new()
        // API routes (protected)
        .nest("/api", api_routes)

        // Public routes (file downloads with token auth)
        .route("/download/backup", get(handlers::download::download_backup))
        .route("/download/file", get(handlers::download::download_file))

        // Upload route
        .route("/upload/file", post(handlers::upload::upload_file))

        // Apply global middleware
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state)
}

/// Routes for individual server operations
fn server_routes() -> Router<AppState> {
    Router::new()
        // Server info
        .route("/", get(handlers::servers::get_server))
        .route("/", delete(handlers::servers::delete_server))

        // Power operations
        .route("/power", post(handlers::servers::power_action))

        // Console
        .route("/commands", post(handlers::servers::send_command))
        .route("/logs", get(handlers::servers::get_logs))

        // Installation
        .route("/install", post(handlers::servers::install_server))
        .route("/reinstall", post(handlers::servers::reinstall_server))

        // Sync
        .route("/sync", post(handlers::servers::sync_server))

        // WebSocket
        .route("/ws", get(websocket::ws_handler))

        // File routes
        .nest("/files", file_routes())

        // Backup routes
        .nest("/backup", backup_routes())
        // Note: Server extraction is handled in individual handlers via Path
}

/// Routes for file operations
fn file_routes() -> Router<AppState> {
    Router::new()
        .route("/list", get(handlers::files::list_files))
        .route("/contents", get(handlers::files::read_file))
        .route("/write", post(handlers::files::write_file))
        .route("/create-directory", post(handlers::files::create_directory))
        .route("/rename", post(handlers::files::rename_file))
        .route("/copy", post(handlers::files::copy_file))
        .route("/delete", delete(handlers::files::delete_files))
        .route("/compress", post(handlers::files::compress_files))
        .route("/decompress", post(handlers::files::decompress_file))
        .route("/chmod", post(handlers::files::chmod_file))
}

/// Routes for backup operations
fn backup_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::backup::list_backups))
        .route("/", post(handlers::backup::create_backup))
        .route("/restore", post(handlers::backup::restore_backup))
        .route("/:backup_id", delete(handlers::backup::delete_backup))
}

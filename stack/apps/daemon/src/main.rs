use axum::{
    extract::FromRef,
    routing::{delete, get, patch, post},
    Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use stellar_daemon::{routes, Config, DockerService, SchedulerService};

#[derive(Clone)]
pub struct AppState {
    pub docker: DockerService,
    pub scheduler: Arc<SchedulerService>,
}

// Allow extracting DockerService from AppState
impl FromRef<AppState> for DockerService {
    fn from_ref(state: &AppState) -> Self {
        state.docker.clone()
    }
}

// Allow extracting SchedulerService from AppState
impl FromRef<AppState> for Arc<SchedulerService> {
    fn from_ref(state: &AppState) -> Self {
        state.scheduler.clone()
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file if present
    let _ = dotenvy::dotenv();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "stellar_daemon=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load config
    let config = Config::from_env();
    info!("Starting daemon on {}", config.address());

    // Initialize Docker service
    let docker = match &config.docker_socket {
        Some(socket) => DockerService::with_socket(socket)?,
        None => DockerService::new()?,
    };

    // Verify Docker connection
    docker.ping().await?;
    info!("Connected to Docker daemon");

    // Initialize Scheduler service
    let scheduler = SchedulerService::new(docker.clone()).await?;
    info!("Scheduler initialized");

    // Create app state
    let state = AppState {
        docker,
        scheduler: Arc::new(scheduler),
    };

    // Build CORS layer
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build router
    let app = Router::new()
        // Health check
        .route("/health", get(routes::health))
        // Container management
        .route("/containers", get(routes::list_containers))
        .route("/containers", post(routes::create_container))
        .route("/containers/{id}", get(routes::get_container))
        .route("/containers/{id}", delete(routes::remove_container))
        .route("/containers/{id}/start", post(routes::start_container))
        .route("/containers/{id}/stop", post(routes::stop_container))
        .route("/containers/{id}/restart", post(routes::restart_container))
        .route("/containers/{id}/kill", post(routes::kill_container))
        .route("/containers/{id}/stats", get(routes::get_container_stats))
        .route("/containers/{id}/logs", get(routes::get_container_logs))
        // WebSocket endpoints
        .route("/containers/{id}/console", get(routes::console_ws))
        .route("/containers/{id}/stats/ws", get(routes::stats_ws))
        // File management endpoints
        .route("/containers/{id}/files", get(routes::list_files))
        .route("/containers/{id}/files/read", get(routes::get_file))
        .route("/containers/{id}/files/download", get(routes::download_file))
        .route("/containers/{id}/files/write", post(routes::write_file))
        .route("/containers/{id}/files/create", post(routes::create_item))
        .route("/containers/{id}/files/delete", delete(routes::delete_item))
        .route("/containers/{id}/files/rename", post(routes::rename_item))
        .route("/containers/{id}/files/archive", post(routes::create_archive))
        .route("/containers/{id}/files/extract", post(routes::extract_archive))
        .route("/containers/{id}/files/upload/{*path}", post(routes::upload_file))
        // Backup endpoints
        .route("/containers/{id}/backups", get(routes::list_backups))
        .route("/containers/{id}/backups", post(routes::create_backup))
        .route("/containers/{id}/backups/download", get(routes::download_backup))
        .route("/containers/{id}/backups/restore", post(routes::restore_backup))
        .route("/containers/{id}/backups/delete", delete(routes::delete_backup))
        .route("/containers/{id}/backups/lock", patch(routes::lock_backup))
        // Schedule endpoints
        .route("/containers/{id}/schedules", get(routes::list_schedules))
        .route("/containers/{id}/schedules", post(routes::create_schedule))
        .route("/containers/{id}/schedules/{schedule_id}", get(routes::get_schedule))
        .route("/containers/{id}/schedules/{schedule_id}", patch(routes::update_schedule))
        .route("/containers/{id}/schedules/{schedule_id}", delete(routes::delete_schedule))
        .route("/containers/{id}/schedules/{schedule_id}/run", post(routes::run_schedule))
        // Middleware
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    // Start server
    let listener = tokio::net::TcpListener::bind(config.address()).await?;
    info!("Listening on {}", config.address());

    axum::serve(listener, app).await?;

    Ok(())
}

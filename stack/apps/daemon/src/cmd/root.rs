//! Main daemon command - starts the daemon server

use std::sync::Arc;
use std::time::Duration;
use anyhow::Result;
use tracing::{info, warn, error, debug};
use tokio_util::sync::CancellationToken;

use stellar_daemon::config::Configuration;
use stellar_daemon::api::HttpClient;
use stellar_daemon::server::Manager;
use stellar_daemon::router::{self, AppState};

/// Run the main daemon
pub async fn run(config_path: &str) -> Result<()> {
    // Load configuration
    info!("Loading configuration from: {}", config_path);
    let config = Configuration::load(config_path)?;
    let config = Arc::new(config);

    info!("Configuration loaded successfully");
    info!("  API: {}:{}", config.api.host, config.api.port);
    info!("  Data directory: {}", config.system.data_directory.display());
    info!("  Panel URL: {}", config.remote.url);

    // Create API client
    let api_client = Arc::new(HttpClient::new(&config.remote)?);

    // Initialize server manager (fetches servers from panel)
    info!("Initializing server manager...");
    let manager = Arc::new(Manager::new(api_client.clone(), config.clone()));

    // Load servers from panel
    if let Err(e) = manager.initialize().await {
        error!("Failed to initialize server manager: {}", e);
        return Err(e.into());
    }
    info!("Loaded {} servers", manager.count());

    // Sync container statuses to panel (important after daemon restart)
    manager.sync_all_statuses().await;

    // Build the HTTP router
    let state = AppState {
        manager: manager.clone(),
        api_client: api_client.clone(),
        config: config.clone(),
    };
    let app = router::build_router(state);

    // Create shutdown token for background tasks
    let shutdown_token = CancellationToken::new();

    // Start periodic status sync task (every 30 seconds)
    let sync_manager = manager.clone();
    let sync_token = shutdown_token.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        interval.tick().await; // Skip first immediate tick

        loop {
            tokio::select! {
                _ = sync_token.cancelled() => {
                    debug!("Periodic status sync task stopped");
                    return;
                }
                _ = interval.tick() => {
                    debug!("Running periodic status sync...");
                    // Use lightweight report_all_statuses instead of sync_all_statuses
                    // to avoid re-attaching to containers on every tick
                    sync_manager.report_all_statuses().await;
                }
            }
        }
    });
    info!("Started periodic status sync (every 30s)");

    // TODO: Start the SFTP server if enabled
    // if config.sftp.enabled {
    //     let sftp_config = config.sftp.clone();
    //     let sftp_manager = manager.clone();
    //     let sftp_client = api_client.clone();
    //
    //     tokio::spawn(async move {
    //         info!("Starting SFTP server on {}:{}", sftp_config.bind_address, sftp_config.bind_port);
    //         // SFTP server implementation pending
    //     });
    // }

    // Start the HTTP server
    let bind_addr = format!("{}:{}", config.api.host, config.api.port);
    info!("Starting HTTP server on {}", bind_addr);

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;

    // Handle graceful shutdown
    let manager_shutdown = manager.clone();
    let shutdown_signal = async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install CTRL+C handler");
        warn!("Received shutdown signal, stopping servers...");

        // Cancel background tasks
        shutdown_token.cancel();

        // Gracefully stop all servers
        manager_shutdown.shutdown().await;
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    info!("Daemon stopped");
    Ok(())
}

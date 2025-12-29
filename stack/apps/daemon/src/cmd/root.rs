//! Main daemon command - starts the daemon server

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use anyhow::Result;
use axum_server::tls_rustls::RustlsConfig;
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

    // Start the HTTP/HTTPS server
    let bind_addr: SocketAddr = format!("{}:{}", config.api.host, config.api.port)
        .parse()
        .expect("Invalid bind address");

    // Handle graceful shutdown
    let manager_shutdown = manager.clone();
    let shutdown_token_clone = shutdown_token.clone();
    let handle = axum_server::Handle::new();
    let shutdown_handle = handle.clone();

    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install CTRL+C handler");
        warn!("Received shutdown signal, stopping servers...");

        // Cancel background tasks
        shutdown_token_clone.cancel();

        // Gracefully stop all servers
        manager_shutdown.shutdown().await;

        // Shutdown the HTTP server
        shutdown_handle.graceful_shutdown(Some(Duration::from_secs(10)));
    });

    // Check if SSL is enabled
    if config.api.ssl.enabled {
        info!("Starting HTTPS server on {} (SSL enabled)", bind_addr);
        info!("  Certificate: {}", config.api.ssl.cert);
        info!("  Key: {}", config.api.ssl.key);

        // Load TLS configuration
        let tls_config = RustlsConfig::from_pem_file(&config.api.ssl.cert, &config.api.ssl.key)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to load TLS config: {}", e))?;

        axum_server::bind_rustls(bind_addr, tls_config)
            .handle(handle)
            .serve(app.into_make_service())
            .await?;
    } else {
        info!("Starting HTTP server on {} (SSL disabled)", bind_addr);

        axum_server::bind(bind_addr)
            .handle(handle)
            .serve(app.into_make_service())
            .await?;
    }

    info!("Daemon stopped");
    Ok(())
}

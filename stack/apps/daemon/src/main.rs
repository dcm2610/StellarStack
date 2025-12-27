//! StellarStack Daemon - Wings-inspired Docker container management
//!
//! This daemon manages Docker containers for game servers and applications,
//! providing a robust API for server lifecycle management, file operations,
//! console access, and real-time statistics.

use anyhow::Result;
use clap::Parser;
use tracing::{info, error};

mod cmd;

#[derive(Parser)]
#[command(name = "stellar-daemon")]
#[command(about = "StellarStack Docker container management daemon")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Option<cmd::Commands>,

    /// Path to configuration file
    #[arg(short, long, default_value = "config.yml")]
    config: String,

    /// Enable debug logging
    #[arg(short, long)]
    debug: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    let log_level = if cli.debug { "debug" } else { "info" };
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| format!("stellar_daemon={}", log_level).into()),
        )
        .init();

    info!("Starting StellarStack Daemon v{}", env!("CARGO_PKG_VERSION"));

    match cli.command {
        Some(cmd::Commands::Configure) => {
            cmd::configure::run().await?;
        }
        Some(cmd::Commands::Diagnostics) => {
            cmd::diagnostics::run().await?;
        }
        None => {
            // Default: run the daemon
            if let Err(e) = cmd::root::run(&cli.config).await {
                error!("Daemon error: {}", e);
                std::process::exit(1);
            }
        }
    }

    Ok(())
}

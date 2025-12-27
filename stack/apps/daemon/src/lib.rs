//! StellarStack Daemon Library
//!
//! This library provides the core functionality for the StellarStack daemon,
//! following Pterodactyl Wings architectural patterns.

pub mod api;
pub mod backup;
pub mod config;
pub mod cron;
pub mod database;
pub mod environment;
pub mod events;
pub mod filesystem;
pub mod parser;
pub mod router;
pub mod server;
pub mod sftp;
pub mod system;

// Re-export commonly used types
pub use config::Configuration;
pub use server::{Server, Manager};
pub use events::EventBus;

//! SFTP server module
//!
//! Provides an embedded SFTP server for file management using russh.

mod auth;
mod handler;
mod server;

pub use auth::{SftpAuthenticator, SftpUser};
pub use handler::SftpFileHandler;
pub use server::{SftpConfig, SftpServer};

use std::sync::Arc;
use thiserror::Error;

use crate::api::HttpClient;
use crate::server::Manager;

/// SFTP errors
#[derive(Debug, Error)]
pub enum SftpError {
    #[error("SSH error: {0}")]
    Ssh(String),

    #[error("Authentication failed: {0}")]
    AuthFailed(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Server not found: {0}")]
    ServerNotFound(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("API error: {0}")]
    Api(#[from] crate::api::ApiError),

    #[error("{0}")]
    Other(String),
}

pub type SftpResult<T> = Result<T, SftpError>;

/// Start the SFTP server
pub async fn start_server(
    config: crate::config::SftpConfiguration,
    manager: Arc<Manager>,
    api_client: Arc<HttpClient>,
) -> SftpResult<()> {
    let sftp_config = SftpConfig {
        bind_address: config.bind_address,
        bind_port: config.bind_port,
        read_only: config.read_only,
    };

    let server = SftpServer::new(sftp_config, manager, api_client)?;
    server.run().await
}

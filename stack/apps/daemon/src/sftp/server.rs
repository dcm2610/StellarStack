//! SFTP/SSH server implementation
//!
//! Placeholder implementation - full SFTP support to be implemented

use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::{error, info};

use crate::api::HttpClient;
use crate::server::Manager;
use super::auth::SftpAuthenticator;
use super::SftpResult;

/// SFTP server configuration
#[derive(Debug, Clone)]
pub struct SftpConfig {
    pub bind_address: String,
    pub bind_port: u16,
    pub read_only: bool,
}

impl Default for SftpConfig {
    fn default() -> Self {
        Self {
            bind_address: "0.0.0.0".to_string(),
            bind_port: 2022,
            read_only: false,
        }
    }
}

/// SFTP server (placeholder)
pub struct SftpServer {
    config: SftpConfig,
    #[allow(dead_code)]
    manager: Arc<Manager>,
    #[allow(dead_code)]
    authenticator: Arc<SftpAuthenticator>,
}

impl SftpServer {
    /// Create a new SFTP server
    pub fn new(
        config: SftpConfig,
        manager: Arc<Manager>,
        api_client: Arc<HttpClient>,
    ) -> SftpResult<Self> {
        let authenticator = Arc::new(SftpAuthenticator::new(api_client, manager.clone()));

        Ok(Self {
            config,
            manager,
            authenticator,
        })
    }

    /// Run the SFTP server
    ///
    /// Note: This is a placeholder. Full SFTP implementation requires
    /// proper russh integration which will be completed in a future update.
    pub async fn run(self) -> SftpResult<()> {
        let bind_addr = format!("{}:{}", self.config.bind_address, self.config.bind_port);

        info!("Starting SFTP server on {} (placeholder - not fully implemented)", bind_addr);

        let listener = TcpListener::bind(&bind_addr).await?;

        loop {
            match listener.accept().await {
                Ok((_socket, peer_addr)) => {
                    // TODO: Implement full SSH/SFTP handling with russh
                    // For now, just log the connection and close it
                    info!("SFTP connection from {} (not yet implemented)", peer_addr);
                }
                Err(e) => {
                    error!("Failed to accept SFTP connection: {}", e);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sftp_config_default() {
        let config = SftpConfig::default();
        assert_eq!(config.bind_address, "0.0.0.0");
        assert_eq!(config.bind_port, 2022);
        assert!(!config.read_only);
    }
}

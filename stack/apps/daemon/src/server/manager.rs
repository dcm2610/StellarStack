//! Server manager - collection of servers

use std::sync::Arc;

use dashmap::DashMap;
use tokio::sync::Semaphore;
use tracing::{debug, error, info, warn};

use crate::api::HttpClient;
use crate::config::Configuration;

use super::configuration::ServerConfig;
use super::server::Server;

/// Manager for all servers on this node
pub struct Manager {
    /// Map of server UUID to Server instance
    servers: DashMap<String, Arc<Server>>,

    /// API client for panel communication
    api_client: Arc<HttpClient>,

    /// Global configuration
    config: Arc<Configuration>,
}

impl Manager {
    /// Create a new server manager
    pub fn new(api_client: Arc<HttpClient>, config: Arc<Configuration>) -> Self {
        Self {
            servers: DashMap::new(),
            api_client,
            config,
        }
    }

    /// Initialize the manager by loading servers from the panel
    pub async fn initialize(&self) -> Result<(), ManagerError> {
        info!("Initializing server manager...");

        // Fetch servers from panel
        let server_data = self.api_client
            .get_servers(self.config.remote.boot_servers_per_page)
            .await
            .map_err(|e| ManagerError::Api(e.to_string()))?;

        info!("Loaded {} servers from panel", server_data.len());

        // Initialize servers in parallel (limited concurrency)
        let semaphore = Arc::new(Semaphore::new(num_cpus::get()));
        let mut handles = Vec::new();

        for data in server_data {
            let permit = semaphore.clone().acquire_owned().await
                .map_err(|_| ManagerError::Other("Semaphore closed".into()))?;

            let api_client = self.api_client.clone();
            let config = self.config.clone();

            handles.push(tokio::spawn(async move {
                let _permit = permit;

                let server_config = ServerConfig::from_api(&data.settings);
                let uuid = server_config.uuid.clone();

                match Server::new(
                    server_config,
                    &config.system,
                    &config.docker,
                    api_client,
                ) {
                    Ok(server) => {
                        debug!("Initialized server {}", uuid);
                        Some((uuid, Arc::new(server)))
                    }
                    Err(e) => {
                        error!("Failed to initialize server {}: {}", uuid, e);
                        None
                    }
                }
            }));
        }

        // Collect results
        let mut initialized = 0;
        for handle in handles {
            if let Ok(Some((uuid, server))) = handle.await {
                self.servers.insert(uuid, server);
                initialized += 1;
            }
        }

        info!("Successfully initialized {} servers", initialized);
        Ok(())
    }

    /// Get a server by UUID
    pub fn get(&self, uuid: &str) -> Option<Arc<Server>> {
        self.servers.get(uuid).map(|r| r.value().clone())
    }

    /// Get all servers
    pub fn all(&self) -> Vec<Arc<Server>> {
        self.servers.iter().map(|r| r.value().clone()).collect()
    }

    /// Get all server UUIDs
    pub fn uuids(&self) -> Vec<String> {
        self.servers.iter().map(|r| r.key().clone()).collect()
    }

    /// Get the number of servers
    pub fn count(&self) -> usize {
        self.servers.len()
    }

    /// Check if a server exists
    pub fn exists(&self, uuid: &str) -> bool {
        self.servers.contains_key(uuid)
    }

    /// Add a new server
    pub async fn add(&self, config: ServerConfig) -> Result<Arc<Server>, ManagerError> {
        let uuid = config.uuid.clone();

        if self.exists(&uuid) {
            return Err(ManagerError::AlreadyExists(uuid));
        }

        let server = Server::new(
            config,
            &self.config.system,
            &self.config.docker,
            self.api_client.clone(),
        ).map_err(|e| ManagerError::Server(e.to_string()))?;

        let server = Arc::new(server);
        self.servers.insert(uuid.clone(), server.clone());

        info!("Added server {}", uuid);
        Ok(server)
    }

    /// Remove a server
    pub async fn remove(&self, uuid: &str) -> Option<Arc<Server>> {
        if let Some((_, server)) = self.servers.remove(uuid) {
            // Cleanup
            if let Err(e) = server.destroy().await {
                warn!("Error destroying server {}: {}", uuid, e);
            }

            info!("Removed server {}", uuid);
            Some(server)
        } else {
            None
        }
    }

    /// Sync all servers with panel
    pub async fn sync_all(&self) {
        for server in self.all() {
            if let Err(e) = server.sync().await {
                warn!("Failed to sync server {}: {}", server.uuid(), e);
            }
        }
    }

    /// Reload server configuration
    pub async fn reload_server(&self, uuid: &str) -> Result<(), ManagerError> {
        let server = self.get(uuid)
            .ok_or_else(|| ManagerError::NotFound(uuid.to_string()))?;

        server.sync().await
            .map_err(|e| ManagerError::Server(e.to_string()))
    }

    /// Get global configuration
    pub fn config(&self) -> &Configuration {
        &self.config
    }

    /// Shutdown all servers gracefully
    pub async fn shutdown(&self) {
        info!("Shutting down all servers...");

        // Stop all running servers
        for server in self.all() {
            let uuid = server.uuid();
            if server.process_state() != crate::events::ProcessState::Offline {
                debug!("Stopping server {}", uuid);
                if let Err(e) = server.handle_power_action(
                    super::PowerAction::Stop,
                    true,
                ).await {
                    warn!("Error stopping server {}: {}", uuid, e);
                }
            }
        }

        info!("All servers stopped");
    }
}

/// Manager errors
#[derive(Debug, thiserror::Error)]
pub enum ManagerError {
    #[error("Server not found: {0}")]
    NotFound(String),

    #[error("Server already exists: {0}")]
    AlreadyExists(String),

    #[error("API error: {0}")]
    Api(String),

    #[error("Server error: {0}")]
    Server(String),

    #[error("{0}")]
    Other(String),
}

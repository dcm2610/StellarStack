//! SSH/SFTP server implementation using russh
//!
//! Provides a fully functional SFTP server for file management.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use parking_lot::RwLock;
use russh::server::{Auth, Msg, Handler, Session};
use russh::{Channel, ChannelId, CryptoVec};
use russh_keys::key::KeyPair;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

use crate::api::HttpClient;
use crate::filesystem::Filesystem;
use crate::server::Manager;

use super::auth::{SftpAuthenticator, SftpUser};
use super::handler::SftpFileHandler;
use super::{SftpError, SftpResult};

/// SFTP server configuration
#[derive(Debug, Clone)]
pub struct SftpConfig {
    pub bind_address: String,
    pub bind_port: u16,
    pub read_only: bool,
    pub host_key_path: PathBuf,
}

impl Default for SftpConfig {
    fn default() -> Self {
        Self {
            bind_address: "0.0.0.0".to_string(),
            bind_port: 2022,
            read_only: false,
            host_key_path: PathBuf::from("/opt/stellar-daemon/ssh_host_key"),
        }
    }
}

/// SSH/SFTP server
pub struct SftpServer {
    config: SftpConfig,
    manager: Arc<Manager>,
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

    /// Load or generate SSH host key
    fn load_or_generate_key(&self) -> SftpResult<KeyPair> {
        let key_path = &self.config.host_key_path;

        // Try to load existing key
        if key_path.exists() {
            info!("Loading SSH host key from {}", key_path.display());
            match russh_keys::load_secret_key(key_path, None) {
                Ok(key) => return Ok(key),
                Err(e) => {
                    warn!("Failed to load existing host key: {}, generating new one", e);
                }
            }
        }

        // Generate new Ed25519 key
        info!("Generating new SSH host key at {}", key_path.display());
        let key = KeyPair::generate_ed25519();

        // Ensure parent directory exists
        if let Some(parent) = key_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                SftpError::Io(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to create key directory: {}", e),
                ))
            })?;
        }

        // Save the key (OpenSSH format)
        let mut key_file = std::fs::File::create(key_path).map_err(|e| {
            SftpError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create key file: {}", e),
            ))
        })?;

        russh_keys::encode_pkcs8_pem(&key, &mut key_file).map_err(|e| {
            SftpError::Ssh(format!("Failed to encode key: {}", e))
        })?;

        // Set restrictive permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(key_path, std::fs::Permissions::from_mode(0o600))
                .map_err(SftpError::Io)?;
        }

        info!("SSH host key generated successfully");
        Ok(key)
    }

    /// Run the SFTP server
    pub async fn run(self) -> SftpResult<()> {
        let bind_addr = format!("{}:{}", self.config.bind_address, self.config.bind_port);

        // Load or generate host key
        let key = self.load_or_generate_key()?;

        // Create russh server config
        let config = russh::server::Config {
            keys: vec![key],
            // Explicitly enable password authentication
            methods: russh::MethodSet::PASSWORD,
            auth_rejection_time: std::time::Duration::from_secs(3),
            auth_rejection_time_initial: Some(std::time::Duration::from_secs(0)),
            ..Default::default()
        };
        let config = Arc::new(config);

        info!("Starting SFTP server on {}", bind_addr);

        // Bind TCP listener
        let listener = TcpListener::bind(&bind_addr).await.map_err(|e| {
            SftpError::Io(std::io::Error::new(
                std::io::ErrorKind::AddrInUse,
                format!("Failed to bind SFTP server to {}: {}", bind_addr, e),
            ))
        })?;

        info!("SFTP server listening on {}", bind_addr);

        // Accept connections
        loop {
            match listener.accept().await {
                Ok((socket, peer_addr)) => {
                    debug!("New SSH connection from {}", peer_addr);

                    let config = config.clone();
                    let authenticator = self.authenticator.clone();
                    let manager = self.manager.clone();
                    let read_only = self.config.read_only;

                    tokio::spawn(async move {
                        let handler = SshHandler::new(
                            authenticator,
                            manager,
                            read_only,
                            peer_addr.to_string(),
                        );

                        if let Err(e) = russh::server::run_stream(config, socket, handler).await {
                            debug!("SSH connection from {} ended: {:?}", peer_addr, e);
                        }
                    });
                }
                Err(e) => {
                    error!("Failed to accept SSH connection: {}", e);
                }
            }
        }
    }
}

/// SSH connection handler
pub struct SshHandler {
    authenticator: Arc<SftpAuthenticator>,
    manager: Arc<Manager>,
    read_only: bool,
    user: Arc<RwLock<Option<SftpUser>>>,
    sftp_handlers: Arc<Mutex<HashMap<ChannelId, SftpSession>>>,
    peer_addr: String,
}

/// SFTP session state
struct SftpSession {
    handler: Arc<SftpFileHandler>,
    #[allow(dead_code)]
    user: SftpUser,
}

impl SshHandler {
    fn new(
        authenticator: Arc<SftpAuthenticator>,
        manager: Arc<Manager>,
        read_only: bool,
        peer_addr: String,
    ) -> Self {
        Self {
            authenticator,
            manager,
            read_only,
            user: Arc::new(RwLock::new(None)),
            sftp_handlers: Arc::new(Mutex::new(HashMap::new())),
            peer_addr,
        }
    }
}

impl Clone for SshHandler {
    fn clone(&self) -> Self {
        Self {
            authenticator: self.authenticator.clone(),
            manager: self.manager.clone(),
            read_only: self.read_only,
            user: self.user.clone(),
            sftp_handlers: self.sftp_handlers.clone(),
            peer_addr: self.peer_addr.clone(),
        }
    }
}

#[async_trait]
impl Handler for SshHandler {
    type Error = russh::Error;

    async fn auth_password(
        &mut self,
        user: &str,
        password: &str,
    ) -> Result<Auth, Self::Error> {
        debug!("Password auth attempt from {} for user {}", self.peer_addr, user);

        match self.authenticator.authenticate(user, password).await {
            Ok(sftp_user) => {
                info!(
                    "SFTP auth successful for {} from {} (server: {})",
                    user, self.peer_addr, sftp_user.server_uuid
                );
                *self.user.write() = Some(sftp_user);
                Ok(Auth::Accept)
            }
            Err(e) => {
                warn!("SFTP auth failed for {} from {}: {}", user, self.peer_addr, e);
                Ok(Auth::Reject {
                    proceed_with_methods: None,
                })
            }
        }
    }

    async fn auth_publickey(
        &mut self,
        _user: &str,
        _public_key: &russh_keys::key::PublicKey,
    ) -> Result<Auth, Self::Error> {
        // We only support password auth
        Ok(Auth::Reject {
            proceed_with_methods: Some(russh::MethodSet::PASSWORD),
        })
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        _session: &mut Session,
    ) -> Result<bool, Self::Error> {
        debug!("Channel open session request on channel {}", channel.id());
        Ok(true)
    }

    async fn subsystem_request(
        &mut self,
        channel_id: ChannelId,
        name: &str,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        debug!("Subsystem request: {} on channel {}", name, channel_id);

        if name != "sftp" {
            warn!("Unknown subsystem requested: {}", name);
            session.channel_failure(channel_id);
            return Ok(());
        }

        // Get authenticated user
        let user = {
            let guard = self.user.read();
            guard.clone()
        };

        let Some(user) = user else {
            warn!("SFTP subsystem requested without authentication");
            session.channel_failure(channel_id);
            return Ok(());
        };

        // Get server and create filesystem
        let server = match self.manager.get(&user.server_uuid) {
            Some(s) => s,
            None => {
                warn!("Server {} not found for SFTP session", user.server_uuid);
                session.channel_failure(channel_id);
                return Ok(());
            }
        };

        // Create filesystem from server's data directory
        let server_config = server.config();
        let filesystem = match Filesystem::new(
            server.data_dir().clone(),
            server_config.disk_bytes(),
            server_config.egg.file_denylist.clone(),
        ) {
            Ok(fs) => Arc::new(fs),
            Err(e) => {
                error!("Failed to create filesystem for server {}: {}", user.server_uuid, e);
                session.channel_failure(channel_id);
                return Ok(());
            }
        };

        // Create SFTP handler
        let handler = Arc::new(SftpFileHandler::new(
            filesystem,
            user.clone(),
            self.read_only,
        ));

        // Store session
        let sftp_session = SftpSession {
            handler,
            user: user.clone(),
        };

        self.sftp_handlers.lock().await.insert(channel_id, sftp_session);

        info!(
            "SFTP session started for user {} on server {}",
            user.user_uuid, user.server_uuid
        );

        session.channel_success(channel_id);
        Ok(())
    }

    async fn data(
        &mut self,
        channel_id: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        let handlers = self.sftp_handlers.lock().await;

        if let Some(sftp_session) = handlers.get(&channel_id) {
            // Process SFTP packet
            match sftp_session.handler.process_packet(data).await {
                Ok(response) => {
                    if !response.is_empty() {
                        session.data(channel_id, CryptoVec::from(response));
                    }
                }
                Err(e) => {
                    error!("SFTP packet processing error: {}", e);
                }
            }
        }

        Ok(())
    }

    async fn channel_close(
        &mut self,
        channel_id: ChannelId,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        debug!("Channel {} closed", channel_id);
        self.sftp_handlers.lock().await.remove(&channel_id);
        Ok(())
    }

    async fn channel_eof(
        &mut self,
        channel_id: ChannelId,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        debug!("Channel {} EOF", channel_id);
        session.eof(channel_id);
        Ok(())
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

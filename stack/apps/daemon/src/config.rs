use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub docker_socket: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: env::var("DAEMON_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("DAEMON_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3001),
            docker_socket: env::var("DOCKER_SOCKET").ok(),
        }
    }

    pub fn address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

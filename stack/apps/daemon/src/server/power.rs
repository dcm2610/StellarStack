//! Power action handling

use std::time::Duration;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Power actions that can be performed on a server
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PowerAction {
    /// Start the server
    Start,

    /// Stop the server gracefully
    Stop,

    /// Restart the server (stop + start)
    Restart,

    /// Force kill the server
    Kill,
}

impl PowerAction {
    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "start" => Some(PowerAction::Start),
            "stop" => Some(PowerAction::Stop),
            "restart" => Some(PowerAction::Restart),
            "kill" => Some(PowerAction::Kill),
            _ => None,
        }
    }

    /// Get permission required for this action
    pub fn required_permission(&self) -> &'static str {
        match self {
            PowerAction::Start => "control.start",
            PowerAction::Stop => "control.stop",
            PowerAction::Restart => "control.restart",
            PowerAction::Kill => "control.stop",
        }
    }
}

impl std::fmt::Display for PowerAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PowerAction::Start => write!(f, "start"),
            PowerAction::Stop => write!(f, "stop"),
            PowerAction::Restart => write!(f, "restart"),
            PowerAction::Kill => write!(f, "kill"),
        }
    }
}

/// Errors that can occur during power operations
#[derive(Debug, Error)]
pub enum PowerError {
    #[error("Server is suspended")]
    Suspended,

    #[error("Server is currently installing")]
    Installing,

    #[error("Server is currently transferring")]
    Transferring,

    #[error("Server is currently restoring from backup")]
    Restoring,

    #[error("Server is already running")]
    AlreadyRunning,

    #[error("Server is already stopped")]
    AlreadyStopped,

    #[error("Another power operation is in progress")]
    Busy,

    #[error("Operation timed out")]
    Timeout,

    #[error("Operation cancelled")]
    Cancelled,

    #[error("Disk space exceeded")]
    DiskSpaceExceeded,

    #[error("Environment error: {0}")]
    Environment(#[from] crate::environment::EnvironmentError),

    #[error("{0}")]
    Other(String),
}

/// Configuration for power operations
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct PowerConfig {
    /// Timeout for stop operations
    pub stop_timeout: Duration,

    /// Whether to wait for lock acquisition
    pub wait_for_lock: bool,

    /// Crash detection enabled
    pub crash_detection: bool,
}

impl Default for PowerConfig {
    fn default() -> Self {
        Self {
            stop_timeout: Duration::from_secs(600), // 10 minutes
            wait_for_lock: true,
            crash_detection: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_power_action_parse() {
        assert_eq!(PowerAction::from_str("start"), Some(PowerAction::Start));
        assert_eq!(PowerAction::from_str("STOP"), Some(PowerAction::Stop));
        assert_eq!(PowerAction::from_str("Restart"), Some(PowerAction::Restart));
        assert_eq!(PowerAction::from_str("kill"), Some(PowerAction::Kill));
        assert_eq!(PowerAction::from_str("invalid"), None);
    }

    #[test]
    fn test_power_action_permission() {
        assert_eq!(PowerAction::Start.required_permission(), "control.start");
        assert_eq!(PowerAction::Stop.required_permission(), "control.stop");
        assert_eq!(PowerAction::Restart.required_permission(), "control.restart");
        assert_eq!(PowerAction::Kill.required_permission(), "control.stop");
    }
}

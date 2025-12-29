//! Event bus for pub/sub messaging
//!
//! Provides a broadcast mechanism for server events like state changes,
//! stats updates, and installation progress.

use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing::{debug, info};

/// Process state enum matching Wings patterns
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessState {
    Offline,
    Starting,
    Running,
    Stopping,
}

impl std::fmt::Display for ProcessState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProcessState::Offline => write!(f, "offline"),
            ProcessState::Starting => write!(f, "starting"),
            ProcessState::Running => write!(f, "running"),
            ProcessState::Stopping => write!(f, "stopping"),
        }
    }
}

impl Default for ProcessState {
    fn default() -> Self {
        ProcessState::Offline
    }
}

/// Network statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NetworkStats {
    /// Bytes received
    pub rx_bytes: u64,
    /// Bytes transmitted
    pub tx_bytes: u64,
}

/// Resource statistics for a server
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Stats {
    /// Current memory usage in bytes
    pub memory_bytes: u64,
    /// Memory limit in bytes
    pub memory_limit_bytes: u64,
    /// CPU usage as absolute percentage (100 = 1 core)
    pub cpu_absolute: f64,
    /// Network statistics
    pub network: NetworkStats,
    /// Server uptime in milliseconds
    pub uptime: i64,
    /// Current disk usage in bytes
    pub disk_bytes: u64,
    /// Disk limit in bytes
    pub disk_limit_bytes: u64,
}

/// Events that can be published through the event bus
#[derive(Debug, Clone)]
pub enum Event {
    /// Server state changed
    StateChange(ProcessState),

    /// Resource statistics update
    Stats(Stats),

    /// Console output from the server
    ConsoleOutput(Vec<u8>),

    /// Installation process started
    InstallStarted,

    /// Installation process completed
    InstallCompleted {
        /// Whether installation was successful
        successful: bool,
    },

    /// Installation output line
    InstallOutput(Vec<u8>),

    /// Backup process started
    BackupStarted {
        /// Backup UUID
        uuid: String,
    },

    /// Backup process completed
    BackupCompleted {
        /// Backup UUID
        uuid: String,
        /// Whether backup was successful
        successful: bool,
        /// Checksum of the backup file (if successful)
        checksum: Option<String>,
        /// Size in bytes
        size: u64,
    },

    /// Backup restoration started
    BackupRestoreStarted {
        /// Backup UUID
        uuid: String,
    },

    /// Backup restoration completed
    BackupRestoreCompleted {
        /// Backup UUID
        uuid: String,
        /// Whether restoration was successful
        successful: bool,
    },

    /// Transfer process started
    TransferStarted,

    /// Transfer progress update
    TransferProgress {
        /// Progress percentage (0-100)
        progress: f64,
    },

    /// Transfer process completed
    TransferCompleted {
        /// Whether transfer was successful
        successful: bool,
    },

    /// Server was synced with panel
    ServerSynced,

    /// Server configuration updated
    ConfigurationUpdated,
}

/// Event bus for broadcasting events to multiple subscribers
///
/// Uses tokio broadcast channels for efficient pub/sub messaging.
/// Subscribers that fall behind will lose messages (lagged).
pub struct EventBus {
    sender: broadcast::Sender<Event>,
    // Keep a receiver to prevent the channel from closing
    _receiver: broadcast::Receiver<Event>,
}

impl EventBus {
    /// Create a new event bus with default capacity (4096 events)
    /// Higher capacity to handle console output bursts without lagging
    pub fn new() -> Self {
        Self::with_capacity(4096)
    }

    /// Create a new event bus with custom capacity
    pub fn with_capacity(capacity: usize) -> Self {
        let (sender, _receiver) = broadcast::channel(capacity);
        Self { sender, _receiver }
    }

    /// Subscribe to the event bus
    ///
    /// Returns a receiver that will receive all events published after subscribing.
    /// If the subscriber falls behind, it will receive a `RecvError::Lagged` error.
    pub fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.sender.subscribe()
    }

    /// Publish an event to all subscribers
    ///
    /// If there are no subscribers, the event is silently dropped.
    /// Returns the number of receivers that received the event.
    pub fn publish(&self, event: Event) -> usize {
        // Ignore send errors (no receivers)
        self.sender.send(event).unwrap_or(0)
    }

    /// Publish a state change event
    pub fn publish_state(&self, state: ProcessState) -> usize {
        let receivers = self.publish(Event::StateChange(state));
        info!("Published StateChange({}) to {} receivers", state, receivers);
        receivers
    }

    /// Publish stats update
    pub fn publish_stats(&self, stats: Stats) -> usize {
        self.publish(Event::Stats(stats))
    }

    /// Publish console output
    pub fn publish_console(&self, data: Vec<u8>) -> usize {
        self.publish(Event::ConsoleOutput(data))
    }

    /// Get the number of active subscribers
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for EventBus {
    fn clone(&self) -> Self {
        Self {
            sender: self.sender.clone(),
            _receiver: self.sender.subscribe(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_event_bus_pubsub() {
        let bus = EventBus::new();

        // Subscribe
        let mut rx = bus.subscribe();

        // Publish event
        bus.publish(Event::StateChange(ProcessState::Running));

        // Receive
        let event = rx.recv().await.unwrap();
        assert!(matches!(event, Event::StateChange(ProcessState::Running)));
    }

    #[tokio::test]
    async fn test_multiple_subscribers() {
        let bus = EventBus::new();

        let mut rx1 = bus.subscribe();
        let mut rx2 = bus.subscribe();

        bus.publish_state(ProcessState::Starting);

        let event1 = rx1.recv().await.unwrap();
        let event2 = rx2.recv().await.unwrap();

        assert!(matches!(event1, Event::StateChange(ProcessState::Starting)));
        assert!(matches!(event2, Event::StateChange(ProcessState::Starting)));
    }

    #[tokio::test]
    async fn test_stats_event() {
        let bus = EventBus::new();
        let mut rx = bus.subscribe();

        let stats = Stats {
            memory_bytes: 1024 * 1024 * 100, // 100MB
            memory_limit_bytes: 1024 * 1024 * 512, // 512MB
            cpu_absolute: 25.5,
            network: NetworkStats {
                rx_bytes: 1000,
                tx_bytes: 2000,
            },
            uptime: 60000,
            disk_bytes: 1024 * 1024 * 50, // 50MB
            disk_limit_bytes: 1024 * 1024 * 1024, // 1GB
        };

        bus.publish_stats(stats.clone());

        let event = rx.recv().await.unwrap();
        if let Event::Stats(received) = event {
            assert_eq!(received.memory_bytes, 1024 * 1024 * 100);
            assert_eq!(received.cpu_absolute, 25.5);
        } else {
            panic!("Expected Stats event");
        }
    }

    #[test]
    fn test_subscriber_count() {
        let bus = EventBus::new();

        assert_eq!(bus.subscriber_count(), 0);

        let _rx1 = bus.subscribe();
        assert_eq!(bus.subscriber_count(), 1);

        let _rx2 = bus.subscribe();
        assert_eq!(bus.subscriber_count(), 2);
    }

    #[test]
    fn test_process_state_display() {
        assert_eq!(ProcessState::Offline.to_string(), "offline");
        assert_eq!(ProcessState::Starting.to_string(), "starting");
        assert_eq!(ProcessState::Running.to_string(), "running");
        assert_eq!(ProcessState::Stopping.to_string(), "stopping");
    }
}

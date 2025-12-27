//! Sink pool for broadcasting log output
//!
//! Provides a pub/sub mechanism for streaming console output and logs
//! to multiple subscribers (e.g., WebSocket connections).

use parking_lot::RwLock;
use tokio::sync::broadcast;

/// A pool of sinks for broadcasting data to multiple subscribers.
///
/// This is used to stream console output to multiple WebSocket connections.
pub struct SinkPool {
    sender: broadcast::Sender<Vec<u8>>,
    // Keep a receiver to prevent the channel from closing
    _receiver: broadcast::Receiver<Vec<u8>>,
}

impl SinkPool {
    /// Create a new sink pool with the specified capacity
    pub fn new() -> Self {
        Self::with_capacity(1024)
    }

    /// Create a new sink pool with custom capacity
    pub fn with_capacity(capacity: usize) -> Self {
        let (sender, _receiver) = broadcast::channel(capacity);
        Self { sender, _receiver }
    }

    /// Subscribe to the sink pool
    ///
    /// Returns a receiver that will receive all messages sent after subscribing.
    pub fn subscribe(&self) -> broadcast::Receiver<Vec<u8>> {
        self.sender.subscribe()
    }

    /// Push data to all subscribers
    ///
    /// If there are no subscribers, the data is silently dropped.
    pub fn push(&self, data: Vec<u8>) {
        // Ignore send errors (no receivers)
        let _ = self.sender.send(data);
    }

    /// Push a string to all subscribers
    pub fn push_string(&self, data: &str) {
        self.push(data.as_bytes().to_vec());
    }

    /// Get the number of active subscribers
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }
}

impl Default for SinkPool {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for SinkPool {
    fn clone(&self) -> Self {
        Self {
            sender: self.sender.clone(),
            _receiver: self.sender.subscribe(),
        }
    }
}

/// A named sink pool that can store multiple named sinks
#[allow(dead_code)]
pub struct SinkPoolMap {
    pools: RwLock<std::collections::HashMap<String, SinkPool>>,
}

#[allow(dead_code)]
impl SinkPoolMap {
    pub fn new() -> Self {
        Self {
            pools: RwLock::new(std::collections::HashMap::new()),
        }
    }

    /// Get or create a sink pool for the given name
    pub fn get_or_create(&self, name: &str) -> SinkPool {
        {
            let pools = self.pools.read();
            if let Some(pool) = pools.get(name) {
                return pool.clone();
            }
        }

        let mut pools = self.pools.write();
        pools
            .entry(name.to_string())
            .or_insert_with(SinkPool::new)
            .clone()
    }

    /// Remove a sink pool
    pub fn remove(&self, name: &str) {
        self.pools.write().remove(name);
    }
}

impl Default for SinkPoolMap {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sink_pool() {
        let pool = SinkPool::new();

        // Subscribe
        let mut rx = pool.subscribe();

        // Push data
        pool.push(b"Hello".to_vec());
        pool.push_string(" World");

        // Receive
        let msg1 = rx.recv().await.unwrap();
        assert_eq!(msg1, b"Hello");

        let msg2 = rx.recv().await.unwrap();
        assert_eq!(msg2, b" World");
    }

    #[tokio::test]
    async fn test_multiple_subscribers() {
        let pool = SinkPool::new();

        let mut rx1 = pool.subscribe();
        let mut rx2 = pool.subscribe();

        pool.push_string("test");

        assert_eq!(rx1.recv().await.unwrap(), b"test");
        assert_eq!(rx2.recv().await.unwrap(), b"test");
    }
}

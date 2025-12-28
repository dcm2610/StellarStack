//! Sink pool for broadcasting log output
//!
//! Provides a pub/sub mechanism for streaming console output and logs
//! to multiple subscribers (e.g., WebSocket connections).

use std::collections::VecDeque;
use std::sync::Arc;
use parking_lot::RwLock;
use tokio::sync::broadcast;

/// Default number of log lines to buffer
const DEFAULT_BUFFER_SIZE: usize = 500;

/// A pool of sinks for broadcasting data to multiple subscribers.
///
/// This is used to stream console output to multiple WebSocket connections.
/// Includes a ring buffer to keep recent messages for new subscribers.
///
/// Note: Cloning a SinkPool shares the same underlying broadcast channel AND buffer,
/// so all clones see the same history and can push to the same buffer.
pub struct SinkPool {
    sender: broadcast::Sender<Vec<u8>>,
    // Keep a receiver to prevent the channel from closing
    _receiver: broadcast::Receiver<Vec<u8>>,
    // Ring buffer for recent messages (shared across clones via Arc)
    buffer: Arc<RwLock<VecDeque<Vec<u8>>>>,
    // Maximum buffer size
    buffer_size: usize,
}

impl SinkPool {
    /// Create a new sink pool with the specified capacity
    pub fn new() -> Self {
        Self::with_capacity(1024)
    }

    /// Create a new sink pool with custom capacity
    pub fn with_capacity(capacity: usize) -> Self {
        let (sender, _receiver) = broadcast::channel(capacity);
        Self {
            sender,
            _receiver,
            buffer: Arc::new(RwLock::new(VecDeque::with_capacity(DEFAULT_BUFFER_SIZE))),
            buffer_size: DEFAULT_BUFFER_SIZE,
        }
    }

    /// Create a new sink pool with custom buffer size for history
    pub fn with_buffer_size(channel_capacity: usize, buffer_size: usize) -> Self {
        let (sender, _receiver) = broadcast::channel(channel_capacity);
        Self {
            sender,
            _receiver,
            buffer: Arc::new(RwLock::new(VecDeque::with_capacity(buffer_size))),
            buffer_size,
        }
    }

    /// Subscribe to the sink pool
    ///
    /// Returns a receiver that will receive all messages sent after subscribing.
    pub fn subscribe(&self) -> broadcast::Receiver<Vec<u8>> {
        self.sender.subscribe()
    }

    /// Get buffered history of recent messages
    ///
    /// Returns a copy of the ring buffer contents (oldest to newest)
    pub fn get_history(&self) -> Vec<Vec<u8>> {
        self.buffer.read().iter().cloned().collect()
    }

    /// Get buffered history as strings (for console output)
    pub fn get_history_strings(&self) -> Vec<String> {
        self.buffer
            .read()
            .iter()
            .map(|data| String::from_utf8_lossy(data).to_string())
            .collect()
    }

    /// Clear the buffer (e.g., when server stops or restarts)
    pub fn clear_buffer(&self) {
        self.buffer.write().clear();
    }

    /// Push data to all subscribers and buffer
    ///
    /// If there are no subscribers, the data is still buffered.
    pub fn push(&self, data: Vec<u8>) {
        // Add to ring buffer
        {
            let mut buffer = self.buffer.write();
            if buffer.len() >= self.buffer_size {
                buffer.pop_front();
            }
            buffer.push_back(data.clone());
        }

        // Broadcast to subscribers (ignore send errors - no receivers)
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

    /// Get current buffer length
    pub fn buffer_len(&self) -> usize {
        self.buffer.read().len()
    }
}

impl Default for SinkPool {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for SinkPool {
    fn clone(&self) -> Self {
        // Clone shares the same broadcast channel AND buffer (via Arc)
        // This is intentional - all clones should see the same history and be able to push to it
        Self {
            sender: self.sender.clone(),
            _receiver: self.sender.subscribe(),
            buffer: Arc::clone(&self.buffer),
            buffer_size: self.buffer_size,
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

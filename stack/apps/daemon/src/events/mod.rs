//! Event system module
//!
//! Provides a pub/sub event bus for broadcasting server events
//! like state changes, stats updates, and installation progress.

mod bus;
mod redis;
mod state_store;

pub use bus::{EventBus, Event, ProcessState, Stats, NetworkStats};
pub use redis::RedisPublisher;
pub use state_store::{RedisStateStore, CachedServerState};

//! Event system module
//!
//! Provides a pub/sub event bus for broadcasting server events
//! like state changes, stats updates, and installation progress.

mod bus;

pub use bus::{EventBus, Event, ProcessState, Stats, NetworkStats};

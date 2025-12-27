//! System utilities module
//!
//! Provides thread-safe primitives, power locking, and log sink pools
//! following Wings patterns.

mod locker;
mod sink;

pub use locker::{Locker, LockerGuard};
pub use sink::SinkPool;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

/// Thread-safe atomic string using parking_lot
pub struct AtomicString {
    inner: parking_lot::RwLock<String>,
}

impl AtomicString {
    pub fn new(value: String) -> Self {
        Self {
            inner: parking_lot::RwLock::new(value),
        }
    }

    pub fn get(&self) -> String {
        self.inner.read().clone()
    }

    pub fn set(&self, value: String) {
        *self.inner.write() = value;
    }
}

impl Default for AtomicString {
    fn default() -> Self {
        Self::new(String::new())
    }
}

/// Wrapper around AtomicBool for convenience
pub struct AtomicFlag(AtomicBool);

impl AtomicFlag {
    pub fn new(value: bool) -> Self {
        Self(AtomicBool::new(value))
    }

    pub fn get(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }

    pub fn set(&self, value: bool) {
        self.0.store(value, Ordering::SeqCst);
    }

    /// Swap if the current value matches expected, returns true if swapped
    pub fn swap_if(&self, expected: bool, new: bool) -> bool {
        self.0
            .compare_exchange(expected, new, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }
}

impl Default for AtomicFlag {
    fn default() -> Self {
        Self::new(false)
    }
}

/// Wrapper around AtomicU64 for convenience
pub struct AtomicCounter(AtomicU64);

impl AtomicCounter {
    pub fn new(value: u64) -> Self {
        Self(AtomicU64::new(value))
    }

    pub fn get(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }

    pub fn set(&self, value: u64) {
        self.0.store(value, Ordering::SeqCst);
    }

    pub fn increment(&self) -> u64 {
        self.0.fetch_add(1, Ordering::SeqCst)
    }
}

impl Default for AtomicCounter {
    fn default() -> Self {
        Self::new(0)
    }
}

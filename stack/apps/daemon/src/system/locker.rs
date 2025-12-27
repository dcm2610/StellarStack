//! Power locker for sequential operations
//!
//! Ensures that only one power operation (start, stop, restart) can
//! happen at a time for a server, preventing race conditions.

use std::time::Duration;
use tokio::sync::{Semaphore, SemaphorePermit, TryAcquireError};
use thiserror::Error;

/// Error type for locker operations
#[derive(Debug, Error)]
pub enum LockerError {
    #[error("Lock is currently held")]
    Busy,

    #[error("Lock acquisition was cancelled")]
    Cancelled,

    #[error("Lock acquisition timed out")]
    Timeout,
}

/// A sequential locker that ensures only one operation runs at a time.
///
/// This is used to prevent concurrent power operations on a server,
/// which could lead to race conditions (e.g., trying to start and stop
/// a server simultaneously).
pub struct Locker {
    semaphore: Semaphore,
}

impl Locker {
    /// Create a new locker
    pub fn new() -> Self {
        Self {
            // Semaphore with 1 permit = mutual exclusion
            semaphore: Semaphore::new(1),
        }
    }

    /// Acquire the lock, waiting indefinitely if needed.
    ///
    /// Returns a guard that releases the lock when dropped.
    pub async fn acquire(&self) -> Result<LockerGuard<'_>, LockerError> {
        let permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|_| LockerError::Cancelled)?;

        Ok(LockerGuard { _permit: permit })
    }

    /// Try to acquire the lock immediately without waiting.
    ///
    /// Returns an error if the lock is already held.
    pub fn try_acquire(&self) -> Result<LockerGuard<'_>, LockerError> {
        match self.semaphore.try_acquire() {
            Ok(permit) => Ok(LockerGuard { _permit: permit }),
            Err(TryAcquireError::NoPermits) => Err(LockerError::Busy),
            Err(TryAcquireError::Closed) => Err(LockerError::Cancelled),
        }
    }

    /// Try to acquire the lock with a timeout.
    ///
    /// Returns an error if the lock cannot be acquired within the timeout.
    pub async fn acquire_timeout(&self, timeout: Duration) -> Result<LockerGuard<'_>, LockerError> {
        match tokio::time::timeout(timeout, self.semaphore.acquire()).await {
            Ok(Ok(permit)) => Ok(LockerGuard { _permit: permit }),
            Ok(Err(_)) => Err(LockerError::Cancelled),
            Err(_) => Err(LockerError::Timeout),
        }
    }

    /// Check if the lock is currently held
    pub fn is_locked(&self) -> bool {
        self.semaphore.available_permits() == 0
    }
}

impl Default for Locker {
    fn default() -> Self {
        Self::new()
    }
}

/// Guard that releases the lock when dropped
pub struct LockerGuard<'a> {
    _permit: SemaphorePermit<'a>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_acquire_and_release() {
        let locker = Locker::new();

        // Should be able to acquire
        assert!(!locker.is_locked());
        let guard = locker.acquire().await.unwrap();
        assert!(locker.is_locked());

        // Try acquire should fail
        assert!(locker.try_acquire().is_err());

        // Drop guard
        drop(guard);
        assert!(!locker.is_locked());

        // Should be able to acquire again
        let _guard = locker.try_acquire().unwrap();
        assert!(locker.is_locked());
    }

    #[tokio::test]
    async fn test_timeout() {
        let locker = Locker::new();

        // Hold the lock
        let _guard = locker.acquire().await.unwrap();

        // Timeout should occur
        let result = locker.acquire_timeout(Duration::from_millis(10)).await;
        assert!(matches!(result, Err(LockerError::Timeout)));
    }
}

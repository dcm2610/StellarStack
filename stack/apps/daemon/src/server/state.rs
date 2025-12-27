//! Server state management

use std::sync::atomic::{AtomicBool, Ordering};

/// Server state flags
#[derive(Debug)]
pub struct ServerState {
    /// Server is currently installing
    installing: AtomicBool,

    /// Server is currently transferring
    transferring: AtomicBool,

    /// Server is restoring from backup
    restoring: AtomicBool,

    /// Server has been marked for deletion
    marked_for_deletion: AtomicBool,

    /// Server was marked as reinstall pending
    reinstall_pending: AtomicBool,
}

impl ServerState {
    /// Create a new server state with all flags false
    pub fn new() -> Self {
        Self {
            installing: AtomicBool::new(false),
            transferring: AtomicBool::new(false),
            restoring: AtomicBool::new(false),
            marked_for_deletion: AtomicBool::new(false),
            reinstall_pending: AtomicBool::new(false),
        }
    }

    /// Check if the server is installing
    pub fn is_installing(&self) -> bool {
        self.installing.load(Ordering::SeqCst)
    }

    /// Set the installing flag
    pub fn set_installing(&self, value: bool) {
        self.installing.store(value, Ordering::SeqCst);
    }

    /// Try to start installation, returns false if already installing
    pub fn try_start_installing(&self) -> bool {
        self.installing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    /// Check if the server is transferring
    pub fn is_transferring(&self) -> bool {
        self.transferring.load(Ordering::SeqCst)
    }

    /// Set the transferring flag
    pub fn set_transferring(&self, value: bool) {
        self.transferring.store(value, Ordering::SeqCst);
    }

    /// Try to start transfer, returns false if already transferring
    pub fn try_start_transferring(&self) -> bool {
        self.transferring
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    /// Check if the server is restoring
    pub fn is_restoring(&self) -> bool {
        self.restoring.load(Ordering::SeqCst)
    }

    /// Set the restoring flag
    pub fn set_restoring(&self, value: bool) {
        self.restoring.store(value, Ordering::SeqCst);
    }

    /// Try to start restoration, returns false if already restoring
    pub fn try_start_restoring(&self) -> bool {
        self.restoring
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    /// Check if the server is marked for deletion
    pub fn is_marked_for_deletion(&self) -> bool {
        self.marked_for_deletion.load(Ordering::SeqCst)
    }

    /// Mark the server for deletion
    pub fn mark_for_deletion(&self) {
        self.marked_for_deletion.store(true, Ordering::SeqCst);
    }

    /// Check if reinstall is pending
    pub fn is_reinstall_pending(&self) -> bool {
        self.reinstall_pending.load(Ordering::SeqCst)
    }

    /// Set reinstall pending flag
    pub fn set_reinstall_pending(&self, value: bool) {
        self.reinstall_pending.store(value, Ordering::SeqCst);
    }

    /// Check if any blocking operation is in progress
    pub fn is_busy(&self) -> bool {
        self.is_installing() || self.is_transferring() || self.is_restoring()
    }

    /// Get a human-readable status string
    pub fn status_string(&self) -> &'static str {
        if self.is_installing() {
            "installing"
        } else if self.is_transferring() {
            "transferring"
        } else if self.is_restoring() {
            "restoring"
        } else {
            "ready"
        }
    }
}

impl Default for ServerState {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for ServerState {
    fn clone(&self) -> Self {
        Self {
            installing: AtomicBool::new(self.installing.load(Ordering::SeqCst)),
            transferring: AtomicBool::new(self.transferring.load(Ordering::SeqCst)),
            restoring: AtomicBool::new(self.restoring.load(Ordering::SeqCst)),
            marked_for_deletion: AtomicBool::new(self.marked_for_deletion.load(Ordering::SeqCst)),
            reinstall_pending: AtomicBool::new(self.reinstall_pending.load(Ordering::SeqCst)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_state() {
        let state = ServerState::new();
        assert!(!state.is_installing());
        assert!(!state.is_transferring());
        assert!(!state.is_restoring());
        assert!(!state.is_marked_for_deletion());
        assert!(!state.is_busy());
    }

    #[test]
    fn test_try_start_installing() {
        let state = ServerState::new();

        // First attempt should succeed
        assert!(state.try_start_installing());
        assert!(state.is_installing());

        // Second attempt should fail
        assert!(!state.try_start_installing());

        // Reset
        state.set_installing(false);
        assert!(!state.is_installing());
    }

    #[test]
    fn test_busy_check() {
        let state = ServerState::new();

        state.set_installing(true);
        assert!(state.is_busy());

        state.set_installing(false);
        state.set_transferring(true);
        assert!(state.is_busy());

        state.set_transferring(false);
        state.set_restoring(true);
        assert!(state.is_busy());

        state.set_restoring(false);
        assert!(!state.is_busy());
    }
}

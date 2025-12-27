//! Crash detection and handling

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tracing::{debug, info, warn};

/// Time window for counting crashes (10 minutes)
const CRASH_WINDOW: Duration = Duration::from_secs(600);

/// Number of crashes before disabling auto-restart
const CRASH_LIMIT: u32 = 3;

/// Minimum runtime before a crash counts (10 seconds)
const MIN_RUNTIME_FOR_CRASH: Duration = Duration::from_secs(10);

/// Crash detection handler
#[derive(Debug)]
pub struct CrashHandler {
    /// Number of crashes in the current window
    crash_count: AtomicU32,

    /// Timestamp of first crash in window
    window_start: AtomicU64,

    /// Whether crash detection is enabled
    enabled: std::sync::atomic::AtomicBool,

    /// Last start time (for calculating runtime)
    last_start: parking_lot::Mutex<Option<Instant>>,
}

impl CrashHandler {
    /// Create a new crash handler
    pub fn new() -> Self {
        Self {
            crash_count: AtomicU32::new(0),
            window_start: AtomicU64::new(0),
            enabled: std::sync::atomic::AtomicBool::new(true),
            last_start: parking_lot::Mutex::new(None),
        }
    }

    /// Record server start
    pub fn record_start(&self) {
        *self.last_start.lock() = Some(Instant::now());
    }

    /// Check if we should treat this exit as a crash
    ///
    /// Returns true if:
    /// - Server ran for less than MIN_RUNTIME_FOR_CRASH
    /// - Exit code was non-zero
    /// - OOM killer wasn't triggered (OOM is handled separately)
    pub fn is_crash(&self, exit_code: i64, oom_killed: bool) -> bool {
        // OOM is not a crash (it's a resource issue)
        if oom_killed {
            debug!("Process killed by OOM, not counting as crash");
            return false;
        }

        // Exit code 0 is not a crash
        if exit_code == 0 {
            return false;
        }

        // Check runtime
        let last_start = self.last_start.lock();
        if let Some(start) = *last_start {
            let runtime = start.elapsed();
            if runtime < MIN_RUNTIME_FOR_CRASH {
                debug!(
                    "Server ran for {:?}, treating exit code {} as crash",
                    runtime, exit_code
                );
                return true;
            }
        }

        // Long-running server that exited with error - not a crash loop
        false
    }

    /// Record a crash and check if we've hit the limit
    ///
    /// Returns true if auto-restart should be disabled
    pub fn record_crash(&self) -> bool {
        if !self.enabled.load(Ordering::SeqCst) {
            return true;
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let window_start = self.window_start.load(Ordering::SeqCst);

        // Check if we're outside the crash window
        if window_start == 0 || now - window_start > CRASH_WINDOW.as_secs() {
            // Start new window
            self.window_start.store(now, Ordering::SeqCst);
            self.crash_count.store(1, Ordering::SeqCst);
            info!("First crash in new window, count: 1");
            return false;
        }

        // Increment crash count
        let count = self.crash_count.fetch_add(1, Ordering::SeqCst) + 1;
        info!("Crash #{} in current window", count);

        if count >= CRASH_LIMIT {
            warn!(
                "Server has crashed {} times in {:?}, disabling auto-restart",
                count, CRASH_WINDOW
            );
            return true;
        }

        false
    }

    /// Reset the crash counter
    pub fn reset(&self) {
        self.crash_count.store(0, Ordering::SeqCst);
        self.window_start.store(0, Ordering::SeqCst);
        debug!("Crash counter reset");
    }

    /// Enable/disable crash detection
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
    }

    /// Check if crash detection is enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// Get current crash count
    pub fn crash_count(&self) -> u32 {
        self.crash_count.load(Ordering::SeqCst)
    }
}

impl Default for CrashHandler {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for CrashHandler {
    fn clone(&self) -> Self {
        Self {
            crash_count: AtomicU32::new(self.crash_count.load(Ordering::SeqCst)),
            window_start: AtomicU64::new(self.window_start.load(Ordering::SeqCst)),
            enabled: std::sync::atomic::AtomicBool::new(self.enabled.load(Ordering::SeqCst)),
            last_start: parking_lot::Mutex::new(*self.last_start.lock()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crash_detection() {
        let handler = CrashHandler::new();

        // Non-crash scenarios
        assert!(!handler.is_crash(0, false)); // Exit 0
        assert!(!handler.is_crash(1, true));  // OOM

        // Record start and check crash for short runtime
        handler.record_start();
        assert!(handler.is_crash(1, false)); // Short runtime with error
    }

    #[test]
    fn test_crash_limit() {
        let handler = CrashHandler::new();

        // First crashes should not disable restart
        assert!(!handler.record_crash());
        assert_eq!(handler.crash_count(), 1);

        assert!(!handler.record_crash());
        assert_eq!(handler.crash_count(), 2);

        // Third crash should disable restart
        assert!(handler.record_crash());
        assert_eq!(handler.crash_count(), 3);
    }

    #[test]
    fn test_reset() {
        let handler = CrashHandler::new();

        handler.record_crash();
        handler.record_crash();
        assert_eq!(handler.crash_count(), 2);

        handler.reset();
        assert_eq!(handler.crash_count(), 0);
    }
}

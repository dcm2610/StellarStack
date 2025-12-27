//! Disk usage tracking and quota management

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::fs;
use tracing::{debug, warn};

use super::errors::{FilesystemError, FilesystemResult};

/// Disk usage tracker with caching
#[derive(Debug)]
pub struct DiskUsage {
    /// Current cached disk usage in bytes
    usage: AtomicU64,

    /// Timestamp of last calculation
    last_check: AtomicU64,

    /// Cache duration
    cache_duration: Duration,

    /// Disk space limit in bytes (0 for unlimited)
    limit: u64,
}

impl DiskUsage {
    /// Create a new disk usage tracker
    pub fn new(limit: u64) -> Self {
        Self {
            usage: AtomicU64::new(0),
            last_check: AtomicU64::new(0),
            cache_duration: Duration::from_secs(60),
            limit,
        }
    }

    /// Create with custom cache duration
    pub fn with_cache_duration(limit: u64, cache_duration: Duration) -> Self {
        Self {
            usage: AtomicU64::new(0),
            last_check: AtomicU64::new(0),
            cache_duration,
            limit,
        }
    }

    /// Get the disk space limit
    pub fn limit(&self) -> u64 {
        self.limit
    }

    /// Set a new disk space limit
    pub fn set_limit(&mut self, limit: u64) {
        self.limit = limit;
    }

    /// Check if there's a limit set
    pub fn has_limit(&self) -> bool {
        self.limit > 0
    }

    /// Get cached disk usage
    pub fn cached_usage(&self) -> u64 {
        self.usage.load(Ordering::SeqCst)
    }

    /// Check if cache is stale
    fn is_cache_stale(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let last_check = self.last_check.load(Ordering::SeqCst);

        now - last_check > self.cache_duration.as_secs()
    }

    /// Calculate disk usage for a directory
    pub async fn calculate(&self, root: &Path) -> FilesystemResult<u64> {
        // Return cached value if still valid
        if !self.is_cache_stale() {
            return Ok(self.cached_usage());
        }

        // Calculate directory size
        let size = calculate_dir_size(root).await?;

        // Update cache
        self.usage.store(size, Ordering::SeqCst);
        self.last_check.store(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            Ordering::SeqCst,
        );

        debug!("Calculated disk usage for {:?}: {} bytes", root, size);
        Ok(size)
    }

    /// Force recalculation of disk usage
    pub async fn recalculate(&self, root: &Path) -> FilesystemResult<u64> {
        // Invalidate cache
        self.last_check.store(0, Ordering::SeqCst);
        self.calculate(root).await
    }

    /// Check if there's space available for additional bytes
    pub fn has_space_for(&self, additional_bytes: u64) -> FilesystemResult<()> {
        if !self.has_limit() {
            return Ok(()); // Unlimited
        }

        let current = self.cached_usage();
        let total = current.saturating_add(additional_bytes);

        if total > self.limit {
            return Err(FilesystemError::DiskSpaceExceeded {
                limit: self.limit,
                used: current,
            });
        }

        Ok(())
    }

    /// Check if space is available (with optional safety buffer)
    pub async fn has_space_available(&self, root: &Path, with_buffer: bool) -> FilesystemResult<()> {
        if !self.has_limit() {
            return Ok(()); // Unlimited
        }

        let usage = self.calculate(root).await?;
        let buffer = if with_buffer { 5 * 1024 * 1024 } else { 0 }; // 5MB buffer

        if usage + buffer > self.limit {
            return Err(FilesystemError::DiskSpaceExceeded {
                limit: self.limit,
                used: usage,
            });
        }

        Ok(())
    }

    /// Get available space in bytes
    pub fn available_space(&self) -> u64 {
        if !self.has_limit() {
            return u64::MAX;
        }

        self.limit.saturating_sub(self.cached_usage())
    }

    /// Get usage percentage (0-100)
    pub fn usage_percentage(&self) -> f64 {
        if !self.has_limit() {
            return 0.0;
        }

        (self.cached_usage() as f64 / self.limit as f64) * 100.0
    }

    /// Add bytes to cached usage (for tracking writes)
    pub fn add_usage(&self, bytes: u64) {
        self.usage.fetch_add(bytes, Ordering::SeqCst);
    }

    /// Subtract bytes from cached usage (for tracking deletes)
    pub fn sub_usage(&self, bytes: u64) {
        // Use fetch_sub with wrapping protection
        let current = self.usage.load(Ordering::SeqCst);
        let new_value = current.saturating_sub(bytes);
        self.usage.store(new_value, Ordering::SeqCst);
    }
}

impl Clone for DiskUsage {
    fn clone(&self) -> Self {
        Self {
            usage: AtomicU64::new(self.usage.load(Ordering::SeqCst)),
            last_check: AtomicU64::new(self.last_check.load(Ordering::SeqCst)),
            cache_duration: self.cache_duration,
            limit: self.limit,
        }
    }
}

/// Calculate the total size of a directory recursively
async fn calculate_dir_size(path: &Path) -> FilesystemResult<u64> {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];

    while let Some(current) = stack.pop() {
        let mut entries = match fs::read_dir(&current).await {
            Ok(entries) => entries,
            Err(e) => {
                warn!("Failed to read directory {:?}: {}", current, e);
                continue;
            }
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let metadata = match entry.metadata().await {
                Ok(m) => m,
                Err(e) => {
                    warn!("Failed to get metadata for {:?}: {}", entry.path(), e);
                    continue;
                }
            };

            if metadata.is_dir() {
                stack.push(entry.path());
            } else {
                total += metadata.len();
            }
        }
    }

    Ok(total)
}

/// Calculate directory size synchronously (for blocking contexts)
pub fn calculate_dir_size_sync(path: &Path) -> FilesystemResult<u64> {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];

    while let Some(current) = stack.pop() {
        let entries = match std::fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(e) => {
                warn!("Failed to read directory {:?}: {}", current, e);
                continue;
            }
        };

        for entry in entries.flatten() {
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(e) => {
                    warn!("Failed to get metadata for {:?}: {}", entry.path(), e);
                    continue;
                }
            };

            if metadata.is_dir() {
                stack.push(entry.path());
            } else {
                total += metadata.len();
            }
        }
    }

    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs::File;
    use std::io::Write;

    #[tokio::test]
    async fn test_disk_usage_calculation() {
        let temp = TempDir::new().unwrap();

        // Create some files
        let mut f1 = File::create(temp.path().join("file1.txt")).unwrap();
        f1.write_all(&[0u8; 1000]).unwrap();

        let mut f2 = File::create(temp.path().join("file2.txt")).unwrap();
        f2.write_all(&[0u8; 2000]).unwrap();

        std::fs::create_dir(temp.path().join("subdir")).unwrap();
        let mut f3 = File::create(temp.path().join("subdir/file3.txt")).unwrap();
        f3.write_all(&[0u8; 500]).unwrap();

        let usage = DiskUsage::new(0);
        let size = usage.calculate(temp.path()).await.unwrap();

        assert_eq!(size, 3500);
    }

    #[test]
    fn test_has_space_for() {
        let usage = DiskUsage::new(1000);
        usage.usage.store(500, Ordering::SeqCst);

        // Should have space for 400 bytes
        assert!(usage.has_space_for(400).is_ok());

        // Should not have space for 600 bytes
        assert!(usage.has_space_for(600).is_err());
    }

    #[test]
    fn test_unlimited() {
        let usage = DiskUsage::new(0);

        // Unlimited should always have space
        assert!(usage.has_space_for(u64::MAX).is_ok());
        assert!(!usage.has_limit());
    }

    #[test]
    fn test_usage_percentage() {
        let usage = DiskUsage::new(1000);
        usage.usage.store(250, Ordering::SeqCst);

        assert!((usage.usage_percentage() - 25.0).abs() < 0.01);
    }
}

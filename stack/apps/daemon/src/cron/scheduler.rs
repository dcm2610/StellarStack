//! Core scheduler implementation

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use thiserror::Error;
use tokio::sync::RwLock;
use tokio::time::Instant;
use tracing::{debug, error, info};

/// Scheduler errors
#[derive(Debug, Error)]
pub enum SchedulerError {
    #[error("Job not found: {0}")]
    JobNotFound(String),

    #[error("Job already exists: {0}")]
    JobExists(String),

    #[error("{0}")]
    Other(String),
}

/// Job execution statistics
#[derive(Debug, Clone, Default)]
pub struct JobStats {
    pub run_count: u64,
    pub success_count: u64,
    pub failure_count: u64,
    pub last_run: Option<Instant>,
    pub last_duration_ms: u64,
    pub avg_duration_ms: u64,
}

/// A scheduled job
pub struct Job {
    /// Job name
    pub name: String,

    /// Job interval
    pub interval: Duration,

    /// Whether the job is enabled
    pub enabled: AtomicBool,

    /// Run immediately on start
    pub run_immediately: bool,

    /// Job statistics
    stats: RwLock<JobStats>,
}

impl Job {
    /// Create a new job
    pub fn new(name: impl Into<String>, interval: Duration) -> Self {
        Self {
            name: name.into(),
            interval,
            enabled: AtomicBool::new(true),
            run_immediately: false,
            stats: RwLock::new(JobStats::default()),
        }
    }

    /// Set whether to run immediately on start
    pub fn run_immediately(mut self, value: bool) -> Self {
        self.run_immediately = value;
        self
    }

    /// Enable the job
    pub fn enable(&self) {
        self.enabled.store(true, Ordering::SeqCst);
    }

    /// Disable the job
    pub fn disable(&self) {
        self.enabled.store(false, Ordering::SeqCst);
    }

    /// Check if job is enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// Get job statistics
    pub async fn stats(&self) -> JobStats {
        self.stats.read().await.clone()
    }

    /// Record a job run
    async fn record_run(&self, success: bool, duration: Duration) {
        let mut stats = self.stats.write().await;
        stats.run_count += 1;
        if success {
            stats.success_count += 1;
        } else {
            stats.failure_count += 1;
        }
        stats.last_run = Some(Instant::now());
        stats.last_duration_ms = duration.as_millis() as u64;

        // Update average
        if stats.run_count == 1 {
            stats.avg_duration_ms = stats.last_duration_ms;
        } else {
            stats.avg_duration_ms = (stats.avg_duration_ms * (stats.run_count - 1) + stats.last_duration_ms)
                / stats.run_count;
        }
    }
}

/// Handle to a running job, used to cancel it
pub struct JobHandle {
    name: String,
    cancelled: Arc<AtomicBool>,
}

impl JobHandle {
    /// Cancel the job
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        info!("Job {} cancelled", self.name);
    }

    /// Check if job is cancelled
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// Get the job name
    pub fn name(&self) -> &str {
        &self.name
    }
}

/// Type alias for async job functions
#[allow(dead_code)]
pub type JobFn = Box<dyn Fn() -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync>;

/// Job scheduler
#[allow(dead_code)]
pub struct Scheduler {
    /// Registered jobs
    jobs: RwLock<HashMap<String, Arc<Job>>>,

    /// Job ID counter
    next_id: AtomicU64,
}

impl Scheduler {
    /// Create a new scheduler
    pub fn new() -> Self {
        Self {
            jobs: RwLock::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        }
    }

    /// Schedule a new job
    pub async fn schedule<F, Fut>(
        &self,
        name: impl Into<String>,
        interval: Duration,
        task: F,
    ) -> JobHandle
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        let name = name.into();
        let job = Arc::new(Job::new(name.clone(), interval));

        // Store job
        {
            let mut jobs = self.jobs.write().await;
            jobs.insert(name.clone(), job.clone());
        }

        let cancelled = Arc::new(AtomicBool::new(false));
        let handle = JobHandle {
            name: name.clone(),
            cancelled: cancelled.clone(),
        };

        // Spawn job task
        let job_clone = job.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(job_clone.interval);

            // Skip first tick if not running immediately
            if !job_clone.run_immediately {
                ticker.tick().await;
            }

            loop {
                ticker.tick().await;

                // Check if cancelled
                if cancelled.load(Ordering::SeqCst) {
                    debug!("Job {} stopping (cancelled)", job_clone.name);
                    break;
                }

                // Check if enabled
                if !job_clone.is_enabled() {
                    continue;
                }

                debug!("Running job: {}", job_clone.name);

                let start = Instant::now();
                let result = tokio::spawn(task());

                match result.await {
                    Ok(_) => {
                        job_clone.record_run(true, start.elapsed()).await;
                        debug!("Job {} completed in {:?}", job_clone.name, start.elapsed());
                    }
                    Err(e) => {
                        job_clone.record_run(false, start.elapsed()).await;
                        error!("Job {} panicked: {}", job_clone.name, e);
                    }
                }
            }
        });

        info!("Scheduled job: {} (interval: {:?})", name, interval);
        handle
    }

    /// Schedule a job with custom configuration
    pub async fn schedule_job<F, Fut>(
        &self,
        job: Job,
        task: F,
    ) -> JobHandle
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        let name = job.name.clone();
        let interval = job.interval;
        let run_immediately = job.run_immediately;
        let job = Arc::new(job);

        // Store job
        {
            let mut jobs = self.jobs.write().await;
            jobs.insert(name.clone(), job.clone());
        }

        let cancelled = Arc::new(AtomicBool::new(false));
        let handle = JobHandle {
            name: name.clone(),
            cancelled: cancelled.clone(),
        };

        // Spawn job task
        let job_clone = job.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);

            // Skip first tick if not running immediately
            if !run_immediately {
                ticker.tick().await;
            }

            loop {
                ticker.tick().await;

                if cancelled.load(Ordering::SeqCst) {
                    break;
                }

                if !job_clone.is_enabled() {
                    continue;
                }

                let start = Instant::now();
                let result = tokio::spawn(task());

                match result.await {
                    Ok(_) => {
                        job_clone.record_run(true, start.elapsed()).await;
                    }
                    Err(e) => {
                        job_clone.record_run(false, start.elapsed()).await;
                        error!("Job {} panicked: {}", job_clone.name, e);
                    }
                }
            }
        });

        handle
    }

    /// Get a job by name
    pub async fn get(&self, name: &str) -> Option<Arc<Job>> {
        let jobs = self.jobs.read().await;
        jobs.get(name).cloned()
    }

    /// List all job names
    pub async fn list(&self) -> Vec<String> {
        let jobs = self.jobs.read().await;
        jobs.keys().cloned().collect()
    }

    /// Enable a job by name
    pub async fn enable(&self, name: &str) -> Result<(), SchedulerError> {
        let jobs = self.jobs.read().await;
        jobs.get(name)
            .ok_or_else(|| SchedulerError::JobNotFound(name.to_string()))?
            .enable();
        Ok(())
    }

    /// Disable a job by name
    pub async fn disable(&self, name: &str) -> Result<(), SchedulerError> {
        let jobs = self.jobs.read().await;
        jobs.get(name)
            .ok_or_else(|| SchedulerError::JobNotFound(name.to_string()))?
            .disable();
        Ok(())
    }

    /// Get statistics for a job
    pub async fn stats(&self, name: &str) -> Result<JobStats, SchedulerError> {
        let jobs = self.jobs.read().await;
        let job = jobs.get(name)
            .ok_or_else(|| SchedulerError::JobNotFound(name.to_string()))?;
        Ok(job.stats().await)
    }
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

/// Schedule a one-time delayed task
#[allow(dead_code)]
pub fn schedule_once<F, Fut>(delay: Duration, task: F)
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        tokio::time::sleep(delay).await;
        task().await;
    });
}

/// Schedule a task to run at a specific instant
#[allow(dead_code)]
pub fn schedule_at<F, Fut>(when: Instant, task: F)
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        tokio::time::sleep_until(when.into()).await;
        task().await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU32;

    #[tokio::test]
    async fn test_scheduler_basic() {
        let scheduler = Scheduler::new();
        let counter = Arc::new(AtomicU32::new(0));

        let counter_clone = counter.clone();
        let handle = scheduler.schedule(
            "test_job",
            Duration::from_millis(50),
            move || {
                let counter = counter_clone.clone();
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                }
            },
        ).await;

        // Wait for a few runs
        tokio::time::sleep(Duration::from_millis(200)).await;

        handle.cancel();

        let count = counter.load(Ordering::SeqCst);
        assert!(count >= 2, "Expected at least 2 runs, got {}", count);
    }

    #[tokio::test]
    async fn test_job_disable() {
        let scheduler = Scheduler::new();
        let counter = Arc::new(AtomicU32::new(0));

        let counter_clone = counter.clone();
        let _handle = scheduler.schedule(
            "test_job",
            Duration::from_millis(50),
            move || {
                let counter = counter_clone.clone();
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                }
            },
        ).await;

        // Let it run once
        tokio::time::sleep(Duration::from_millis(75)).await;

        // Disable the job
        scheduler.disable("test_job").await.unwrap();

        let count_before = counter.load(Ordering::SeqCst);

        // Wait more
        tokio::time::sleep(Duration::from_millis(100)).await;

        let count_after = counter.load(Ordering::SeqCst);

        // Count should not have increased while disabled
        assert_eq!(count_before, count_after);
    }
}

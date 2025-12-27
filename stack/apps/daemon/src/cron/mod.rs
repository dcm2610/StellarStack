//! Task scheduling module
//!
//! Provides cron-like task scheduling for periodic operations.

mod scheduler;

pub use scheduler::{Scheduler, Job, JobHandle, SchedulerError};

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::api::HttpClient;
use crate::server::Manager;

/// Cron job registry for the daemon
pub struct CronRegistry {
    scheduler: Arc<Scheduler>,
    manager: Arc<Manager>,
    api_client: Arc<HttpClient>,
    handles: RwLock<Vec<JobHandle>>,
}

impl CronRegistry {
    /// Create a new cron registry
    pub fn new(manager: Arc<Manager>, api_client: Arc<HttpClient>) -> Self {
        Self {
            scheduler: Arc::new(Scheduler::new()),
            manager,
            api_client,
            handles: RwLock::new(Vec::new()),
        }
    }

    /// Start all scheduled jobs
    pub async fn start(&self) {
        let mut handles = self.handles.write().await;

        // Disk usage calculation - every 60 seconds
        let manager = self.manager.clone();
        handles.push(self.scheduler.schedule(
            "disk_usage",
            std::time::Duration::from_secs(60),
            move || {
                let manager = manager.clone();
                async move {
                    for _server in manager.all() {
                        // Disk usage calculation - placeholder
                        // Would call filesystem recalculate_usage if available
                    }
                }
            },
        ).await);

        // Activity log batching - every 5 seconds
        let api_client = self.api_client.clone();
        let manager = self.manager.clone();
        handles.push(self.scheduler.schedule(
            "activity_logs",
            std::time::Duration::from_secs(5),
            move || {
                let api_client = api_client.clone();
                let _manager = manager.clone();
                async move {
                    // Collect and send activity logs
                    // This would gather logs from all servers and batch send them
                    let _ = api_client; // Placeholder
                }
            },
        ).await);

        // Server status reporting - every 30 seconds
        let api_client = self.api_client.clone();
        let manager = self.manager.clone();
        handles.push(self.scheduler.schedule(
            "status_report",
            std::time::Duration::from_secs(30),
            move || {
                let api_client = api_client.clone();
                let manager = manager.clone();
                async move {
                    for server in manager.all() {
                        let state = server.process_state();
                        let _ = api_client.set_server_status(&server.uuid(), &state.to_string()).await;
                    }
                }
            },
        ).await);

        // Cleanup temporary files - every 5 minutes
        let manager = self.manager.clone();
        handles.push(self.scheduler.schedule(
            "temp_cleanup",
            std::time::Duration::from_secs(300),
            move || {
                let manager = manager.clone();
                async move {
                    for _server in manager.all() {
                        // Temp cleanup - placeholder
                        // Would call filesystem cleanup_temp if available
                    }
                }
            },
        ).await);
    }

    /// Stop all scheduled jobs
    pub async fn stop(&self) {
        let handles = self.handles.read().await;
        for handle in handles.iter() {
            handle.cancel();
        }
    }

    /// Get the scheduler instance
    pub fn scheduler(&self) -> Arc<Scheduler> {
        self.scheduler.clone()
    }
}

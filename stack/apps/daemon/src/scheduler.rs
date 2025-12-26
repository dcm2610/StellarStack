use bollard::exec::{CreateExecOptions, StartExecOptions};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::docker::DockerService;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleAction {
    Command { command: String },
    Restart,
    Start,
    Stop,
    Kill,
    Backup { name: Option<String>, paths: Option<Vec<String>> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub id: String,
    pub container_id: String,
    pub name: String,
    pub cron: String,
    pub action: ScheduleAction,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScheduleRequest {
    pub name: String,
    pub cron: String,
    pub action: ScheduleAction,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateScheduleRequest {
    pub name: Option<String>,
    pub cron: Option<String>,
    pub action: Option<ScheduleAction>,
    pub enabled: Option<bool>,
}

pub struct SchedulerService {
    scheduler: JobScheduler,
    schedules: Arc<RwLock<HashMap<String, Schedule>>>,
    job_ids: Arc<RwLock<HashMap<String, uuid::Uuid>>>,
    docker: DockerService,
    storage_path: PathBuf,
}

impl SchedulerService {
    pub async fn new(docker: DockerService) -> anyhow::Result<Self> {
        let scheduler = JobScheduler::new().await?;
        let storage_path = PathBuf::from(
            std::env::var("SCHEDULES_PATH").unwrap_or_else(|_| "/var/lib/stellar/schedules".to_string()),
        );

        // Create storage directory if it doesn't exist
        fs::create_dir_all(&storage_path).await.ok();

        let service = Self {
            scheduler,
            schedules: Arc::new(RwLock::new(HashMap::new())),
            job_ids: Arc::new(RwLock::new(HashMap::new())),
            docker,
            storage_path,
        };

        // Load existing schedules
        service.load_schedules().await?;

        // Start the scheduler
        service.scheduler.start().await?;

        Ok(service)
    }

    async fn load_schedules(&self) -> anyhow::Result<()> {
        let schedules_file = self.storage_path.join("schedules.json");

        if !schedules_file.exists() {
            return Ok(());
        }

        let data = fs::read_to_string(&schedules_file).await?;
        let schedules: Vec<Schedule> = serde_json::from_str(&data)?;

        for schedule in schedules {
            if schedule.enabled {
                if let Err(e) = self.register_job(&schedule).await {
                    warn!("Failed to register schedule {}: {}", schedule.id, e);
                }
            }
            self.schedules.write().await.insert(schedule.id.clone(), schedule);
        }

        info!("Loaded {} schedules", self.schedules.read().await.len());
        Ok(())
    }

    async fn save_schedules(&self) -> anyhow::Result<()> {
        let schedules: Vec<Schedule> = self.schedules.read().await.values().cloned().collect();
        let data = serde_json::to_string_pretty(&schedules)?;

        let schedules_file = self.storage_path.join("schedules.json");
        fs::write(&schedules_file, data).await?;

        Ok(())
    }

    async fn register_job(&self, schedule: &Schedule) -> anyhow::Result<()> {
        let schedule_id = schedule.id.clone();
        let container_id = schedule.container_id.clone();
        let action = schedule.action.clone();
        let docker = self.docker.clone();
        let schedules = self.schedules.clone();

        let job = Job::new_async(schedule.cron.as_str(), move |_uuid, _lock| {
            let schedule_id = schedule_id.clone();
            let container_id = container_id.clone();
            let action = action.clone();
            let docker = docker.clone();
            let schedules = schedules.clone();

            Box::pin(async move {
                info!("Executing schedule {} for container {}", schedule_id, container_id);

                let result = execute_action(&docker, &container_id, &action).await;

                match result {
                    Ok(_) => {
                        info!("Schedule {} executed successfully", schedule_id);
                    }
                    Err(e) => {
                        error!("Schedule {} failed: {}", schedule_id, e);
                    }
                }

                // Update last_run
                if let Some(schedule) = schedules.write().await.get_mut(&schedule_id) {
                    schedule.last_run = Some(Utc::now().to_rfc3339());
                }
            })
        })?;

        let job_id = job.guid();
        self.scheduler.add(job).await?;
        self.job_ids.write().await.insert(schedule.id.clone(), job_id);

        Ok(())
    }

    async fn unregister_job(&self, schedule_id: &str) -> anyhow::Result<()> {
        if let Some(job_id) = self.job_ids.write().await.remove(schedule_id) {
            self.scheduler.remove(&job_id).await?;
        }
        Ok(())
    }

    pub async fn list_schedules(&self, container_id: &str) -> Vec<Schedule> {
        self.schedules
            .read()
            .await
            .values()
            .filter(|s| s.container_id == container_id)
            .cloned()
            .collect()
    }

    pub async fn get_schedule(&self, schedule_id: &str) -> Option<Schedule> {
        self.schedules.read().await.get(schedule_id).cloned()
    }

    pub async fn create_schedule(
        &self,
        container_id: String,
        request: CreateScheduleRequest,
    ) -> anyhow::Result<Schedule> {
        let schedule = Schedule {
            id: Uuid::new_v4().to_string(),
            container_id,
            name: request.name,
            cron: request.cron,
            action: request.action,
            enabled: request.enabled.unwrap_or(true),
            last_run: None,
            next_run: None,
            created_at: Utc::now().to_rfc3339(),
        };

        if schedule.enabled {
            self.register_job(&schedule).await?;
        }

        self.schedules.write().await.insert(schedule.id.clone(), schedule.clone());
        self.save_schedules().await?;

        info!("Created schedule {} for container {}", schedule.id, schedule.container_id);
        Ok(schedule)
    }

    pub async fn update_schedule(
        &self,
        schedule_id: &str,
        request: UpdateScheduleRequest,
    ) -> anyhow::Result<Option<Schedule>> {
        let mut schedules = self.schedules.write().await;

        if let Some(schedule) = schedules.get_mut(schedule_id) {
            let was_enabled = schedule.enabled;

            if let Some(name) = request.name {
                schedule.name = name;
            }
            if let Some(cron) = request.cron {
                schedule.cron = cron;
            }
            if let Some(action) = request.action {
                schedule.action = action;
            }
            if let Some(enabled) = request.enabled {
                schedule.enabled = enabled;
            }

            let updated = schedule.clone();
            drop(schedules);

            // Handle job registration changes
            if was_enabled && !updated.enabled {
                self.unregister_job(schedule_id).await?;
            } else if !was_enabled && updated.enabled {
                self.register_job(&updated).await?;
            } else if updated.enabled {
                // Re-register with new settings
                self.unregister_job(schedule_id).await?;
                self.register_job(&updated).await?;
            }

            self.save_schedules().await?;
            info!("Updated schedule {}", schedule_id);
            return Ok(Some(updated));
        }

        Ok(None)
    }

    pub async fn delete_schedule(&self, schedule_id: &str) -> anyhow::Result<bool> {
        self.unregister_job(schedule_id).await?;

        let removed = self.schedules.write().await.remove(schedule_id).is_some();

        if removed {
            self.save_schedules().await?;
            info!("Deleted schedule {}", schedule_id);
        }

        Ok(removed)
    }

    pub async fn run_schedule_now(&self, schedule_id: &str) -> anyhow::Result<bool> {
        let schedule = self.schedules.read().await.get(schedule_id).cloned();

        if let Some(schedule) = schedule {
            execute_action(&self.docker, &schedule.container_id, &schedule.action).await?;

            // Update last_run
            if let Some(s) = self.schedules.write().await.get_mut(schedule_id) {
                s.last_run = Some(Utc::now().to_rfc3339());
            }
            self.save_schedules().await?;

            return Ok(true);
        }

        Ok(false)
    }
}

async fn execute_action(
    docker: &DockerService,
    container_id: &str,
    action: &ScheduleAction,
) -> anyhow::Result<()> {
    match action {
        ScheduleAction::Command { command } => {
            let exec = docker
                .client()
                .create_exec(
                    container_id,
                    CreateExecOptions {
                        attach_stdin: Some(true),
                        attach_stdout: Some(true),
                        attach_stderr: Some(true),
                        cmd: Some(vec!["sh", "-c", command]),
                        ..Default::default()
                    },
                )
                .await?;

            docker
                .client()
                .start_exec(
                    &exec.id,
                    Some(StartExecOptions {
                        detach: true,
                        tty: false,
                        output_capacity: None,
                    }),
                )
                .await?;
        }
        ScheduleAction::Restart => {
            docker.restart_container(container_id, None).await?;
        }
        ScheduleAction::Start => {
            docker.start_container(container_id).await?;
        }
        ScheduleAction::Stop => {
            docker.stop_container(container_id, None).await?;
        }
        ScheduleAction::Kill => {
            docker.kill_container(container_id, None).await?;
        }
        ScheduleAction::Backup { name, paths } => {
            // Use the backup system
            let backup_name = name.clone().unwrap_or_else(|| "scheduled_backup".to_string());
            let backup_paths = paths.clone().unwrap_or_else(|| vec!["/data".to_string()]);

            // Create backup using exec
            let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
            let filename = format!("{}_{}.tar.gz", backup_name, timestamp);
            let paths_str = backup_paths.join(" ");
            let temp_backup = format!("/tmp/{}", filename);

            let cmd = format!("tar -czf {} {}", temp_backup, paths_str);

            let exec = docker
                .client()
                .create_exec(
                    container_id,
                    CreateExecOptions {
                        attach_stdout: Some(true),
                        attach_stderr: Some(true),
                        cmd: Some(vec!["sh", "-c", &cmd]),
                        ..Default::default()
                    },
                )
                .await?;

            docker
                .client()
                .start_exec(
                    &exec.id,
                    Some(StartExecOptions {
                        detach: false,
                        tty: false,
                        output_capacity: None,
                    }),
                )
                .await?;

            info!("Created scheduled backup {} for container {}", filename, container_id);
        }
    }

    Ok(())
}

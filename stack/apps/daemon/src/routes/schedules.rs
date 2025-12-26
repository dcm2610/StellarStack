use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::error::{DaemonError, Result};
use crate::scheduler::{CreateScheduleRequest, Schedule, SchedulerService, UpdateScheduleRequest};

// List schedules for a container
pub async fn list_schedules(
    State(scheduler): State<Arc<SchedulerService>>,
    Path(container_id): Path<String>,
) -> Result<Json<Vec<Schedule>>> {
    let schedules = scheduler.list_schedules(&container_id).await;
    Ok(Json(schedules))
}

// Get a specific schedule
pub async fn get_schedule(
    State(scheduler): State<Arc<SchedulerService>>,
    Path((_container_id, schedule_id)): Path<(String, String)>,
) -> Result<Json<Schedule>> {
    scheduler
        .get_schedule(&schedule_id)
        .await
        .map(Json)
        .ok_or_else(|| DaemonError::NotFound("Schedule not found".to_string()))
}

// Create a schedule
pub async fn create_schedule(
    State(scheduler): State<Arc<SchedulerService>>,
    Path(container_id): Path<String>,
    Json(request): Json<CreateScheduleRequest>,
) -> Result<Json<Schedule>> {
    let schedule = scheduler
        .create_schedule(container_id, request)
        .await
        .map_err(|e| DaemonError::Internal(e.to_string()))?;

    Ok(Json(schedule))
}

// Update a schedule
pub async fn update_schedule(
    State(scheduler): State<Arc<SchedulerService>>,
    Path((_container_id, schedule_id)): Path<(String, String)>,
    Json(request): Json<UpdateScheduleRequest>,
) -> Result<Json<Schedule>> {
    scheduler
        .update_schedule(&schedule_id, request)
        .await
        .map_err(|e| DaemonError::Internal(e.to_string()))?
        .map(Json)
        .ok_or_else(|| DaemonError::NotFound("Schedule not found".to_string()))
}

// Delete a schedule
pub async fn delete_schedule(
    State(scheduler): State<Arc<SchedulerService>>,
    Path((_container_id, schedule_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>> {
    let deleted = scheduler
        .delete_schedule(&schedule_id)
        .await
        .map_err(|e| DaemonError::Internal(e.to_string()))?;

    if deleted {
        Ok(Json(json!({
            "success": true,
            "id": schedule_id
        })))
    } else {
        Err(DaemonError::NotFound("Schedule not found".to_string()))
    }
}

// Run a schedule immediately
pub async fn run_schedule(
    State(scheduler): State<Arc<SchedulerService>>,
    Path((_container_id, schedule_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>> {
    let ran = scheduler
        .run_schedule_now(&schedule_id)
        .await
        .map_err(|e| DaemonError::Internal(e.to_string()))?;

    if ran {
        Ok(Json(json!({
            "success": true,
            "id": schedule_id,
            "message": "Schedule executed"
        })))
    } else {
        Err(DaemonError::NotFound("Schedule not found".to_string()))
    }
}

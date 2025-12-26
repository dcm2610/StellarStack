use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::docker::DockerService;
use crate::error::Result;
use crate::types::{
    Blueprint, ConsoleMessage, ContainerAction, ContainerInfo, ContainerStats,
    CreateContainerResponse, StopContainerRequest,
};

#[derive(Debug, Deserialize)]
pub struct ListContainersQuery {
    pub all: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct LogsQuery {
    pub tail: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RemoveQuery {
    pub force: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct KillQuery {
    pub signal: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateContainerQuery {
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub docker: bool,
}

pub async fn health(State(docker): State<DockerService>) -> Json<HealthResponse> {
    let docker_ok = docker.ping().await.is_ok();
    Json(HealthResponse {
        status: if docker_ok { "healthy" } else { "degraded" }.to_string(),
        docker: docker_ok,
    })
}

pub async fn list_containers(
    State(docker): State<DockerService>,
    Query(query): Query<ListContainersQuery>,
) -> Result<Json<Vec<ContainerInfo>>> {
    let containers = docker.list_containers(query.all.unwrap_or(false)).await?;
    Ok(Json(containers))
}

pub async fn get_container(
    State(docker): State<DockerService>,
    Path(id): Path<String>,
) -> Result<Json<ContainerInfo>> {
    let container = docker.get_container(&id).await?;
    Ok(Json(container))
}

pub async fn create_container(
    State(docker): State<DockerService>,
    Query(query): Query<CreateContainerQuery>,
    Json(blueprint): Json<Blueprint>,
) -> Result<(StatusCode, Json<CreateContainerResponse>)> {
    let response = docker
        .create_container(&blueprint, query.name)
        .await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn start_container(
    State(docker): State<DockerService>,
    Path(id): Path<String>,
) -> Result<Json<ContainerAction>> {
    docker.start_container(&id).await?;
    Ok(Json(ContainerAction {
        action: "start".to_string(),
        container_id: id,
        success: true,
        message: Some("Container started".to_string()),
    }))
}

pub async fn stop_container(
    State(docker): State<DockerService>,
    Path(id): Path<String>,
    Json(request): Json<Option<StopContainerRequest>>,
) -> Result<Json<ContainerAction>> {
    let timeout = request.and_then(|r| r.timeout);
    docker.stop_container(&id, timeout).await?;
    Ok(Json(ContainerAction {
        action: "stop".to_string(),
        container_id: id,
        success: true,
        message: Some("Container stopped".to_string()),
    }))
}

pub async fn restart_container(
    State(docker): State<DockerService>,
    Path(id): Path<String>,
    Json(request): Json<Option<StopContainerRequest>>,
) -> Result<Json<ContainerAction>> {
    let timeout = request.and_then(|r| r.timeout);
    docker.restart_container(&id, timeout).await?;
    Ok(Json(ContainerAction {
        action: "restart".to_string(),
        container_id: id,
        success: true,
        message: Some("Container restarted".to_string()),
    }))
}

pub async fn kill_container(
    State(docker): State<DockerService>,
    Path(id): Path<String>,
    Query(query): Query<KillQuery>,
) -> Result<Json<ContainerAction>> {
    docker
        .kill_container(&id, query.signal.as_deref())
        .await?;
    Ok(Json(ContainerAction {
        action: "kill".to_string(),
        container_id: id,
        success: true,
        message: Some("Container killed".to_string()),
    }))
}

pub async fn remove_container(
    State(docker): State<DockerService>,
    Path(id): Path<String>,
    Query(query): Query<RemoveQuery>,
) -> Result<Json<ContainerAction>> {
    docker
        .remove_container(&id, query.force.unwrap_or(false))
        .await?;
    Ok(Json(ContainerAction {
        action: "remove".to_string(),
        container_id: id,
        success: true,
        message: Some("Container removed".to_string()),
    }))
}

pub async fn get_container_stats(
    State(docker): State<DockerService>,
    Path(id): Path<String>,
) -> Result<Json<ContainerStats>> {
    let stats = docker.get_container_stats(&id).await?;
    Ok(Json(stats))
}

pub async fn get_container_logs(
    State(docker): State<DockerService>,
    Path(id): Path<String>,
    Query(query): Query<LogsQuery>,
) -> Result<Json<Vec<ConsoleMessage>>> {
    let logs = docker
        .get_container_logs(&id, query.tail.as_deref())
        .await?;
    Ok(Json(logs))
}

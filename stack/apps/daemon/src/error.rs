use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DaemonError {
    #[error("Docker error: {0}")]
    Docker(#[from] bollard::errors::Error),

    #[error("Container not found: {0}")]
    ContainerNotFound(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Blueprint validation error: {0}")]
    BlueprintValidation(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("WebSocket error: {0}")]
    WebSocket(String),
}

impl IntoResponse for DaemonError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            DaemonError::Docker(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            DaemonError::ContainerNotFound(id) => {
                (StatusCode::NOT_FOUND, format!("Container not found: {}", id))
            }
            DaemonError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            DaemonError::BlueprintValidation(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            DaemonError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            DaemonError::WebSocket(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
        };

        let body = Json(json!({
            "error": true,
            "message": message,
        }));

        (status, body).into_response()
    }
}

pub type Result<T> = std::result::Result<T, DaemonError>;

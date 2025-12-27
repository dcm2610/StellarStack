//! HTTP request handlers

pub mod backup;
pub mod download;
pub mod files;
pub mod servers;
pub mod system;
pub mod upload;

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

/// Standard error response
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
}

impl ApiError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: message.into(),
        }
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            message: message.into(),
        }
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({
                "error": self.status.canonical_reason().unwrap_or("Error"),
                "message": self.message
            })),
        )
            .into_response()
    }
}

impl From<std::io::Error> for ApiError {
    fn from(err: std::io::Error) -> Self {
        ApiError::internal(err.to_string())
    }
}

impl From<crate::filesystem::FilesystemError> for ApiError {
    fn from(err: crate::filesystem::FilesystemError) -> Self {
        ApiError {
            status: StatusCode::from_u16(err.status_code()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            message: err.to_string(),
        }
    }
}

impl From<crate::server::PowerError> for ApiError {
    fn from(err: crate::server::PowerError) -> Self {
        use crate::server::PowerError;
        match &err {
            PowerError::Suspended => ApiError::forbidden(err.to_string()),
            PowerError::Installing
            | PowerError::Transferring
            | PowerError::Restoring
            | PowerError::Busy => ApiError::conflict(err.to_string()),
            PowerError::AlreadyRunning
            | PowerError::AlreadyStopped => ApiError::bad_request(err.to_string()),
            _ => ApiError::internal(err.to_string()),
        }
    }
}

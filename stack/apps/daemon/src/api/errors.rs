//! API error types

use thiserror::Error;

/// Errors that can occur when communicating with the Panel API
#[derive(Debug, Error)]
pub enum ApiError {
    /// HTTP request failed
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),

    /// Failed to parse JSON response
    #[error("Failed to parse response: {0}")]
    Parse(#[from] serde_json::Error),

    /// Server returned an error response
    #[error("Server error ({status}): {message}")]
    Server {
        status: u16,
        message: String,
    },

    /// Authentication failed
    #[error("Authentication failed: {0}")]
    Authentication(String),

    /// Resource not found
    #[error("Resource not found: {0}")]
    NotFound(String),

    /// Rate limited
    #[error("Rate limited, retry after {retry_after:?} seconds")]
    RateLimited {
        retry_after: Option<u64>,
    },

    /// Request timed out
    #[error("Request timed out")]
    Timeout,

    /// All retry attempts exhausted
    #[error("All retry attempts exhausted: {0}")]
    RetryExhausted(String),

    /// Invalid URL
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    /// Configuration error
    #[error("Configuration error: {0}")]
    Config(String),
}

impl ApiError {
    /// Check if this error is retryable
    pub fn is_retryable(&self) -> bool {
        match self {
            ApiError::Request(e) => {
                // Retry on connection errors, timeouts
                e.is_connect() || e.is_timeout()
            }
            ApiError::Server { status, .. } => {
                // Retry on 5xx errors (server errors)
                *status >= 500
            }
            ApiError::RateLimited { .. } => true,
            ApiError::Timeout => true,
            // Don't retry on client errors, auth failures, etc.
            _ => false,
        }
    }

    /// Get the HTTP status code if available
    pub fn status_code(&self) -> Option<u16> {
        match self {
            ApiError::Server { status, .. } => Some(*status),
            ApiError::Request(e) => e.status().map(|s| s.as_u16()),
            ApiError::NotFound(_) => Some(404),
            ApiError::Authentication(_) => Some(401),
            ApiError::RateLimited { .. } => Some(429),
            _ => None,
        }
    }
}

/// Result type for API operations
pub type ApiResult<T> = Result<T, ApiError>;

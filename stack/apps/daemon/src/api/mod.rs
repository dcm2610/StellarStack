//! Panel API client module
//!
//! Provides an HTTP client for communicating with the StellarStack panel,
//! with automatic retry logic and exponential backoff.

mod client;
mod errors;
mod types;

pub use client::HttpClient;
pub use errors::ApiError;
pub use types::*;

//! System information handlers

use axum::{extract::State, Json};
use serde::Serialize;

use super::super::AppState;

/// System information response
#[derive(Debug, Serialize)]
pub struct SystemInfo {
    /// Daemon version
    pub version: String,

    /// Architecture
    pub architecture: String,

    /// CPU count
    pub cpu_count: usize,

    /// Kernel version
    pub kernel_version: String,

    /// Operating system
    pub os: String,

    /// Server count
    pub server_count: usize,
}

/// Get system information
pub async fn system_info(State(state): State<AppState>) -> Json<SystemInfo> {
    Json(SystemInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        cpu_count: num_cpus::get(),
        kernel_version: sysinfo::System::kernel_version()
            .unwrap_or_else(|| "unknown".to_string()),
        os: sysinfo::System::name()
            .unwrap_or_else(|| std::env::consts::OS.to_string()),
        server_count: state.manager.count(),
    })
}

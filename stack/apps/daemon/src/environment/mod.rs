//! Process environment abstraction module
//!
//! Provides a trait-based abstraction over container runtimes (Docker),
//! enabling server lifecycle management, resource monitoring, and I/O handling.

pub mod docker;
mod traits;

pub use docker::DockerEnvironment;
pub use traits::{
    EnvironmentConfiguration, EnvironmentError, EnvironmentResult,
    MountConfig, ProcessEnvironment, ResourceLimits, StopConfig, UserConfig,
};

//! Backup system module
//!
//! Provides backup creation, restoration, and S3 upload capabilities
//! following Pterodactyl Wings patterns.

mod adapter;
mod backup;
mod local;
mod s3;

pub use adapter::{BackupAdapter, AdapterType};
pub use backup::{Backup, BackupConfig, BackupError, BackupResult};
pub use local::LocalAdapter;
pub use s3::S3Adapter;

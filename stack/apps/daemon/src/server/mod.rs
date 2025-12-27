//! Server management module
//!
//! Provides server lifecycle management, power operations, installation,
//! and state tracking following Wings patterns.

mod configuration;
mod crash;
mod install;
mod manager;
mod power;
mod server;
mod state;

pub use configuration::*;
pub use crash::CrashHandler;
pub use install::InstallationProcess;
pub use manager::Manager;
pub use power::{PowerAction, PowerError};
pub use server::Server;
pub use state::ServerState;

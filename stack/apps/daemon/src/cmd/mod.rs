//! CLI command handlers

use clap::Subcommand;

pub mod configure;
pub mod diagnostics;
pub mod root;

#[derive(Subcommand)]
pub enum Commands {
    /// Interactive configuration setup
    Configure,
    /// Run diagnostics and display system information
    Diagnostics,
}

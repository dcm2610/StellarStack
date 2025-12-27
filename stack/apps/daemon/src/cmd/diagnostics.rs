//! Diagnostics command - displays system and Docker information

use anyhow::Result;
use sysinfo::System;
use bollard::Docker;

/// Run diagnostics and display system information
pub async fn run() -> Result<()> {
    println!("StellarStack Daemon Diagnostics");
    println!("================================\n");

    // System information
    println!("System Information:");
    println!("-------------------");

    let mut sys = System::new_all();
    sys.refresh_all();

    println!("  OS: {} {}", System::name().unwrap_or_default(), System::os_version().unwrap_or_default());
    println!("  Kernel: {}", System::kernel_version().unwrap_or_default());
    println!("  Hostname: {}", System::host_name().unwrap_or_default());
    println!("  CPUs: {}", sys.cpus().len());
    println!("  Total Memory: {} MB", sys.total_memory() / 1024 / 1024);
    println!("  Used Memory: {} MB", sys.used_memory() / 1024 / 1024);
    println!("  Uptime: {} seconds", System::uptime());

    // Docker information
    println!("\nDocker Information:");
    println!("-------------------");

    match Docker::connect_with_local_defaults() {
        Ok(docker) => {
            match docker.version().await {
                Ok(version) => {
                    println!("  Version: {}", version.version.unwrap_or_default());
                    println!("  API Version: {}", version.api_version.unwrap_or_default());
                    println!("  Go Version: {}", version.go_version.unwrap_or_default());
                    println!("  OS/Arch: {}/{}",
                        version.os.unwrap_or_default(),
                        version.arch.unwrap_or_default()
                    );
                }
                Err(e) => {
                    println!("  Error getting version: {}", e);
                }
            }

            match docker.info().await {
                Ok(info) => {
                    println!("  Containers: {}", info.containers.unwrap_or(0));
                    println!("    Running: {}", info.containers_running.unwrap_or(0));
                    println!("    Paused: {}", info.containers_paused.unwrap_or(0));
                    println!("    Stopped: {}", info.containers_stopped.unwrap_or(0));
                    println!("  Images: {}", info.images.unwrap_or(0));
                    println!("  Storage Driver: {}", info.driver.unwrap_or_default());
                }
                Err(e) => {
                    println!("  Error getting info: {}", e);
                }
            }
        }
        Err(e) => {
            println!("  Error connecting to Docker: {}", e);
            println!("  Make sure Docker is running and accessible.");
        }
    }

    // Network information
    println!("\nNetwork Interfaces:");
    println!("-------------------");

    let networks = sysinfo::Networks::new_with_refreshed_list();
    for (name, _data) in &networks {
        println!("  {}", name);
    }

    println!("\nDiagnostics complete.");
    Ok(())
}

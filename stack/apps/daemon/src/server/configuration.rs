//! Server configuration types

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// Complete server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Server UUID
    pub uuid: String,

    /// Server name
    pub name: String,

    /// Whether the server is suspended
    #[serde(default)]
    pub suspended: bool,

    /// Startup invocation command
    pub invocation: String,

    /// Skip egg installation scripts
    #[serde(default)]
    pub skip_egg_scripts: bool,

    /// Build/resource configuration
    pub build: BuildConfig,

    /// Container configuration
    pub container: ContainerConfig,

    /// Network allocations
    pub allocations: AllocationsConfig,

    /// Egg configuration
    pub egg: EggConfig,

    /// Mount configurations
    #[serde(default)]
    pub mounts: Vec<MountConfig>,

    /// Process configuration (startup/stop)
    pub process: ProcessConfig,

    /// Environment variables
    #[serde(default)]
    pub environment: HashMap<String, String>,
}

/// Build/resource limits configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildConfig {
    /// Memory limit in MB (-1 for unlimited)
    #[serde(default = "default_memory")]
    pub memory_limit: i64,

    /// Swap limit in MB (-1 for unlimited)
    #[serde(default = "default_swap")]
    pub swap: i64,

    /// I/O weight (10-1000)
    #[serde(default = "default_io")]
    pub io_weight: u32,

    /// CPU limit as percentage (100 = 1 core, -1 for unlimited)
    #[serde(default = "default_cpu")]
    pub cpu_limit: i64,

    /// CPU threads to pin to (comma-separated)
    #[serde(default)]
    pub threads: Option<String>,

    /// Disk space limit in MB (-1 for unlimited)
    #[serde(default = "default_disk")]
    pub disk_space: i64,

    /// Whether OOM killer is disabled
    #[serde(default)]
    pub oom_disabled: bool,
}

fn default_memory() -> i64 { -1 }
fn default_swap() -> i64 { -1 }
fn default_io() -> u32 { 500 }
fn default_cpu() -> i64 { -1 }
fn default_disk() -> i64 { -1 }

impl Default for BuildConfig {
    fn default() -> Self {
        Self {
            memory_limit: -1,
            swap: -1,
            io_weight: 500,
            cpu_limit: -1,
            threads: None,
            disk_space: -1,
            oom_disabled: false,
        }
    }
}

/// Container configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerConfig {
    /// Docker image to use
    pub image: String,

    /// Whether OOM killer is disabled (override)
    #[serde(default)]
    pub oom_disabled: bool,

    /// Requires container rebuild
    #[serde(default)]
    pub requires_rebuild: bool,
}

impl Default for ContainerConfig {
    fn default() -> Self {
        Self {
            image: String::new(),
            oom_disabled: false,
            requires_rebuild: false,
        }
    }
}

/// Network allocations configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllocationsConfig {
    /// Default allocation
    pub default: Allocation,

    /// Additional port mappings (IP -> ports)
    #[serde(default)]
    pub mappings: HashMap<String, Vec<u16>>,
}

impl Default for AllocationsConfig {
    fn default() -> Self {
        Self {
            default: Allocation::default(),
            mappings: HashMap::new(),
        }
    }
}

/// Single port allocation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Allocation {
    /// IP address
    pub ip: String,

    /// Port number
    pub port: u16,
}

impl Default for Allocation {
    fn default() -> Self {
        Self {
            ip: "0.0.0.0".to_string(),
            port: 25565,
        }
    }
}

/// Egg configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EggConfig {
    /// Egg UUID/ID
    pub id: String,

    /// File denylist patterns
    #[serde(default)]
    pub file_denylist: Vec<String>,

    /// Whether to fix permissions on start
    #[serde(default)]
    pub fix_permissions: bool,
}

impl Default for EggConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            file_denylist: Vec::new(),
            fix_permissions: false,
        }
    }
}

/// Mount configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MountConfig {
    /// Source path on host
    pub source: String,

    /// Target path in container
    pub target: String,

    /// Read-only mount
    #[serde(default)]
    pub read_only: bool,
}

/// Process startup/stop configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessConfig {
    /// Startup detection configuration
    pub startup: StartupConfig,

    /// Stop configuration
    pub stop: StopConfig,

    /// Configuration files to modify
    #[serde(default)]
    pub configs: Vec<ConfigFileEntry>,
}

impl Default for ProcessConfig {
    fn default() -> Self {
        Self {
            startup: StartupConfig::default(),
            stop: StopConfig::default(),
            configs: Vec::new(),
        }
    }
}

/// Startup detection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupConfig {
    /// Patterns indicating startup complete
    #[serde(default)]
    pub done: Vec<String>,

    /// User interaction patterns
    #[serde(default)]
    pub user_interaction: Vec<String>,

    /// Strip ANSI codes from output
    #[serde(default)]
    pub strip_ansi: bool,
}

impl Default for StartupConfig {
    fn default() -> Self {
        Self {
            done: Vec::new(),
            user_interaction: Vec::new(),
            strip_ansi: false,
        }
    }
}

/// Stop configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StopConfig {
    /// Send a signal
    Signal {
        #[serde(default = "default_signal")]
        value: String,
    },
    /// Send a command
    Command { value: String },
    /// No specific stop method
    None,
}

fn default_signal() -> String {
    "SIGTERM".to_string()
}

impl Default for StopConfig {
    fn default() -> Self {
        StopConfig::Signal {
            value: "SIGTERM".to_string(),
        }
    }
}

impl StopConfig {
    /// Convert to environment StopConfig
    pub fn to_env_stop_config(&self) -> crate::environment::StopConfig {
        match self {
            StopConfig::Signal { value } => crate::environment::StopConfig::Signal(value.clone()),
            StopConfig::Command { value } => crate::environment::StopConfig::Command(value.clone()),
            StopConfig::None => crate::environment::StopConfig::Native,
        }
    }
}

/// Configuration file entry for startup modifications
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFileEntry {
    /// Parser type (yaml, json, ini, xml, properties, file)
    pub parser: String,

    /// File path relative to server root
    pub file: String,

    /// Replacements to make
    pub replace: Vec<ConfigReplacement>,
}

/// Single configuration replacement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigReplacement {
    /// Match pattern
    #[serde(rename = "match")]
    pub match_pattern: String,

    /// Replacement value
    pub replace_with: String,

    /// Optional condition
    #[serde(default)]
    pub if_value: Option<String>,
}

impl ServerConfig {
    /// Convert API server configuration to internal format
    pub fn from_api(api_config: &crate::api::ServerConfiguration) -> Self {
        let mut environment = HashMap::new();

        // Build standard environment variables
        environment.insert("STARTUP".to_string(), api_config.invocation.clone());
        environment.insert("SERVER_IP".to_string(), api_config.allocations.default.ip.clone());
        environment.insert("SERVER_PORT".to_string(), api_config.allocations.default.port.to_string());
        environment.insert("P_SERVER_UUID".to_string(), api_config.uuid.clone());

        Self {
            uuid: api_config.uuid.clone(),
            name: api_config.name.clone(),
            suspended: api_config.suspended,
            invocation: api_config.invocation.clone(),
            skip_egg_scripts: api_config.skip_egg_scripts,
            build: BuildConfig {
                memory_limit: api_config.build.memory_limit,
                swap: api_config.build.swap,
                io_weight: api_config.build.io_weight,
                cpu_limit: api_config.build.cpu_limit,
                threads: api_config.build.threads.clone(),
                disk_space: api_config.build.disk_space,
                oom_disabled: api_config.build.oom_disabled,
            },
            container: ContainerConfig {
                image: api_config.container.image.clone(),
                oom_disabled: api_config.container.oom_disabled,
                requires_rebuild: api_config.container.requires_rebuild,
            },
            allocations: AllocationsConfig {
                default: Allocation {
                    ip: api_config.allocations.default.ip.clone(),
                    port: api_config.allocations.default.port,
                },
                mappings: api_config.allocations.mappings.clone(),
            },
            egg: EggConfig {
                id: api_config.egg.id.clone(),
                file_denylist: api_config.egg.file_denylist.clone(),
                fix_permissions: false,
            },
            mounts: api_config.mounts.iter().map(|m| MountConfig {
                source: m.source.clone(),
                target: m.target.clone(),
                read_only: m.read_only,
            }).collect(),
            process: ProcessConfig::default(), // Will be filled from process_configuration
            environment,
        }
    }

    /// Get all port bindings as (container_port, (host_ip, host_port))
    pub fn get_port_bindings(&self) -> HashMap<u16, (String, u16)> {
        let mut bindings = HashMap::new();

        // Default allocation
        bindings.insert(
            self.allocations.default.port,
            (self.allocations.default.ip.clone(), self.allocations.default.port),
        );

        // Additional mappings
        for (ip, ports) in &self.allocations.mappings {
            for port in ports {
                bindings.insert(*port, (ip.clone(), *port));
            }
        }

        bindings
    }

    /// Calculate memory limit in bytes
    pub fn memory_bytes(&self) -> u64 {
        if self.build.memory_limit <= 0 {
            0 // Unlimited
        } else {
            (self.build.memory_limit as u64) * 1024 * 1024
        }
    }

    /// Calculate swap limit in bytes
    pub fn swap_bytes(&self) -> i64 {
        if self.build.swap <= 0 {
            -1 // Unlimited or same as memory
        } else {
            (self.build.swap as i64) * 1024 * 1024
        }
    }

    /// Calculate CPU quota (microseconds per period)
    pub fn cpu_quota(&self) -> i64 {
        if self.build.cpu_limit <= 0 {
            0 // Unlimited
        } else {
            // CPU limit is percentage, convert to quota
            // With period of 100000us, quota = limit * 1000
            (self.build.cpu_limit * 1000) as i64
        }
    }

    /// Get disk space limit in bytes
    pub fn disk_bytes(&self) -> u64 {
        if self.build.disk_space <= 0 {
            0 // Unlimited
        } else {
            (self.build.disk_space as u64) * 1024 * 1024
        }
    }
}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blueprint {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub image: DockerImage,
    pub resources: Option<ResourceLimits>,
    pub mounts: Option<Vec<Mount>>,
    pub volumes: Option<Vec<Volume>>,
    pub ports: Option<Vec<PortMapping>>,
    pub environment: Option<HashMap<String, String>>,
    pub command: Option<Vec<String>>,
    pub entrypoint: Option<Vec<String>>,
    pub working_dir: Option<String>,
    pub user: Option<String>,
    pub restart_policy: Option<RestartPolicy>,
    pub network_mode: Option<String>,
    pub hostname: Option<String>,
    pub labels: Option<HashMap<String, String>>,
    pub tty: Option<bool>,
    pub stdin_open: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerImage {
    pub name: String,
    pub tag: Option<String>,
    pub registry: Option<String>,
}

impl DockerImage {
    pub fn full_name(&self) -> String {
        let tag = self.tag.as_deref().unwrap_or("latest");
        match &self.registry {
            Some(registry) => format!("{}/{}:{}", registry, self.name, tag),
            None => format!("{}:{}", self.name, tag),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    /// Memory limit in bytes
    pub memory: Option<i64>,
    /// Memory + swap limit in bytes
    pub memory_swap: Option<i64>,
    /// CPU cores limit (e.g., 1.0 = 1 core, 0.5 = half core, 2.5 = 2.5 cores)
    pub cpus: Option<f64>,
    /// Relative CPU weight (default 1024)
    pub cpu_shares: Option<i64>,
    /// CPU CFS period in microseconds
    pub cpu_period: Option<i64>,
    /// CPU CFS quota in microseconds
    pub cpu_quota: Option<i64>,
    /// Pin to specific CPUs (e.g., "0,1" or "0-3")
    pub cpuset_cpus: Option<String>,
    /// Pin to specific memory nodes
    pub cpuset_mems: Option<String>,
    /// CPU limit in nano CPUs (1e9 = 1 CPU) - use `cpus` instead for simplicity
    pub nano_cpus: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mount {
    pub source: String,
    pub target: String,
    pub read_only: Option<bool>,
    #[serde(rename = "type")]
    pub mount_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Volume {
    pub name: String,
    pub target: String,
    pub read_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortMapping {
    pub container_port: u16,
    pub host_port: Option<u16>,
    pub host_ip: Option<String>,
    pub protocol: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RestartPolicy {
    No,
    Always,
    OnFailure,
    UnlessStopped,
}

impl Default for RestartPolicy {
    fn default() -> Self {
        Self::No
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateContainerRequest {
    pub blueprint: Blueprint,
    pub container_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateContainerResponse {
    pub id: String,
    pub name: String,
    pub warnings: Vec<String>,
}

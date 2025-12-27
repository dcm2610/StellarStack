//! Configuration file parser module
//!
//! Parses and modifies game server configuration files in various formats.
//! Supports: YAML, JSON, INI, Properties, XML

mod json;
mod ini;
mod properties;
mod xml;
mod yaml;

pub use self::json::JsonParser;
pub use self::ini::IniParser;
pub use self::properties::PropertiesParser;
pub use self::xml::XmlParser;
pub use self::yaml::YamlParser;

use std::path::Path;
use thiserror::Error;

/// Parser errors
#[derive(Debug, Error)]
pub enum ParserError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Key not found: {0}")]
    KeyNotFound(String),

    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),

    #[error("{0}")]
    Other(String),
}

pub type ParserResult<T> = Result<T, ParserError>;

/// Parser type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParserType {
    Yaml,
    Json,
    Ini,
    Properties,
    Xml,
}

impl ParserType {
    /// Detect parser type from file extension
    pub fn from_extension(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?.to_lowercase();
        match ext.as_str() {
            "yml" | "yaml" => Some(Self::Yaml),
            "json" => Some(Self::Json),
            "ini" | "cfg" => Some(Self::Ini),
            "properties" | "props" => Some(Self::Properties),
            "xml" => Some(Self::Xml),
            _ => None,
        }
    }

    /// Detect parser type from content
    pub fn from_content(content: &str) -> Option<Self> {
        let trimmed = content.trim();

        // JSON starts with { or [
        if trimmed.starts_with('{') || trimmed.starts_with('[') {
            return Some(Self::Json);
        }

        // XML starts with <?xml or <
        if trimmed.starts_with("<?xml") || (trimmed.starts_with('<') && trimmed.contains("</")) {
            return Some(Self::Xml);
        }

        // Properties/INI have key=value or key: value patterns
        // Check for YAML-specific features first
        if trimmed.contains(": ") && (trimmed.contains("\n  ") || trimmed.contains("---")) {
            return Some(Self::Yaml);
        }

        // Check for INI sections
        if trimmed.contains('[') && trimmed.contains(']') {
            return Some(Self::Ini);
        }

        // Default to properties for simple key=value files
        if trimmed.contains('=') {
            return Some(Self::Properties);
        }

        None
    }
}

/// Configuration file parser trait
pub trait ConfigParser: Send + Sync {
    /// Parse a configuration file from string content
    fn parse(&self, content: &str) -> ParserResult<ConfigValue>;

    /// Serialize a configuration value to string
    fn serialize(&self, value: &ConfigValue) -> ParserResult<String>;

    /// Get a value by key path (e.g., "server.port")
    fn get(&self, content: &str, key: &str) -> ParserResult<ConfigValue>;

    /// Set a value by key path
    fn set(&self, content: &str, key: &str, value: ConfigValue) -> ParserResult<String>;

    /// Get the parser type
    fn parser_type(&self) -> ParserType;
}

/// Configuration value types
#[derive(Debug, Clone, PartialEq)]
pub enum ConfigValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    String(String),
    Array(Vec<ConfigValue>),
    Object(std::collections::HashMap<String, ConfigValue>),
}

impl ConfigValue {
    /// Convert to string representation
    pub fn as_string(&self) -> Option<String> {
        match self {
            ConfigValue::Null => Some("null".to_string()),
            ConfigValue::Bool(b) => Some(b.to_string()),
            ConfigValue::Int(i) => Some(i.to_string()),
            ConfigValue::Float(f) => Some(f.to_string()),
            ConfigValue::String(s) => Some(s.clone()),
            _ => None,
        }
    }

    /// Check if value is null
    pub fn is_null(&self) -> bool {
        matches!(self, ConfigValue::Null)
    }

    /// Get as bool
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            ConfigValue::Bool(b) => Some(*b),
            ConfigValue::String(s) => {
                match s.to_lowercase().as_str() {
                    "true" | "yes" | "on" | "1" => Some(true),
                    "false" | "no" | "off" | "0" => Some(false),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    /// Get as integer
    pub fn as_int(&self) -> Option<i64> {
        match self {
            ConfigValue::Int(i) => Some(*i),
            ConfigValue::Float(f) => Some(*f as i64),
            ConfigValue::String(s) => s.parse().ok(),
            _ => None,
        }
    }

    /// Get as float
    pub fn as_float(&self) -> Option<f64> {
        match self {
            ConfigValue::Float(f) => Some(*f),
            ConfigValue::Int(i) => Some(*i as f64),
            ConfigValue::String(s) => s.parse().ok(),
            _ => None,
        }
    }

    /// Get value at key path
    pub fn get_path(&self, path: &str) -> Option<&ConfigValue> {
        let parts: Vec<&str> = path.split('.').collect();
        self.get_path_parts(&parts)
    }

    fn get_path_parts(&self, parts: &[&str]) -> Option<&ConfigValue> {
        if parts.is_empty() {
            return Some(self);
        }

        match self {
            ConfigValue::Object(map) => {
                map.get(parts[0]).and_then(|v| v.get_path_parts(&parts[1..]))
            }
            ConfigValue::Array(arr) => {
                parts[0].parse::<usize>().ok()
                    .and_then(|i| arr.get(i))
                    .and_then(|v| v.get_path_parts(&parts[1..]))
            }
            _ => None,
        }
    }

    /// Set value at key path
    pub fn set_path(&mut self, path: &str, value: ConfigValue) -> ParserResult<()> {
        let parts: Vec<&str> = path.split('.').collect();
        self.set_path_parts(&parts, value)
    }

    fn set_path_parts(&mut self, parts: &[&str], value: ConfigValue) -> ParserResult<()> {
        if parts.is_empty() {
            *self = value;
            return Ok(());
        }

        match self {
            ConfigValue::Object(map) => {
                if parts.len() == 1 {
                    map.insert(parts[0].to_string(), value);
                } else {
                    let entry = map.entry(parts[0].to_string())
                        .or_insert(ConfigValue::Object(std::collections::HashMap::new()));
                    entry.set_path_parts(&parts[1..], value)?;
                }
                Ok(())
            }
            ConfigValue::Array(arr) => {
                let index = parts[0].parse::<usize>()
                    .map_err(|_| ParserError::KeyNotFound(parts[0].to_string()))?;

                if index >= arr.len() {
                    return Err(ParserError::KeyNotFound(parts[0].to_string()));
                }

                if parts.len() == 1 {
                    arr[index] = value;
                } else {
                    arr[index].set_path_parts(&parts[1..], value)?;
                }
                Ok(())
            }
            _ => Err(ParserError::KeyNotFound(parts.join("."))),
        }
    }
}

impl From<bool> for ConfigValue {
    fn from(v: bool) -> Self {
        ConfigValue::Bool(v)
    }
}

impl From<i64> for ConfigValue {
    fn from(v: i64) -> Self {
        ConfigValue::Int(v)
    }
}

impl From<i32> for ConfigValue {
    fn from(v: i32) -> Self {
        ConfigValue::Int(v as i64)
    }
}

impl From<f64> for ConfigValue {
    fn from(v: f64) -> Self {
        ConfigValue::Float(v)
    }
}

impl From<String> for ConfigValue {
    fn from(v: String) -> Self {
        ConfigValue::String(v)
    }
}

impl From<&str> for ConfigValue {
    fn from(v: &str) -> Self {
        ConfigValue::String(v.to_string())
    }
}

/// Get a parser for the specified type
pub fn get_parser(parser_type: ParserType) -> Box<dyn ConfigParser> {
    match parser_type {
        ParserType::Yaml => Box::new(YamlParser::new()),
        ParserType::Json => Box::new(JsonParser::new()),
        ParserType::Ini => Box::new(IniParser::new()),
        ParserType::Properties => Box::new(PropertiesParser::new()),
        ParserType::Xml => Box::new(XmlParser::new()),
    }
}

/// Get a parser based on file path
pub fn get_parser_for_file(path: &Path) -> ParserResult<Box<dyn ConfigParser>> {
    ParserType::from_extension(path)
        .map(get_parser)
        .ok_or_else(|| ParserError::UnsupportedFormat(
            path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("unknown")
                .to_string()
        ))
}

/// Parse a configuration file
pub async fn parse_file(path: &Path) -> ParserResult<ConfigValue> {
    let content = tokio::fs::read_to_string(path).await?;
    let parser = get_parser_for_file(path)?;
    parser.parse(&content)
}

/// Update a configuration file with new values
pub async fn update_file(
    path: &Path,
    updates: &[(String, ConfigValue)],
) -> ParserResult<()> {
    let content = tokio::fs::read_to_string(path).await?;
    let parser = get_parser_for_file(path)?;

    let mut updated_content = content;
    for (key, value) in updates {
        updated_content = parser.set(&updated_content, key, value.clone())?;
    }

    tokio::fs::write(path, updated_content).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_value_path() {
        let mut config = ConfigValue::Object(std::collections::HashMap::new());

        // Set nested value
        config.set_path("server.port", ConfigValue::Int(25565)).unwrap();

        // Get nested value
        let port = config.get_path("server.port").unwrap();
        assert_eq!(port.as_int(), Some(25565));
    }

    #[test]
    fn test_parser_type_from_extension() {
        assert_eq!(
            ParserType::from_extension(Path::new("config.yml")),
            Some(ParserType::Yaml)
        );
        assert_eq!(
            ParserType::from_extension(Path::new("config.json")),
            Some(ParserType::Json)
        );
        assert_eq!(
            ParserType::from_extension(Path::new("server.properties")),
            Some(ParserType::Properties)
        );
    }
}

//! Properties file parser
//!
//! Parses Java-style .properties files (like Minecraft's server.properties)

use std::collections::HashMap;

use super::{ConfigParser, ConfigValue, ParserError, ParserResult, ParserType};

/// Properties parser implementation
pub struct PropertiesParser;

impl PropertiesParser {
    pub fn new() -> Self {
        Self
    }

    /// Parse a properties line
    fn parse_line(line: &str) -> Option<(String, String)> {
        let trimmed = line.trim();

        // Skip empty lines and comments
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') {
            return None;
        }

        // Find the separator (= or :)
        let separator_pos = trimmed.find('=')
            .or_else(|| trimmed.find(':'));

        if let Some(pos) = separator_pos {
            let key = trimmed[..pos].trim().to_string();
            let value = trimmed[pos + 1..].trim().to_string();
            Some((key, value))
        } else {
            None
        }
    }

    /// Parse value to appropriate type
    fn parse_value(value: &str) -> ConfigValue {
        // Try boolean
        match value.to_lowercase().as_str() {
            "true" => return ConfigValue::Bool(true),
            "false" => return ConfigValue::Bool(false),
            _ => {}
        }

        // Try integer
        if let Ok(i) = value.parse::<i64>() {
            return ConfigValue::Int(i);
        }

        // Try float
        if let Ok(f) = value.parse::<f64>() {
            return ConfigValue::Float(f);
        }

        // Default to string
        ConfigValue::String(value.to_string())
    }

    /// Serialize value for properties file
    fn serialize_value(value: &ConfigValue) -> String {
        match value {
            ConfigValue::Null => String::new(),
            ConfigValue::Bool(b) => b.to_string(),
            ConfigValue::Int(i) => i.to_string(),
            ConfigValue::Float(f) => f.to_string(),
            ConfigValue::String(s) => s.clone(),
            ConfigValue::Array(_) | ConfigValue::Object(_) => {
                // Properties files don't support complex types
                String::new()
            }
        }
    }
}

impl Default for PropertiesParser {
    fn default() -> Self {
        Self::new()
    }
}

impl ConfigParser for PropertiesParser {
    fn parse(&self, content: &str) -> ParserResult<ConfigValue> {
        let mut map = HashMap::new();

        for line in content.lines() {
            if let Some((key, value)) = Self::parse_line(line) {
                map.insert(key, Self::parse_value(&value));
            }
        }

        Ok(ConfigValue::Object(map))
    }

    fn serialize(&self, value: &ConfigValue) -> ParserResult<String> {
        match value {
            ConfigValue::Object(map) => {
                let mut lines = Vec::new();

                // Sort keys for consistent output
                let mut keys: Vec<_> = map.keys().collect();
                keys.sort();

                for key in keys {
                    if let Some(val) = map.get(key) {
                        let serialized = Self::serialize_value(val);
                        lines.push(format!("{}={}", key, serialized));
                    }
                }

                Ok(lines.join("\n"))
            }
            _ => Err(ParserError::Parse(
                "Properties can only serialize objects".to_string()
            )),
        }
    }

    fn get(&self, content: &str, key: &str) -> ParserResult<ConfigValue> {
        // Properties files are flat, so key is just the property name
        for line in content.lines() {
            if let Some((k, v)) = Self::parse_line(line) {
                if k == key {
                    return Ok(Self::parse_value(&v));
                }
            }
        }

        Err(ParserError::KeyNotFound(key.to_string()))
    }

    fn set(&self, content: &str, key: &str, value: ConfigValue) -> ParserResult<String> {
        let serialized_value = Self::serialize_value(&value);
        let mut found = false;
        let mut lines: Vec<String> = Vec::new();

        for line in content.lines() {
            if let Some((k, _)) = Self::parse_line(line) {
                if k == key {
                    lines.push(format!("{}={}", key, serialized_value));
                    found = true;
                    continue;
                }
            }
            lines.push(line.to_string());
        }

        // If key wasn't found, add it at the end
        if !found {
            lines.push(format!("{}={}", key, serialized_value));
        }

        Ok(lines.join("\n"))
    }

    fn parser_type(&self) -> ParserType {
        ParserType::Properties
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_properties_parse() {
        let parser = PropertiesParser::new();
        let content = r#"
# Minecraft server properties
server-port=25565
max-players=20
motd=A Minecraft Server
online-mode=true
difficulty=2
"#;

        let config = parser.parse(content).unwrap();

        if let ConfigValue::Object(map) = config {
            assert_eq!(map.get("server-port").and_then(|v| v.as_int()), Some(25565));
            assert_eq!(map.get("max-players").and_then(|v| v.as_int()), Some(20));
            assert_eq!(map.get("online-mode").and_then(|v| v.as_bool()), Some(true));
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_properties_get_set() {
        let parser = PropertiesParser::new();
        let content = "server-port=25565\nmax-players=20";

        let port = parser.get(content, "server-port").unwrap();
        assert_eq!(port.as_int(), Some(25565));

        let updated = parser.set(content, "server-port", ConfigValue::Int(25566)).unwrap();
        let new_port = parser.get(&updated, "server-port").unwrap();
        assert_eq!(new_port.as_int(), Some(25566));
    }

    #[test]
    fn test_properties_add_new_key() {
        let parser = PropertiesParser::new();
        let content = "existing=value";

        let updated = parser.set(content, "new-key", ConfigValue::String("new-value".into())).unwrap();
        assert!(updated.contains("new-key=new-value"));
        assert!(updated.contains("existing=value"));
    }
}

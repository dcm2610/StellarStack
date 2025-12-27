//! INI configuration file parser

use std::collections::HashMap;

use super::{ConfigParser, ConfigValue, ParserError, ParserResult, ParserType};

/// INI parser implementation
pub struct IniParser;

impl IniParser {
    pub fn new() -> Self {
        Self
    }

    /// Parse a value string to appropriate type
    fn parse_value(value: &str) -> ConfigValue {
        let trimmed = value.trim();

        // Handle quoted strings
        if (trimmed.starts_with('"') && trimmed.ends_with('"'))
            || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
        {
            return ConfigValue::String(trimmed[1..trimmed.len() - 1].to_string());
        }

        // Try boolean
        match trimmed.to_lowercase().as_str() {
            "true" | "yes" | "on" | "1" => return ConfigValue::Bool(true),
            "false" | "no" | "off" | "0" => return ConfigValue::Bool(false),
            _ => {}
        }

        // Try integer
        if let Ok(i) = trimmed.parse::<i64>() {
            return ConfigValue::Int(i);
        }

        // Try float
        if let Ok(f) = trimmed.parse::<f64>() {
            return ConfigValue::Float(f);
        }

        // Default to string
        ConfigValue::String(trimmed.to_string())
    }

    /// Serialize value for INI file
    fn serialize_value(value: &ConfigValue) -> String {
        match value {
            ConfigValue::Null => String::new(),
            ConfigValue::Bool(b) => if *b { "true" } else { "false" }.to_string(),
            ConfigValue::Int(i) => i.to_string(),
            ConfigValue::Float(f) => f.to_string(),
            ConfigValue::String(s) => {
                // Quote strings with spaces or special characters
                if s.contains(' ') || s.contains('=') || s.contains(';') || s.contains('#') {
                    format!("\"{}\"", s)
                } else {
                    s.clone()
                }
            }
            ConfigValue::Array(_) | ConfigValue::Object(_) => String::new(),
        }
    }
}

impl Default for IniParser {
    fn default() -> Self {
        Self::new()
    }
}

impl ConfigParser for IniParser {
    fn parse(&self, content: &str) -> ParserResult<ConfigValue> {
        let mut root: HashMap<String, ConfigValue> = HashMap::new();
        let mut current_section: Option<String> = None;

        for line in content.lines() {
            let trimmed = line.trim();

            // Skip empty lines and comments
            if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
                continue;
            }

            // Check for section header
            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                let section_name = trimmed[1..trimmed.len() - 1].trim().to_string();
                root.entry(section_name.clone())
                    .or_insert(ConfigValue::Object(HashMap::new()));
                current_section = Some(section_name);
                continue;
            }

            // Parse key=value
            if let Some(eq_pos) = trimmed.find('=') {
                let key = trimmed[..eq_pos].trim().to_string();
                let value = trimmed[eq_pos + 1..].trim();

                // Remove inline comments
                let value = if let Some(comment_pos) = value.find(';') {
                    value[..comment_pos].trim()
                } else if let Some(comment_pos) = value.find('#') {
                    // Only treat # as comment if not in quotes
                    if !value.starts_with('"') {
                        value[..comment_pos].trim()
                    } else {
                        value
                    }
                } else {
                    value
                };

                let parsed_value = Self::parse_value(value);

                if let Some(ref section) = current_section {
                    if let Some(ConfigValue::Object(section_map)) = root.get_mut(section) {
                        section_map.insert(key, parsed_value);
                    }
                } else {
                    // Global key (before any section)
                    root.insert(key, parsed_value);
                }
            }
        }

        Ok(ConfigValue::Object(root))
    }

    fn serialize(&self, value: &ConfigValue) -> ParserResult<String> {
        let mut lines = Vec::new();

        if let ConfigValue::Object(root) = value {
            // First, write global keys (non-object values)
            let mut global_keys: Vec<_> = root.iter()
                .filter(|(_, v)| !matches!(v, ConfigValue::Object(_)))
                .collect();
            global_keys.sort_by_key(|(k, _)| *k);

            let has_global_keys = !global_keys.is_empty();
            for (key, val) in global_keys {
                lines.push(format!("{} = {}", key, Self::serialize_value(val)));
            }

            if has_global_keys {
                lines.push(String::new());
            }

            // Then, write sections
            let mut sections: Vec<_> = root.iter()
                .filter(|(_, v)| matches!(v, ConfigValue::Object(_)))
                .collect();
            sections.sort_by_key(|(k, _)| *k);

            for (section_name, section_value) in sections {
                if let ConfigValue::Object(section_map) = section_value {
                    lines.push(format!("[{}]", section_name));

                    let mut keys: Vec<_> = section_map.keys().collect();
                    keys.sort();

                    for key in keys {
                        if let Some(val) = section_map.get(key) {
                            lines.push(format!("{} = {}", key, Self::serialize_value(val)));
                        }
                    }

                    lines.push(String::new());
                }
            }
        } else {
            return Err(ParserError::Parse(
                "INI can only serialize objects".to_string()
            ));
        }

        Ok(lines.join("\n").trim_end().to_string())
    }

    fn get(&self, content: &str, key: &str) -> ParserResult<ConfigValue> {
        let config = self.parse(content)?;
        config.get_path(key)
            .cloned()
            .ok_or_else(|| ParserError::KeyNotFound(key.to_string()))
    }

    fn set(&self, content: &str, key: &str, value: ConfigValue) -> ParserResult<String> {
        let parts: Vec<&str> = key.split('.').collect();

        if parts.len() == 2 {
            // section.key format
            let section = parts[0];
            let key_name = parts[1];
            let serialized_value = Self::serialize_value(&value);

            let mut lines: Vec<String> = Vec::new();
            let mut in_target_section = false;
            let mut key_found = false;
            let mut section_found = false;

            for line in content.lines() {
                let trimmed = line.trim();

                // Check for section header
                if trimmed.starts_with('[') && trimmed.ends_with(']') {
                    // If we were in target section and didn't find key, add it
                    if in_target_section && !key_found {
                        lines.push(format!("{} = {}", key_name, serialized_value));
                        key_found = true;
                    }

                    let section_name = &trimmed[1..trimmed.len() - 1];
                    in_target_section = section_name.trim() == section;
                    if in_target_section {
                        section_found = true;
                    }
                    lines.push(line.to_string());
                    continue;
                }

                // Check for key in target section
                if in_target_section {
                    if let Some(eq_pos) = trimmed.find('=') {
                        let current_key = trimmed[..eq_pos].trim();
                        if current_key == key_name {
                            lines.push(format!("{} = {}", key_name, serialized_value));
                            key_found = true;
                            continue;
                        }
                    }
                }

                lines.push(line.to_string());
            }

            // Handle case where section or key wasn't found
            if !section_found {
                lines.push(String::new());
                lines.push(format!("[{}]", section));
                lines.push(format!("{} = {}", key_name, serialized_value));
            } else if !key_found {
                // Section exists but key doesn't - find end of section and add
                lines.push(format!("{} = {}", key_name, serialized_value));
            }

            Ok(lines.join("\n"))
        } else if parts.len() == 1 {
            // Global key (no section)
            let key_name = parts[0];
            let serialized_value = Self::serialize_value(&value);

            let mut lines: Vec<String> = Vec::new();
            let mut key_found = false;
            let mut first_section_line = None;

            for (i, line) in content.lines().enumerate() {
                let trimmed = line.trim();

                // Track first section
                if first_section_line.is_none() && trimmed.starts_with('[') {
                    first_section_line = Some(i);
                }

                // Check for global key
                if first_section_line.is_none() || i < first_section_line.unwrap() {
                    if let Some(eq_pos) = trimmed.find('=') {
                        let current_key = trimmed[..eq_pos].trim();
                        if current_key == key_name {
                            lines.push(format!("{} = {}", key_name, serialized_value));
                            key_found = true;
                            continue;
                        }
                    }
                }

                lines.push(line.to_string());
            }

            if !key_found {
                // Add at beginning if no sections, or before first section
                if let Some(idx) = first_section_line {
                    lines.insert(idx, format!("{} = {}", key_name, serialized_value));
                } else {
                    lines.push(format!("{} = {}", key_name, serialized_value));
                }
            }

            Ok(lines.join("\n"))
        } else {
            Err(ParserError::Parse(
                "Invalid INI key path. Use 'section.key' or 'key' format".to_string()
            ))
        }
    }

    fn parser_type(&self) -> ParserType {
        ParserType::Ini
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ini_parse() {
        let parser = IniParser::new();
        let content = r#"
; Global settings
global_key = global_value

[server]
port = 25565
name = "My Server"
enabled = true

[database]
host = localhost
port = 5432
"#;

        let config = parser.parse(content).unwrap();

        if let ConfigValue::Object(map) = config {
            assert_eq!(
                map.get("global_key").and_then(|v| v.as_string()),
                Some("global_value".to_string())
            );

            if let Some(ConfigValue::Object(server)) = map.get("server") {
                assert_eq!(server.get("port").and_then(|v| v.as_int()), Some(25565));
                assert_eq!(server.get("enabled").and_then(|v| v.as_bool()), Some(true));
            } else {
                panic!("Expected server section");
            }
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_ini_get_set() {
        let parser = IniParser::new();
        let content = "[server]\nport = 25565";

        let port = parser.get(content, "server.port").unwrap();
        assert_eq!(port.as_int(), Some(25565));

        let updated = parser.set(content, "server.port", ConfigValue::Int(25566)).unwrap();
        let new_port = parser.get(&updated, "server.port").unwrap();
        assert_eq!(new_port.as_int(), Some(25566));
    }
}

//! YAML configuration parser

use std::collections::HashMap;

use super::{ConfigParser, ConfigValue, ParserError, ParserResult, ParserType};

/// YAML parser implementation
pub struct YamlParser;

impl YamlParser {
    pub fn new() -> Self {
        Self
    }

    fn yaml_to_config(value: serde_yaml::Value) -> ConfigValue {
        match value {
            serde_yaml::Value::Null => ConfigValue::Null,
            serde_yaml::Value::Bool(b) => ConfigValue::Bool(b),
            serde_yaml::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    ConfigValue::Int(i)
                } else if let Some(f) = n.as_f64() {
                    ConfigValue::Float(f)
                } else {
                    ConfigValue::String(n.to_string())
                }
            }
            serde_yaml::Value::String(s) => ConfigValue::String(s),
            serde_yaml::Value::Sequence(arr) => {
                ConfigValue::Array(arr.into_iter().map(Self::yaml_to_config).collect())
            }
            serde_yaml::Value::Mapping(map) => {
                let mut result = HashMap::new();
                for (k, v) in map {
                    let key = match k {
                        serde_yaml::Value::String(s) => s,
                        _ => k.as_str().unwrap_or("").to_string(),
                    };
                    result.insert(key, Self::yaml_to_config(v));
                }
                ConfigValue::Object(result)
            }
            serde_yaml::Value::Tagged(tagged) => Self::yaml_to_config(tagged.value),
        }
    }

    fn config_to_yaml(value: &ConfigValue) -> serde_yaml::Value {
        match value {
            ConfigValue::Null => serde_yaml::Value::Null,
            ConfigValue::Bool(b) => serde_yaml::Value::Bool(*b),
            ConfigValue::Int(i) => serde_yaml::Value::Number(serde_yaml::Number::from(*i)),
            ConfigValue::Float(f) => {
                serde_yaml::Value::Number(serde_yaml::Number::from(*f))
            }
            ConfigValue::String(s) => serde_yaml::Value::String(s.clone()),
            ConfigValue::Array(arr) => {
                serde_yaml::Value::Sequence(arr.iter().map(Self::config_to_yaml).collect())
            }
            ConfigValue::Object(map) => {
                let mut result = serde_yaml::Mapping::new();
                for (k, v) in map {
                    result.insert(
                        serde_yaml::Value::String(k.clone()),
                        Self::config_to_yaml(v),
                    );
                }
                serde_yaml::Value::Mapping(result)
            }
        }
    }
}

impl Default for YamlParser {
    fn default() -> Self {
        Self::new()
    }
}

impl ConfigParser for YamlParser {
    fn parse(&self, content: &str) -> ParserResult<ConfigValue> {
        let yaml: serde_yaml::Value = serde_yaml::from_str(content)
            .map_err(|e| ParserError::Parse(e.to_string()))?;
        Ok(Self::yaml_to_config(yaml))
    }

    fn serialize(&self, value: &ConfigValue) -> ParserResult<String> {
        let yaml = Self::config_to_yaml(value);
        serde_yaml::to_string(&yaml)
            .map_err(|e| ParserError::Parse(e.to_string()))
    }

    fn get(&self, content: &str, key: &str) -> ParserResult<ConfigValue> {
        let config = self.parse(content)?;
        config.get_path(key)
            .cloned()
            .ok_or_else(|| ParserError::KeyNotFound(key.to_string()))
    }

    fn set(&self, content: &str, key: &str, value: ConfigValue) -> ParserResult<String> {
        let mut config = self.parse(content)?;
        config.set_path(key, value)?;
        self.serialize(&config)
    }

    fn parser_type(&self) -> ParserType {
        ParserType::Yaml
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_yaml_parse() {
        let parser = YamlParser::new();
        let content = r#"
server:
  port: 25565
  max-players: 20
  motd: "Hello World"
"#;

        let config = parser.parse(content).unwrap();

        if let ConfigValue::Object(map) = config {
            if let Some(ConfigValue::Object(server)) = map.get("server") {
                assert_eq!(server.get("port").and_then(|v| v.as_int()), Some(25565));
                assert_eq!(server.get("max-players").and_then(|v| v.as_int()), Some(20));
            } else {
                panic!("Expected server object");
            }
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_yaml_get_set() {
        let parser = YamlParser::new();
        let content = r#"
server:
  port: 25565
"#;

        let port = parser.get(content, "server.port").unwrap();
        assert_eq!(port.as_int(), Some(25565));

        let updated = parser.set(content, "server.port", ConfigValue::Int(25566)).unwrap();
        let new_port = parser.get(&updated, "server.port").unwrap();
        assert_eq!(new_port.as_int(), Some(25566));
    }
}

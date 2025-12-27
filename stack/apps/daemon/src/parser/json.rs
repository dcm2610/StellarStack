//! JSON configuration parser

use std::collections::HashMap;

use super::{ConfigParser, ConfigValue, ParserError, ParserResult, ParserType};

/// JSON parser implementation
pub struct JsonParser;

impl JsonParser {
    pub fn new() -> Self {
        Self
    }

    fn json_to_config(value: serde_json::Value) -> ConfigValue {
        match value {
            serde_json::Value::Null => ConfigValue::Null,
            serde_json::Value::Bool(b) => ConfigValue::Bool(b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    ConfigValue::Int(i)
                } else if let Some(f) = n.as_f64() {
                    ConfigValue::Float(f)
                } else {
                    ConfigValue::String(n.to_string())
                }
            }
            serde_json::Value::String(s) => ConfigValue::String(s),
            serde_json::Value::Array(arr) => {
                ConfigValue::Array(arr.into_iter().map(Self::json_to_config).collect())
            }
            serde_json::Value::Object(map) => {
                let mut result = HashMap::new();
                for (k, v) in map {
                    result.insert(k, Self::json_to_config(v));
                }
                ConfigValue::Object(result)
            }
        }
    }

    fn config_to_json(value: &ConfigValue) -> serde_json::Value {
        match value {
            ConfigValue::Null => serde_json::Value::Null,
            ConfigValue::Bool(b) => serde_json::Value::Bool(*b),
            ConfigValue::Int(i) => serde_json::Value::Number(serde_json::Number::from(*i)),
            ConfigValue::Float(f) => {
                serde_json::Number::from_f64(*f)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null)
            }
            ConfigValue::String(s) => serde_json::Value::String(s.clone()),
            ConfigValue::Array(arr) => {
                serde_json::Value::Array(arr.iter().map(Self::config_to_json).collect())
            }
            ConfigValue::Object(map) => {
                let mut result = serde_json::Map::new();
                for (k, v) in map {
                    result.insert(k.clone(), Self::config_to_json(v));
                }
                serde_json::Value::Object(result)
            }
        }
    }
}

impl Default for JsonParser {
    fn default() -> Self {
        Self::new()
    }
}

impl ConfigParser for JsonParser {
    fn parse(&self, content: &str) -> ParserResult<ConfigValue> {
        let json: serde_json::Value = serde_json::from_str(content)
            .map_err(|e| ParserError::Parse(e.to_string()))?;
        Ok(Self::json_to_config(json))
    }

    fn serialize(&self, value: &ConfigValue) -> ParserResult<String> {
        let json = Self::config_to_json(value);
        serde_json::to_string_pretty(&json)
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
        ParserType::Json
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_parse() {
        let parser = JsonParser::new();
        let content = r#"{
            "server": {
                "port": 25565,
                "max-players": 20
            }
        }"#;

        let config = parser.parse(content).unwrap();

        if let ConfigValue::Object(map) = config {
            if let Some(ConfigValue::Object(server)) = map.get("server") {
                assert_eq!(server.get("port").and_then(|v| v.as_int()), Some(25565));
            } else {
                panic!("Expected server object");
            }
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_json_get_set() {
        let parser = JsonParser::new();
        let content = r#"{"server": {"port": 25565}}"#;

        let port = parser.get(content, "server.port").unwrap();
        assert_eq!(port.as_int(), Some(25565));

        let updated = parser.set(content, "server.port", ConfigValue::Int(25566)).unwrap();
        let new_port = parser.get(&updated, "server.port").unwrap();
        assert_eq!(new_port.as_int(), Some(25566));
    }
}

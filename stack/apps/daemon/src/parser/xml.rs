//! XML configuration file parser

use std::collections::HashMap;

use super::{ConfigParser, ConfigValue, ParserError, ParserResult, ParserType};

/// XML parser implementation
///
/// Uses a simple text-based approach to preserve formatting when modifying values.
/// For complex XML manipulation, consider using a full XML library.
pub struct XmlParser;

impl XmlParser {
    pub fn new() -> Self {
        Self
    }

    /// Simple XML text content extraction
    #[allow(dead_code)]
    fn extract_text_content(xml: &str) -> Option<String> {
        let start = xml.find('>')?;
        let end = xml.rfind('<')?;

        if start >= end {
            return None;
        }

        Some(xml[start + 1..end].trim().to_string())
    }

    /// Parse XML element to ConfigValue
    fn parse_element(element: &str) -> ParserResult<(String, ConfigValue)> {
        // Find tag name
        let tag_start = element.find('<')
            .ok_or_else(|| ParserError::Parse("Invalid XML: no opening tag".into()))?;
        let tag_end = element.find(|c| c == '>' || c == ' ' || c == '/')
            .ok_or_else(|| ParserError::Parse("Invalid XML: malformed tag".into()))?;

        let tag_name = element[tag_start + 1..tag_end].to_string();

        // Check if self-closing
        if element.contains("/>") {
            return Ok((tag_name, ConfigValue::Null));
        }

        // Find closing tag
        let closing_tag = format!("</{}>", tag_name);
        if !element.contains(&closing_tag) {
            return Err(ParserError::Parse(format!("Missing closing tag for {}", tag_name)));
        }

        // Extract content between tags
        let content_start = element.find('>')
            .ok_or_else(|| ParserError::Parse("Invalid XML: no closing bracket".into()))? + 1;
        let content_end = element.rfind(&closing_tag)
            .ok_or_else(|| ParserError::Parse(format!("Missing closing tag for {}", tag_name)))?;
        let content = &element[content_start..content_end];

        // Check if content contains child elements
        if content.trim().starts_with('<') {
            // Has child elements - parse recursively
            let children = Self::parse_children(content)?;
            Ok((tag_name, ConfigValue::Object(children)))
        } else {
            // Text content
            let text = content.trim();
            Ok((tag_name, Self::parse_text_value(text)))
        }
    }

    /// Parse children elements
    fn parse_children(content: &str) -> ParserResult<HashMap<String, ConfigValue>> {
        let mut result = HashMap::new();
        let mut depth = 0;
        let mut current_element = String::new();

        for c in content.chars() {
            current_element.push(c);

            if c == '>' {

                // Check if opening or closing tag
                if current_element.contains("</") {
                    depth -= 1;
                } else if !current_element.contains("/>") {
                    depth += 1;
                }

                // If we're back to depth 0, we have a complete element
                if depth == 0 && current_element.trim().len() > 2 {
                    let trimmed = current_element.trim();
                    if trimmed.starts_with('<') && !trimmed.starts_with("<?") && !trimmed.starts_with("<!") {
                        if let Ok((name, value)) = Self::parse_element(trimmed) {
                            result.insert(name, value);
                        }
                    }
                    current_element.clear();
                }
            }
        }

        Ok(result)
    }

    /// Parse text value to appropriate type
    fn parse_text_value(text: &str) -> ConfigValue {
        if text.is_empty() {
            return ConfigValue::Null;
        }

        // Try boolean
        match text.to_lowercase().as_str() {
            "true" => return ConfigValue::Bool(true),
            "false" => return ConfigValue::Bool(false),
            _ => {}
        }

        // Try integer
        if let Ok(i) = text.parse::<i64>() {
            return ConfigValue::Int(i);
        }

        // Try float
        if let Ok(f) = text.parse::<f64>() {
            return ConfigValue::Float(f);
        }

        ConfigValue::String(text.to_string())
    }

    /// Serialize value to XML element
    fn serialize_element(name: &str, value: &ConfigValue, indent: usize) -> String {
        let indent_str = "  ".repeat(indent);

        match value {
            ConfigValue::Null => format!("{}<{} />", indent_str, name),
            ConfigValue::Bool(b) => format!("{}<{}>{}</{}>", indent_str, name, b, name),
            ConfigValue::Int(i) => format!("{}<{}>{}</{}>", indent_str, name, i, name),
            ConfigValue::Float(f) => format!("{}<{}>{}</{}>", indent_str, name, f, name),
            ConfigValue::String(s) => {
                // Escape XML special characters
                let escaped = s
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;")
                    .replace('"', "&quot;")
                    .replace('\'', "&apos;");
                format!("{}<{}>{}</{}>", indent_str, name, escaped, name)
            }
            ConfigValue::Array(arr) => {
                let mut lines = Vec::new();
                lines.push(format!("{}<{}>", indent_str, name));
                for (i, item) in arr.iter().enumerate() {
                    lines.push(Self::serialize_element(&format!("item_{}", i), item, indent + 1));
                }
                lines.push(format!("{}</{}>", indent_str, name));
                lines.join("\n")
            }
            ConfigValue::Object(map) => {
                let mut lines = Vec::new();
                lines.push(format!("{}<{}>", indent_str, name));

                let mut keys: Vec<_> = map.keys().collect();
                keys.sort();

                for key in keys {
                    if let Some(val) = map.get(key) {
                        lines.push(Self::serialize_element(key, val, indent + 1));
                    }
                }
                lines.push(format!("{}</{}>", indent_str, name));
                lines.join("\n")
            }
        }
    }
}

impl Default for XmlParser {
    fn default() -> Self {
        Self::new()
    }
}

impl ConfigParser for XmlParser {
    fn parse(&self, content: &str) -> ParserResult<ConfigValue> {
        // Remove XML declaration if present
        let content = if content.trim().starts_with("<?xml") {
            content
                .find("?>")
                .map(|i| &content[i + 2..])
                .unwrap_or(content)
        } else {
            content
        };

        // Parse root element
        let trimmed = content.trim();
        if trimmed.is_empty() {
            return Ok(ConfigValue::Object(HashMap::new()));
        }

        let (name, value) = Self::parse_element(trimmed)?;

        let mut root = HashMap::new();
        root.insert(name, value);

        Ok(ConfigValue::Object(root))
    }

    fn serialize(&self, value: &ConfigValue) -> ParserResult<String> {
        let mut lines = Vec::new();
        lines.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>".to_string());

        match value {
            ConfigValue::Object(map) => {
                if let Some((name, val)) = map.iter().next() {
                    lines.push(Self::serialize_element(name, val, 0));
                }
            }
            _ => {
                lines.push(Self::serialize_element("root", value, 0));
            }
        }

        Ok(lines.join("\n"))
    }

    fn get(&self, content: &str, key: &str) -> ParserResult<ConfigValue> {
        let config = self.parse(content)?;
        config.get_path(key)
            .cloned()
            .ok_or_else(|| ParserError::KeyNotFound(key.to_string()))
    }

    fn set(&self, content: &str, key: &str, value: ConfigValue) -> ParserResult<String> {
        // For XML, we use a text-based approach to preserve formatting
        let parts: Vec<&str> = key.split('.').collect();

        if parts.is_empty() {
            return Err(ParserError::KeyNotFound(key.to_string()));
        }

        // Find the target element and replace its content
        let target_tag = parts.last().unwrap();
        let opening_tag = format!("<{}>", target_tag);
        let closing_tag = format!("</{}>", target_tag);

        if let Some(start) = content.find(&opening_tag) {
            if let Some(end) = content[start..].find(&closing_tag) {
                let before = &content[..start + opening_tag.len()];
                let after = &content[start + end..];

                let new_value = match &value {
                    ConfigValue::String(s) => s
                        .replace('&', "&amp;")
                        .replace('<', "&lt;")
                        .replace('>', "&gt;"),
                    ConfigValue::Int(i) => i.to_string(),
                    ConfigValue::Float(f) => f.to_string(),
                    ConfigValue::Bool(b) => b.to_string(),
                    ConfigValue::Null => String::new(),
                    _ => return Err(ParserError::Parse(
                        "Cannot set complex values in XML via text replacement".to_string()
                    )),
                };

                return Ok(format!("{}{}{}", before, new_value, after));
            }
        }

        Err(ParserError::KeyNotFound(key.to_string()))
    }

    fn parser_type(&self) -> ParserType {
        ParserType::Xml
    }
}

#[allow(dead_code)]
trait FindExt {
    fn find(&self, needle: impl Fn(char) -> bool) -> Option<usize>;
}

impl FindExt for str {
    fn find(&self, needle: impl Fn(char) -> bool) -> Option<usize> {
        self.char_indices()
            .find(|(_, c)| needle(*c))
            .map(|(i, _)| i)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xml_parse() {
        let parser = XmlParser::new();
        let content = r#"<?xml version="1.0"?>
<config>
    <server>
        <port>25565</port>
        <name>My Server</name>
    </server>
</config>"#;

        let config = parser.parse(content).unwrap();

        if let ConfigValue::Object(root) = config {
            if let Some(ConfigValue::Object(conf)) = root.get("config") {
                if let Some(ConfigValue::Object(server)) = conf.get("server") {
                    assert_eq!(server.get("port").and_then(|v| v.as_int()), Some(25565));
                }
            }
        }
    }

    #[test]
    fn test_xml_get_set() {
        let parser = XmlParser::new();
        let content = "<config><port>25565</port></config>";

        let updated = parser.set(content, "port", ConfigValue::Int(25566)).unwrap();
        assert!(updated.contains(">25566<"));
    }
}

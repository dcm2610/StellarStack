//! Safe path handling with traversal prevention

use std::path::{Path, PathBuf, Component};

use super::errors::{FilesystemError, FilesystemResult};

/// A validated safe path within a root directory
#[derive(Debug, Clone)]
pub struct SafePath {
    /// The root directory
    root: PathBuf,
    /// The resolved absolute path
    resolved: PathBuf,
    /// The relative path from root
    relative: PathBuf,
}

impl SafePath {
    /// Create a new safe path from a relative path string
    ///
    /// Returns an error if the path would escape the root directory.
    pub fn new(root: &Path, relative: &str) -> FilesystemResult<Self> {
        let root = root.canonicalize().map_err(|e| {
            FilesystemError::InvalidPath(format!("Invalid root path: {}", e))
        })?;

        // Clean the relative path
        let relative = clean_path(relative);

        // Build the resolved path
        let resolved = root.join(&relative);

        // Canonicalize if it exists, otherwise validate manually
        let resolved = if resolved.exists() {
            resolved.canonicalize().map_err(|e| {
                FilesystemError::InvalidPath(format!("Failed to canonicalize path: {}", e))
            })?
        } else {
            // For non-existent paths, normalize and check prefix
            normalize_path(&resolved)
        };

        // Verify the resolved path is within root
        if !resolved.starts_with(&root) {
            return Err(FilesystemError::PathTraversal);
        }

        Ok(Self {
            root,
            resolved,
            relative,
        })
    }

    /// Create a safe path from an already-resolved path
    ///
    /// Use with caution - this bypasses path cleaning.
    pub fn from_resolved(root: PathBuf, resolved: PathBuf) -> FilesystemResult<Self> {
        if !resolved.starts_with(&root) {
            return Err(FilesystemError::PathTraversal);
        }

        let relative = resolved.strip_prefix(&root)
            .map(|p| p.to_path_buf())
            .unwrap_or_default();

        Ok(Self {
            root,
            resolved,
            relative,
        })
    }

    /// Get the root directory
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Get the resolved absolute path
    pub fn resolved(&self) -> &Path {
        &self.resolved
    }

    /// Get the relative path from root
    pub fn relative(&self) -> &Path {
        &self.relative
    }

    /// Get the resolved path as a string
    pub fn to_string_lossy(&self) -> String {
        self.resolved.to_string_lossy().to_string()
    }

    /// Check if the path exists
    pub fn exists(&self) -> bool {
        self.resolved.exists()
    }

    /// Check if the path is a directory
    pub fn is_dir(&self) -> bool {
        self.resolved.is_dir()
    }

    /// Check if the path is a file
    pub fn is_file(&self) -> bool {
        self.resolved.is_file()
    }

    /// Get the parent directory as a SafePath
    pub fn parent(&self) -> Option<FilesystemResult<SafePath>> {
        self.resolved.parent().map(|p| {
            SafePath::from_resolved(self.root.clone(), p.to_path_buf())
        })
    }

    /// Join a child path
    pub fn join(&self, child: &str) -> FilesystemResult<SafePath> {
        let new_relative = self.relative.join(clean_path(child));
        let relative_str = new_relative.to_string_lossy().to_string();
        SafePath::new(&self.root, &relative_str)
    }

    /// Get the file name
    pub fn file_name(&self) -> Option<&str> {
        self.resolved.file_name().and_then(|s| s.to_str())
    }

    /// Get the file stem (name without extension)
    pub fn file_stem(&self) -> Option<&str> {
        self.resolved.file_stem().and_then(|s| s.to_str())
    }

    /// Get the file extension
    pub fn extension(&self) -> Option<&str> {
        self.resolved.extension().and_then(|s| s.to_str())
    }
}

impl AsRef<Path> for SafePath {
    fn as_ref(&self) -> &Path {
        &self.resolved
    }
}

/// Clean a path string, removing traversal attempts
fn clean_path(path: &str) -> PathBuf {
    let path = path.trim();
    let path = path.trim_start_matches('/');
    let path = path.trim_start_matches('\\');

    let mut result = PathBuf::new();

    for component in Path::new(path).components() {
        match component {
            Component::Normal(c) => {
                result.push(c);
            }
            Component::CurDir => {
                // Skip .
            }
            Component::ParentDir => {
                // Don't allow going up - skip ..
            }
            Component::Prefix(_) | Component::RootDir => {
                // Skip absolute path components
            }
        }
    }

    result
}

/// Normalize a path without requiring it to exist
fn normalize_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();

    for component in path.components() {
        match component {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            _ => {
                result.push(component);
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_clean_path() {
        assert_eq!(clean_path("foo/bar"), PathBuf::from("foo/bar"));
        assert_eq!(clean_path("/foo/bar"), PathBuf::from("foo/bar"));
        assert_eq!(clean_path("foo/../bar"), PathBuf::from("foo/bar"));
        assert_eq!(clean_path("../foo"), PathBuf::from("foo"));
        assert_eq!(clean_path("./foo"), PathBuf::from("foo"));
        assert_eq!(clean_path("foo/./bar"), PathBuf::from("foo/bar"));
    }

    #[test]
    fn test_safe_path_basic() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();

        // Create test directory
        fs::create_dir(root.join("test")).unwrap();

        let safe = SafePath::new(root, "test").unwrap();
        assert!(safe.exists());
        assert!(safe.is_dir());
    }

    #[test]
    fn test_safe_path_traversal_prevention() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();

        // These should all fail
        assert!(SafePath::new(root, "../etc/passwd").is_err());
        assert!(SafePath::new(root, "foo/../../etc/passwd").is_err());

        // But cleaned paths should work
        let safe = SafePath::new(root, "foo/../bar").unwrap();
        assert_eq!(safe.relative(), Path::new("foo/bar"));
    }

    #[test]
    fn test_safe_path_join() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();

        let base = SafePath::new(root, "").unwrap();
        let joined = base.join("foo/bar").unwrap();

        assert_eq!(joined.relative(), Path::new("foo/bar"));
    }
}

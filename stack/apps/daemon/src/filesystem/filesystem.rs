//! Main filesystem implementation

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tokio::fs;
use tracing::{debug, warn};

use super::archive::{compress, decompress};
use super::disk::DiskUsage;
use super::errors::{FilesystemError, FilesystemResult};
use super::path::SafePath;

/// File information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    /// File name
    pub name: String,

    /// File size in bytes
    pub size: u64,

    /// Whether this is a directory
    pub is_directory: bool,

    /// Whether this is a file
    pub is_file: bool,

    /// Whether this is a symlink
    pub is_symlink: bool,

    /// Last modified timestamp (Unix seconds)
    pub modified: i64,

    /// Created timestamp (Unix seconds)
    pub created: Option<i64>,

    /// File mode (Unix permissions)
    pub mode: u32,

    /// MIME type
    pub mime_type: String,
}

/// Filesystem manager for a server
pub struct Filesystem {
    /// Root directory
    root: PathBuf,

    /// Disk usage tracker
    disk_usage: DiskUsage,

    /// File denylist patterns
    denylist: Vec<glob::Pattern>,
}

impl Filesystem {
    /// Create a new filesystem manager
    pub fn new(root: PathBuf, disk_limit: u64, denylist: Vec<String>) -> FilesystemResult<Self> {
        // Ensure root exists
        std::fs::create_dir_all(&root)?;

        // Compile denylist patterns
        let denylist = denylist
            .iter()
            .filter_map(|pattern| {
                glob::Pattern::new(pattern)
                    .map_err(|e| warn!("Invalid denylist pattern '{}': {}", pattern, e))
                    .ok()
            })
            .collect();

        Ok(Self {
            root,
            disk_usage: DiskUsage::new(disk_limit),
            denylist,
        })
    }

    /// Get the root directory
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Get disk usage tracker
    pub fn disk_usage(&self) -> &DiskUsage {
        &self.disk_usage
    }

    /// Resolve a relative path safely
    pub fn safe_path(&self, relative: &str) -> FilesystemResult<SafePath> {
        let safe = SafePath::new(&self.root, relative)?;

        // Check denylist
        if let Some(name) = safe.file_name() {
            for pattern in &self.denylist {
                if pattern.matches(name) {
                    return Err(FilesystemError::AccessDenied(format!(
                        "File matches denylist pattern: {}",
                        pattern
                    )));
                }
            }
        }

        Ok(safe)
    }

    /// List files in a directory
    pub async fn list_directory(&self, path: &str) -> FilesystemResult<Vec<FileInfo>> {
        let safe_path = self.safe_path(path)?;

        if !safe_path.exists() {
            return Err(FilesystemError::NotFound(path.to_string()));
        }

        if !safe_path.is_dir() {
            return Err(FilesystemError::InvalidPath(format!(
                "'{}' is not a directory",
                path
            )));
        }

        let mut entries = Vec::new();
        let mut dir = fs::read_dir(safe_path.resolved()).await?;

        while let Some(entry) = dir.next_entry().await? {
            let name = entry.file_name().to_string_lossy().to_string();

            // Check denylist
            let denied = self.denylist.iter().any(|p| p.matches(&name));
            if denied {
                continue;
            }

            if let Ok(info) = self.get_file_info_from_entry(&entry).await {
                entries.push(info);
            }
        }

        // Sort: directories first, then alphabetically
        entries.sort_by(|a, b| {
            match (a.is_directory, b.is_directory) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(entries)
    }

    /// Get file info from a directory entry
    async fn get_file_info_from_entry(&self, entry: &fs::DirEntry) -> FilesystemResult<FileInfo> {
        let metadata = entry.metadata().await?;
        let name = entry.file_name().to_string_lossy().to_string();

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let created = metadata
            .created()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64);

        let mode = get_mode(&metadata);

        let mime_type = if metadata.is_dir() {
            "inode/directory".to_string()
        } else {
            mime_guess::from_path(&name)
                .first_or_octet_stream()
                .to_string()
        };

        Ok(FileInfo {
            name,
            size: metadata.len(),
            is_directory: metadata.is_dir(),
            is_file: metadata.is_file(),
            is_symlink: metadata.file_type().is_symlink(),
            modified,
            created,
            mode,
            mime_type,
        })
    }

    /// Read file contents
    pub async fn read_file(&self, path: &str) -> FilesystemResult<Vec<u8>> {
        let safe_path = self.safe_path(path)?;

        if !safe_path.exists() {
            return Err(FilesystemError::NotFound(path.to_string()));
        }

        if !safe_path.is_file() {
            return Err(FilesystemError::InvalidPath(format!(
                "'{}' is not a file",
                path
            )));
        }

        let contents = fs::read(safe_path.resolved()).await?;
        Ok(contents)
    }

    /// Read file as string
    pub async fn read_file_string(&self, path: &str) -> FilesystemResult<String> {
        let safe_path = self.safe_path(path)?;

        if !safe_path.exists() {
            return Err(FilesystemError::NotFound(path.to_string()));
        }

        let contents = fs::read_to_string(safe_path.resolved()).await?;
        Ok(contents)
    }

    /// Write file contents
    pub async fn write_file(&self, path: &str, data: &[u8]) -> FilesystemResult<()> {
        let safe_path = self.safe_path(path)?;

        // Check disk space
        let current_size = if safe_path.exists() {
            fs::metadata(safe_path.resolved()).await?.len()
        } else {
            0
        };

        let additional = (data.len() as u64).saturating_sub(current_size);
        self.disk_usage.has_space_for(additional)?;

        // Ensure parent directory exists
        if let Some(parent) = safe_path.resolved().parent() {
            fs::create_dir_all(parent).await?;
        }

        // Write file
        fs::write(safe_path.resolved(), data).await?;

        // Update disk usage
        self.disk_usage.add_usage(additional);

        debug!("Wrote {} bytes to {:?}", data.len(), safe_path.resolved());
        Ok(())
    }

    /// Create a directory
    pub async fn create_directory(&self, path: &str) -> FilesystemResult<()> {
        let safe_path = self.safe_path(path)?;

        if safe_path.exists() {
            return Err(FilesystemError::AlreadyExists(path.to_string()));
        }

        fs::create_dir_all(safe_path.resolved()).await?;
        debug!("Created directory: {:?}", safe_path.resolved());
        Ok(())
    }

    /// Delete a file or directory
    pub async fn delete(&self, path: &str) -> FilesystemResult<()> {
        let safe_path = self.safe_path(path)?;

        if !safe_path.exists() {
            return Err(FilesystemError::NotFound(path.to_string()));
        }

        // Calculate size before deleting
        let size = if safe_path.is_dir() {
            super::disk::calculate_dir_size_sync(safe_path.resolved())?
        } else {
            fs::metadata(safe_path.resolved()).await?.len()
        };

        // Delete
        if safe_path.is_dir() {
            fs::remove_dir_all(safe_path.resolved()).await?;
        } else {
            fs::remove_file(safe_path.resolved()).await?;
        }

        // Update disk usage
        self.disk_usage.sub_usage(size);

        debug!("Deleted: {:?}", safe_path.resolved());
        Ok(())
    }

    /// Rename/move a file or directory
    pub async fn rename(&self, from: &str, to: &str) -> FilesystemResult<()> {
        let from_path = self.safe_path(from)?;
        let to_path = self.safe_path(to)?;

        if !from_path.exists() {
            return Err(FilesystemError::NotFound(from.to_string()));
        }

        if to_path.exists() {
            return Err(FilesystemError::AlreadyExists(to.to_string()));
        }

        // Ensure parent directory exists
        if let Some(parent) = to_path.resolved().parent() {
            fs::create_dir_all(parent).await?;
        }

        fs::rename(from_path.resolved(), to_path.resolved()).await?;

        debug!("Renamed {:?} to {:?}", from_path.resolved(), to_path.resolved());
        Ok(())
    }

    /// Copy a file or directory
    pub async fn copy(&self, path: &str) -> FilesystemResult<String> {
        let source_path = self.safe_path(path)?;

        if !source_path.exists() {
            return Err(FilesystemError::NotFound(path.to_string()));
        }

        // Generate unique copy name
        let parent = source_path.resolved().parent()
            .ok_or_else(|| FilesystemError::InvalidPath("No parent directory".into()))?;

        let stem = source_path.file_stem().unwrap_or("file");
        let ext = source_path.extension();

        let mut copy_num = 1;
        let (new_path, new_name) = loop {
            let name = if let Some(ext) = ext {
                format!("{} copy {}.{}", stem, copy_num, ext)
            } else {
                format!("{} copy {}", stem, copy_num)
            };

            let candidate = parent.join(&name);
            if !candidate.exists() {
                break (candidate, name);
            }
            copy_num += 1;
        };

        // Check disk space
        let size = if source_path.is_dir() {
            super::disk::calculate_dir_size_sync(source_path.resolved())?
        } else {
            fs::metadata(source_path.resolved()).await?.len()
        };

        self.disk_usage.has_space_for(size)?;

        // Copy
        if source_path.is_dir() {
            copy_dir_all(source_path.resolved(), &new_path).await?;
        } else {
            fs::copy(source_path.resolved(), &new_path).await?;
        }

        // Update disk usage
        self.disk_usage.add_usage(size);

        debug!("Copied {:?} to {:?}", source_path.resolved(), new_path);
        Ok(new_name)
    }

    /// Compress files into an archive
    pub async fn compress(&self, base_path: &str, files: Vec<String>) -> FilesystemResult<FileInfo> {
        let base = self.safe_path(base_path)?;

        // Check disk space (estimate compressed size)
        self.disk_usage.has_space_available(&self.root, true).await?;

        let archive_path = compress(base.resolved(), &files, None).await?;

        // Get file info
        let metadata = fs::metadata(&archive_path).await?;
        let name = archive_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("archive.tar.gz")
            .to_string();

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        // Update disk usage
        self.disk_usage.add_usage(metadata.len());

        Ok(FileInfo {
            name,
            size: metadata.len(),
            is_directory: false,
            is_file: true,
            is_symlink: false,
            modified,
            created: None,
            mode: get_mode(&metadata),
            mime_type: "application/gzip".to_string(),
        })
    }

    /// Decompress an archive
    pub async fn decompress(&self, archive_path: &str, destination: &str) -> FilesystemResult<()> {
        let archive = self.safe_path(archive_path)?;
        let dest = self.safe_path(destination)?;

        if !archive.exists() {
            return Err(FilesystemError::NotFound(archive_path.to_string()));
        }

        decompress(archive.resolved(), dest.resolved()).await?;

        // Recalculate disk usage after extraction
        self.disk_usage.recalculate(&self.root).await?;

        Ok(())
    }

    /// Set file permissions (Unix only)
    #[cfg(unix)]
    pub async fn chmod(&self, path: &str, mode: u32) -> FilesystemResult<()> {
        use std::os::unix::fs::PermissionsExt;

        let safe_path = self.safe_path(path)?;

        if !safe_path.exists() {
            return Err(FilesystemError::NotFound(path.to_string()));
        }

        let permissions = std::fs::Permissions::from_mode(mode);
        fs::set_permissions(safe_path.resolved(), permissions).await?;

        debug!("Set permissions {:o} on {:?}", mode, safe_path.resolved());
        Ok(())
    }

    /// Set file permissions (non-Unix stub)
    #[cfg(not(unix))]
    pub async fn chmod(&self, _path: &str, _mode: u32) -> FilesystemResult<()> {
        // No-op on non-Unix systems
        Ok(())
    }

    /// Get file information
    pub async fn stat(&self, path: &str) -> FilesystemResult<FileInfo> {
        let safe_path = self.safe_path(path)?;

        if !safe_path.exists() {
            return Err(FilesystemError::NotFound(path.to_string()));
        }

        let metadata = fs::metadata(safe_path.resolved()).await?;
        let name = safe_path.file_name().unwrap_or("").to_string();

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let created = metadata
            .created()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64);

        let mime_type = if metadata.is_dir() {
            "inode/directory".to_string()
        } else {
            mime_guess::from_path(&name)
                .first_or_octet_stream()
                .to_string()
        };

        Ok(FileInfo {
            name,
            size: metadata.len(),
            is_directory: metadata.is_dir(),
            is_file: metadata.is_file(),
            is_symlink: metadata.file_type().is_symlink(),
            modified,
            created,
            mode: get_mode(&metadata),
            mime_type,
        })
    }
}

/// Get file mode from metadata
#[cfg(unix)]
fn get_mode(metadata: &std::fs::Metadata) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode()
}

#[cfg(not(unix))]
fn get_mode(_metadata: &std::fs::Metadata) -> u32 {
    0o644 // Default mode for non-Unix
}

/// Copy a directory recursively
async fn copy_dir_all(src: &Path, dst: &Path) -> FilesystemResult<()> {
    fs::create_dir_all(dst).await?;

    let mut entries = fs::read_dir(src).await?;

    while let Some(entry) = entries.next_entry().await? {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            Box::pin(copy_dir_all(&src_path, &dst_path)).await?;
        } else {
            fs::copy(&src_path, &dst_path).await?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs::File;
    use std::io::Write;

    #[tokio::test]
    async fn test_list_directory() {
        let temp = TempDir::new().unwrap();
        let fs_manager = Filesystem::new(temp.path().to_path_buf(), 0, vec![]).unwrap();

        // Create test files
        File::create(temp.path().join("file1.txt")).unwrap();
        File::create(temp.path().join("file2.txt")).unwrap();
        std::fs::create_dir(temp.path().join("subdir")).unwrap();

        let entries = fs_manager.list_directory("").await.unwrap();

        assert_eq!(entries.len(), 3);
        // Directories should be first
        assert!(entries[0].is_directory);
    }

    #[tokio::test]
    async fn test_read_write_file() {
        let temp = TempDir::new().unwrap();
        let fs_manager = Filesystem::new(temp.path().to_path_buf(), 0, vec![]).unwrap();

        // Write
        fs_manager.write_file("test.txt", b"Hello, World!").await.unwrap();

        // Read
        let contents = fs_manager.read_file("test.txt").await.unwrap();
        assert_eq!(contents, b"Hello, World!");
    }

    #[tokio::test]
    async fn test_path_traversal_prevention() {
        let temp = TempDir::new().unwrap();
        let fs_manager = Filesystem::new(temp.path().to_path_buf(), 0, vec![]).unwrap();

        // These should all fail
        assert!(fs_manager.safe_path("../etc/passwd").is_err());
        assert!(fs_manager.safe_path("foo/../../etc/passwd").is_err());
    }

    #[tokio::test]
    async fn test_denylist() {
        let temp = TempDir::new().unwrap();
        let fs_manager = Filesystem::new(
            temp.path().to_path_buf(),
            0,
            vec!["*.secret".to_string()],
        ).unwrap();

        // Should be denied
        assert!(fs_manager.safe_path("config.secret").is_err());

        // Should be allowed
        assert!(fs_manager.safe_path("config.txt").is_ok());
    }
}

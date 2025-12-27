//! Archive compression and extraction

use std::path::Path;

use async_compression::tokio::write::GzipEncoder;
use tokio::fs::File;
use tracing::{debug, info};

use super::errors::{FilesystemError, FilesystemResult};

/// Supported archive formats
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveFormat {
    TarGz,
    Tar,
    Zip,
}

impl ArchiveFormat {
    /// Detect format from file extension
    pub fn from_extension(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?.to_lowercase();

        match ext.as_str() {
            "gz" | "tgz" => Some(ArchiveFormat::TarGz),
            "tar" => Some(ArchiveFormat::Tar),
            "zip" => Some(ArchiveFormat::Zip),
            _ => None,
        }
    }

    /// Get the file extension for this format
    pub fn extension(&self) -> &'static str {
        match self {
            ArchiveFormat::TarGz => "tar.gz",
            ArchiveFormat::Tar => "tar",
            ArchiveFormat::Zip => "zip",
        }
    }

    /// Get the MIME type for this format
    pub fn mime_type(&self) -> &'static str {
        match self {
            ArchiveFormat::TarGz => "application/gzip",
            ArchiveFormat::Tar => "application/x-tar",
            ArchiveFormat::Zip => "application/zip",
        }
    }
}

/// Compress files into an archive
pub async fn compress(
    base_path: &Path,
    files: &[String],
    output_name: Option<&str>,
) -> FilesystemResult<std::path::PathBuf> {
    let archive_name = output_name
        .map(String::from)
        .unwrap_or_else(|| {
            format!(
                "archive-{}.tar.gz",
                chrono::Utc::now().timestamp()
            )
        });

    let archive_path = base_path.join(&archive_name);

    info!("Creating archive: {:?} with {} files", archive_path, files.len());

    // Create the tar.gz file
    let file = File::create(&archive_path).await?;
    let _encoder = GzipEncoder::new(file);

    // Use blocking task for tar operations
    let base = base_path.to_path_buf();
    let files = files.to_vec();

    tokio::task::spawn_blocking(move || {
        use std::fs::File;
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use tar::Builder;

        let file = File::create(&archive_path)
            .map_err(|e| FilesystemError::Io(e))?;

        let encoder = GzEncoder::new(file, Compression::default());
        let mut tar = Builder::new(encoder);

        for file_name in &files {
            let file_path = base.join(file_name);

            if file_path.is_dir() {
                tar.append_dir_all(file_name, &file_path)
                    .map_err(|e| FilesystemError::ArchiveError(e.to_string()))?;
            } else if file_path.is_file() {
                let mut f = File::open(&file_path)
                    .map_err(|e| FilesystemError::Io(e))?;
                tar.append_file(file_name, &mut f)
                    .map_err(|e| FilesystemError::ArchiveError(e.to_string()))?;
            } else {
                debug!("Skipping non-existent file: {}", file_name);
            }
        }

        tar.finish()
            .map_err(|e| FilesystemError::ArchiveError(e.to_string()))?;

        Ok(archive_path)
    }).await
    .map_err(|e| FilesystemError::Other(format!("Task join error: {}", e)))?
}

/// Extract an archive to a destination directory
pub async fn decompress(
    archive_path: &Path,
    destination: &Path,
) -> FilesystemResult<()> {
    let format = ArchiveFormat::from_extension(archive_path)
        .ok_or_else(|| FilesystemError::UnsupportedArchive(
            archive_path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("unknown")
                .to_string()
        ))?;

    info!("Extracting {:?} archive: {:?} to {:?}", format, archive_path, destination);

    // Ensure destination exists
    tokio::fs::create_dir_all(destination).await?;

    let archive = archive_path.to_path_buf();
    let dest = destination.to_path_buf();

    match format {
        ArchiveFormat::TarGz => {
            tokio::task::spawn_blocking(move || {
                extract_tar_gz(&archive, &dest)
            }).await
            .map_err(|e| FilesystemError::Other(format!("Task join error: {}", e)))??;
        }
        ArchiveFormat::Tar => {
            tokio::task::spawn_blocking(move || {
                extract_tar(&archive, &dest)
            }).await
            .map_err(|e| FilesystemError::Other(format!("Task join error: {}", e)))??;
        }
        ArchiveFormat::Zip => {
            tokio::task::spawn_blocking(move || {
                extract_zip(&archive, &dest)
            }).await
            .map_err(|e| FilesystemError::Other(format!("Task join error: {}", e)))??;
        }
    }

    Ok(())
}

/// Extract a tar.gz archive (blocking)
fn extract_tar_gz(archive: &Path, dest: &Path) -> FilesystemResult<()> {
    use std::fs::File;
    use flate2::read::GzDecoder;
    use tar::Archive;

    let file = File::open(archive)?;
    let decoder = GzDecoder::new(file);
    let mut archive = Archive::new(decoder);

    archive.unpack(dest)
        .map_err(|e| FilesystemError::ArchiveError(e.to_string()))?;

    Ok(())
}

/// Extract a tar archive (blocking)
fn extract_tar(archive: &Path, dest: &Path) -> FilesystemResult<()> {
    use std::fs::File;
    use tar::Archive;

    let file = File::open(archive)?;
    let mut archive = Archive::new(file);

    archive.unpack(dest)
        .map_err(|e| FilesystemError::ArchiveError(e.to_string()))?;

    Ok(())
}

/// Extract a zip archive (blocking)
fn extract_zip(archive: &Path, dest: &Path) -> FilesystemResult<()> {
    use std::fs::File;
    use std::io::{Read, Write};
    use zip::ZipArchive;

    let file = File::open(archive)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| FilesystemError::ArchiveError(e.to_string()))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| FilesystemError::ArchiveError(e.to_string()))?;

        let name = entry.name().to_string();
        let path = dest.join(&name);

        if entry.is_dir() {
            std::fs::create_dir_all(&path)?;
        } else {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }

            let mut outfile = File::create(&path)?;
            let mut buffer = Vec::new();
            entry.read_to_end(&mut buffer)
                .map_err(|e| FilesystemError::Io(e))?;
            outfile.write_all(&buffer)?;
        }

        // Set permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = entry.unix_mode() {
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode))?;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs;
    use std::io::Write;

    #[test]
    fn test_format_detection() {
        assert_eq!(
            ArchiveFormat::from_extension(Path::new("test.tar.gz")),
            Some(ArchiveFormat::TarGz)
        );
        assert_eq!(
            ArchiveFormat::from_extension(Path::new("test.tgz")),
            Some(ArchiveFormat::TarGz)
        );
        assert_eq!(
            ArchiveFormat::from_extension(Path::new("test.tar")),
            Some(ArchiveFormat::Tar)
        );
        assert_eq!(
            ArchiveFormat::from_extension(Path::new("test.zip")),
            Some(ArchiveFormat::Zip)
        );
        assert_eq!(
            ArchiveFormat::from_extension(Path::new("test.txt")),
            None
        );
    }

    #[tokio::test]
    async fn test_compress_and_decompress() {
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create test files
        let mut f1 = fs::File::create(base.join("file1.txt")).unwrap();
        f1.write_all(b"Hello, World!").unwrap();

        fs::create_dir(base.join("subdir")).unwrap();
        let mut f2 = fs::File::create(base.join("subdir/file2.txt")).unwrap();
        f2.write_all(b"Nested file").unwrap();

        // Compress
        let archive = compress(
            base,
            &["file1.txt".to_string(), "subdir".to_string()],
            Some("test.tar.gz"),
        ).await.unwrap();

        assert!(archive.exists());

        // Create new destination
        let dest = temp.path().join("extracted");
        fs::create_dir(&dest).unwrap();

        // Decompress
        decompress(&archive, &dest).await.unwrap();

        // Verify
        assert!(dest.join("file1.txt").exists());
        assert!(dest.join("subdir/file2.txt").exists());
    }
}

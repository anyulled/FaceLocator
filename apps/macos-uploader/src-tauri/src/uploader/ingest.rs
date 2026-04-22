use std::collections::HashSet;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use super::{ItemStatus, SessionStatus, UploadItemState, UploadSessionState};

fn is_supported_file(path: &Path) -> bool {
  match path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()) {
    Some(ext) => matches!(ext.as_str(), "jpg" | "jpeg" | "png"),
    None => false,
  }
}

fn build_item(path: &Path, status: ItemStatus, error: Option<String>) -> UploadItemState {
  UploadItemState {
    item_id: Uuid::new_v4().to_string(),
    file_name: path
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or("unknown")
      .to_string(),
    source_path: path.to_string_lossy().to_string(),
    status,
    error,
    uploaded_object_key: None,
  }
}

pub fn ingest_folder(path: &Path) -> std::io::Result<UploadSessionState> {
  let mut items = Vec::new();
  let mut seen = HashSet::new();

  for entry in std::fs::read_dir(path)? {
    let entry = entry?;
    let entry_path = entry.path();
    let canonical = std::fs::canonicalize(&entry_path).unwrap_or(entry_path.clone());
    if !seen.insert(canonical) {
      continue;
    }

    if entry.file_type()?.is_dir() {
      items.push(build_item(
        &entry_path,
        ItemStatus::SkippedSubdirectory,
        Some("File is in a subfolder (ignored).".to_string()),
      ));
      continue;
    }

    if !is_supported_file(&entry_path) {
      items.push(build_item(
        &entry_path,
        ItemStatus::SkippedUnsupported,
        Some("Unsupported file type (skipped).".to_string()),
      ));
      continue;
    }

    items.push(build_item(&entry_path, ItemStatus::Discovered, None));
  }

  Ok(UploadSessionState {
    session_id: Uuid::new_v4().to_string(),
    folder_path: Some(path.to_string_lossy().to_string()),
    status: SessionStatus::Ready,
    items,
  })
}

pub fn ingest_paths(paths: &[String]) -> std::io::Result<UploadSessionState> {
  let mut session = UploadSessionState {
    session_id: Uuid::new_v4().to_string(),
    folder_path: None,
    status: SessionStatus::Ready,
    items: Vec::new(),
  };

  for path in paths {
    let path_buf = PathBuf::from(path);
    if path_buf.is_dir() {
      let nested = ingest_folder(&path_buf)?;
      if session.folder_path.is_none() {
        session.folder_path = nested.folder_path;
      }
      session.items.extend(nested.items);
      continue;
    }

    if is_supported_file(&path_buf) {
      session.items.push(build_item(&path_buf, ItemStatus::Discovered, None));
    } else {
      session.items.push(build_item(
        &path_buf,
        ItemStatus::SkippedUnsupported,
        Some("Unsupported file type (skipped).".to_string()),
      ));
    }
  }

  Ok(session)
}

#[cfg(test)]
mod tests {
  use super::ingest_folder;

  #[test]
  fn ignores_nested_directories() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("photo.jpg"), b"demo").unwrap();
    std::fs::create_dir(temp.path().join("nested")).unwrap();

    let session = ingest_folder(temp.path()).unwrap();
    assert_eq!(session.items.len(), 2);
    assert!(session.items.iter().any(|item| item.status == super::ItemStatus::Discovered));
    assert!(session.items.iter().any(|item| item.status == super::ItemStatus::SkippedSubdirectory));
  }
}

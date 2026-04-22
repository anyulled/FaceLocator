use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tempfile::TempDir;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::sync::CancellationToken;

use crate::uploader::UploadSessionState;

pub struct SessionRecord {
  pub state: Arc<AsyncMutex<UploadSessionState>>,
  pub cancellation: CancellationToken,
  pub temp_dir: Mutex<Option<TempDir>>,
}

impl SessionRecord {
  pub fn new(state: UploadSessionState) -> Self {
    Self {
      state: Arc::new(AsyncMutex::new(state)),
      cancellation: CancellationToken::new(),
      temp_dir: Mutex::new(None),
    }
  }
}

#[derive(Default)]
pub struct AppState {
  pub token: Mutex<Option<String>>,
  pub sessions: Mutex<HashMap<String, Arc<SessionRecord>>>,
}

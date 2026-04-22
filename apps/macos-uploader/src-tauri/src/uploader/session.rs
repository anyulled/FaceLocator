use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tempfile::tempdir;
use tokio::sync::Mutex as AsyncMutex;

use crate::auth;
use crate::error::AppError;
use crate::state::{AppState, SessionRecord};

use super::backend;
use super::events::{session_totals, ItemEvent, SessionEvent};
use super::preprocess::preprocess_image;
use super::upload::upload_file;
use super::{ItemStatus, SessionStatus, StartUploadRequest, UploadSessionState};

async fn emit_session(app: &AppHandle, state: &UploadSessionState) {
  let _ = app.emit(
    "uploader://session",
    SessionEvent {
      session_id: state.session_id.clone(),
      status: state.status.clone(),
      totals: session_totals(&state.items),
    },
  );
}

async fn emit_item(app: &AppHandle, session_id: &str, item: super::UploadItemState) {
  let _ = app.emit(
    "uploader://item",
    ItemEvent {
      session_id: session_id.to_string(),
      item,
    },
  );
}

pub fn register_session(state: &AppState, session: UploadSessionState) -> UploadSessionState {
  let record = Arc::new(SessionRecord::new(session.clone()));
  state
    .sessions
    .lock()
    .unwrap()
    .insert(session.session_id.clone(), record);
  session
}

pub fn get_session_record(state: &AppState, session_id: &str) -> Result<Arc<SessionRecord>, AppError> {
  state
    .sessions
    .lock()
    .unwrap()
    .get(session_id)
    .cloned()
    .ok_or_else(|| AppError::message("Upload session not found"))
}

pub async fn get_session_state(
  state: &AppState,
  session_id: &str,
) -> Result<UploadSessionState, AppError> {
  let record = get_session_record(state, session_id)?;
  let current = record.state.lock().await.clone();
  Ok(current)
}

pub fn cancel_session(state: &AppState, session_id: &str) -> Result<(), AppError> {
  let record = get_session_record(state, session_id)?;
  record.cancellation.cancel();
  Ok(())
}

pub async fn reset_session(state: &AppState, session_id: &str) -> Result<(), AppError> {
  let record = state.sessions.lock().unwrap().remove(session_id);
  if let Some(record) = record {
    record.cancellation.cancel();
    drop(record.temp_dir.lock().unwrap().take());
  }
  Ok(())
}

pub async fn start_upload(
  app: AppHandle,
  state: &AppState,
  request: StartUploadRequest,
) -> Result<UploadSessionState, AppError> {
  let token = auth::load_token(state)?.ok_or_else(|| AppError::message("Sign in first"))?;
  let record = get_session_record(state, &request.session_id)?;
  let backend_base_url = request.backend_base_url.clone();
  let event_slug = request.event_slug.clone();
  let workers = request.concurrency.unwrap_or(4).clamp(1, 8);

  {
    let mut session = record.state.lock().await;
    session.status = SessionStatus::Running;
    emit_session(&app, &session).await;
  }

  let queue = {
    let session = record.state.lock().await;
    let queue = session
      .items
      .iter()
      .enumerate()
      .filter_map(|(index, item)| (item.status == ItemStatus::Discovered).then_some(index))
      .collect::<VecDeque<_>>();
    Arc::new(AsyncMutex::new(queue))
  };

  let temp_dir = tempdir()?;
  *record.temp_dir.lock().unwrap() = Some(temp_dir);

  for _ in 0..workers {
    let app = app.clone();
    let record = record.clone();
    let queue = queue.clone();
    let token = token.clone();
    let backend_base_url = backend_base_url.clone();
    let event_slug = event_slug.clone();

    tauri::async_runtime::spawn(async move {
      loop {
        if record.cancellation.is_cancelled() {
          let mut session = record.state.lock().await;
          session.status = SessionStatus::Cancelling;
          emit_session(&app, &session).await;
          break;
        }

        let next_index = { queue.lock().await.pop_front() };
        let Some(index) = next_index else {
          break;
        };

        {
          let mut session = record.state.lock().await;
          session.items[index].status = ItemStatus::Preprocessing;
          let item = session.items[index].clone();
          emit_item(&app, &session.session_id, item).await;
          emit_session(&app, &session).await;
        }

        let source_path = {
          let session = record.state.lock().await;
          session.items[index].source_path.clone()
        };

        let preprocess_path = PathBuf::from(&source_path);
        let preprocess_result = tokio::task::spawn_blocking(move || preprocess_image(preprocess_path.as_path()))
          .await
          .map_err(|error| AppError::message(error.to_string()));
        let temp_file = match preprocess_result {
          Ok(Ok(file)) => file,
          Ok(Err(error)) => {
            let mut session = record.state.lock().await;
            session.items[index].status = ItemStatus::Failed;
            session.items[index].error = Some(error.to_string());
            let item = session.items[index].clone();
            emit_item(&app, &session.session_id, item).await;
            emit_session(&app, &session).await;
            continue;
          }
          Err(error) => {
            let mut session = record.state.lock().await;
            session.items[index].status = ItemStatus::Failed;
            session.items[index].error = Some(error.to_string());
            let item = session.items[index].clone();
            emit_item(&app, &session.session_id, item).await;
            emit_session(&app, &session).await;
            continue;
          }
        };

        {
          let mut session = record.state.lock().await;
          session.items[index].status = ItemStatus::Presigning;
          let item = session.items[index].clone();
          emit_item(&app, &session.session_id, item).await;
        }

        let presign = match backend::create_presign(&backend_base_url, &token, &event_slug).await {
          Ok(presign) => presign,
          Err(error) => {
            let mut session = record.state.lock().await;
            session.items[index].status = ItemStatus::Failed;
            session.items[index].error = Some(error.to_string());
            let item = session.items[index].clone();
            emit_item(&app, &session.session_id, item).await;
            emit_session(&app, &session).await;
            continue;
          }
        };

        {
          let mut session = record.state.lock().await;
          session.items[index].status = ItemStatus::Uploading;
          let item = session.items[index].clone();
          emit_item(&app, &session.session_id, item).await;
          emit_session(&app, &session).await;
        }

        let upload_result = upload_file(&presign.upload, temp_file.path()).await;
        let mut session = record.state.lock().await;
        if upload_result.is_ok() {
          session.items[index].status = ItemStatus::Succeeded;
          session.items[index].uploaded_object_key = Some(presign.photo.object_key);
          session.items[index].error = None;
        } else {
          session.items[index].status = ItemStatus::Failed;
          session.items[index].error = upload_result.err().map(|error| error.to_string());
        }
        let item = session.items[index].clone();
        emit_item(&app, &session.session_id, item).await;
        emit_session(&app, &session).await;
      }

      let mut session = record.state.lock().await;
      if record.cancellation.is_cancelled() {
        session.status = SessionStatus::Cancelled;
        for item in session.items.iter_mut().filter(|item| item.status == ItemStatus::Discovered) {
          item.status = ItemStatus::Cancelled;
        }
      } else if session.items.iter().all(|item| {
        matches!(
          item.status,
          ItemStatus::Succeeded
            | ItemStatus::Failed
            | ItemStatus::SkippedUnsupported
            | ItemStatus::SkippedSubdirectory
        )
      }) {
        session.status = SessionStatus::Completed;
      }
      emit_session(&app, &session).await;
    });
  }

  let current = record.state.lock().await.clone();
  Ok(current)
}

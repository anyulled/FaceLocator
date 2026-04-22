mod auth;
mod error;
mod state;
mod uploader;

use auth::AuthStatus;
use error::AppError;
use state::AppState;
use uploader::ingest::{ingest_folder, ingest_paths};
use uploader::session::{cancel_session, get_session_state, register_session, reset_session, start_upload};
use uploader::{AdminEventsResponse, ListEventsRequest, StartUploadRequest, UploadSessionState};

#[tauri::command]
fn auth_set_bearer_token(token: String, state: tauri::State<'_, AppState>) -> Result<AuthStatus, AppError> {
  auth::set_token(&state, token)
}

#[tauri::command]
fn auth_clear(state: tauri::State<'_, AppState>) -> Result<AuthStatus, AppError> {
  auth::clear_token(&state)
}

#[tauri::command]
fn auth_status(state: tauri::State<'_, AppState>) -> Result<AuthStatus, AppError> {
  auth::get_status(&state)
}

#[tauri::command]
async fn auth_begin_browser_sign_in(
  backend_base_url: String,
  state: tauri::State<'_, AppState>,
) -> Result<AuthStatus, AppError> {
  auth::begin_browser_sign_in(&state, &backend_base_url).await
}

#[tauri::command]
async fn admin_list_events(
  request: ListEventsRequest,
  state: tauri::State<'_, AppState>,
) -> Result<AdminEventsResponse, AppError> {
  let token = auth::load_token(&state)?.ok_or_else(|| AppError::message("Sign in first"))?;
  uploader::backend::list_events(
    &request.backend_base_url,
    &token,
    request.page.unwrap_or(1),
    request.page_size.unwrap_or(100),
  )
  .await
}

#[tauri::command]
fn uploader_ingest_folder(
  folder_path: String,
  state: tauri::State<'_, AppState>,
) -> Result<UploadSessionState, AppError> {
  let session = ingest_folder(std::path::Path::new(&folder_path))?;
  Ok(register_session(&state, session))
}

#[tauri::command]
fn uploader_ingest_paths(
  paths: Vec<String>,
  state: tauri::State<'_, AppState>,
) -> Result<UploadSessionState, AppError> {
  let session = ingest_paths(&paths)?;
  Ok(register_session(&state, session))
}

#[tauri::command]
async fn uploader_start_upload(
  request: StartUploadRequest,
  app: tauri::AppHandle,
  state: tauri::State<'_, AppState>,
) -> Result<UploadSessionState, AppError> {
  start_upload(app, &state, request).await
}

#[tauri::command]
fn uploader_cancel(session_id: String, state: tauri::State<'_, AppState>) -> Result<(), AppError> {
  cancel_session(&state, &session_id)
}

#[tauri::command]
async fn uploader_reset(session_id: String, state: tauri::State<'_, AppState>) -> Result<(), AppError> {
  reset_session(&state, &session_id).await
}

#[tauri::command]
async fn uploader_get_state(
  session_id: String,
  state: tauri::State<'_, AppState>,
) -> Result<UploadSessionState, AppError> {
  get_session_state(&state, &session_id).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(AppState::default())
    .invoke_handler(tauri::generate_handler![
      auth_set_bearer_token,
      auth_clear,
      auth_status,
      auth_begin_browser_sign_in,
      admin_list_events,
      uploader_ingest_folder,
      uploader_ingest_paths,
      uploader_start_upload,
      uploader_cancel,
      uploader_reset,
      uploader_get_state
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

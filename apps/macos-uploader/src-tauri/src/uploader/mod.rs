pub mod backend;
pub mod events;
pub mod ingest;
pub mod preprocess;
pub mod session;
pub mod upload;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SessionStatus {
  Idle,
  Ready,
  Running,
  Cancelling,
  Cancelled,
  Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ItemStatus {
  Discovered,
  SkippedUnsupported,
  SkippedSubdirectory,
  Preprocessing,
  Presigning,
  Uploading,
  Succeeded,
  Failed,
  Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadItemState {
  pub item_id: String,
  pub file_name: String,
  pub source_path: String,
  pub status: ItemStatus,
  pub error: Option<String>,
  pub uploaded_object_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadSessionState {
  pub session_id: String,
  pub folder_path: Option<String>,
  pub status: SessionStatus,
  pub items: Vec<UploadItemState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartUploadRequest {
  pub session_id: String,
  pub backend_base_url: String,
  pub event_slug: String,
  pub concurrency: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEventsRequest {
  pub backend_base_url: String,
  pub page: Option<usize>,
  pub page_size: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminEventSummary {
  pub id: String,
  pub slug: String,
  pub title: String,
  pub venue: String,
  pub description: String,
  pub starts_at: String,
  pub ends_at: String,
  pub photo_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminEventsResponse {
  pub events: Vec<AdminEventSummary>,
  pub total_count: usize,
}

use serde::Serialize;

use super::{ItemStatus, SessionStatus, UploadItemState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEvent {
  pub session_id: String,
  pub status: SessionStatus,
  pub totals: SessionTotals,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTotals {
  pub discovered: usize,
  pub succeeded: usize,
  pub failed: usize,
  pub skipped: usize,
  pub uploading: usize,
  pub queued: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemEvent {
  pub session_id: String,
  pub item: UploadItemState,
}

pub fn session_totals(items: &[UploadItemState]) -> SessionTotals {
  let mut totals = SessionTotals {
    discovered: items.len(),
    succeeded: 0,
    failed: 0,
    skipped: 0,
    uploading: 0,
    queued: 0,
  };

  for item in items {
    match item.status {
      ItemStatus::Succeeded => totals.succeeded += 1,
      ItemStatus::Failed => totals.failed += 1,
      ItemStatus::SkippedUnsupported | ItemStatus::SkippedSubdirectory => totals.skipped += 1,
      ItemStatus::Uploading | ItemStatus::Presigning | ItemStatus::Preprocessing => totals.uploading += 1,
      ItemStatus::Discovered => totals.queued += 1,
      ItemStatus::Cancelled => totals.failed += 1,
    }
  }

  totals
}

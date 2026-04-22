use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::AdminEventsResponse;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignResponse {
  pub event: PresignedEvent,
  pub photo: PresignedPhoto,
  pub upload: PresignedUpload,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignedEvent {
  pub id: String,
  pub slug: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignedPhoto {
  pub photo_id: String,
  pub object_key: String,
  pub uploaded_by: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignedUpload {
  pub method: String,
  pub url: String,
  pub headers: std::collections::HashMap<String, String>,
  pub object_key: String,
  pub expires_at: String,
}

fn normalize_base_url(base_url: &str) -> String {
  base_url.trim_end_matches('/').to_string()
}

pub async fn list_events(
  base_url: &str,
  token: &str,
  page: usize,
  page_size: usize,
) -> Result<AdminEventsResponse, AppError> {
  let url = format!(
    "{}/api/admin/events?page={page}&pageSize={page_size}",
    normalize_base_url(base_url)
  );

  let response = reqwest::Client::new()
    .get(url)
    .bearer_auth(token)
    .send()
    .await?;

  if !response.status().is_success() {
    return Err(AppError::message(format!(
      "Failed to load events: {}",
      response.status()
    )));
  }

  Ok(response.json::<AdminEventsResponse>().await?)
}

pub async fn create_presign(
  base_url: &str,
  token: &str,
  event_slug: &str,
) -> Result<PresignResponse, AppError> {
  let url = format!(
    "{}/api/admin/events/{event_slug}/photos/presign",
    normalize_base_url(base_url)
  );

  let response = reqwest::Client::new()
    .post(url)
    .bearer_auth(token)
    .json(&serde_json::json!({
      "contentType": "image/jpeg",
    }))
    .send()
    .await?;

  if !response.status().is_success() {
    return Err(AppError::message(format!(
      "Failed to create upload contract: {}",
      response.status()
    )));
  }

  Ok(response.json::<PresignResponse>().await?)
}

pub fn build_upload_headers(headers: &std::collections::HashMap<String, String>) -> Result<HeaderMap, AppError> {
  let mut header_map = HeaderMap::new();
  for (key, value) in headers {
    let name = HeaderName::from_bytes(key.as_bytes()).map_err(|error| AppError::message(error.to_string()))?;
    let value = HeaderValue::from_str(value).map_err(|error| AppError::message(error.to_string()))?;
    header_map.insert(name, value);
  }
  Ok(header_map)
}

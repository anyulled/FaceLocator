use std::path::Path;

use crate::error::AppError;

use super::backend::{build_upload_headers, PresignedUpload};

pub async fn upload_file(upload: &PresignedUpload, file_path: &Path) -> Result<(), AppError> {
  let body = tokio::fs::read(file_path).await?;
  let method = reqwest::Method::from_bytes(upload.method.as_bytes())
    .map_err(|error| AppError::message(error.to_string()))?;
  let response = reqwest::Client::new()
    .request(method, &upload.url)
    .headers(build_upload_headers(&upload.headers)?)
    .body(body)
    .send()
    .await?;

  if !response.status().is_success() {
    return Err(AppError::message(format!(
      "Upload failed with status {}",
      response.status()
    )));
  }

  Ok(())
}

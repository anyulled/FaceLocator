use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
  #[error("{0}")]
  Message(String),
}

impl AppError {
  pub fn message(message: impl Into<String>) -> Self {
    Self::Message(message.into())
  }
}

impl Serialize for AppError {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    serializer.serialize_str(&self.to_string())
  }
}

impl From<std::io::Error> for AppError {
  fn from(value: std::io::Error) -> Self {
    Self::message(value.to_string())
  }
}

impl From<reqwest::Error> for AppError {
  fn from(value: reqwest::Error) -> Self {
    Self::message(value.to_string())
  }
}

impl From<image::ImageError> for AppError {
  fn from(value: image::ImageError) -> Self {
    Self::message(value.to_string())
  }
}

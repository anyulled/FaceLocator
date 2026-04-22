use crate::error::AppError;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const KEYRING_SERVICE: &str = "face-locator-macos-uploader";
const KEYRING_ACCOUNT: &str = "admin-bearer-token";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
  pub authenticated: bool,
  pub token_preview: Option<String>,
}

fn keyring_entry() -> Result<keyring::Entry, AppError> {
  keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| AppError::message(error.to_string()))
}

pub fn preview_token(token: &str) -> String {
  let tail = token.chars().rev().take(6).collect::<String>().chars().rev().collect::<String>();
  format!("...{tail}")
}

pub fn load_token(state: &AppState) -> Result<Option<String>, AppError> {
  if let Some(token) = state.token.lock().unwrap().clone() {
    return Ok(Some(token));
  }

  let entry = keyring_entry()?;
  match entry.get_password() {
    Ok(token) => {
      *state.token.lock().unwrap() = Some(token.clone());
      Ok(Some(token))
    }
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(error) => Err(AppError::message(error.to_string())),
  }
}

pub fn set_token(state: &AppState, token: String) -> Result<AuthStatus, AppError> {
  let entry = keyring_entry()?;
  entry
    .set_password(&token)
    .map_err(|error| AppError::message(error.to_string()))?;
  *state.token.lock().unwrap() = Some(token.clone());

  Ok(AuthStatus {
    authenticated: true,
    token_preview: Some(preview_token(&token)),
  })
}

pub fn clear_token(state: &AppState) -> Result<AuthStatus, AppError> {
  let entry = keyring_entry()?;
  match entry.delete_credential() {
    Ok(_) | Err(keyring::Error::NoEntry) => {}
    Err(error) => return Err(AppError::message(error.to_string())),
  }
  *state.token.lock().unwrap() = None;

  Ok(AuthStatus {
    authenticated: false,
    token_preview: None,
  })
}

pub fn get_status(state: &AppState) -> Result<AuthStatus, AppError> {
  let token = load_token(state)?;
  Ok(AuthStatus {
    authenticated: token.is_some(),
    token_preview: token.as_deref().map(preview_token),
  })
}

fn parse_form_urlencoded(body: &str, key: &str) -> Option<String> {
  body.split('&').find_map(|pair| {
    let mut parts = pair.splitn(2, '=');
    let current_key = parts.next()?;
    let current_value = parts.next().unwrap_or_default();
    if current_key != key {
      return None;
    }
    let decoded = current_value.replace('+', " ");
    let bytes = decoded.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
      if bytes[index] == b'%' && index + 2 < bytes.len() {
        let hex = &decoded[index + 1..index + 3];
        if let Ok(value) = u8::from_str_radix(hex, 16) {
          output.push(value);
          index += 3;
          continue;
        }
      }
      output.push(bytes[index]);
      index += 1;
    }
    String::from_utf8(output).ok()
  })
}

fn build_browser_sign_in_url(base_url: &str, handoff_url: &str) -> Result<String, AppError> {
  let mut url = reqwest::Url::parse(&format!(
    "{}/api/admin/login",
    base_url.trim_end_matches('/')
  ))
  .map_err(|error| AppError::message(error.to_string()))?;
  url.query_pairs_mut()
    .append_pair("responseMode", "token")
    .append_pair("redirect", "/admin/events")
    .append_pair("handoff", handoff_url);
  Ok(url.to_string())
}

pub async fn begin_browser_sign_in(state: &AppState, base_url: &str) -> Result<AuthStatus, AppError> {
  let listener = TcpListener::bind("127.0.0.1:0").await?;
  let address = listener.local_addr()?;
  let handoff_url = format!("http://127.0.0.1:{}/callback", address.port());
  let login_url = build_browser_sign_in_url(base_url, &handoff_url)?;

  open::that_detached(login_url).map_err(|error| AppError::message(error.to_string()))?;

  let (mut stream, _) = tokio::time::timeout(std::time::Duration::from_secs(300), listener.accept())
    .await
    .map_err(|_| AppError::message("Timed out waiting for browser sign-in"))?
    .map_err(AppError::from)?;

  let mut buffer = [0_u8; 8192];
  let read = stream.read(&mut buffer).await?;
  let request = String::from_utf8_lossy(&buffer[..read]);
  let body = request.split("\r\n\r\n").nth(1).unwrap_or_default();
  let access_token = parse_form_urlencoded(body, "accessToken")
    .ok_or_else(|| AppError::message("Browser sign-in did not return an access token"))?;

  let response = b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body><h1>Sign-in complete</h1><p>You can return to event Face Locator.</p></body></html>";
  stream.write_all(response).await?;
  stream.shutdown().await?;

  set_token(state, access_token)
}

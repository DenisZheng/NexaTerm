use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::app_error::AppError;
use crate::brand_migration::{CURRENT_APP_IDENTIFIER, LEGACY_APP_IDENTIFIER};

const PROBE_WINDOW_LABEL: &str = "legacy-settings-probe";
const MAX_SETTINGS_BYTES: usize = 1024 * 1024;

#[derive(Default)]
pub struct LegacyWebviewSettingsProbeState {
    captures: Mutex<HashMap<String, ProbeCapture>>,
}

#[derive(Clone, Debug)]
struct ProbeCapture {
    complete: bool,
    value: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyWebviewSettingsProbeStart {
    pub supported: bool,
    pub started: bool,
    pub token: Option<String>,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyWebviewSettingsProbeResult {
    pub complete: bool,
    pub value: Option<String>,
}

#[tauri::command]
pub async fn legacy_webview_settings_probe_start(
    app: tauri::AppHandle,
    state: State<'_, LegacyWebviewSettingsProbeState>,
) -> Result<LegacyWebviewSettingsProbeStart, AppError> {
    #[cfg(target_os = "macos")]
    {
        let _ = (&app, &state);
        return Ok(LegacyWebviewSettingsProbeStart {
            supported: false,
            started: false,
            token: None,
            reason: Some("macos-default-wkwebview-store-unaddressable".to_string()),
        });
    }

    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        let _ = (&app, &state);
        return Ok(LegacyWebviewSettingsProbeStart {
            supported: false,
            started: false,
            token: None,
            reason: Some("platform-unsupported".to_string()),
        });
    }

    #[cfg(any(windows, target_os = "linux"))]
    {
        let Some(legacy_root) = legacy_webview_data_root(&app)? else {
            return Ok(LegacyWebviewSettingsProbeStart {
                supported: true,
                started: false,
                token: None,
                reason: Some("custom-app-local-data-root".to_string()),
            });
        };
        if !legacy_root.is_dir() {
            return Ok(LegacyWebviewSettingsProbeStart {
                supported: true,
                started: false,
                token: None,
                reason: Some("legacy-webview-data-not-found".to_string()),
            });
        }

        if let Some(existing) = app.get_webview_window(PROBE_WINDOW_LABEL) {
            let _ = existing.close();
        }

        let token = uuid::Uuid::new_v4().to_string();
        {
            let mut captures = state.captures.lock().map_err(|_| {
                AppError::new(
                    "brand_settings_probe_state_failed",
                    "无法初始化旧设置迁移状态。",
                    "probe mutex poisoned",
                    true,
                )
            })?;
            captures.clear();
            captures.insert(
                token.clone(),
                ProbeCapture {
                    complete: false,
                    value: None,
                },
            );
        }

        let token_json = serde_json::to_string(&token).map_err(|error| {
            AppError::new(
                "brand_settings_probe_token_failed",
                "无法初始化旧设置迁移令牌。",
                error,
                true,
            )
        })?;
        let initialization_script =
            format!("window.__NEXATERM_LEGACY_SETTINGS_PROBE_TOKEN__ = {token_json};");
        WebviewWindowBuilder::new(
            &app,
            PROBE_WINDOW_LABEL,
            WebviewUrl::App("index.html".into()),
        )
            .initialization_script(initialization_script)
            .data_directory(legacy_root)
            .visible(false)
            .build()
            .map_err(|error| {
                AppError::new(
                    "brand_settings_probe_window_failed",
                    "无法打开旧 mXterm 设置读取窗口。",
                    error,
                    true,
                )
            })?;

        Ok(LegacyWebviewSettingsProbeStart {
            supported: true,
            started: true,
            token: Some(token),
            reason: None,
        })
    }
}

#[tauri::command]
pub fn legacy_webview_settings_probe_capture(
    token: String,
    value: Option<String>,
    state: State<'_, LegacyWebviewSettingsProbeState>,
) -> Result<(), AppError> {
    let value = value
        .map(|value| {
            if value.len() > MAX_SETTINGS_BYTES {
                return Err(AppError::new(
                    "brand_settings_probe_too_large",
                    "旧 mXterm 设置数据异常过大，已停止自动迁移。",
                    value.len(),
                    false,
                ));
            }
            serde_json::from_str::<serde_json::Value>(&value).map_err(|error| {
                AppError::new(
                    "brand_settings_probe_invalid_json",
                    "旧 mXterm 设置数据损坏，已停止自动迁移。",
                    error,
                    false,
                )
            })?;
            Ok(value)
        })
        .transpose()?;

    let mut captures = state.captures.lock().map_err(|_| {
        AppError::new(
            "brand_settings_probe_state_failed",
            "无法更新旧设置迁移状态。",
            "probe mutex poisoned",
            true,
        )
    })?;
    let Some(capture) = captures.get_mut(&token) else {
        return Err(AppError::new(
            "brand_settings_probe_token_invalid",
            "旧设置迁移令牌已失效。",
            "unknown probe token",
            false,
        ));
    };
    capture.complete = true;
    capture.value = value;
    Ok(())
}

#[tauri::command]
pub fn legacy_webview_settings_probe_take(
    token: String,
    state: State<'_, LegacyWebviewSettingsProbeState>,
) -> Result<LegacyWebviewSettingsProbeResult, AppError> {
    let mut captures = state.captures.lock().map_err(|_| {
        AppError::new(
            "brand_settings_probe_state_failed",
            "无法读取旧设置迁移状态。",
            "probe mutex poisoned",
            true,
        )
    })?;
    let Some(capture) = captures.get(&token).cloned() else {
        return Ok(LegacyWebviewSettingsProbeResult {
            complete: true,
            value: None,
        });
    };

    if capture.complete {
        captures.remove(&token);
    }
    Ok(LegacyWebviewSettingsProbeResult {
        complete: capture.complete,
        value: capture.value,
    })
}

#[cfg(any(windows, target_os = "linux"))]
fn legacy_webview_data_root(app: &tauri::AppHandle) -> Result<Option<PathBuf>, AppError> {
    let current_root = app.path().app_local_data_dir().map_err(|error| {
        AppError::new(
            "brand_settings_probe_path_failed",
            "无法定位 NexaTerm WebView 数据目录。",
            error,
            true,
        )
    })?;
    let Some(directory_name) = current_root.file_name() else {
        return Ok(None);
    };
    if directory_name.to_string_lossy() != CURRENT_APP_IDENTIFIER {
        return Ok(None);
    }
    Ok(current_root
        .parent()
        .map(|parent| parent.join(LEGACY_APP_IDENTIFIER)))
}

#[cfg(test)]
mod tests {
    use super::MAX_SETTINGS_BYTES;

    #[test]
    fn settings_probe_payload_limit_is_bounded() {
        assert_eq!(MAX_SETTINGS_BYTES, 1024 * 1024);
    }
}

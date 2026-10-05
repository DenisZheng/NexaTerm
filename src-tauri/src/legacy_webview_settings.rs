use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use std::collections::HashSet;
#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::path::Path;

#[cfg(target_os = "macos")]
use rusqlite::types::Value;
#[cfg(target_os = "macos")]
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use tauri::State;
#[cfg(any(windows, target_os = "linux"))]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::app_error::AppError;
use crate::brand_migration::{CURRENT_APP_IDENTIFIER, LEGACY_APP_IDENTIFIER};

const PROBE_WINDOW_LABEL: &str = "legacy-settings-probe";
const SETTINGS_STORAGE_KEY: &str = "mxterm.settings.v1";
const MAX_SETTINGS_BYTES: usize = 1024 * 1024;
#[cfg(target_os = "macos")]
const MAX_MACOS_SCAN_DEPTH: usize = 10;
#[cfg(target_os = "macos")]
const MAX_MACOS_LOCALSTORAGE_DATABASES: usize = 64;

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
        let scan = read_legacy_macos_settings()?;
        if !scan.store_found {
            return Ok(LegacyWebviewSettingsProbeStart {
                supported: true,
                started: false,
                token: None,
                reason: Some("legacy-webview-data-not-found".to_string()),
            });
        }

        let token = uuid::Uuid::new_v4().to_string();
        replace_capture(
            &state,
            token.clone(),
            ProbeCapture {
                complete: true,
                value: scan.value,
            },
        )?;
        let _ = app;
        return Ok(LegacyWebviewSettingsProbeStart {
            supported: true,
            started: true,
            token: Some(token),
            reason: Some("macos-readonly-webkit-sqlite".to_string()),
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
        replace_capture(
            &state,
            token.clone(),
            ProbeCapture {
                complete: false,
                value: None,
            },
        )?;

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
    let value = value.map(validate_settings_json).transpose()?;

    let mut captures = state.captures.lock().map_err(|_| probe_state_error("update"))?;
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
    let mut captures = state.captures.lock().map_err(|_| probe_state_error("read"))?;
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

fn replace_capture(
    state: &State<'_, LegacyWebviewSettingsProbeState>,
    token: String,
    capture: ProbeCapture,
) -> Result<(), AppError> {
    let mut captures = state.captures.lock().map_err(|_| probe_state_error("initialize"))?;
    captures.clear();
    captures.insert(token, capture);
    Ok(())
}

fn probe_state_error(stage: &str) -> AppError {
    AppError::new(
        "brand_settings_probe_state_failed",
        "无法访问旧设置迁移状态。",
        format!("probe mutex poisoned during {stage}"),
        true,
    )
}

fn validate_settings_json(value: String) -> Result<String, AppError> {
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

#[cfg(target_os = "macos")]
#[derive(Debug)]
struct MacosSettingsScan {
    store_found: bool,
    value: Option<String>,
}

#[cfg(target_os = "macos")]
fn read_legacy_macos_settings() -> Result<MacosSettingsScan, AppError> {
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or_else(|| {
        AppError::new(
            "brand_settings_probe_path_failed",
            "无法定位 macOS 用户目录。",
            "HOME missing",
            true,
        )
    })?;

    let roots = [
        home.join("Library")
            .join("WebKit")
            .join(LEGACY_APP_IDENTIFIER)
            .join("WebsiteData"),
        home.join("Library")
            .join("Containers")
            .join(LEGACY_APP_IDENTIFIER)
            .join("Data")
            .join("Library")
            .join("WebKit")
            .join("WebsiteData"),
        home.join("Library")
            .join("WebKit")
            .join("MXterm")
            .join("WebsiteData"),
    ];

    let existing_roots = roots
        .iter()
        .filter(|root| root.is_dir())
        .collect::<Vec<_>>();
    if existing_roots.is_empty() {
        return Ok(MacosSettingsScan {
            store_found: false,
            value: None,
        });
    }

    let mut databases = Vec::new();
    for root in existing_roots {
        collect_macos_localstorage_databases(root, 0, &mut databases)?;
    }

    let mut values = HashSet::new();
    for database in databases {
        if let Some(value) = read_settings_from_webkit_database(&database)? {
            values.insert(value);
            if values.len() > 1 {
                return Err(AppError::new(
                    "brand_settings_probe_ambiguous",
                    "检测到多个不同的旧 mXterm 设置副本，已停止自动迁移。",
                    "multiple distinct mxterm.settings.v1 values in legacy WebKit stores",
                    false,
                ));
            }
        }
    }

    Ok(MacosSettingsScan {
        store_found: true,
        value: values.into_iter().next(),
    })
}

#[cfg(target_os = "macos")]
fn collect_macos_localstorage_databases(
    root: &Path,
    depth: usize,
    databases: &mut Vec<PathBuf>,
) -> Result<(), AppError> {
    if depth > MAX_MACOS_SCAN_DEPTH {
        return Ok(());
    }
    if databases.len() >= MAX_MACOS_LOCALSTORAGE_DATABASES {
        return Err(AppError::new(
            "brand_settings_probe_scan_limit",
            "旧 mXterm WebKit 数据目录异常复杂，已停止自动迁移。",
            databases.len(),
            false,
        ));
    }

    let entries = fs::read_dir(root).map_err(|error| {
        AppError::new(
            "brand_settings_probe_scan_failed",
            "无法读取旧 mXterm WebKit 数据目录。",
            format!("{}: {error}", root.display()),
            true,
        )
    })?;
    for entry in entries {
        let entry = entry.map_err(|error| {
            AppError::new(
                "brand_settings_probe_scan_failed",
                "无法读取旧 mXterm WebKit 数据目录。",
                error,
                true,
            )
        })?;
        let file_type = entry.file_type().map_err(|error| {
            AppError::new(
                "brand_settings_probe_scan_failed",
                "无法检查旧 mXterm WebKit 数据。",
                error,
                true,
            )
        })?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_macos_localstorage_databases(&path, depth + 1, databases)?;
        } else if file_type.is_file()
            && entry.file_name().to_string_lossy() == "localstorage.sqlite3"
        {
            databases.push(path);
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn read_settings_from_webkit_database(path: &Path) -> Result<Option<String>, AppError> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| {
            AppError::new(
                "brand_settings_probe_database_failed",
                "无法只读打开旧 mXterm WebKit 设置数据库。",
                format!("{}: {error}", path.display()),
                true,
            )
        })?;
    let value = connection
        .query_row(
            "SELECT value FROM ItemTable WHERE key = ?1",
            [SETTINGS_STORAGE_KEY],
            |row| row.get::<_, Value>(0),
        )
        .optional()
        .map_err(|error| {
            AppError::new(
                "brand_settings_probe_database_failed",
                "无法读取旧 mXterm WebKit 设置。",
                format!("{}: {error}", path.display()),
                true,
            )
        })?;

    value
        .map(decode_webkit_localstorage_value)
        .transpose()
        .and_then(|value| value.map(validate_settings_json).transpose())
}

#[cfg(target_os = "macos")]
fn decode_webkit_localstorage_value(value: Value) -> Result<String, AppError> {
    match value {
        Value::Text(value) => Ok(value),
        Value::Blob(bytes) => decode_webkit_utf16le_blob(&bytes),
        other => Err(AppError::new(
            "brand_settings_probe_value_invalid",
            "旧 mXterm WebKit 设置格式无法识别。",
            format!("unexpected sqlite value type: {other:?}"),
            false,
        )),
    }
}

fn decode_webkit_utf16le_blob(bytes: &[u8]) -> Result<String, AppError> {
    if bytes.len() % 2 != 0 {
        return Err(AppError::new(
            "brand_settings_probe_value_invalid",
            "旧 mXterm WebKit 设置编码损坏。",
            format!("odd UTF-16 byte length: {}", bytes.len()),
            false,
        ));
    }
    let mut units = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect::<Vec<_>>();
    if units.first().copied() == Some(0xfeff) {
        units.remove(0);
    }
    while units.last().copied() == Some(0) {
        units.pop();
    }
    String::from_utf16(&units).map_err(|error| {
        AppError::new(
            "brand_settings_probe_value_invalid",
            "旧 mXterm WebKit 设置编码损坏。",
            error,
            false,
        )
    })
}

#[cfg(test)]
mod tests {
    use super::{decode_webkit_utf16le_blob, validate_settings_json, MAX_SETTINGS_BYTES};

    #[test]
    fn settings_probe_payload_limit_is_bounded() {
        assert_eq!(MAX_SETTINGS_BYTES, 1024 * 1024);
    }

    #[test]
    fn webkit_utf16le_settings_blob_decodes_json() {
        let json = r#"{"appearance":{"themeMode":"dark"}}"#;
        let bytes = json
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>();

        assert_eq!(decode_webkit_utf16le_blob(&bytes).unwrap(), json);
        assert!(validate_settings_json(json.to_string()).is_ok());
    }

    #[test]
    fn invalid_settings_json_is_rejected() {
        let error = validate_settings_json("{not-json}".to_string()).unwrap_err();
        assert_eq!(error.code, "brand_settings_probe_invalid_json");
    }
}

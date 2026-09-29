use std::borrow::Cow;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;

use encoding_rs::WINDOWS_1252;
use serde::{Deserialize, Serialize};

use crate::app_error::AppError;
use crate::connections::{
    ConnectionAdvancedConfig, ConnectionAuthKind, ConnectionCredentialMode, ConnectionJumpConfig,
    ConnectionProfile, ConnectionProfileInput, ConnectionProtocol, ConnectionProxyConfig,
};
use crate::storage_repository::StorageRepository;
use crate::sync_snapshot::sha256_hex;

const MOBAXTERM_IMPORT_MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MobaXtermSessionKind {
    Ssh,
    Wsl,
    Telnet,
    Rdp,
    Vnc,
    Sftp,
    Serial,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MobaXtermImportStatus {
    Ready,
    NeedsInput,
    Unsupported,
    Invalid,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MobaXtermImportConflict {
    #[default]
    None,
    ExactDuplicate,
    NameConflict,
    PossibleTargetDuplicate,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MobaXtermImportItem {
    pub source_index: usize,
    pub name: String,
    pub folder_path: Option<String>,
    pub kind: MobaXtermSessionKind,
    pub source_type_code: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub private_key_path: Option<String>,
    pub status: MobaXtermImportStatus,
    pub missing_fields: Vec<String>,
    pub warnings: Vec<String>,
    #[serde(default)]
    pub conflict: MobaXtermImportConflict,
    #[serde(default)]
    pub suggested_name: Option<String>,
    #[serde(default)]
    pub effective_username: Option<String>,
    #[serde(default)]
    pub selectable: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct MobaXtermImportSummary {
    pub total: usize,
    pub ready: usize,
    pub needs_input: usize,
    pub unsupported: usize,
    pub invalid: usize,
    pub exact_duplicates: usize,
    pub name_conflicts: usize,
    pub possible_target_duplicates: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MobaXtermImportPreviewResult {
    pub fingerprint: String,
    pub summary: MobaXtermImportSummary,
    pub items: Vec<MobaXtermImportItem>,
}

#[derive(Debug, Deserialize)]
pub struct MobaXtermImportPreviewRequest {
    pub path: String,
    #[serde(default)]
    pub default_username: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MobaXtermImportSelection {
    pub source_index: usize,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct MobaXtermImportApplyRequest {
    pub path: String,
    pub fingerprint: String,
    #[serde(default)]
    pub default_username: Option<String>,
    #[serde(default)]
    pub selections: Vec<MobaXtermImportSelection>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct MobaXtermImportApplyResult {
    pub created: usize,
    pub skipped_exact_duplicates: usize,
}

#[tauri::command]
pub async fn mobaxterm_import_preview(
    app: AppHandle,
    request: MobaXtermImportPreviewRequest,
) -> Result<MobaXtermImportPreviewResult, AppError> {
    let repository = StorageRepository::open_app(&app)?;
    preview_for_repository(
        &repository,
        Path::new(&request.path),
        request.default_username.as_deref(),
    )
}

#[tauri::command]
pub async fn mobaxterm_import_apply(
    app: AppHandle,
    request: MobaXtermImportApplyRequest,
) -> Result<MobaXtermImportApplyResult, AppError> {
    let mut repository = StorageRepository::open_app(&app)?;
    import_from_file(&mut repository, request)
}

pub fn preview_file(path: &Path) -> Result<MobaXtermImportPreviewResult, AppError> {
    let (fingerprint, items) = read_source_file(path)?;
    let summary = summarize(&items);
    Ok(MobaXtermImportPreviewResult {
        fingerprint,
        summary,
        items,
    })
}

pub fn preview_for_repository(
    repository: &StorageRepository,
    path: &Path,
    default_username: Option<&str>,
) -> Result<MobaXtermImportPreviewResult, AppError> {
    let (fingerprint, mut items) = read_source_file(path)?;
    enrich_items_for_repository(
        &mut items,
        &repository.connection_list()?,
        default_username,
    );
    let summary = summarize(&items);
    Ok(MobaXtermImportPreviewResult {
        fingerprint,
        summary,
        items,
    })
}

fn read_source_file(path: &Path) -> Result<(String, Vec<MobaXtermImportItem>), AppError> {
    validate_import_path(path)?;
    let metadata = fs::metadata(path).map_err(mobaxterm_import_file_read_failed)?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err(mobaxterm_import_file_read_failed(
            "MobaXterm import path is not a non-empty file",
        ));
    }
    if metadata.len() > MOBAXTERM_IMPORT_MAX_FILE_BYTES {
        return Err(mobaxterm_import_file_too_large(metadata.len()));
    }

    let bytes = fs::read(path).map_err(mobaxterm_import_file_read_failed)?;
    if bytes.len() as u64 > MOBAXTERM_IMPORT_MAX_FILE_BYTES {
        return Err(mobaxterm_import_file_too_large(bytes.len() as u64));
    }

    Ok((sha256_hex(&bytes), parse_bytes(&bytes)?))
}

fn parse_bytes(bytes: &[u8]) -> Result<Vec<MobaXtermImportItem>, AppError> {
    let decoded = decode_mobaxterm_text(bytes);
    let text = decoded.trim_start_matches('\u{feff}');
    let mut in_bookmarks = false;
    let mut folder_path: Option<String> = None;
    let mut items = Vec::new();

    for raw_line in text.lines() {
        let line = raw_line.trim_end_matches('\r');
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') {
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let section = &trimmed[1..trimmed.len() - 1];
            in_bookmarks = section == "Bookmarks" || section.starts_with("Bookmarks_");
            folder_path = None;
            continue;
        }

        if !in_bookmarks {
            continue;
        }

        let Some((raw_key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = raw_key.trim();
        if key.eq_ignore_ascii_case("SubRep") {
            folder_path = non_empty(raw_value).map(ToOwned::to_owned);
            continue;
        }
        if key.eq_ignore_ascii_case("ImgNum") {
            continue;
        }

        let name = key.trim();
        if name.is_empty() {
            continue;
        }
        let value = raw_value.trim_start();
        if !value.starts_with('#') {
            continue;
        }

        let source_index = items.len();
        items.push(parse_session(
            source_index,
            name,
            folder_path.as_deref(),
            value,
        ));
    }

    if items.is_empty() {
        return Err(AppError::new(
            "mobaxterm_import_no_sessions",
            "未在文件中找到可识别的 MobaXterm 会话。",
            "no MobaXterm bookmark session lines found",
            true,
        ));
    }

    Ok(items)
}

fn decode_mobaxterm_text(bytes: &[u8]) -> Cow<'_, str> {
    match std::str::from_utf8(bytes) {
        Ok(text) => Cow::Borrowed(text),
        Err(_) => {
            let (text, _, _) = WINDOWS_1252.decode(bytes);
            text
        }
    }
}

fn parse_session(
    source_index: usize,
    name: &str,
    folder_path: Option<&str>,
    value: &str,
) -> MobaXtermImportItem {
    let characteristics: Vec<&str> = value.split('#').collect();
    if characteristics.len() < 3 || !characteristics[0].trim().is_empty() {
        return invalid_item(
            source_index,
            name,
            folder_path,
            "",
            vec!["invalid_session_record".to_string()],
        );
    }

    let icon_code = characteristics[1].trim();
    let primary: Vec<&str> = characteristics[2].split('%').collect();
    let source_type_code = primary.first().copied().unwrap_or_default().trim();
    let kind = session_kind(source_type_code, icon_code);

    match kind {
        MobaXtermSessionKind::Ssh => {
            parse_ssh_session(source_index, name, folder_path, source_type_code, &primary)
        }
        _ => parse_unsupported_session(
            source_index,
            name,
            folder_path,
            source_type_code,
            kind,
            &primary,
        ),
    }
}

fn parse_ssh_session(
    source_index: usize,
    name: &str,
    folder_path: Option<&str>,
    source_type_code: &str,
    fields: &[&str],
) -> MobaXtermImportItem {
    let host = field(fields, 1).and_then(non_empty).map(ToOwned::to_owned);
    let port_raw = field(fields, 2).and_then(non_empty).unwrap_or("22");
    let port = port_raw.parse::<u16>().ok().filter(|value| *value > 0);
    let username = field(fields, 3).and_then(non_empty).map(ToOwned::to_owned);
    let private_key_path = field(fields, 14).and_then(non_empty).map(ToOwned::to_owned);
    let mut missing_fields = Vec::new();
    let mut warnings = Vec::new();

    if host.is_none() {
        warnings.push("missing_host".to_string());
    }
    if port.is_none() {
        warnings.push("invalid_port".to_string());
    }
    if username.is_none() {
        missing_fields.push("username".to_string());
    }

    if let Some(key_path) = private_key_path.as_deref() {
        warnings.push("private_key_path_is_local_reference".to_string());
        if key_path.contains("_CurrentDrive_") {
            warnings.push("private_key_path_uses_current_drive_placeholder".to_string());
        }
    }

    if field(fields, 7).and_then(non_empty).is_some() {
        warnings.push("startup_command_not_imported".to_string());
    }
    if field(fields, 8).and_then(non_empty).is_some() {
        warnings.push("ssh_gateway_requires_review".to_string());
        missing_fields.push("network_settings_review".to_string());
    }
    if field(fields, 19)
        .and_then(non_empty)
        .is_some_and(|value| value != "0")
    {
        warnings.push("proxy_requires_review".to_string());
        if !missing_fields
            .iter()
            .any(|field| field.as_str() == "network_settings_review")
        {
            missing_fields.push("network_settings_review".to_string());
        }
    }
    if field(fields, 5).is_some_and(|value| value.trim() == "-1") {
        warnings.push("x11_forwarding_not_imported".to_string());
    }

    let status = if host.is_none() || port.is_none() {
        MobaXtermImportStatus::Invalid
    } else if missing_fields.is_empty() {
        MobaXtermImportStatus::Ready
    } else {
        MobaXtermImportStatus::NeedsInput
    };

    MobaXtermImportItem {
        source_index,
        name: name.to_string(),
        folder_path: folder_path.and_then(non_empty).map(ToOwned::to_owned),
        kind: MobaXtermSessionKind::Ssh,
        source_type_code: source_type_code.to_string(),
        host,
        port,
        username,
        private_key_path,
        status,
        missing_fields,
        warnings,
        conflict: MobaXtermImportConflict::None,
        suggested_name: None,
        effective_username: None,
        selectable: false,
    }
}

fn parse_unsupported_session(
    source_index: usize,
    name: &str,
    folder_path: Option<&str>,
    source_type_code: &str,
    kind: MobaXtermSessionKind,
    fields: &[&str],
) -> MobaXtermImportItem {
    let host = match kind {
        MobaXtermSessionKind::Telnet
        | MobaXtermSessionKind::Rdp
        | MobaXtermSessionKind::Vnc
        | MobaXtermSessionKind::Sftp => field(fields, 1).and_then(non_empty).map(ToOwned::to_owned),
        _ => None,
    };
    let port = match kind {
        MobaXtermSessionKind::Telnet
        | MobaXtermSessionKind::Rdp
        | MobaXtermSessionKind::Vnc
        | MobaXtermSessionKind::Sftp => field(fields, 2)
            .and_then(non_empty)
            .and_then(|value| value.parse::<u16>().ok()),
        _ => None,
    };
    let username = match kind {
        MobaXtermSessionKind::Rdp | MobaXtermSessionKind::Sftp => {
            field(fields, 3).and_then(non_empty).map(ToOwned::to_owned)
        }
        _ => None,
    };

    MobaXtermImportItem {
        source_index,
        name: name.to_string(),
        folder_path: folder_path.and_then(non_empty).map(ToOwned::to_owned),
        kind,
        source_type_code: source_type_code.to_string(),
        host,
        port,
        username,
        private_key_path: None,
        status: MobaXtermImportStatus::Unsupported,
        missing_fields: Vec::new(),
        warnings: vec!["session_type_not_imported_yet".to_string()],
        conflict: MobaXtermImportConflict::None,
        suggested_name: None,
        effective_username: None,
        selectable: false,
    }
}

fn invalid_item(
    source_index: usize,
    name: &str,
    folder_path: Option<&str>,
    source_type_code: &str,
    warnings: Vec<String>,
) -> MobaXtermImportItem {
    MobaXtermImportItem {
        source_index,
        name: name.to_string(),
        folder_path: folder_path.and_then(non_empty).map(ToOwned::to_owned),
        kind: MobaXtermSessionKind::Other,
        source_type_code: source_type_code.to_string(),
        host: None,
        port: None,
        username: None,
        private_key_path: None,
        status: MobaXtermImportStatus::Invalid,
        missing_fields: Vec::new(),
        warnings,
        conflict: MobaXtermImportConflict::None,
        suggested_name: None,
        effective_username: None,
        selectable: false,
    }
}

fn summarize(items: &[MobaXtermImportItem]) -> MobaXtermImportSummary {
    let mut summary = MobaXtermImportSummary {
        total: items.len(),
        ..MobaXtermImportSummary::default()
    };
    for item in items {
        match item.status {
            MobaXtermImportStatus::Ready => summary.ready += 1,
            MobaXtermImportStatus::NeedsInput => summary.needs_input += 1,
            MobaXtermImportStatus::Unsupported => summary.unsupported += 1,
            MobaXtermImportStatus::Invalid => summary.invalid += 1,
        }
        match item.conflict {
            MobaXtermImportConflict::ExactDuplicate => summary.exact_duplicates += 1,
            MobaXtermImportConflict::NameConflict => summary.name_conflicts += 1,
            MobaXtermImportConflict::PossibleTargetDuplicate => {
                summary.possible_target_duplicates += 1
            }
            MobaXtermImportConflict::None => {}
        }
    }
    summary
}

fn enrich_items_for_repository(
    items: &mut [MobaXtermImportItem],
    existing: &[ConnectionProfile],
    default_username: Option<&str>,
) {
    let default_username = default_username.and_then(non_empty);
    let mut reserved_names: BTreeSet<String> =
        existing.iter().map(|item| item.name.clone()).collect();

    for item in items {
        if item.kind != MobaXtermSessionKind::Ssh {
            continue;
        }
        item.effective_username = item
            .username
            .clone()
            .or_else(|| default_username.map(ToOwned::to_owned));

        let blocked_network_settings = item
            .missing_fields
            .iter()
            .any(|field| field == "network_settings_review");
        let username_missing = item.effective_username.is_none();
        item.status = if item.host.is_none() || item.port.is_none() {
            MobaXtermImportStatus::Invalid
        } else if username_missing || blocked_network_settings {
            MobaXtermImportStatus::NeedsInput
        } else {
            MobaXtermImportStatus::Ready
        };

        if item.status == MobaXtermImportStatus::Invalid {
            item.selectable = false;
            continue;
        }

        let host = item.host.as_deref().unwrap_or_default();
        let port = item.port.unwrap_or_default();
        let username = item.effective_username.as_deref().unwrap_or_default();
        let exact = existing.iter().any(|candidate| {
            candidate.protocol == ConnectionProtocol::Ssh
                && candidate.name == item.name
                && same_host(&candidate.host, host)
                && candidate.port == port
                && candidate.username == username
        });
        let same_target = existing.iter().any(|candidate| {
            candidate.protocol == ConnectionProtocol::Ssh
                && same_host(&candidate.host, host)
                && candidate.port == port
                && candidate.username == username
                && candidate.name != item.name
        });

        if exact {
            item.conflict = MobaXtermImportConflict::ExactDuplicate;
            item.selectable = false;
            continue;
        }

        if reserved_names.contains(&item.name) {
            item.conflict = MobaXtermImportConflict::NameConflict;
            item.suggested_name = Some(suggest_unique_name(&item.name, &reserved_names));
        } else if same_target {
            item.conflict = MobaXtermImportConflict::PossibleTargetDuplicate;
        }
        reserved_names.insert(
            item.suggested_name
                .clone()
                .unwrap_or_else(|| item.name.clone()),
        );
        item.selectable = item.status == MobaXtermImportStatus::Ready;
    }
}

fn suggest_unique_name(base: &str, reserved: &BTreeSet<String>) -> String {
    let first = format!("{base} (MobaXterm)");
    if !reserved.contains(&first) {
        return first;
    }
    for suffix in 2..10_000 {
        let candidate = format!("{base} (MobaXterm {suffix})");
        if !reserved.contains(&candidate) {
            return candidate;
        }
    }
    format!("{base} (MobaXterm {})", uuid::Uuid::new_v4())
}

fn same_host(left: &str, right: &str) -> bool {
    left.trim().eq_ignore_ascii_case(right.trim())
}

fn import_from_file(
    repository: &mut StorageRepository,
    request: MobaXtermImportApplyRequest,
) -> Result<MobaXtermImportApplyResult, AppError> {
    let path = Path::new(&request.path);
    let (fingerprint, mut items) = read_source_file(path)?;
    if request.fingerprint.len() != 64 || fingerprint != request.fingerprint {
        return Err(AppError::new(
            "mobaxterm_import_file_changed",
            "MobaXterm 会话文件在预览后发生了变化，请重新预览。",
            "MobaXterm import fingerprint mismatch",
            true,
        ));
    }

    let existing = repository.connection_list()?;
    enrich_items_for_repository(
        &mut items,
        &existing,
        request.default_username.as_deref(),
    );
    let selection_count = request.selections.len();
    let selections: BTreeMap<usize, String> = request
        .selections
        .into_iter()
        .map(|selection| (selection.source_index, selection.name.trim().to_string()))
        .collect();
    if selections.len() != selection_count {
        return Err(mobaxterm_import_invalid_selection(
            "duplicate source indexes in selection",
        ));
    }
    if selections.values().any(|name| name.is_empty()) {
        return Err(mobaxterm_import_invalid_selection(
            "selected connection name is empty",
        ));
    }
    if selections.len() == 0 {
        return Err(mobaxterm_import_invalid_selection(
            "no MobaXterm sessions selected",
        ));
    }

    repository.create_sync_backup()?;
    repository
        .sqlite_connection()
        .execute_batch("BEGIN IMMEDIATE;")
        .map_err(mobaxterm_import_apply_failed)?;

    let apply_result = (|| -> Result<MobaXtermImportApplyResult, AppError> {
        let mut result = MobaXtermImportApplyResult::default();
        let mut used_names: BTreeSet<String> =
            existing.iter().map(|item| item.name.clone()).collect();

        for (source_index, selected_name) in &selections {
            let Some(item) = items.get(*source_index) else {
                return Err(mobaxterm_import_invalid_selection(format!(
                    "source index {source_index} is out of range"
                )));
            };
            if item.source_index != *source_index || item.kind != MobaXtermSessionKind::Ssh {
                return Err(mobaxterm_import_invalid_selection(format!(
                    "source index {source_index} is not an SSH session"
                )));
            }
            if item.conflict == MobaXtermImportConflict::ExactDuplicate {
                result.skipped_exact_duplicates += 1;
                continue;
            }
            if !item.selectable {
                return Err(mobaxterm_import_invalid_selection(format!(
                    "source index {source_index} is not ready for import"
                )));
            }

            let username = item
                .effective_username
                .clone()
                .ok_or_else(|| mobaxterm_import_invalid_selection("SSH username is missing"))?;
            let host = item
                .host
                .clone()
                .ok_or_else(|| mobaxterm_import_invalid_selection("SSH host is missing"))?;
            let port = item
                .port
                .ok_or_else(|| mobaxterm_import_invalid_selection("SSH port is invalid"))?;

            if item.conflict == MobaXtermImportConflict::NameConflict
                && selected_name == &item.name
            {
                return Err(mobaxterm_import_name_conflict(selected_name));
            }
            if used_names.contains(selected_name) && selected_name != &item.name {
                return Err(mobaxterm_import_name_conflict(selected_name));
            }
            if existing
                .iter()
                .any(|candidate| candidate.name == *selected_name)
            {
                return Err(mobaxterm_import_name_conflict(selected_name));
            }
            used_names.insert(selected_name.clone());

            let (credential_mode, inline_auth_kind, inline_private_key_path, prompt_auth_kind) =
                if let Some(private_key_path) = item.private_key_path.clone() {
                    (
                        ConnectionCredentialMode::Inline,
                        Some(ConnectionAuthKind::PrivateKey),
                        Some(private_key_path),
                        None,
                    )
                } else {
                    (
                        ConnectionCredentialMode::Prompt,
                        None,
                        None,
                        Some(ConnectionAuthKind::Password),
                    )
                };

            repository.connection_upsert(
                ConnectionProfileInput {
                    id: None,
                    source_connection_id: None,
                    protocol: ConnectionProtocol::Ssh,
                    name: Some(selected_name.clone()),
                    group: item.folder_path.clone(),
                    host,
                    port,
                    username,
                    credential_mode,
                    credential_id: None,
                    inline_auth_kind,
                    inline_password: None,
                    inline_password_touched: false,
                    inline_private_key_path,
                    inline_private_key_passphrase: None,
                    inline_private_key_passphrase_touched: false,
                    prompt_auth_kind,
                    proxy: ConnectionProxyConfig::default(),
                    jump: ConnectionJumpConfig::default(),
                    advanced: ConnectionAdvancedConfig::default(),
                    rdp: None,
                    vnc: None,
                    telnet: None,
                    serial: None,
                    notes: Some("Imported from MobaXterm".to_string()),
                    is_favorite: Some(false),
                    last_connected_at: None,
                    remote_os_id: None,
                    remote_os_name: None,
                    remote_os_version: None,
                    auth_kind: None,
                    password: None,
                    private_key_path: None,
                    private_key_passphrase: None,
                },
                &now_timestamp()?,
            )?;
            result.created += 1;
        }

        Ok(result)
    })();

    match apply_result {
        Ok(result) => {
            repository
                .sqlite_connection()
                .execute_batch("COMMIT;")
                .map_err(mobaxterm_import_apply_failed)?;
            Ok(result)
        }
        Err(error) => {
            let _ = repository.sqlite_connection().execute_batch("ROLLBACK;");
            Err(error)
        }
    }
}

fn now_timestamp() -> Result<String, AppError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::new("connection_clock_invalid", "系统时间异常。", error, false))?;
    Ok(duration.as_secs().to_string())
}

fn mobaxterm_import_invalid_selection(raw: impl ToString) -> AppError {
    AppError::new(
        "mobaxterm_import_invalid_selection",
        "MobaXterm 导入选择无效，请重新预览。",
        raw,
        true,
    )
}

fn mobaxterm_import_name_conflict(name: &str) -> AppError {
    AppError::new(
        "mobaxterm_import_name_conflict",
        "导入项名称与现有连接冲突，请使用预览中的建议名称。",
        format!("MobaXterm import name conflict: {name}"),
        true,
    )
}

fn mobaxterm_import_apply_failed(raw: impl ToString) -> AppError {
    AppError::new(
        "mobaxterm_import_apply_failed",
        "MobaXterm 会话导入失败，本地连接未修改。",
        raw,
        true,
    )
}

fn session_kind(type_code: &str, icon_code: &str) -> MobaXtermSessionKind {
    match type_code {
        "0" => MobaXtermSessionKind::Ssh,
        "1" => MobaXtermSessionKind::Telnet,
        "4" => MobaXtermSessionKind::Rdp,
        "5" => MobaXtermSessionKind::Vnc,
        "7" => MobaXtermSessionKind::Sftp,
        "8" => MobaXtermSessionKind::Serial,
        "14" => MobaXtermSessionKind::Wsl,
        _ => match icon_code {
            "109" => MobaXtermSessionKind::Ssh,
            "98" => MobaXtermSessionKind::Telnet,
            "91" => MobaXtermSessionKind::Rdp,
            "128" => MobaXtermSessionKind::Vnc,
            "140" => MobaXtermSessionKind::Sftp,
            "131" => MobaXtermSessionKind::Serial,
            "151" => MobaXtermSessionKind::Wsl,
            _ => MobaXtermSessionKind::Other,
        },
    }
}

fn field<'a>(fields: &'a [&'a str], index: usize) -> Option<&'a str> {
    fields.get(index).copied()
}

fn non_empty(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()).then_some(value)
}

fn validate_import_path(path: &Path) -> Result<(), AppError> {
    if path.as_os_str().is_empty() || path.to_string_lossy().trim().is_empty() {
        return Err(AppError::new(
            "mobaxterm_import_path_required",
            "请选择 MobaXterm 会话导出文件。",
            "MobaXterm import path is empty",
            true,
        ));
    }
    Ok(())
}

fn mobaxterm_import_file_read_failed(raw: impl ToString) -> AppError {
    AppError::new(
        "mobaxterm_import_file_read_failed",
        "MobaXterm 会话文件读取失败。",
        raw,
        true,
    )
}

fn mobaxterm_import_file_too_large(size: u64) -> AppError {
    AppError::new(
        "mobaxterm_import_file_too_large",
        "MobaXterm 会话文件过大。",
        format!("MobaXterm import file has {size} bytes"),
        true,
    )
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::Arc;

    use crate::storage_repository::StorageRepository;
    use crate::storage_vault::InMemorySecretStore;

    use super::{
        import_from_file, parse_bytes, preview_file, preview_for_repository,
        MobaXtermImportApplyRequest, MobaXtermImportConflict, MobaXtermImportSelection,
        MobaXtermImportStatus, MobaXtermSessionKind,
    };

    const SSH_WITH_KEY: &str = "Prod=#109#0%host.example.com%2222%deploy%%-1%-1%%%%%0%0%0%C:\\Keys\\prod.ppk%%-1%0%0%0%%1080%%0%0%1#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1%-1#0# #-1";
    const SSH_MISSING_USER: &str = "Legacy=#109#0%legacy.example.com%22%%%-1%-1%%%%%0%-1%0%%%-1%0%0%0%%1080%%0%0%1#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1%-1#0# #-1";
    const WSL: &str = "WSL-Default=#151#14%Default%%Interactive shell%%%0#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1%-1%#0# #-1";

    #[test]
    fn parses_ssh_fields_without_requiring_full_record_length() {
        let text =
            format!("[Bookmarks]\r\nSubRep=Production\\Web\r\nImgNum=41\r\n{SSH_WITH_KEY}\r\n");
        let items = parse_bytes(text.as_bytes()).unwrap();

        assert_eq!(items.len(), 1);
        let item = &items[0];
        assert_eq!(item.kind, MobaXtermSessionKind::Ssh);
        assert_eq!(item.status, MobaXtermImportStatus::Ready);
        assert_eq!(item.folder_path.as_deref(), Some("Production\\Web"));
        assert_eq!(item.host.as_deref(), Some("host.example.com"));
        assert_eq!(item.port, Some(2222));
        assert_eq!(item.username.as_deref(), Some("deploy"));
        assert_eq!(
            item.private_key_path.as_deref(),
            Some("C:\\Keys\\prod.ppk")
        );
    }

    #[test]
    fn missing_ssh_username_is_reported_as_user_input_not_parse_failure() {
        let text = format!("[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\n{SSH_MISSING_USER}\r\n");
        let items = parse_bytes(text.as_bytes()).unwrap();

        assert_eq!(items[0].status, MobaXtermImportStatus::NeedsInput);
        assert_eq!(items[0].missing_fields, vec!["username"]);
    }

    #[test]
    fn wsl_is_recognized_but_not_misclassified_as_ssh() {
        let text = format!("[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\n{WSL}\r\n");
        let items = parse_bytes(text.as_bytes()).unwrap();

        assert_eq!(items[0].kind, MobaXtermSessionKind::Wsl);
        assert_eq!(items[0].status, MobaXtermImportStatus::Unsupported);
    }

    #[test]
    fn cp1252_session_names_are_decoded() {
        let mut bytes = b"[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\nCaf".to_vec();
        bytes.push(0xe9);
        let suffix = SSH_WITH_KEY.split_once('=').unwrap().1;
        bytes.extend_from_slice(format!("={suffix}\r\n").as_bytes());
        let items = parse_bytes(&bytes).unwrap();

        assert_eq!(items[0].name, "Café");
    }

    #[test]
    fn import_creates_ssh_and_second_preview_marks_exact_duplicate() {
        let mut repository = temp_repository("apply");
        let path = write_sessions(
            "apply",
            &format!("[Bookmarks]\r\nSubRep=Production\\Web\r\nImgNum=42\r\n{SSH_WITH_KEY}\r\n"),
        );
        let preview = preview_for_repository(&repository, &path, None).unwrap();
        let result = import_from_file(
            &mut repository,
            MobaXtermImportApplyRequest {
                path: path.to_string_lossy().to_string(),
                fingerprint: preview.fingerprint,
                default_username: None,
                selections: vec![MobaXtermImportSelection {
                    source_index: 0,
                    name: "Prod".to_string(),
                }],
            },
        )
        .unwrap();

        assert_eq!(result.created, 1);
        let connections = repository.connection_list().unwrap();
        assert_eq!(connections.len(), 1);
        assert_eq!(connections[0].name, "Prod");
        assert_eq!(connections[0].host, "host.example.com");
        assert_eq!(connections[0].port, 2222);
        assert_eq!(connections[0].username, "deploy");
        assert_eq!(
            connections[0].inline_private_key_path.as_deref(),
            Some("C:\\Keys\\prod.ppk")
        );

        let second = preview_for_repository(&repository, &path, None).unwrap();
        assert_eq!(
            second.items[0].conflict,
            MobaXtermImportConflict::ExactDuplicate
        );
        assert!(!second.items[0].selectable);
        assert_eq!(second.summary.exact_duplicates, 1);
    }

    #[test]
    fn preview_suggests_rename_for_same_name_with_different_target() {
        let mut repository = temp_repository("name-conflict");
        let first_path = write_sessions(
            "name-conflict-first",
            &format!("[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\n{SSH_WITH_KEY}\r\n"),
        );
        let first = preview_for_repository(&repository, &first_path, None).unwrap();
        import_from_file(
            &mut repository,
            MobaXtermImportApplyRequest {
                path: first_path.to_string_lossy().to_string(),
                fingerprint: first.fingerprint,
                default_username: None,
                selections: vec![MobaXtermImportSelection {
                    source_index: 0,
                    name: "Prod".to_string(),
                }],
            },
        )
        .unwrap();

        let second_record = SSH_WITH_KEY.replace("host.example.com", "other.example.com");
        let second_path = write_sessions(
            "name-conflict-second",
            &format!("[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\n{second_record}\r\n"),
        );
        let preview = preview_for_repository(&repository, &second_path, None).unwrap();
        assert_eq!(preview.items[0].conflict, MobaXtermImportConflict::NameConflict);
        assert_eq!(
            preview.items[0].suggested_name.as_deref(),
            Some("Prod (MobaXterm)")
        );
    }

    #[test]
    fn import_rejects_file_changed_after_preview() {
        let mut repository = temp_repository("fingerprint");
        let path = write_sessions(
            "fingerprint",
            &format!("[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\n{SSH_WITH_KEY}\r\n"),
        );
        let preview = preview_for_repository(&repository, &path, None).unwrap();
        fs::write(
            &path,
            format!("[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\n{SSH_MISSING_USER}\r\n"),
        )
        .unwrap();

        let error = import_from_file(
            &mut repository,
            MobaXtermImportApplyRequest {
                path: path.to_string_lossy().to_string(),
                fingerprint: preview.fingerprint,
                default_username: Some("deploy".to_string()),
                selections: vec![MobaXtermImportSelection {
                    source_index: 0,
                    name: "Prod".to_string(),
                }],
            },
        )
        .unwrap_err();
        assert_eq!(error.code, "mobaxterm_import_file_changed");
        assert!(repository.connection_list().unwrap().is_empty());
    }

    #[test]
    fn preview_file_returns_summary_and_stable_fingerprint() {
        let root = std::env::temp_dir().join(format!(
            "nexaterm-mobaxterm-preview-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("sessions.mxtsessions");
        let text = format!(
            "[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\n{SSH_WITH_KEY}\r\n{SSH_MISSING_USER}\r\n{WSL}\r\n"
        );
        fs::write(&path, text).unwrap();

        let first = preview_file(&path).unwrap();
        let second = preview_file(&path).unwrap();

        assert_eq!(first.fingerprint, second.fingerprint);
        assert_eq!(first.fingerprint.len(), 64);
        assert_eq!(first.summary.total, 3);
        assert_eq!(first.summary.ready, 1);
        assert_eq!(first.summary.needs_input, 1);
        assert_eq!(first.summary.unsupported, 1);
        assert_eq!(first.summary.invalid, 0);
    }
    fn temp_repository(name: &str) -> StorageRepository {
        let root = std::env::temp_dir().join(format!(
            "nexaterm-mobaxterm-import-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        StorageRepository::open(root.join("nexaterm.db"), Arc::new(InMemorySecretStore::default()))
            .unwrap()
    }

    fn write_sessions(name: &str, content: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "nexaterm-mobaxterm-source-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("sessions.mxtsessions");
        fs::write(&path, content).unwrap();
        path
    }

}

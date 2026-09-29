use std::borrow::Cow;
use std::fs;
use std::path::Path;

use encoding_rs::WINDOWS_1252;
use serde::Serialize;

use crate::app_error::AppError;
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MobaXtermImportItem {
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
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct MobaXtermImportSummary {
    pub total: usize,
    pub ready: usize,
    pub needs_input: usize,
    pub unsupported: usize,
    pub invalid: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MobaXtermImportPreviewResult {
    pub fingerprint: String,
    pub summary: MobaXtermImportSummary,
    pub items: Vec<MobaXtermImportItem>,
}

pub fn preview_file(path: &Path) -> Result<MobaXtermImportPreviewResult, AppError> {
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

    let fingerprint = sha256_hex(&bytes);
    let items = parse_bytes(&bytes)?;
    let summary = summarize(&items);
    Ok(MobaXtermImportPreviewResult {
        fingerprint,
        summary,
        items,
    })
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

        items.push(parse_session(name, folder_path.as_deref(), value));
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

fn parse_session(name: &str, folder_path: Option<&str>, value: &str) -> MobaXtermImportItem {
    let characteristics: Vec<&str> = value.split('#').collect();
    if characteristics.len() < 3 || !characteristics[0].trim().is_empty() {
        return invalid_item(
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
        MobaXtermSessionKind::Ssh => parse_ssh_session(name, folder_path, source_type_code, &primary),
        _ => parse_unsupported_session(name, folder_path, source_type_code, kind, &primary),
    }
}

fn parse_ssh_session(
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
    }
}

fn parse_unsupported_session(
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
    }
}

fn invalid_item(
    name: &str,
    folder_path: Option<&str>,
    source_type_code: &str,
    warnings: Vec<String>,
) -> MobaXtermImportItem {
    MobaXtermImportItem {
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
    }
    summary
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

    use super::{parse_bytes, preview_file, MobaXtermImportStatus, MobaXtermSessionKind};

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
}

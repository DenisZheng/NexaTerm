use super::*;

pub(super) fn row_to_connection_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConnectionProfile> {
    let protocol: String = row.get(2)?;
    let credential_mode: String = row.get(7)?;
    let inline_auth_kind: Option<String> = row.get(9)?;
    let prompt_auth_kind: Option<String> = row.get(11)?;
    let proxy_json: String = row.get(12)?;
    let jump_json: String = row.get(13)?;
    let advanced_json: String = row.get(14)?;
    let rdp_json: Option<String> = row.get(15)?;
    let vnc_json: Option<String> = row.get(16)?;
    let telnet_json: Option<String> = row.get(17)?;
    let serial_json: Option<String> = row.get(18)?;
    Ok(ConnectionProfile {
        id: row.get(0)?,
        name: row.get(1)?,
        protocol: serde_json::from_value(serde_json::Value::String(protocol))
            .map_err(from_serde_row_error)?,
        group: row.get(3)?,
        group_id: row.get(27)?,
        host: row.get(4)?,
        port: row.get(5)?,
        username: row.get(6)?,
        credential_mode: serde_json::from_value(serde_json::Value::String(credential_mode))
            .map_err(from_serde_row_error)?,
        credential_id: row.get(8)?,
        inline_auth_kind: optional_enum_from_string(inline_auth_kind)?,
        inline_password: None,
        inline_private_key_path: row.get(10)?,
        inline_private_key_passphrase: None,
        prompt_auth_kind: optional_enum_from_string(prompt_auth_kind)?,
        proxy: serde_json::from_str(&proxy_json).map_err(from_serde_row_error)?,
        jump: serde_json::from_str(&jump_json).map_err(from_serde_row_error)?,
        advanced: serde_json::from_str(&advanced_json).map_err(from_serde_row_error)?,
        rdp: parse_optional_json(rdp_json)?,
        vnc: parse_optional_json(vnc_json)?,
        rlogin: parse_optional_json(row.get(28)?)?,
        telnet: parse_optional_json(telnet_json)?,
        serial: parse_optional_json(serial_json)?,
        notes: row.get(19)?,
        is_favorite: row.get::<_, i64>(20)? != 0,
        last_connected_at: row.get(21)?,
        remote_os_id: row.get(22)?,
        remote_os_name: row.get(23)?,
        remote_os_version: row.get(24)?,
        created_at: row.get(25)?,
        updated_at: row.get(26)?,
        auth_kind: None,
        password: None,
        private_key_path: None,
        private_key_passphrase: None,
    })
}

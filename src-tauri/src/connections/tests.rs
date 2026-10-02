use std::fs;
use std::path::PathBuf;

use super::{
    parse_remote_system_probe, validate_profile_input, ConnectionAdvancedConfig,
    ConnectionAuthKind, ConnectionCredentialMode, ConnectionJumpConfig, ConnectionJumpKind,
    ConnectionProfileInput, ConnectionProtocol, ConnectionProxyConfig, ConnectionProxyKind,
    ConnectionRemoteSystemInfo, ConnectionStore, RdpConnectionConfig, RdpGatewayConfig,
    RdpGatewayMode, SerialConnectionConfig, TelnetConnectionConfig, VncConnectionConfig,
};
use crate::terminal::serial::{SerialBackspaceMode, SerialDataBits};
use crate::terminal::telnet::{TelnetBackspaceMode, TelnetEnterMode};

fn password_input() -> ConnectionProfileInput {
    ConnectionProfileInput {
        id: None,
        source_connection_id: None,
        protocol: ConnectionProtocol::Ssh,
        name: None,
        group: Some(" 生产 ".to_string()),
        group_id: None,
        host: "  example.com  ".to_string(),
        port: 22,
        username: "  root  ".to_string(),
        credential_mode: ConnectionCredentialMode::Inline,
        credential_id: None,
        inline_auth_kind: Some(ConnectionAuthKind::Password),
        inline_password: Some("secret".to_string()),
        inline_password_touched: true,
        inline_private_key_path: None,
        inline_private_key_passphrase: None,
        inline_private_key_passphrase_touched: false,
        prompt_auth_kind: None,
        proxy: ConnectionProxyConfig::default(),
        jump: ConnectionJumpConfig::default(),
        advanced: ConnectionAdvancedConfig::default(),
        rdp: None,
        vnc: None,
        telnet: None,
        serial: None,
        notes: None,
        is_favorite: None,
        last_connected_at: None,
        remote_os_id: None,
        remote_os_name: None,
        remote_os_version: None,
        auth_kind: None,
        password: None,
        private_key_path: None,
        private_key_passphrase: None,
    }
}

fn rdp_input() -> ConnectionProfileInput {
    ConnectionProfileInput {
        protocol: ConnectionProtocol::Rdp,
        port: 3389,
        username: " administrator ".to_string(),
        inline_password: Some("ssh-secret-ignored".to_string()),
        inline_password_touched: true,
        rdp: Some(RdpConnectionConfig {
            domain: Some(" CORP ".to_string()),
            gateway: Some(RdpGatewayConfig {
                mode: RdpGatewayMode::Explicit,
                host: Some(" gw.example.com ".to_string()),
                ..RdpGatewayConfig::default()
            }),
            ..RdpConnectionConfig::default()
        }),
        ..password_input()
    }
}

fn vnc_input() -> ConnectionProfileInput {
    ConnectionProfileInput {
        protocol: ConnectionProtocol::Vnc,
        port: 5900,
        username: " user ".to_string(),
        vnc: Some(VncConnectionConfig::default()),
        ..password_input()
    }
}

#[test]
fn validation_trims_fields_and_defaults_name() {
    let validated = validate_profile_input(&password_input()).unwrap();

    assert_eq!(validated.name, "root@example.com");
    assert_eq!(validated.group, Some("生产".to_string()));
    assert_eq!(validated.host, "example.com");
    assert_eq!(validated.username, "root");
    assert_eq!(validated.port, 22);
}

#[test]
fn validation_rejects_blank_host() {
    let input = ConnectionProfileInput {
        host: "  ".to_string(),
        ..password_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "connection_host_missing");
}

#[test]
fn validation_rejects_missing_inline_password() {
    let input = ConnectionProfileInput {
        inline_password: Some(" ".to_string()),
        ..password_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "connection_password_missing");
}

#[test]
fn validation_rejects_missing_saved_credential() {
    let input = ConnectionProfileInput {
        credential_mode: ConnectionCredentialMode::Saved,
        credential_id: Some(" ".to_string()),
        ..password_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "connection_credential_missing");
}

#[test]
fn validation_prompt_mode_does_not_require_secret() {
    let input = ConnectionProfileInput {
        credential_mode: ConnectionCredentialMode::Prompt,
        inline_password: None,
        prompt_auth_kind: Some(ConnectionAuthKind::PrivateKey),
        ..password_input()
    };

    let validated = validate_profile_input(&input).unwrap();

    assert_eq!(validated.credential_mode, ConnectionCredentialMode::Prompt);
    assert_eq!(
        validated.prompt_auth_kind,
        Some(ConnectionAuthKind::PrivateKey)
    );
    assert_eq!(validated.inline_password, None);
}

#[test]
fn validation_rejects_invalid_proxy() {
    let input = ConnectionProfileInput {
        proxy: ConnectionProxyConfig {
            kind: ConnectionProxyKind::Socks5,
            host: Some(" ".to_string()),
            port: Some(1080),
            username: None,
            password: None,
        },
        ..password_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "connection_proxy_host_missing");
}

#[test]
fn validation_accepts_proxy_and_advanced() {
    let input = ConnectionProfileInput {
        proxy: ConnectionProxyConfig {
            kind: ConnectionProxyKind::HttpConnect,
            host: Some("  proxy.local ".to_string()),
            port: Some(8080),
            username: Some(" user ".to_string()),
            password: Some(" pass ".to_string()),
        },
        advanced: ConnectionAdvancedConfig {
            connect_timeout_ms: 10_000,
            auth_timeout_ms: 20_000,
            keepalive_interval_ms: 30_000,
            terminal_encoding: "gbk".to_string(),
        },
        ..password_input()
    };

    let validated = validate_profile_input(&input).unwrap();

    assert_eq!(validated.proxy.host, Some("proxy.local".to_string()));
    assert_eq!(validated.proxy.username, Some("user".to_string()));
    assert_eq!(validated.advanced.auth_timeout_ms, 20_000);
    assert_eq!(validated.advanced.terminal_encoding, "gbk");
}

#[test]
fn validation_rejects_invalid_terminal_encoding() {
    let input = ConnectionProfileInput {
        advanced: ConnectionAdvancedConfig {
            terminal_encoding: "utf-16".to_string(),
            ..ConnectionAdvancedConfig::default()
        },
        ..password_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "connection_terminal_encoding_invalid");
}

#[test]
fn validation_rejects_missing_jump_connection() {
    let input = ConnectionProfileInput {
        jump: ConnectionJumpConfig {
            kind: ConnectionJumpKind::SshJump,
            jump_connection_id: Some(" ".to_string()),
        },
        ..password_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "connection_jump_missing");
}

#[test]
fn validation_accepts_ssh_jump_connection() {
    let input = ConnectionProfileInput {
        jump: ConnectionJumpConfig {
            kind: ConnectionJumpKind::SshJump,
            jump_connection_id: Some("  conn-bastion-001 ".to_string()),
        },
        ..password_input()
    };

    let validated = validate_profile_input(&input).unwrap();

    assert_eq!(validated.jump.kind, ConnectionJumpKind::SshJump);
    assert_eq!(
        validated.jump.jump_connection_id,
        Some("conn-bastion-001".to_string())
    );
}

#[test]
fn validation_accepts_rdp_and_clears_ssh_only_fields() {
    let validated = validate_profile_input(&rdp_input()).unwrap();

    assert_eq!(validated.protocol, ConnectionProtocol::Rdp);
    assert_eq!(validated.port, 3389);
    assert_eq!(validated.username, "administrator");
    assert_eq!(validated.credential_mode, ConnectionCredentialMode::Inline);
    assert_eq!(
        validated.inline_auth_kind,
        Some(ConnectionAuthKind::Password)
    );
    assert_eq!(
        validated.inline_password,
        Some("ssh-secret-ignored".to_string())
    );
    assert_eq!(validated.proxy, ConnectionProxyConfig::default());
    assert_eq!(validated.jump, ConnectionJumpConfig::default());
    assert_eq!(
        validated.rdp.as_ref().and_then(|rdp| rdp.domain.as_deref()),
        Some("CORP")
    );
    assert_eq!(
        validated
            .rdp
            .as_ref()
            .and_then(|rdp| rdp.gateway.as_ref())
            .and_then(|gateway| gateway.host.as_deref()),
        Some("gw.example.com")
    );
}

#[test]
fn validation_accepts_vnc_and_clears_ssh_only_fields() {
    let validated = validate_profile_input(&vnc_input()).unwrap();

    assert_eq!(validated.protocol, ConnectionProtocol::Vnc);
    assert_eq!(validated.port, 5900);
    assert_eq!(validated.username, "user");
    assert_eq!(validated.credential_mode, ConnectionCredentialMode::Inline);
    assert_eq!(
        validated.inline_auth_kind,
        Some(ConnectionAuthKind::Password)
    );
    assert_eq!(validated.proxy, ConnectionProxyConfig::default());
    assert_eq!(validated.jump, ConnectionJumpConfig::default());
    assert!(validated.rdp.is_none());
    assert!(validated.vnc.is_some());
}

#[test]
fn validation_accepts_telnet_and_clears_ssh_only_fields() {
    let input = ConnectionProfileInput {
        protocol: ConnectionProtocol::Telnet,
        host: " 192.0.2.30 ".to_string(),
        port: 23,
        username: "ignored".to_string(),
        telnet: Some(TelnetConnectionConfig {
            enter_mode: TelnetEnterMode::Cr,
            backspace_mode: TelnetBackspaceMode::CtrlH,
        }),
        ..password_input()
    };

    let validated = validate_profile_input(&input).unwrap();

    assert_eq!(validated.protocol, ConnectionProtocol::Telnet);
    assert_eq!(validated.name, "Telnet 192.0.2.30:23");
    assert_eq!(validated.username, "");
    assert_eq!(validated.credential_mode, ConnectionCredentialMode::Prompt);
    assert!(validated.inline_auth_kind.is_none());
    assert!(validated.inline_password.is_none());
    assert_eq!(validated.proxy, ConnectionProxyConfig::default());
    assert_eq!(validated.jump, ConnectionJumpConfig::default());
    assert_eq!(
        validated.telnet.as_ref().map(|item| item.enter_mode),
        Some(TelnetEnterMode::Cr)
    );
}

#[test]
fn validation_accepts_serial_and_uses_port_name_as_host() {
    let input = ConnectionProfileInput {
        protocol: ConnectionProtocol::Serial,
        host: "COM3".to_string(),
        port: 1,
        username: "ignored".to_string(),
        serial: Some(SerialConnectionConfig {
            port_name: " COM4 ".to_string(),
            baud_rate: 115_200,
            data_bits: SerialDataBits::Seven,
            backspace_mode: SerialBackspaceMode::CtrlH,
            ..SerialConnectionConfig::default()
        }),
        ..password_input()
    };

    let validated = validate_profile_input(&input).unwrap();

    assert_eq!(validated.protocol, ConnectionProtocol::Serial);
    assert_eq!(validated.name, "串口 COM4");
    assert_eq!(validated.host, "COM4");
    assert_eq!(validated.port, 1);
    assert_eq!(validated.username, "");
    assert_eq!(validated.credential_mode, ConnectionCredentialMode::Prompt);
    assert!(validated.inline_auth_kind.is_none());
    assert_eq!(validated.proxy, ConnectionProxyConfig::default());
    assert_eq!(
        validated.serial.as_ref().map(|item| item.baud_rate),
        Some(115_200)
    );
}

#[test]
fn validation_rejects_vnc_private_key_credentials() {
    let input = ConnectionProfileInput {
        inline_auth_kind: Some(ConnectionAuthKind::PrivateKey),
        inline_password: None,
        inline_private_key_path: Some("~/.ssh/id_ed25519".to_string()),
        ..vnc_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "vnc_credential_kind_unsupported");
}

#[test]
fn validation_rejects_vnc_runner_secret_args() {
    let input = ConnectionProfileInput {
        vnc: Some(VncConnectionConfig {
            raw_runner_args: Some("--password abc".to_string()),
            ..VncConnectionConfig::default()
        }),
        ..vnc_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "vnc_runner_args_secret_forbidden");
}

#[test]
fn validation_rejects_rdp_private_key_credentials() {
    let input = ConnectionProfileInput {
        inline_auth_kind: Some(ConnectionAuthKind::PrivateKey),
        inline_password: None,
        inline_private_key_path: Some("~/.ssh/id_ed25519".to_string()),
        ..rdp_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "rdp_credential_kind_unsupported");
}

#[test]
fn validation_rejects_raw_rdp_password_setting() {
    let input = ConnectionProfileInput {
        rdp: Some(RdpConnectionConfig {
            raw_rdp_settings: Some("password 51:b:abc".to_string()),
            ..RdpConnectionConfig::default()
        }),
        ..rdp_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "rdp_raw_settings_secret_forbidden");
}

#[test]
fn validation_rejects_rdp_line_injection_fields() {
    let input = ConnectionProfileInput {
        username: "administrator\r\npassword 51:b:abc".to_string(),
        ..rdp_input()
    };

    let error = validate_profile_input(&input).unwrap_err();

    assert_eq!(error.code, "rdp_field_invalid");
}

#[test]
fn store_upsert_persists_and_loads_profiles() {
    let path = temp_store_path("roundtrip");
    let _ = fs::remove_file(&path);
    let mut store = ConnectionStore::load(path.clone()).unwrap();

    let saved = store
        .upsert(password_input(), "2026-06-05T09:30:00+08:00")
        .unwrap();

    let reloaded = ConnectionStore::load(path.clone()).unwrap();
    let profiles = reloaded.list();

    assert_eq!(profiles.len(), 1);
    assert_eq!(profiles[0].id, saved.id);
    assert_eq!(profiles[0].name, "root@example.com");
    assert_eq!(profiles[0].created_at, "2026-06-05T09:30:00+08:00");
    assert_eq!(profiles[0].auth_kind, None);

    let _ = fs::remove_file(path);
}

#[test]
fn store_delete_removes_profile_and_persists() {
    let path = temp_store_path("delete");
    let _ = fs::remove_file(&path);
    let mut store = ConnectionStore::load(path.clone()).unwrap();
    let saved = store
        .upsert(password_input(), "2026-06-05T09:30:00+08:00")
        .unwrap();

    store.delete(&saved.id).unwrap();

    let reloaded = ConnectionStore::load(path.clone()).unwrap();
    assert!(reloaded.list().is_empty());

    let _ = fs::remove_file(path);
}

#[test]
fn store_update_preserves_created_at_and_refreshes_updated_at() {
    let path = temp_store_path("update");
    let _ = fs::remove_file(&path);
    let mut store = ConnectionStore::load(path.clone()).unwrap();
    let saved = store
        .upsert(password_input(), "2026-06-05T09:30:00+08:00")
        .unwrap();

    let updated = store
        .upsert(
            ConnectionProfileInput {
                id: Some(saved.id.clone()),
                name: Some("prod".to_string()),
                ..password_input()
            },
            "2026-06-05T09:45:00+08:00",
        )
        .unwrap();

    assert_eq!(updated.id, saved.id);
    assert_eq!(updated.name, "prod");
    assert_eq!(updated.created_at, "2026-06-05T09:30:00+08:00");
    assert_eq!(updated.updated_at, "2026-06-05T09:45:00+08:00");
    assert_eq!(store.list().len(), 1);

    let _ = fs::remove_file(path);
}

#[test]
fn store_tracks_favorite_and_last_connected_at() {
    let path = temp_store_path("activity");
    let _ = fs::remove_file(&path);
    let mut store = ConnectionStore::load(path.clone()).unwrap();
    let saved = store
        .upsert(password_input(), "2026-06-05T09:30:00+08:00")
        .unwrap();

    let favorited = store
        .set_favorite(&saved.id, true, "2026-06-05T09:35:00+08:00")
        .unwrap();
    assert!(favorited.is_favorite);
    assert_eq!(favorited.last_connected_at, None);

    let connected = store
        .mark_connected(&saved.id, "2026-06-05T09:40:00+08:00")
        .unwrap();
    assert!(connected.is_favorite);
    assert_eq!(
        connected.last_connected_at,
        Some("2026-06-05T09:40:00+08:00".to_string())
    );

    let reloaded = ConnectionStore::load(path.clone()).unwrap();
    let profile = reloaded.get(&saved.id).unwrap();
    assert!(profile.is_favorite);
    assert_eq!(
        profile.last_connected_at,
        Some("2026-06-05T09:40:00+08:00".to_string())
    );

    let _ = fs::remove_file(path);
}

#[test]
fn parse_remote_system_probe_reads_ubuntu_os_release() {
    let info = parse_remote_system_probe(
        br#"NAME="Ubuntu"
ID=ubuntu
VERSION_ID="22.04"
"#,
    );

    assert_eq!(info.os_id, Some("ubuntu".to_string()));
    assert_eq!(info.os_name, Some("Ubuntu".to_string()));
    assert_eq!(info.os_version, Some("22.04".to_string()));
}

#[test]
fn parse_remote_system_probe_reads_centos7_os_release() {
    let info = parse_remote_system_probe(
        br#"NAME="CentOS Linux"
VERSION_ID="7"
ID="centos"
"#,
    );

    assert_eq!(info.os_id, Some("centos".to_string()));
    assert_eq!(info.os_name, Some("CentOS Linux".to_string()));
    assert_eq!(info.os_version, Some("7".to_string()));
}

#[test]
fn store_updates_remote_system_and_persists() {
    let path = temp_store_path("remote-system");
    let _ = fs::remove_file(&path);
    let mut store = ConnectionStore::load(path.clone()).unwrap();
    let saved = store
        .upsert(password_input(), "2026-06-05T09:30:00+08:00")
        .unwrap();

    let updated = store
        .update_remote_system(
            &saved.id,
            ConnectionRemoteSystemInfo {
                os_id: Some("ubuntu".to_string()),
                os_name: Some("Ubuntu".to_string()),
                os_version: Some("22.04".to_string()),
            },
            "2026-06-05T09:45:00+08:00",
        )
        .unwrap();

    assert_eq!(updated.remote_os_id, Some("ubuntu".to_string()));
    assert_eq!(updated.remote_os_name, Some("Ubuntu".to_string()));
    assert_eq!(updated.remote_os_version, Some("22.04".to_string()));

    let reloaded = ConnectionStore::load(path.clone()).unwrap();
    let profile = reloaded.get(&saved.id).unwrap();
    assert_eq!(profile.remote_os_id, Some("ubuntu".to_string()));

    let _ = fs::remove_file(path);
}

#[test]
fn store_upsert_preserves_remote_system_for_same_target() {
    let path = temp_store_path("remote-system-preserve");
    let _ = fs::remove_file(&path);
    let mut store = ConnectionStore::load(path.clone()).unwrap();
    let saved = store
        .upsert(password_input(), "2026-06-05T09:30:00+08:00")
        .unwrap();
    store
        .update_remote_system(
            &saved.id,
            ConnectionRemoteSystemInfo {
                os_id: Some("centos".to_string()),
                os_name: Some("CentOS Linux".to_string()),
                os_version: Some("7".to_string()),
            },
            "2026-06-05T09:35:00+08:00",
        )
        .unwrap();

    let updated = store
        .upsert(
            ConnectionProfileInput {
                id: Some(saved.id.clone()),
                name: Some("renamed".to_string()),
                ..password_input()
            },
            "2026-06-05T09:40:00+08:00",
        )
        .unwrap();

    assert_eq!(updated.remote_os_id, Some("centos".to_string()));
    assert_eq!(updated.remote_os_version, Some("7".to_string()));

    let _ = fs::remove_file(path);
}

#[test]
fn store_upsert_clears_remote_system_when_target_changes() {
    let path = temp_store_path("remote-system-clear");
    let _ = fs::remove_file(&path);
    let mut store = ConnectionStore::load(path.clone()).unwrap();
    let saved = store
        .upsert(password_input(), "2026-06-05T09:30:00+08:00")
        .unwrap();
    store
        .update_remote_system(
            &saved.id,
            ConnectionRemoteSystemInfo {
                os_id: Some("ubuntu".to_string()),
                os_name: Some("Ubuntu".to_string()),
                os_version: Some("22.04".to_string()),
            },
            "2026-06-05T09:35:00+08:00",
        )
        .unwrap();

    let updated = store
        .upsert(
            ConnectionProfileInput {
                id: Some(saved.id.clone()),
                host: "other.example.com".to_string(),
                ..password_input()
            },
            "2026-06-05T09:40:00+08:00",
        )
        .unwrap();

    assert_eq!(updated.remote_os_id, None);
    assert_eq!(updated.remote_os_name, None);
    assert_eq!(updated.remote_os_version, None);

    let _ = fs::remove_file(path);
}

#[test]
fn load_migrates_legacy_auth_fields_to_inline_mode() {
    let path = temp_store_path("legacy");
    let _ = fs::remove_file(&path);
    fs::write(
        &path,
        r#"{
  "version": 1,
  "profiles": [{
    "id": "old",
    "name": "old",
    "host": "example.com",
    "port": 22,
    "username": "root",
    "auth_kind": "password",
    "password": "secret",
    "private_key_path": "C:/old",
    "private_key_passphrase": "old",
    "notes": null,
    "created_at": "1",
    "updated_at": "1"
  }]
}"#,
    )
    .unwrap();

    let store = ConnectionStore::load(path.clone()).unwrap();
    let profile = store.get("old").unwrap();

    assert_eq!(profile.credential_mode, ConnectionCredentialMode::Inline);
    assert_eq!(profile.inline_auth_kind, Some(ConnectionAuthKind::Password));
    assert_eq!(profile.inline_password, Some("secret".to_string()));
    assert_eq!(profile.inline_private_key_path, None);
    assert_eq!(profile.password, None);

    let _ = fs::remove_file(path);
}

fn temp_store_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "mxterm-connections-{name}-{}.json",
        uuid::Uuid::new_v4()
    ))
}

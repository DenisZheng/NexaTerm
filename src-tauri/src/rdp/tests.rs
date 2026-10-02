use super::{macos_rdp_open_args_with_app, serialize_rdp_file};
use crate::connections::{
    ConnectionAdvancedConfig, ConnectionCredentialMode, ConnectionJumpConfig, ConnectionProfile,
    ConnectionProtocol, ConnectionProxyConfig, RdpCertificatePolicy, RdpConnectionConfig,
    RdpPerformanceConfig, RdpPerformancePreset, RdpSecurityConfig,
};

fn rdp_profile() -> ConnectionProfile {
    ConnectionProfile {
        id: "rdp-1".to_string(),
        name: "RDP 1".to_string(),
        protocol: ConnectionProtocol::Rdp,
        group: None,
        group_id: None,
        host: "192.0.2.40".to_string(),
        port: 3389,
        username: r"MicrosoftAccount\user@example.com".to_string(),
        credential_mode: ConnectionCredentialMode::Prompt,
        credential_id: None,
        inline_auth_kind: None,
        inline_password: None,
        inline_private_key_path: None,
        inline_private_key_passphrase: None,
        prompt_auth_kind: None,
        proxy: ConnectionProxyConfig::default(),
        jump: ConnectionJumpConfig::default(),
        advanced: ConnectionAdvancedConfig::default(),
        rdp: None,
        vnc: None,
        telnet: None,
        serial: None,
        notes: None,
        is_favorite: false,
        last_connected_at: None,
        remote_os_id: None,
        remote_os_name: None,
        remote_os_version: None,
        created_at: "2026-06-24T00:00:00+08:00".to_string(),
        updated_at: "2026-06-24T00:00:00+08:00".to_string(),
        auth_kind: None,
        password: None,
        private_key_path: None,
        private_key_passphrase: None,
    }
}

fn config_with_certificate_policy(policy: RdpCertificatePolicy) -> RdpConnectionConfig {
    RdpConnectionConfig {
        security: RdpSecurityConfig {
            certificate_policy: policy,
            ..RdpSecurityConfig::default()
        },
        ..RdpConnectionConfig::default()
    }
}

#[test]
fn rdp_prompt_certificate_policy_allows_mstsc_warning_continue() {
    let content = serialize_rdp_file(
        &rdp_profile(),
        &config_with_certificate_policy(RdpCertificatePolicy::Prompt),
    )
    .unwrap();

    assert!(content.contains("authentication level:i:2\r\n"));
}

#[test]
fn rdp_certificate_policy_maps_trust_and_strict() {
    let trust = serialize_rdp_file(
        &rdp_profile(),
        &config_with_certificate_policy(RdpCertificatePolicy::Trust),
    )
    .unwrap();
    let strict = serialize_rdp_file(
        &rdp_profile(),
        &config_with_certificate_policy(RdpCertificatePolicy::Strict),
    )
    .unwrap();

    assert!(trust.contains("authentication level:i:0\r\n"));
    assert!(strict.contains("authentication level:i:1\r\n"));
}

#[test]
fn rdp_default_experience_enables_desktop_composition() {
    let content = serialize_rdp_file(&rdp_profile(), &RdpConnectionConfig::default()).unwrap();

    assert!(content.contains("session bpp:i:32\r\n"));
    assert!(content.contains("connection type:i:7\r\n"));
    assert!(content.contains("allow font smoothing:i:1\r\n"));
    assert!(content.contains("allow desktop composition:i:1\r\n"));
    assert!(content.contains("disable themes:i:0\r\n"));
    assert!(content.contains("disable full window drag:i:0\r\n"));
    assert!(content.contains("disable menu anims:i:0\r\n"));
}

#[test]
fn rdp_low_bandwidth_experience_disables_desktop_composition() {
    let content = serialize_rdp_file(
        &rdp_profile(),
        &RdpConnectionConfig {
            performance: RdpPerformanceConfig {
                preset: RdpPerformancePreset::LowBandwidth,
                ..RdpPerformanceConfig::default()
            },
            ..RdpConnectionConfig::default()
        },
    )
    .unwrap();

    assert!(content.contains("session bpp:i:16\r\n"));
    assert!(content.contains("allow desktop composition:i:0\r\n"));
    assert!(content.contains("disable themes:i:1\r\n"));
    assert!(content.contains("disable cursor setting:i:1\r\n"));
}

#[test]
fn macos_rdp_open_args_target_official_client_when_found() {
    let args = macos_rdp_open_args_with_app(
        "/tmp/example.rdp".to_string(),
        Some("Windows App".to_string()),
    );

    assert_eq!(args, vec!["-a", "Windows App", "/tmp/example.rdp"]);
}

#[test]
fn macos_rdp_open_args_fall_back_to_default_handler() {
    let args = macos_rdp_open_args_with_app("/tmp/example.rdp".to_string(), None);

    assert_eq!(args, vec!["/tmp/example.rdp"]);
}

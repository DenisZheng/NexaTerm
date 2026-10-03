#![cfg(target_os = "linux")]

use std::env;
use std::sync::Arc;
use std::time::Duration;

use russh::keys::ssh_key::PublicKey;
use russh::ChannelMsg;

use crate::commands::TerminalConnectRequest;
use crate::connections::{
    ConnectionAdvancedConfig, ConnectionAuthKind, ConnectionCredentialMode, ConnectionJumpConfig,
    ConnectionProfileInput, ConnectionProtocol, ConnectionProxyConfig,
};
use crate::known_hosts::host_key_info;
use crate::storage_repository::StorageRepository;
use crate::storage_vault::{InMemorySecretStore, SecretStore};

use super::session::{SshConnectionContext, TerminalSession};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires tests/fixtures ssh-x11 plus host Xvfb"]
async fn x11_fixture_russh_path_reaches_host_xvfb() {
    let key_path = required_env("NEXATERM_FIXTURE_X11_KEY");
    let host_key_text = required_env("NEXATERM_FIXTURE_X11_HOST_KEY");
    let display_text = required_env("NEXATERM_FIXTURE_X11_DISPLAY");

    let root = env::temp_dir().join(format!(
        "nexaterm-x11-production-fixture-{}",
        uuid::Uuid::new_v4()
    ));
    let secrets: Arc<dyn SecretStore> = Arc::new(InMemorySecretStore::default());
    let repository =
        StorageRepository::open_root(root.clone(), Arc::clone(&secrets)).expect("open fixture store");
    let public_key =
        PublicKey::from_openssh(&host_key_text).expect("fixture host public key should parse");
    repository
        .known_host_trust(
            host_key_info("127.0.0.1", 2223, &public_key),
            "2026-10-03T00:00:00Z",
        )
        .expect("pre-trust fixture host key");

    repository
        .connection_upsert(
            ConnectionProfileInput {
                id: Some("wf06c-x11-target".to_string()),
                source_connection_id: None,
                protocol: ConnectionProtocol::Ssh,
                name: Some("WF-06C X11 target".to_string()),
                group: None,
                group_id: None,
                host: "127.0.0.1".to_string(),
                port: 2223,
                username: "testuser".to_string(),
                credential_mode: ConnectionCredentialMode::Inline,
                credential_id: None,
                inline_auth_kind: Some(ConnectionAuthKind::PrivateKey),
                inline_password: None,
                inline_password_touched: false,
                inline_private_key_path: Some(key_path),
                inline_private_key_passphrase: None,
                inline_private_key_passphrase_touched: false,
                prompt_auth_kind: None,
                proxy: ConnectionProxyConfig::default(),
                jump: ConnectionJumpConfig::default(),
                advanced: ConnectionAdvancedConfig {
                    x11_forwarding: true,
                    x11_display: Some(display_text),
                    ..ConnectionAdvancedConfig::default()
                },
                rdp: None,
                vnc: None,
                telnet: None,
                serial: None,
                notes: None,
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
            "2026-10-03T00:00:00Z",
        )
        .expect("save production X11 fixture profile");

    let config = repository
        .resolve_saved_connection("wf06c-x11-target", None)
        .expect("resolve production X11 fixture profile");
    drop(repository);

    let request = TerminalConnectRequest {
        request_id: None,
        connection_id: Some("wf06c-x11-target".to_string()),
        host: config.host.clone(),
        port: config.port,
        username: config.username.clone(),
        auth_kind: None,
        password: config.password.clone(),
        private_key_path: config.private_key_path.clone(),
        private_key_passphrase: config.private_key_passphrase.clone(),
        runtime_credentials: Default::default(),
        cols: 80,
        rows: 24,
        runtime_config: Some(config),
    };
    let context = SshConnectionContext::from_parts(root.clone(), secrets);
    let (session, mut reader) =
        TerminalSession::open_with_context(context, request, None)
            .await
            .expect("production TerminalSession opens with X11 enabled");

    session
        .write(
            "test -n \"$DISPLAY\" && xauth list | grep -q MIT-MAGIC-COOKIE-1 && xdpyinfo >/dev/null 2>&1 && echo nexaterm-x11-production-ok; exit\n"
                .to_string(),
        )
        .await
        .expect("run production X11 terminal probe");

    let output = tokio::time::timeout(Duration::from_secs(15), async {
        let mut output = Vec::new();
        while let Some(message) = reader.wait().await {
            match message {
                ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                    output.extend_from_slice(&data);
                    if String::from_utf8_lossy(&output).contains("nexaterm-x11-production-ok") {
                        break;
                    }
                }
                ChannelMsg::Close => break,
                _ => {}
            }
        }
        output
    })
    .await
    .expect("production X11 terminal probe timeout");

    let output = String::from_utf8_lossy(&output);
    assert!(
        output.contains("nexaterm-x11-production-ok"),
        "production TerminalSession X11 probe did not reach local Xvfb: {output:?}"
    );

    session.close().await.expect("close production X11 terminal");
    let _ = std::fs::remove_dir_all(root);
}

fn required_env(name: &str) -> String {
    env::var(name).unwrap_or_else(|_| panic!("missing required fixture environment variable {name}"))
}

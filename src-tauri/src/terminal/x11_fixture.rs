#![cfg(target_os = "linux")]

use std::env;
use std::sync::Arc;
use std::time::Duration;

use russh::{client, ChannelMsg, Disconnect};
use russh::keys::ssh_key::PublicKey;

use crate::known_hosts::host_key_info;
use crate::storage_repository::StorageRepository;
use crate::storage_vault::{InMemorySecretStore, SecretStore};
use crate::x11_forward::{
    decode_cookie_hex, encode_cookie_hex, parse_display, X11ForwardConfig, X11ForwardState,
};

use super::forwarding::RemoteForwardState;
use super::session::{authenticate, AuthMethod, KnownHostClient};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires tests/fixtures ssh-x11 plus host Xvfb"]
async fn x11_fixture_russh_path_reaches_host_xvfb() {
    let key_path = required_env("NEXATERM_FIXTURE_X11_KEY");
    let host_key_text = required_env("NEXATERM_FIXTURE_X11_HOST_KEY");
    let display_text = required_env("NEXATERM_FIXTURE_X11_DISPLAY");
    let real_cookie_hex = required_env("NEXATERM_FIXTURE_X11_COOKIE");

    let display = parse_display(&display_text).expect("fixture DISPLAY should parse");
    let real_cookie = decode_cookie_hex(&real_cookie_hex).expect("fixture X11 cookie should decode");
    assert!(!real_cookie.is_empty(), "fixture X11 cookie must not be empty");
    let fake_cookie = vec![0x5a; real_cookie.len()];

    let root = env::temp_dir().join(format!(
        "nexaterm-x11-fixture-{}",
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
            "2026-09-29T00:00:00Z",
        )
        .expect("pre-trust fixture host key");

    let x11_forward = X11ForwardState::default();
    x11_forward
        .configure(X11ForwardConfig {
            display: display.clone(),
            fake_cookie: fake_cookie.clone(),
            real_cookie,
        })
        .await
        .expect("configure X11 forwarding state");

    let handler = KnownHostClient {
        host: "127.0.0.1".to_string(),
        port: 2223,
        app_data_dir: root.clone(),
        secret_store: secrets,
        remote_forward: RemoteForwardState::default(),
        x11_forward: x11_forward.clone(),
    };
    let config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(30)),
        ..<_>::default()
    });
    let mut client = client::connect(config, ("127.0.0.1", 2223), handler)
        .await
        .expect("russh connects to X11 fixture");

    authenticate(
        &mut client,
        "testuser",
        AuthMethod::PrivateKey {
            path: key_path,
            passphrase: None,
        },
    )
    .await
    .expect("fixture public-key authentication succeeds");

    let channel = client
        .channel_open_session()
        .await
        .expect("open fixture session channel");
    channel
        .request_x11(
            true,
            false,
            "MIT-MAGIC-COOKIE-1",
            encode_cookie_hex(&fake_cookie),
            display.screen_number,
        )
        .await
        .expect("request X11 forwarding");
    channel
        .exec(
            true,
            "test -n \"$DISPLAY\" && xauth list | grep -q MIT-MAGIC-COOKIE-1 && xdpyinfo >/dev/null 2>&1 && echo nexaterm-x11-ok",
        )
        .await
        .expect("start remote X11 probe");

    let mut output = Vec::new();
    let mut exit_status = None;
    while let Some(message) = channel.wait().await {
        match message {
            ChannelMsg::Data { data } => output.extend_from_slice(&data),
            ChannelMsg::ExitStatus { exit_status: code } => exit_status = Some(code),
            ChannelMsg::Close => break,
            _ => {}
        }
    }

    assert_eq!(exit_status, Some(0), "remote X11 probe should exit successfully");
    let output = String::from_utf8_lossy(&output);
    assert!(
        output.contains("nexaterm-x11-ok"),
        "remote X11 probe did not confirm local X server connection: {output:?}"
    );

    x11_forward.clear().await;
    let _ = client
        .disconnect(Disconnect::ByApplication, "", "English")
        .await;
    let _ = std::fs::remove_dir_all(root);
}

fn required_env(name: &str) -> String {
    env::var(name).unwrap_or_else(|_| panic!("missing required fixture environment variable {name}"))
}

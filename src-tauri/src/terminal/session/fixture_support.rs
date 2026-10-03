use std::env;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use russh::keys::ssh_key::PublicKey;
use tokio::time::sleep;

use super::SshConnectionContext;
use crate::connections::{
    ConnectionAdvancedConfig, ConnectionAuthKind, ConnectionCredentialMode, ConnectionJumpConfig,
    ConnectionJumpKind, ConnectionProfileInput, ConnectionProtocol, ConnectionProxyConfig,
};
use crate::known_hosts::host_key_info;
use crate::ssh_config::ResolvedSshConfig;
use crate::storage_repository::StorageRepository;
use crate::storage_vault::{InMemorySecretStore, SecretStore};

pub(crate) const OUTER_ID: &str = "wf06b-jump-2";
pub(crate) const INNER_ID: &str = "wf06b-jump-1";
pub(crate) const TARGET_ID: &str = "wf06b-target";
pub(crate) const OUTER_HOST: &str = "127.0.0.1";
pub(crate) const OUTER_PORT: u16 = 2224;
pub(crate) const INNER_HOST: &str = "ssh-jump-inner";
pub(crate) const TARGET_HOST: &str = "ssh-multihop-target";
pub(crate) const FIXTURE_USER: &str = "testuser";
const SERVICES: [&str; 3] = ["ssh-jump-outer", "ssh-jump-inner", "ssh-multihop-target"];

pub(crate) struct TwoHopFixture {
    pub context: SshConnectionContext,
    pub target: ResolvedSshConfig,
    pub root: PathBuf,
    key_path: String,
}

pub(crate) fn setup_two_hop_fixture(label: &str) -> TwoHopFixture {
    let key_path = required_env("NEXATERM_FIXTURE_WF06B_KEY");
    let root = env::temp_dir().join(format!(
        "nexaterm-wf06b-fixture-{label}-{}",
        uuid::Uuid::new_v4()
    ));
    let secrets: Arc<dyn SecretStore> = Arc::new(InMemorySecretStore::default());
    let repository = StorageRepository::open_root(root.clone(), Arc::clone(&secrets))
        .expect("open WF-06B fixture store");

    upsert_profile(&repository, OUTER_ID, OUTER_HOST, OUTER_PORT, FIXTURE_USER, &key_path, None);
    upsert_profile(
        &repository,
        INNER_ID,
        INNER_HOST,
        22,
        FIXTURE_USER,
        &key_path,
        Some(OUTER_ID),
    );
    upsert_profile(
        &repository,
        TARGET_ID,
        TARGET_HOST,
        22,
        FIXTURE_USER,
        &key_path,
        Some(INNER_ID),
    );

    trust_fixture_host(
        &repository,
        OUTER_HOST,
        OUTER_PORT,
        "NEXATERM_FIXTURE_WF06B_OUTER_HOST_KEY",
    );
    trust_fixture_host(
        &repository,
        INNER_HOST,
        22,
        "NEXATERM_FIXTURE_WF06B_INNER_HOST_KEY",
    );
    trust_fixture_host(
        &repository,
        TARGET_HOST,
        22,
        "NEXATERM_FIXTURE_WF06B_TARGET_HOST_KEY",
    );
    let target = repository
        .resolve_saved_connection(TARGET_ID, None)
        .expect("resolve WF-06B target profile");
    drop(repository);

    TwoHopFixture {
        context: SshConnectionContext::from_parts(root.clone(), secrets),
        target,
        root,
        key_path,
    }
}

pub(crate) fn make_inner_auth_fail(fixture: &TwoHopFixture) {
    let repository = StorageRepository::open_root(
        fixture.root.clone(),
        Arc::clone(&fixture.context.secret_store),
    )
    .expect("reopen WF-06B fixture store");
    upsert_profile(
        &repository,
        INNER_ID,
        INNER_HOST,
        22,
        "missing-wf06b-user",
        &fixture.key_path,
        Some(OUTER_ID),
    );
}

pub(crate) async fn assert_chain_active() {
    let counts = chain_session_counts();
    assert!(
        counts.iter().all(|(_, count)| *count > 0),
        "expected active sshd child session on every WF-06B node: {counts:?}"
    );
}

pub(crate) async fn assert_chain_drained() {
    for _ in 0..60 {
        let counts = chain_session_counts();
        if counts.iter().all(|(_, count)| *count == 0) {
            return;
        }
        sleep(Duration::from_millis(100)).await;
    }
    panic!(
        "WF-06B SSH sessions did not drain after close/failure: {:?}",
        chain_session_counts()
    );
}

fn chain_session_counts() -> Vec<(String, usize)> {
    SERVICES
        .iter()
        .map(|service| ((*service).to_string(), service_session_count(service)))
        .collect()
}

fn service_session_count(service: &str) -> usize {
    let compose = required_env("NEXATERM_FIXTURE_WF06B_COMPOSE");
    let output = Command::new("docker")
        .args([
            "compose",
            "-f",
            &compose,
            "exec",
            "-T",
            service,
            "sh",
            "-lc",
            "ps -eo args | grep '[s]shd:' | grep -v '\\[listener\\]' | wc -l",
        ])
        .output()
        .expect("run docker compose sshd session probe");
    assert!(
        output.status.success(),
        "docker compose session probe failed for {service}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<usize>()
        .unwrap_or_else(|_| panic!("invalid sshd session count for {service}"))
}

fn trust_fixture_host(repository: &StorageRepository, host: &str, port: u16, env_name: &str) {
    let public_key = PublicKey::from_openssh(&required_env(env_name))
        .unwrap_or_else(|error| panic!("parse {env_name}: {error}"));
    repository
        .known_host_trust(
            host_key_info(host, port, &public_key),
            "2026-10-03T00:00:00Z",
        )
        .expect("trust WF-06B fixture host key");
}

fn upsert_profile(
    repository: &StorageRepository,
    id: &str,
    host: &str,
    port: u16,
    username: &str,
    key_path: &str,
    jump_id: Option<&str>,
) {
    repository
        .connection_upsert(
            ConnectionProfileInput {
                id: Some(id.to_string()),
                source_connection_id: None,
                protocol: ConnectionProtocol::Ssh,
                name: Some(id.to_string()),
                group: None,
                group_id: None,
                host: host.to_string(),
                port,
                username: username.to_string(),
                credential_mode: ConnectionCredentialMode::Inline,
                credential_id: None,
                inline_auth_kind: Some(ConnectionAuthKind::PrivateKey),
                inline_password: None,
                inline_password_touched: false,
                inline_private_key_path: Some(key_path.to_string()),
                inline_private_key_passphrase: None,
                inline_private_key_passphrase_touched: false,
                prompt_auth_kind: None,
                proxy: ConnectionProxyConfig::default(),
                jump: jump_id
                    .map(|jump_connection_id| ConnectionJumpConfig {
                        kind: ConnectionJumpKind::SshJump,
                        jump_connection_id: Some(jump_connection_id.to_string()),
                    })
                    .unwrap_or_default(),
                advanced: ConnectionAdvancedConfig::default(),
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
        .expect("upsert WF-06B fixture profile");
}

fn required_env(name: &str) -> String {
    env::var(name).unwrap_or_else(|_| panic!("missing required fixture environment variable {name}"))
}

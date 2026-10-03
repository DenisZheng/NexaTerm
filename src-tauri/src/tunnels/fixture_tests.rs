use std::env;
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{sleep, timeout};

use super::*;
use crate::terminal::session::ReusableForwardSession;

const FIXTURE_HOST: &str = "127.0.0.1";
const FIXTURE_PORT: u16 = 2222;
const FIXTURE_USER: &str = "testuser";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires tests/fixtures ssh-jump + ssh-target"]
async fn tunnel_fixture_local_dynamic_remote_real_ssh() {
    local_forward_reaches_real_ssh_target_and_releases_listener().await;
    dynamic_socks_reaches_real_ssh_target_and_releases_listener().await;
    remote_forward_reaches_local_echo_and_cancel_removes_listener().await;
}

async fn local_forward_reaches_real_ssh_target_and_releases_listener() {
    let (session, root) = fixture_session("local").await;
    let session = Arc::new(session);
    let listener = TcpListener::bind((FIXTURE_HOST, 0))
        .await
        .expect("bind local tunnel fixture listener");
    let local_port = listener.local_addr().expect("local fixture address").port();

    let mut rule = fixture_rule("wf06-local", TunnelKind::Local);
    rule.local_port = local_port;
    let manager = TunnelManager::default();
    let task = tauri::async_runtime::spawn(run_tunnel_accept_loop(
        rule.clone(),
        listener,
        Arc::clone(&session),
        Arc::clone(&manager.states),
        Arc::clone(&manager.running),
    ));
    manager.running.lock().await.insert(
        rule.id.clone(),
        RunningTunnel {
            rule: rule.clone(),
            session,
            task,
            remote_forward: None,
        },
    );

    let mut client = TcpStream::connect((FIXTURE_HOST, local_port))
        .await
        .expect("connect local tunnel fixture");
    let banner = read_line(&mut client).await;
    assert!(
        banner.starts_with("SSH-2.0-"),
        "local forwarding did not reach ssh-target: {banner:?}"
    );
    drop(client);

    assert!(manager.stop_running(&rule.id).await.is_some());
    assert_listener_released(local_port).await;
    let _ = std::fs::remove_dir_all(root);
}

async fn dynamic_socks_reaches_real_ssh_target_and_releases_listener() {
    let (session, root) = fixture_session("dynamic").await;
    let session = Arc::new(session);
    let listener = TcpListener::bind((FIXTURE_HOST, 0))
        .await
        .expect("bind SOCKS fixture listener");
    let local_port = listener.local_addr().expect("SOCKS fixture address").port();

    let mut rule = fixture_rule("wf06-dynamic", TunnelKind::Dynamic);
    rule.local_port = local_port;
    let manager = TunnelManager::default();
    let task = tauri::async_runtime::spawn(run_tunnel_accept_loop(
        rule.clone(),
        listener,
        Arc::clone(&session),
        Arc::clone(&manager.states),
        Arc::clone(&manager.running),
    ));
    manager.running.lock().await.insert(
        rule.id.clone(),
        RunningTunnel {
            rule: rule.clone(),
            session,
            task,
            remote_forward: None,
        },
    );

    let mut client = TcpStream::connect((FIXTURE_HOST, local_port))
        .await
        .expect("connect SOCKS fixture");
    client
        .write_all(&[0x05, 0x01, 0x00])
        .await
        .expect("write SOCKS greeting");
    let mut method_reply = [0_u8; 2];
    timeout(Duration::from_secs(5), client.read_exact(&mut method_reply))
        .await
        .expect("SOCKS method timeout")
        .expect("read SOCKS method");
    assert_eq!(method_reply, [0x05, 0x00]);

    let target = b"ssh-target";
    let mut request = vec![0x05, 0x01, 0x00, 0x03, target.len() as u8];
    request.extend_from_slice(target);
    request.extend_from_slice(&22_u16.to_be_bytes());
    client
        .write_all(&request)
        .await
        .expect("write SOCKS CONNECT");
    let mut reply = [0_u8; 10];
    timeout(Duration::from_secs(5), client.read_exact(&mut reply))
        .await
        .expect("SOCKS CONNECT timeout")
        .expect("read SOCKS CONNECT reply");
    assert_eq!(reply[0], 0x05);
    assert_eq!(reply[1], 0x00);

    let banner = read_line(&mut client).await;
    assert!(
        banner.starts_with("SSH-2.0-"),
        "dynamic SOCKS did not reach ssh-target: {banner:?}"
    );
    drop(client);

    assert!(manager.stop_running(&rule.id).await.is_some());
    assert_listener_released(local_port).await;
    let _ = std::fs::remove_dir_all(root);
}

async fn remote_forward_reaches_local_echo_and_cancel_removes_listener() {
    let (session, root) = fixture_session("remote").await;
    let session = Arc::new(session);
    let echo_listener = TcpListener::bind((FIXTURE_HOST, 0))
        .await
        .expect("bind remote-forward echo target");
    let echo_port = echo_listener.local_addr().expect("echo target address").port();
    let echo_task = tauri::async_runtime::spawn(async move {
        let (mut socket, _) = echo_listener.accept().await.expect("accept remote-forward target");
        let mut payload = [0_u8; 11];
        socket
            .read_exact(&mut payload)
            .await
            .expect("read remote-forward payload");
        socket
            .write_all(&payload)
            .await
            .expect("echo remote-forward payload");
    });

    session
        .set_remote_forward_target(FIXTURE_HOST.to_string(), echo_port, None)
        .await;
    let remote_port = session
        .request_remote_forward(FIXTURE_HOST, 0)
        .await
        .expect("request real remote forwarding");

    let mut rule = fixture_rule("wf06-remote", TunnelKind::Remote);
    rule.local_port = echo_port;
    rule.remote_port = remote_port;
    let manager = TunnelManager::default();
    manager.running.lock().await.insert(
        rule.id.clone(),
        RunningTunnel {
            rule: rule.clone(),
            session: Arc::clone(&session),
            task: tauri::async_runtime::spawn(std::future::pending::<()>()),
            remote_forward: Some(RemoteForwardBinding {
                host: FIXTURE_HOST.to_string(),
                port: remote_port,
            }),
        },
    );

    let (probe, probe_root) = fixture_session("remote-probe").await;
    let command = format!(
        "bash -lc 'exec 3<>/dev/tcp/127.0.0.1/{remote_port}; printf wf06-remote >&3; head -c 11 <&3'"
    );
    let (output, status) = probe.exec_fixture_command(&command).await;
    assert_eq!(status, Some(0), "remote-forward probe failed: {output:?}");
    assert_eq!(output, b"wf06-remote");
    timeout(Duration::from_secs(5), echo_task)
        .await
        .expect("remote-forward echo timeout")
        .expect("remote-forward echo task");

    assert!(manager.stop_running(&rule.id).await.is_some());
    sleep(Duration::from_millis(150)).await;

    let closed_probe =
        format!("bash -lc 'exec 3<>/dev/tcp/127.0.0.1/{remote_port}'");
    let (_, closed_status) = probe.exec_fixture_command(&closed_probe).await;
    assert_ne!(
        closed_status,
        Some(0),
        "cancel_remote_forward must remove the server-side listener"
    );

    probe.close().await;
    let _ = std::fs::remove_dir_all(root);
    let _ = std::fs::remove_dir_all(probe_root);
}

async fn fixture_session(label: &str) -> (ReusableForwardSession, std::path::PathBuf) {
    let key_path = required_env("NEXATERM_FIXTURE_TUNNEL_KEY");
    let host_key = required_env("NEXATERM_FIXTURE_TUNNEL_HOST_KEY");
    let root = env::temp_dir().join(format!(
        "nexaterm-tunnel-fixture-{label}-{}",
        uuid::Uuid::new_v4()
    ));
    let session = ReusableForwardSession::connect_fixture(
        FIXTURE_HOST,
        FIXTURE_PORT,
        FIXTURE_USER,
        key_path,
        &host_key,
        root.clone(),
    )
    .await;
    (session, root)
}

fn fixture_rule(id: &str, kind: TunnelKind) -> TunnelRule {
    TunnelRule {
        id: id.to_string(),
        name: id.to_string(),
        kind,
        connection_id: "fixture-ssh-jump".to_string(),
        local_host: FIXTURE_HOST.to_string(),
        local_port: 0,
        remote_host: "ssh-target".to_string(),
        remote_port: 22,
        auto_start: false,
        created_at: "2026-10-03T00:00:00Z".to_string(),
        updated_at: "2026-10-03T00:00:00Z".to_string(),
    }
}

async fn read_line(stream: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    timeout(Duration::from_secs(5), async {
        loop {
            let byte = stream.read_u8().await.expect("read forwarded byte");
            bytes.push(byte);
            if byte == b'\n' || bytes.len() >= 256 {
                break;
            }
        }
    })
    .await
    .expect("forwarded banner timeout");
    String::from_utf8_lossy(&bytes).into_owned()
}

async fn assert_listener_released(port: u16) {
    for _ in 0..20 {
        match TcpListener::bind((FIXTURE_HOST, port)).await {
            Ok(listener) => {
                drop(listener);
                return;
            }
            Err(_) => sleep(Duration::from_millis(50)).await,
        }
    }
    panic!("tunnel listener {port} was not released after stop");
}

fn required_env(name: &str) -> String {
    env::var(name).unwrap_or_else(|_| panic!("missing required fixture environment variable {name}"))
}

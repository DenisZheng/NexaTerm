use std::sync::Arc;

use tokio::io::AsyncReadExt;

use super::*;
use crate::app_error::AppErrorDetails;
use crate::terminal::session::fixture_support::{
    assert_chain_active, assert_chain_drained, make_inner_auth_fail, setup_two_hop_fixture,
    INNER_ID,
};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires tests/fixtures true two-level Jump chain"]
async fn wf06b_fixture_two_hop_terminal_sftp_and_cleanup() {
    let fixture = setup_two_hop_fixture("terminal-sftp");

    terminal_pty_round_trip(&fixture).await;
    assert_chain_drained().await;

    let sftp = ReusableSftpSession::connect_resolved_with_context(&fixture.context, &fixture.target)
        .await
        .expect("connect SFTP over two Jump nodes");
    assert_chain_active().await;
    let mut remote_file = sftp
        .sftp()
        .open("/home/testuser/wf06b-files.txt".to_string())
        .await
        .expect("open file over two-hop SFTP");
    let mut contents = Vec::new();
    remote_file
        .read_to_end(&mut contents)
        .await
        .expect("read file over two-hop SFTP");
    assert_eq!(contents, b"wf06b-files-ok");
    sftp.close().await;
    assert_chain_drained().await;

    make_inner_auth_fail(&fixture);
    let error =
        match ReusableExecSession::connect_resolved_with_context(&fixture.context, &fixture.target)
            .await
        {
            Ok(session) => {
                session.close().await;
                panic!("Jump-1 authentication must fail");
            }
            Err(error) => error,
        };
    assert_eq!(error.code, "jump_auth_rejected");
    match error.details {
        Some(AppErrorDetails::SshNodeFailure {
            connection_id,
            stage,
            ..
        }) => {
            assert_eq!(connection_id, INNER_ID);
            assert_eq!(stage, "auth");
        }
        details => panic!("expected Jump-1 SshNodeFailure details, got {details:?}"),
    }
    assert_chain_drained().await;
    let _ = std::fs::remove_dir_all(&fixture.root);
}

async fn terminal_pty_round_trip(fixture: &crate::terminal::session::fixture_support::TwoHopFixture) {
    let config = &fixture.target;
    let auth_method = auth_method(config).expect("build target auth method");
    let ssh_config = Arc::new(client::Config {
        keepalive_interval: Some(duration_from_ms(config.advanced.keepalive_interval_ms)),
        keepalive_max: 1,
        nodelay: true,
        ..<_>::default()
    });
    let handler = KnownHostClient {
        host: config.host.clone(),
        port: config.port,
        app_data_dir: fixture.context.app_data_dir.clone(),
        secret_store: Arc::clone(&fixture.context.secret_store),
        remote_forward: RemoteForwardState::default(),
        x11_forward: X11ForwardState::default(),
    };
    let (mut client, jump_clients) =
        connect_target_client(&fixture.context, ssh_config, config, handler)
            .await
            .expect("connect target through Jump-2 -> Jump-1");
    authenticate(&mut client, &config.username, auth_method)
        .await
        .expect("authenticate final target");
    let mut channel = client
        .channel_open_session()
        .await
        .expect("open terminal channel on final target");
    channel
        .request_pty(true, "xterm-256color", 80, 24, 0, 0, &[])
        .await
        .expect("request PTY through two-hop chain");
    channel
        .request_shell(true)
        .await
        .expect("start shell through two-hop chain");
    assert_chain_active().await;
    channel
        .data_bytes(
            b"printf 'wf06b-terminal-ok\\n'; printf 'wf06b-files-ok' > /home/testuser/wf06b-files.txt; exit\\n"
                .to_vec(),
        )
        .await
        .expect("write terminal command");

    let mut output = Vec::new();
    while let Some(message) = channel.wait().await {
        match message {
            ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                output.extend_from_slice(&data)
            }
            ChannelMsg::Close => break,
            _ => {}
        }
    }
    let _ = channel.close().await;
    let _ = client
        .disconnect(Disconnect::ByApplication, "", "English")
        .await;
    disconnect_jump_clients(&jump_clients).await;
    assert!(
        String::from_utf8_lossy(&output).contains("wf06b-terminal-ok"),
        "terminal PTY did not return marker: {}",
        String::from_utf8_lossy(&output)
    );
}

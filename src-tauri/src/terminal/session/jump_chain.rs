use super::*;
use crate::app_error::AppErrorDetails;
use crate::connections::{
    ConnectionAdvancedConfig, ConnectionAuthKind, ConnectionJumpConfig, ConnectionJumpKind,
    ConnectionProxyConfig,
};

const MAX_JUMP_HOPS: usize = 2;

fn with_node_context(
    mut error: AppError,
    config: &ResolvedSshConfig,
    stage: &str,
) -> AppError {
    if error.details.is_none() {
        error.details = Some(AppErrorDetails::SshNodeFailure {
            connection_id: config.connection_id.clone(),
            host: config.host.clone(),
            port: config.port,
            stage: stage.to_string(),
        });
    }
    error
}

fn to_node_russh_error(
    error: AppError,
    config: &ResolvedSshConfig,
    stage: &str,
) -> russh::Error {
    to_russh_error(with_node_context(error, config, stage))
}

pub(super) async fn disconnect_jump_clients(jump_clients: &[SshHandle]) {
    for jump_client in jump_clients.iter().rev() {
        let _ = jump_client
            .disconnect(Disconnect::ByApplication, "", "English")
            .await;
    }
}

pub(super) async fn connect_target_client(
    context: &SshConnectionContext,
    config: Arc<client::Config>,
    request: &ResolvedSshConfig,
    handler: KnownHostClient,
) -> Result<(SshHandle, Vec<SshHandle>), russh::Error> {
    let jump_plan = resolve_jump_chain(context, request).map_err(to_russh_error)?;
    let mut jump_clients: Vec<SshHandle> = Vec::with_capacity(jump_plan.len());

    let result = async {
        for jump in jump_plan {
            let jump_auth_method =
                auth_method(&jump).map_err(|error| to_node_russh_error(error, &jump, "auth"))?;
            let jump_ssh_config = Arc::new(client::Config {
                keepalive_interval: Some(duration_from_ms(jump.advanced.keepalive_interval_ms)),
                keepalive_max: 1,
                nodelay: true,
                ..<_>::default()
            });
            let jump_host_key_handler = KnownHostClient {
                host: jump.host.clone(),
                port: jump.port,
                app_data_dir: context.app_data_dir.clone(),
                secret_store: Arc::clone(&context.secret_store),
                remote_forward: RemoteForwardState::default(),
                x11_forward: X11ForwardState::default(),
            };

            let mut jump_client = if let Some(parent) = jump_clients.last() {
                let channel = run_with_timeout(
                    "jump_direct_tcpip_timeout",
                    "跳板机通道打开超时。",
                    duration_from_ms(jump.advanced.connect_timeout_ms),
                    parent.channel_open_direct_tcpip(
                        jump.host.clone(),
                        u32::from(jump.port),
                        "127.0.0.1",
                        0,
                    ),
                )
                .await
                .map_err(|error| to_node_russh_error(error, &jump, "direct_tcpip"))?
                .map_err(|error| {
                    to_node_russh_error(
                        AppError::new(
                            "jump_direct_tcpip_failed",
                            "跳板机通道打开失败。",
                            error,
                            true,
                        ),
                        &jump,
                        "direct_tcpip",
                    )
                })?;
                client::connect_stream(jump_ssh_config, channel.into_stream(), jump_host_key_handler)
                    .await
                    .map_err(|error| {
                        to_russh_error(with_node_context(
                            app_error_from_russh(
                                error,
                                "jump_connect_failed",
                                "跳板机连接失败。",
                            ),
                            &jump,
                            "connect",
                        ))
                    })?
            } else {
                run_with_timeout(
                    "jump_connect_timeout",
                    "跳板机连接超时。",
                    duration_from_ms(jump.advanced.connect_timeout_ms),
                    connect_ssh_client(jump_ssh_config, &jump, jump_host_key_handler),
                )
                .await
                .map_err(|error| to_node_russh_error(error, &jump, "connect"))?
                .map_err(|error| {
                    to_russh_error(with_node_context(
                        app_error_from_russh(
                            error,
                            "jump_connect_failed",
                            "跳板机连接失败。",
                        ),
                        &jump,
                        "connect",
                    ))
                })?
            };

            run_with_timeout(
                "jump_auth_timeout",
                "跳板机认证超时。",
                duration_from_ms(jump.advanced.auth_timeout_ms),
                authenticate(&mut jump_client, &jump.username, jump_auth_method),
            )
            .await
            .map_err(|error| to_node_russh_error(error, &jump, "auth"))?
            .map_err(|error| {
                to_russh_error(with_node_context(map_jump_auth_error(error), &jump, "auth"))
            })?;
            jump_clients.push(jump_client);
        }

        if let Some(parent) = jump_clients.last() {
            let channel = run_with_timeout(
                "jump_direct_tcpip_timeout",
                "跳板机通道打开超时。",
                duration_from_ms(request.advanced.connect_timeout_ms),
                parent.channel_open_direct_tcpip(
                    request.host.clone(),
                    u32::from(request.port),
                    "127.0.0.1",
                    0,
                ),
            )
            .await
            .map_err(|error| to_node_russh_error(error, request, "direct_tcpip"))?
            .map_err(|error| {
                to_node_russh_error(
                    AppError::new(
                        "jump_direct_tcpip_failed",
                        "跳板机通道打开失败。",
                        error,
                        true,
                    ),
                    request,
                    "direct_tcpip",
                )
            })?;
            client::connect_stream(config, channel.into_stream(), handler).await
        } else {
            connect_ssh_client(config, request, handler).await
        }
    }
    .await;

    match result {
        Ok(client) => Ok((client, jump_clients)),
        Err(error) => {
            disconnect_jump_clients(&jump_clients).await;
            Err(error)
        }
    }
}

fn resolve_jump_chain(
    context: &SshConnectionContext,
    request: &ResolvedSshConfig,
) -> Result<Vec<ResolvedSshConfig>, AppError> {
    let repository = StorageRepository::open_root(
        context.app_data_dir.clone(),
        Arc::clone(&context.secret_store),
    )?;
    resolve_jump_chain_with(request, |connection_id| {
        repository.resolve_saved_connection(
            connection_id,
            context.runtime_credentials.get(connection_id).cloned(),
        )
    })
}

fn resolve_jump_chain_with<F>(
    request: &ResolvedSshConfig,
    mut resolve: F,
) -> Result<Vec<ResolvedSshConfig>, AppError>
where
    F: FnMut(&str) -> Result<ResolvedSshConfig, AppError>,
{
    let mut visited = std::collections::HashSet::new();
    if !request.connection_id.trim().is_empty() {
        visited.insert(request.connection_id.clone());
    }

    let mut chain = Vec::new();
    let mut current = request.clone();
    while current.jump.kind == ConnectionJumpKind::SshJump {
        let jump_connection_id = current
            .jump
            .jump_connection_id
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                AppError::new(
                    "connection_jump_missing",
                    "请选择 SSH 跳板机连接。",
                    format!("connection_id={}", current.connection_id),
                    true,
                )
            })?;

        if jump_connection_id == request.connection_id {
            return Err(AppError::new(
                "connection_jump_self_reference",
                "跳板机不能引用自身连接。",
                format!("connection_id={jump_connection_id}"),
                true,
            ));
        }
        if !visited.insert(jump_connection_id.to_string()) {
            return Err(AppError::new(
                "connection_jump_cycle",
                "跳板链存在循环引用。",
                format!("connection_id={jump_connection_id}"),
                true,
            ));
        }
        if chain.len() >= MAX_JUMP_HOPS {
            return Err(AppError::new(
                "connection_jump_depth_exceeded",
                "当前最多支持两级 SSH 跳板。",
                format!("connection_id={jump_connection_id}"),
                true,
            ));
        }

        let jump = resolve(jump_connection_id)?;
        chain.push(jump.clone());
        current = jump;
    }

    chain.reverse();
    Ok(chain)
}


#[cfg(test)]
mod tests {
    use super::*;

    fn resolved_jump(
        id: &str,
        jump_connection_id: Option<&str>,
    ) -> ResolvedSshConfig {
        ResolvedSshConfig {
            connection_id: id.to_string(),
            host: format!("{id}.example.com"),
            port: 22,
            username: "root".to_string(),
            auth_kind: ConnectionAuthKind::Password,
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            proxy: ConnectionProxyConfig::default(),
            jump: ConnectionJumpConfig {
                kind: if jump_connection_id.is_some() {
                    ConnectionJumpKind::SshJump
                } else {
                    ConnectionJumpKind::None
                },
                jump_connection_id: jump_connection_id.map(ToOwned::to_owned),
            },
            advanced: ConnectionAdvancedConfig::default(),
        }
    }

    #[test]
    fn jump_plan_accepts_two_hops_in_outer_to_inner_connect_order() {
        let target = resolved_jump("target-001", Some("jump-001"));
        let jump_one = resolved_jump("jump-001", Some("jump-002"));
        let jump_two = resolved_jump("jump-002", None);

        let plan = resolve_jump_chain_with(&target, |id| match id {
            "jump-001" => Ok(jump_one.clone()),
            "jump-002" => Ok(jump_two.clone()),
            _ => panic!("unexpected jump id {id}"),
        })
        .unwrap();

        assert_eq!(
            plan.iter().map(|item| item.connection_id.as_str()).collect::<Vec<_>>(),
            vec!["jump-002", "jump-001"]
        );
    }

    #[test]
    fn jump_plan_rejects_self_reference() {
        let target = resolved_jump("target-001", Some("target-001"));

        let error = resolve_jump_chain_with(&target, |_| unreachable!()).unwrap_err();

        assert_eq!(error.code, "connection_jump_self_reference");
    }

    #[test]
    fn jump_plan_rejects_cycle_between_jump_nodes() {
        let target = resolved_jump("target-001", Some("jump-001"));
        let jump_one = resolved_jump("jump-001", Some("jump-002"));
        let jump_two = resolved_jump("jump-002", Some("jump-001"));

        let error = resolve_jump_chain_with(&target, |id| match id {
            "jump-001" => Ok(jump_one.clone()),
            "jump-002" => Ok(jump_two.clone()),
            _ => panic!("unexpected jump id {id}"),
        })
        .unwrap_err();

        assert_eq!(error.code, "connection_jump_cycle");
    }

    #[test]
    fn jump_plan_rejects_more_than_two_hops() {
        let target = resolved_jump("target-001", Some("jump-001"));
        let jump_one = resolved_jump("jump-001", Some("jump-002"));
        let jump_two = resolved_jump("jump-002", Some("jump-003"));

        let error = resolve_jump_chain_with(&target, |id| match id {
            "jump-001" => Ok(jump_one.clone()),
            "jump-002" => Ok(jump_two.clone()),
            _ => Ok(resolved_jump(id, None)),
        })
        .unwrap_err();

        assert_eq!(error.code, "connection_jump_depth_exceeded");
    }

    #[test]
    fn jump_plan_rejects_missing_jump_connection() {
        let mut target = resolved_jump("target-001", None);
        target.jump = ConnectionJumpConfig {
            kind: ConnectionJumpKind::SshJump,
            jump_connection_id: None,
        };

        let error = resolve_jump_chain_with(&target, |_| unreachable!()).unwrap_err();

        assert_eq!(error.code, "connection_jump_missing");
    }

}

use std::collections::HashMap;
use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::app_error::AppError;
use crate::commands::TerminalConnectRequest;
use crate::connections::{
    ConnectionAuthKind, ConnectionCredentialMode, ConnectionProfileInput, ConnectionProtocol,
};
use crate::ssh_config::{resolve_transient_connection, ResolvedSshConfig};
use crate::terminal::manager::TerminalManager;

#[derive(Clone, Default)]
pub struct TemporaryConnectionManager {
    entries: Arc<Mutex<HashMap<String, TemporaryConnectionEntry>>>,
}

#[derive(Clone)]
struct TemporaryConnectionEntry {
    owner_instance_id: String,
    host: String,
    port: u16,
    username: Option<String>,
    config: Option<ResolvedSshConfig>,
}

#[derive(Debug, Deserialize)]
pub struct TemporaryConnectionCreateRequest {
    pub owner_instance_id: String,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub username: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TemporaryConnectionCredentialsRequest {
    pub context_ref: String,
    pub username: String,
    pub auth_kind: ConnectionAuthKind,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub private_key_path: Option<String>,
    #[serde(default)]
    pub private_key_passphrase: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TemporaryConnectionTerminalConnectRequest {
    pub context_ref: String,
    #[serde(default)]
    pub request_id: Option<String>,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Deserialize)]
pub struct TemporaryConnectionReleaseRequest {
    pub context_ref: String,
}

impl TemporaryConnectionManager {
    async fn create(&self, request: TemporaryConnectionCreateRequest) -> Result<String, AppError> {
        let owner_instance_id = require_text(
            request.owner_instance_id,
            "temporary_connection_owner_missing",
            "临时连接缺少所属实例。",
        )?;
        let host = require_text(
            request.host,
            "temporary_connection_host_missing",
            "请填写 SSH 主机。",
        )?;
        if request.port == 0 {
            return Err(AppError::new(
                "temporary_connection_port_invalid",
                "SSH 端口无效。",
                "port is 0",
                true,
            ));
        }
        let username = request
            .username
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let context_ref = format!("temp-ssh-{}", Uuid::new_v4());
        self.entries.lock().await.insert(
            context_ref.clone(),
            TemporaryConnectionEntry {
                owner_instance_id,
                host,
                port: request.port,
                username,
                config: None,
            },
        );
        Ok(context_ref)
    }

    async fn entry(&self, context_ref: &str) -> Result<TemporaryConnectionEntry, AppError> {
        self.entries
            .lock()
            .await
            .get(context_ref.trim())
            .cloned()
            .ok_or_else(|| temporary_context_missing(context_ref))
    }

    async fn set_config(
        &self,
        context_ref: &str,
        username: String,
        config: ResolvedSshConfig,
    ) -> Result<(), AppError> {
        let mut entries = self.entries.lock().await;
        let entry = entries
            .get_mut(context_ref.trim())
            .ok_or_else(|| temporary_context_missing(context_ref))?;
        entry.username = Some(username);
        entry.config = Some(config);
        Ok(())
    }

    async fn resolve(&self, context_ref: &str) -> Result<ResolvedSshConfig, AppError> {
        self.entry(context_ref)
            .await?
            .config
            .ok_or_else(|| {
                AppError::new(
                    "credential_prompt_required",
                    "请输入本次连接凭据。",
                    format!("temporary_context_ref={}", context_ref.trim()),
                    true,
                )
            })
    }

    async fn release(&self, context_ref: &str) -> bool {
        self.entries.lock().await.remove(context_ref.trim()).is_some()
    }
}

#[tauri::command]
pub async fn temporary_connection_create(
    manager: State<'_, TemporaryConnectionManager>,
    request: TemporaryConnectionCreateRequest,
) -> Result<String, AppError> {
    manager.create(request).await
}

#[tauri::command]
pub async fn temporary_connection_set_credentials(
    app: AppHandle,
    manager: State<'_, TemporaryConnectionManager>,
    request: TemporaryConnectionCredentialsRequest,
) -> Result<(), AppError> {
    let entry = manager.entry(&request.context_ref).await?;
    let username = require_text(
        request.username,
        "terminal_username_missing",
        "请填写 SSH 用户名。",
    )?;
    let password = matches!(request.auth_kind, ConnectionAuthKind::Password)
        .then_some(request.password)
        .flatten();
    let private_key_path = matches!(request.auth_kind, ConnectionAuthKind::PrivateKey)
        .then_some(request.private_key_path)
        .flatten();
    let private_key_passphrase = matches!(request.auth_kind, ConnectionAuthKind::PrivateKey)
        .then_some(request.private_key_passphrase)
        .flatten();
    let mut config = resolve_transient_connection(
        &app,
        ConnectionProfileInput {
            id: None,
            source_connection_id: None,
            protocol: ConnectionProtocol::Ssh,
            name: Some(format!("{username}@{}", entry.host)),
            group: None,
            host: entry.host,
            port: entry.port,
            username: username.clone(),
            credential_mode: ConnectionCredentialMode::Inline,
            credential_id: None,
            inline_auth_kind: Some(request.auth_kind),
            inline_password: password,
            inline_password_touched: true,
            inline_private_key_path: private_key_path,
            inline_private_key_passphrase: private_key_passphrase,
            inline_private_key_passphrase_touched: true,
            prompt_auth_kind: None,
            proxy: Default::default(),
            jump: Default::default(),
            advanced: Default::default(),
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
        },
    )?;
    config.connection_id = request.context_ref.clone();
    manager
        .set_config(&request.context_ref, username, config)
        .await
}

#[tauri::command]
pub async fn temporary_connection_terminal_connect(
    app: AppHandle,
    terminal_manager: State<'_, TerminalManager>,
    manager: State<'_, TemporaryConnectionManager>,
    request: TemporaryConnectionTerminalConnectRequest,
) -> Result<String, AppError> {
    let config = manager.resolve(&request.context_ref).await?;
    terminal_manager
        .connect(
            app,
            TerminalConnectRequest {
                request_id: request.request_id,
                connection_id: None,
                host: config.host.clone(),
                port: config.port,
                username: config.username.clone(),
                auth_kind: Some(config.auth_kind.clone()),
                password: config.password.clone(),
                private_key_path: config.private_key_path.clone(),
                private_key_passphrase: config.private_key_passphrase.clone(),
                cols: request.cols,
                rows: request.rows,
                runtime_config: Some(config),
            },
        )
        .await
}

#[tauri::command]
pub async fn temporary_connection_release(
    manager: State<'_, TemporaryConnectionManager>,
    request: TemporaryConnectionReleaseRequest,
) -> Result<bool, AppError> {
    Ok(manager.release(&request.context_ref).await)
}

fn require_text(value: String, code: &str, message: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(code, message, "value is empty", true));
    }
    Ok(trimmed.to_string())
}

fn temporary_context_missing(context_ref: &str) -> AppError {
    AppError::new(
        "temporary_connection_missing",
        "临时连接已关闭或不存在。",
        format!("temporary_context_ref={}", context_ref.trim()),
        false,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn context_is_opaque_scoped_and_released() {
        let manager = TemporaryConnectionManager::default();
        let context_ref = manager
            .create(TemporaryConnectionCreateRequest {
                owner_instance_id: "workspace-item-1".to_string(),
                host: "example.com".to_string(),
                port: 22,
                username: Some("ops".to_string()),
            })
            .await
            .unwrap();

        assert!(context_ref.starts_with("temp-ssh-"));
        let entry = manager.entry(&context_ref).await.unwrap();
        assert_eq!(entry.owner_instance_id, "workspace-item-1");
        assert_eq!(entry.username.as_deref(), Some("ops"));
        assert!(entry.config.is_none());
        assert!(manager.release(&context_ref).await);
        assert!(manager.entry(&context_ref).await.is_err());
    }

    #[tokio::test]
    async fn context_rejects_blank_target() {
        let manager = TemporaryConnectionManager::default();
        let error = manager
            .create(TemporaryConnectionCreateRequest {
                owner_instance_id: "workspace-item-1".to_string(),
                host: " ".to_string(),
                port: 22,
                username: None,
            })
            .await
            .unwrap_err();
        assert_eq!(error.code, "temporary_connection_host_missing");
    }
}

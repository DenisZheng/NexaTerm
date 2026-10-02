use std::collections::HashMap;
use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::app_error::AppError;
use crate::commands::{connection_upsert, TerminalConnectRequest};
use crate::connections::{
    ConnectionAuthKind, ConnectionCredentialMode, ConnectionProfileInput, ConnectionProtocol,
};
use crate::ssh_config::{resolve_saved_connection, resolve_transient_connection, ResolvedSshConfig};
use crate::terminal::manager::TerminalManager;
use crate::remote_files::RemoteFileManager;

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
    saved_connection_id: Option<String>,
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

#[derive(Debug, Deserialize)]
pub struct TemporaryConnectionSaveRequest {
    pub context_ref: String,
    #[serde(default)]
    pub name: Option<String>,
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
                saved_connection_id: None,
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

    pub async fn resolve(&self, context_ref: &str) -> Result<ResolvedSshConfig, AppError> {
        self.resolve_reference(context_ref)
            .await?
            .ok_or_else(|| temporary_context_missing(context_ref))
    }

    pub async fn resolve_reference(
        &self,
        reference: &str,
    ) -> Result<Option<ResolvedSshConfig>, AppError> {
        let reference = reference.trim();
        let entry = {
            let entries = self.entries.lock().await;
            entries.get(reference).cloned().or_else(|| {
                entries
                    .values()
                    .find(|entry| entry.saved_connection_id.as_deref() == Some(reference))
                    .cloned()
            })
        };
        let Some(entry) = entry else {
            return if is_temporary_connection_ref(reference) {
                Err(temporary_context_missing(reference))
            } else {
                Ok(None)
            };
        };
        entry.config.map(Some).ok_or_else(|| {
            AppError::new(
                "credential_prompt_required",
                "请输入本次连接凭据。",
                format!("temporary_context_ref={reference}"),
                true,
            )
        })
    }

    async fn associate_saved(&self, context_ref: &str, connection_id: &str) -> bool {
        let mut entries = self.entries.lock().await;
        let Some(entry) = entries.get_mut(context_ref.trim()) else {
            return false;
        };
        entry.saved_connection_id = Some(connection_id.to_string());
        true
    }

    async fn release(&self, context_ref: &str) -> bool {
        self.entries.lock().await.remove(context_ref.trim()).is_some()
    }
}

pub async fn resolve_remote_connection_profile(
    app: &AppHandle,
    connection_id: &str,
) -> Result<ResolvedSshConfig, AppError> {
    let connection_id = connection_id.trim();
    if connection_id.is_empty() {
        return Err(AppError::new(
            "remote_file_connection_missing",
            "请选择活动连接。",
            "connection_id is empty",
            false,
        ));
    }
    if let Some(config) = app
        .state::<TemporaryConnectionManager>()
        .resolve_reference(connection_id)
        .await?
    {
        return Ok(config);
    }
    resolve_saved_connection(app, connection_id, None)
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
    let auth_kind = request.auth_kind.clone();
    let password = matches!(&auth_kind, ConnectionAuthKind::Password)
        .then_some(request.password)
        .flatten();
    let private_key_path = matches!(&auth_kind, ConnectionAuthKind::PrivateKey)
        .then_some(request.private_key_path)
        .flatten();
    let private_key_passphrase = matches!(&auth_kind, ConnectionAuthKind::PrivateKey)
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
        group_id: None,
            host: entry.host,
            port: entry.port,
            username: username.clone(),
            credential_mode: ConnectionCredentialMode::Inline,
            credential_id: None,
            inline_auth_kind: Some(auth_kind),
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
pub async fn temporary_connection_save(
    app: AppHandle,
    manager: State<'_, TemporaryConnectionManager>,
    request: TemporaryConnectionSaveRequest,
) -> Result<crate::connections::ConnectionProfile, AppError> {
    let config = manager.resolve(&request.context_ref).await?;
    let profile = connection_upsert(app.clone(), saved_profile_input(&config, request.name)).await?;
    manager.associate_saved(&request.context_ref, &profile.id).await;
    Ok(profile)
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
    remote_file_manager: State<'_, RemoteFileManager>,
    request: TemporaryConnectionReleaseRequest,
) -> Result<bool, AppError> {
    remote_file_manager
        .invalidate_connection(&request.context_ref)
        .await;
    Ok(manager.release(&request.context_ref).await)
}

fn require_text(value: String, code: &str, message: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(code, message, "value is empty", true));
    }
    Ok(trimmed.to_string())
}

fn saved_profile_input(config: &ResolvedSshConfig, name: Option<String>) -> ConnectionProfileInput {
    ConnectionProfileInput {
        id: None,
        source_connection_id: None,
        protocol: ConnectionProtocol::Ssh,
        name: name.and_then(|value| {
            let value = value.trim().to_string();
            (!value.is_empty()).then_some(value)
        }),
        group: None,
        group_id: None,
        host: config.host.clone(),
        port: config.port,
        username: config.username.clone(),
        credential_mode: ConnectionCredentialMode::Prompt,
        credential_id: None,
        inline_auth_kind: None,
        inline_password: None,
        inline_password_touched: false,
        inline_private_key_path: None,
        inline_private_key_passphrase: None,
        inline_private_key_passphrase_touched: false,
        prompt_auth_kind: Some(config.auth_kind.clone()),
        proxy: config.proxy.clone(),
        jump: config.jump.clone(),
        advanced: config.advanced.clone(),
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
    }
}

pub fn is_temporary_connection_ref(value: &str) -> bool {
    value.trim().starts_with("temp-ssh-")
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

    #[test]
    fn temporary_ref_detection_is_explicit() {
        assert!(is_temporary_connection_ref("temp-ssh-123"));
        assert!(!is_temporary_connection_ref("saved-connection-id"));
        assert!(!is_temporary_connection_ref(""));
    }

    #[tokio::test]
    async fn resolved_context_is_reusable_by_other_consumers() {
        let manager = TemporaryConnectionManager::default();
        let context_ref = manager
            .create(TemporaryConnectionCreateRequest {
                owner_instance_id: "workspace-item-2".to_string(),
                host: "example.com".to_string(),
                port: 22,
                username: Some("ops".to_string()),
            })
            .await
            .unwrap();
        let config = ResolvedSshConfig {
            connection_id: context_ref.clone(),
            host: "example.com".to_string(),
            port: 22,
            username: "ops".to_string(),
            auth_kind: ConnectionAuthKind::Password,
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            proxy: Default::default(),
            jump: Default::default(),
            advanced: Default::default(),
        };
        manager
            .set_config(&context_ref, "ops".to_string(), config)
            .await
            .unwrap();

        let resolved = manager.resolve(&context_ref).await.unwrap();
        assert_eq!(resolved.connection_id, context_ref);
        assert_eq!(resolved.host, "example.com");
        assert_eq!(resolved.username, "ops");
    }

    #[test]
    fn save_projection_keeps_credentials_ephemeral() {
        let config = ResolvedSshConfig {
            connection_id: "temp-ssh-1".to_string(),
            host: "example.com".to_string(),
            port: 22,
            username: "ops".to_string(),
            auth_kind: ConnectionAuthKind::Password,
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            proxy: Default::default(),
            jump: Default::default(),
            advanced: Default::default(),
        };
        let input = saved_profile_input(&config, Some("Example".to_string()));
        assert_eq!(input.credential_mode, ConnectionCredentialMode::Prompt);
        assert_eq!(input.prompt_auth_kind, Some(ConnectionAuthKind::Password));
        assert_eq!(input.inline_password, None);
        assert_eq!(input.password, None);
    }

    #[tokio::test]
    async fn saved_alias_reuses_runtime_context_until_release() {
        let manager = TemporaryConnectionManager::default();
        let context_ref = manager
            .create(TemporaryConnectionCreateRequest {
                owner_instance_id: "workspace-item-3".to_string(),
                host: "example.com".to_string(),
                port: 22,
                username: Some("ops".to_string()),
            })
            .await
            .unwrap();
        let config = ResolvedSshConfig {
            connection_id: context_ref.clone(),
            host: "example.com".to_string(),
            port: 22,
            username: "ops".to_string(),
            auth_kind: ConnectionAuthKind::Password,
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            proxy: Default::default(),
            jump: Default::default(),
            advanced: Default::default(),
        };
        manager.set_config(&context_ref, "ops".to_string(), config).await.unwrap();
        assert!(manager.associate_saved(&context_ref, "saved-1").await);
        assert_eq!(
            manager.resolve_reference("saved-1").await.unwrap().unwrap().connection_id,
            context_ref
        );
        assert!(manager.release(&context_ref).await);
        assert!(manager.resolve_reference("saved-1").await.unwrap().is_none());
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

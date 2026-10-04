use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::app_error::AppError;
use crate::storage_repository::StorageRepository;

const MAX_WORKSPACE_SNAPSHOT_BYTES: usize = 512 * 1024;
const MAX_WORKSPACE_SNAPSHOT_DEPTH: usize = 24;

#[derive(Clone, Debug, Serialize)]
pub struct WorkspaceSnapshotEnvelope {
    pub current: Option<Value>,
    pub backup: Option<Value>,
}

#[tauri::command]
pub fn workspace_snapshot_load(app: AppHandle) -> Result<WorkspaceSnapshotEnvelope, AppError> {
    let repository = StorageRepository::open_app(&app)?;
    let (current, backup) = repository.workspace_snapshot_get()?;
    Ok(WorkspaceSnapshotEnvelope { current, backup })
}

#[tauri::command]
pub fn workspace_snapshot_save(app: AppHandle, snapshot: Value) -> Result<(), AppError> {
    validate_workspace_snapshot_value(&snapshot)?;
    StorageRepository::open_app(&app)?.workspace_snapshot_save(&snapshot, &now_timestamp())
}

#[tauri::command]
pub fn workspace_snapshot_clear(app: AppHandle) -> Result<(), AppError> {
    StorageRepository::open_app(&app)?.workspace_snapshot_clear()
}

fn validate_workspace_snapshot_value(value: &Value) -> Result<(), AppError> {
    if !value.is_object() {
        return Err(snapshot_rejected("workspace snapshot root must be an object"));
    }
    let size = serde_json::to_vec(value)
        .map_err(|error| AppError::new("workspace_snapshot_serialize_failed", "工作区快照序列化失败。", error, true))?
        .len();
    if size > MAX_WORKSPACE_SNAPSHOT_BYTES {
        return Err(snapshot_rejected(format!(
            "workspace snapshot exceeds {MAX_WORKSPACE_SNAPSHOT_BYTES} bytes"
        )));
    }
    reject_sensitive_keys(value, 0)
}

fn reject_sensitive_keys(value: &Value, depth: usize) -> Result<(), AppError> {
    if depth > MAX_WORKSPACE_SNAPSHOT_DEPTH {
        return Err(snapshot_rejected("workspace snapshot nesting is too deep"));
    }
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let normalized = key
                    .chars()
                    .filter(|ch| ch.is_ascii_alphanumeric())
                    .flat_map(char::to_lowercase)
                    .collect::<String>();
                if is_sensitive_key(&normalized) {
                    return Err(snapshot_rejected(format!(
                        "workspace snapshot contains forbidden field: {key}"
                    )));
                }
                reject_sensitive_keys(child, depth + 1)?;
            }
        }
        Value::Array(items) => {
            for item in items {
                reject_sensitive_keys(item, depth + 1)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn is_sensitive_key(key: &str) -> bool {
    matches!(
        key,
        "password"
            | "passphrase"
            | "privatekey"
            | "privatekeypassphrase"
            | "sessionid"
            | "x11cookie"
            | "runtimecredentials"
            | "broadcaststate"
            | "secret"
            | "token"
    )
}

fn snapshot_rejected(detail: impl ToString) -> AppError {
    AppError::new(
        "workspace_snapshot_rejected",
        "工作区快照包含不可持久化的数据。",
        detail,
        true,
    )
}

fn now_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::validate_workspace_snapshot_value;

    #[test]
    fn accepts_non_sensitive_workspace_shape() {
        validate_workspace_snapshot_value(&json!({
            "version": 1,
            "instances": [{"id": "ssh:a", "target": {"kind": "profile", "profileId": "a"}}],
            "files": {"directories": {"ssh:a": "/srv/app"}}
        }))
        .unwrap();
    }

    #[test]
    fn rejects_runtime_and_secret_fields_recursively() {
        for key in ["password", "sessionId", "private_key", "x11Cookie", "runtime_credentials", "broadcastState", "token"] {
            let mut nested = serde_json::Map::new();
            nested.insert(key.to_string(), json!("forbidden"));
            let value = json!({"version": 1, "nested": nested});
            assert_eq!(
                validate_workspace_snapshot_value(&value).unwrap_err().code,
                "workspace_snapshot_rejected"
            );
        }
    }

    #[test]
    fn workspace_snapshot_survives_repository_reopen_and_rotates_backup_for_a14() {
        use std::sync::Arc;

        use crate::storage_repository::StorageRepository;
        use crate::storage_vault::{InMemorySecretStore, SecretStore};

        let root = std::env::temp_dir().join(format!(
            "nexaterm-wf07-a14-restart-{}",
            uuid::Uuid::new_v4()
        ));
        let db_path = root.join("mxterm.db");
        let secrets: Arc<dyn SecretStore> = Arc::new(InMemorySecretStore::default());
        let repo = StorageRepository::open(db_path.clone(), Arc::clone(&secrets)).unwrap();

        let first = json!({
            "version": 1,
            "activeItemId": "split",
            "instances": [
                {"id": "ssh:ssh-a", "kind": "ssh", "ordinal": 0, "target": {"kind": "profile", "profileId": "ssh-a"}},
                {"id": "local:wsl-a", "kind": "local", "ordinal": 0, "source": "local", "target": {"kind": "profile", "profileId": "wsl-a"}}
            ],
            "order": ["ssh:ssh-a", "local:wsl-a"],
            "panes": null,
            "files": {"directories": {"ssh:ssh-a": "/srv/a"}, "followActivePane": true},
            "sidebar": {"collapsed": false, "view": "files"}
        });
        let second = json!({
            "version": 1,
            "activeItemId": "split",
            "instances": [
                {"id": "ssh:ssh-a", "kind": "ssh", "ordinal": 0, "target": {"kind": "profile", "profileId": "ssh-a"}},
                {"id": "ssh:ssh-broken", "kind": "ssh", "ordinal": 1, "target": {"kind": "profile", "profileId": "deleted-profile"}},
                {"id": "local:wsl-a", "kind": "local", "ordinal": 0, "source": "local", "target": {"kind": "profile", "profileId": "wsl-a"}}
            ],
            "order": ["ssh:ssh-a", "ssh:ssh-broken", "local:wsl-a"],
            "panes": null,
            "files": {"directories": {"ssh:ssh-a": "/srv/a"}, "followActivePane": true},
            "sidebar": {"collapsed": false, "view": "files"}
        });

        repo.workspace_snapshot_save(&first, "2026-10-04T01:00:00Z").unwrap();
        repo.workspace_snapshot_save(&second, "2026-10-04T01:00:01Z").unwrap();
        drop(repo);

        let reopened = StorageRepository::open(db_path.clone(), secrets).unwrap();
        let (current, backup) = reopened.workspace_snapshot_get().unwrap();

        assert_eq!(current, Some(second));
        assert_eq!(backup, Some(first));

        drop(reopened);
        let _ = std::fs::remove_dir_all(root);
    }

}

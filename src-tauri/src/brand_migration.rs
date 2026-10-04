use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::app_error::AppError;

pub const LEGACY_APP_IDENTIFIER: &str = "com.mxterm.app";
pub const CURRENT_APP_IDENTIFIER: &str = "com.nexaterm.app";
const MIGRATION_MARKER_FILE: &str = ".nexaterm-brand-migration.json";

const LEGACY_PAYLOAD_FILES: &[&str] = &[
    "mxterm.db",
    "mxterm.db-wal",
    "mxterm.db-shm",
    "connections.json",
    "connections.json.migrated.bak",
    "credentials.json",
    "credentials.json.migrated.bak",
    "known_hosts.json",
    "known_hosts.json.migrated.bak",
    "tunnels.json",
    "tunnels.json.migrated.bak",
    "secrets.enc",
    "secrets.enc.bak",
    "secrets.local.key",
    ".data-version",
];

const USER_DATA_TABLES: &[&str] = &[
    "connection_groups",
    "connections",
    "credentials",
    "known_hosts",
    "tunnels",
    "command_snippets",
    "command_history",
    "workspace_snapshots",
    "app_settings",
    "ai_chat_sessions",
];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAppDataMigrationPreview {
    pub available: bool,
    pub blocked: bool,
    pub current_root: String,
    pub legacy_root: Option<String>,
    pub legacy_identifier: &'static str,
    pub current_identifier: &'static str,
    pub files: Vec<String>,
    pub reason: Option<String>,
    pub target_has_user_data: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAppDataMigrationResult {
    pub migrated_files: Vec<String>,
    pub backup_root: Option<String>,
    pub legacy_root: String,
    pub current_root: String,
    pub restart_required: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAppDataRollbackResult {
    pub restored_backup: bool,
    pub preserved_migrated_root: String,
    pub restart_required: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct MigrationMarker {
    legacy_root: String,
    backup_root: Option<String>,
}

#[tauri::command]
pub fn legacy_app_data_migration_preview(
    app: tauri::AppHandle,
) -> Result<LegacyAppDataMigrationPreview, AppError> {
    let current_root = current_app_data_root(&app)?;
    preview_for_root(&current_root)
}

#[tauri::command]
pub fn legacy_app_data_migration_apply(
    app: tauri::AppHandle,
) -> Result<LegacyAppDataMigrationResult, AppError> {
    let current_root = current_app_data_root(&app)?;
    apply_for_root(&current_root)
}

#[tauri::command]
pub fn legacy_app_data_migration_rollback(
    app: tauri::AppHandle,
) -> Result<LegacyAppDataRollbackResult, AppError> {
    let current_root = current_app_data_root(&app)?;
    rollback_for_root(&current_root)
}

fn current_app_data_root(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    app.path().app_data_dir().map_err(|error| {
        AppError::new(
            "brand_migration_path_failed",
            "无法定位 NexaTerm 数据目录。",
            error,
            true,
        )
    })
}

fn legacy_root_from_current(current_root: &Path) -> Option<PathBuf> {
    if current_root.file_name()?.to_string_lossy() != CURRENT_APP_IDENTIFIER {
        return None;
    }
    Some(current_root.parent()?.join(LEGACY_APP_IDENTIFIER))
}

fn preview_for_root(current_root: &Path) -> Result<LegacyAppDataMigrationPreview, AppError> {
    let current_root_text = current_root.to_string_lossy().to_string();
    let Some(legacy_root) = legacy_root_from_current(current_root) else {
        return Ok(LegacyAppDataMigrationPreview {
            available: false,
            blocked: false,
            current_root: current_root_text,
            legacy_root: None,
            legacy_identifier: LEGACY_APP_IDENTIFIER,
            current_identifier: CURRENT_APP_IDENTIFIER,
            files: Vec::new(),
            reason: Some("custom-app-data-root".to_string()),
            target_has_user_data: false,
        });
    };

    let files = existing_payload_files(&legacy_root);
    let available = !files.is_empty();
    let target_has_user_data = target_has_user_data(current_root)?;
    let blocked = available && target_has_user_data;
    let reason = if !available {
        Some("legacy-data-not-found".to_string())
    } else if blocked {
        Some("nexaterm-data-already-exists".to_string())
    } else {
        None
    };

    Ok(LegacyAppDataMigrationPreview {
        available,
        blocked,
        current_root: current_root_text,
        legacy_root: Some(legacy_root.to_string_lossy().to_string()),
        legacy_identifier: LEGACY_APP_IDENTIFIER,
        current_identifier: CURRENT_APP_IDENTIFIER,
        files,
        reason,
        target_has_user_data,
    })
}

fn existing_payload_files(root: &Path) -> Vec<String> {
    LEGACY_PAYLOAD_FILES
        .iter()
        .filter(|name| root.join(name).is_file())
        .map(|name| (*name).to_string())
        .collect()
}

fn target_has_user_data(root: &Path) -> Result<bool, AppError> {
    for name in [
        "connections.json",
        "credentials.json",
        "known_hosts.json",
        "tunnels.json",
        "secrets.enc",
    ] {
        if root.join(name).is_file() {
            return Ok(true);
        }
    }

    let db_path = root.join("mxterm.db");
    if !db_path.is_file() {
        return Ok(false);
    }

    let connection = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| migration_error("brand_migration_target_inspect_failed", "无法检查现有 NexaTerm 数据。", error))?;

    for table in USER_DATA_TABLES {
        if !sqlite_table_exists(&connection, table)? {
            continue;
        }
        let sql = format!("SELECT EXISTS(SELECT 1 FROM {table} LIMIT 1)");
        let exists = connection
            .query_row(&sql, [], |row| row.get::<_, i64>(0))
            .map_err(|error| migration_error("brand_migration_target_inspect_failed", "无法检查现有 NexaTerm 数据。", error))?;
        if exists == 1 {
            return Ok(true);
        }
    }
    Ok(false)
}

fn sqlite_table_exists(connection: &Connection, table: &str) -> Result<bool, AppError> {
    let exists = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            [table],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| migration_error("brand_migration_target_inspect_failed", "无法检查 SQLite 表。", error))?;
    Ok(exists == 1)
}

fn apply_for_root(current_root: &Path) -> Result<LegacyAppDataMigrationResult, AppError> {
    let preview = preview_for_root(current_root)?;
    if !preview.available {
        return Err(AppError::new(
            "brand_migration_source_missing",
            "未发现可迁移的 mXterm 数据。",
            preview.reason.unwrap_or_else(|| "legacy data missing".to_string()),
            false,
        ));
    }
    if preview.blocked {
        return Err(AppError::new(
            "brand_migration_target_not_empty",
            "NexaTerm 已存在用户数据，为避免覆盖已停止迁移。",
            "export or back up current NexaTerm data before migrating legacy mXterm data",
            false,
        ));
    }

    let legacy_root = PathBuf::from(
        preview
            .legacy_root
            .clone()
            .ok_or_else(|| AppError::new(
                "brand_migration_source_missing",
                "未发现可迁移的 mXterm 数据。",
                "legacy root missing",
                false,
            ))?,
    );
    let parent = current_root.parent().ok_or_else(|| {
        AppError::new(
            "brand_migration_path_failed",
            "NexaTerm 数据目录没有可用父目录。",
            current_root.display(),
            false,
        )
    })?;
    fs::create_dir_all(parent).map_err(|error| {
        AppError::new(
            "brand_migration_stage_failed",
            "无法创建迁移工作目录。",
            error,
            true,
        )
    })?;

    let token = uuid::Uuid::new_v4().to_string();
    let stage_root = parent.join(format!(".nexaterm-brand-migration-stage-{token}"));
    let backup_root = parent.join(format!(".nexaterm-pre-migration-{token}"));
    fs::create_dir(&stage_root).map_err(|error| {
        AppError::new(
            "brand_migration_stage_failed",
            "无法创建迁移暂存目录。",
            error,
            true,
        )
    })?;

    let migration_result = (|| -> Result<Vec<String>, AppError> {
        let copied = copy_legacy_payload(&legacy_root, &stage_root)?;
        validate_staged_database(&stage_root)?;
        Ok(copied)
    })();

    let copied = match migration_result {
        Ok(copied) => copied,
        Err(error) => {
            let _ = fs::remove_dir_all(&stage_root);
            return Err(error);
        }
    };

    let had_current_root = current_root.exists();
    if had_current_root {
        fs::rename(current_root, &backup_root).map_err(|error| {
            let _ = fs::remove_dir_all(&stage_root);
            AppError::new(
                "brand_migration_backup_failed",
                "无法备份当前 NexaTerm 数据目录，未执行迁移。",
                error,
                true,
            )
        })?;
    }

    if let Err(error) = fs::rename(&stage_root, current_root) {
        if had_current_root {
            let _ = fs::rename(&backup_root, current_root);
        }
        let _ = fs::remove_dir_all(&stage_root);
        return Err(AppError::new(
            "brand_migration_replace_failed",
            "无法切换到迁移后的数据目录，已尝试恢复原数据。",
            error,
            true,
        ));
    }

    let marker = MigrationMarker {
        legacy_root: legacy_root.to_string_lossy().to_string(),
        backup_root: had_current_root.then(|| backup_root.to_string_lossy().to_string()),
    };
    if let Err(error) = write_marker(current_root, &marker) {
        let failed_root = parent.join(format!(".nexaterm-brand-migration-failed-{token}"));
        let _ = fs::rename(current_root, &failed_root);
        if had_current_root {
            let _ = fs::rename(&backup_root, current_root);
        } else {
            let _ = fs::create_dir_all(current_root);
        }
        return Err(error);
    }

    Ok(LegacyAppDataMigrationResult {
        migrated_files: copied,
        backup_root: marker.backup_root,
        legacy_root: marker.legacy_root,
        current_root: current_root.to_string_lossy().to_string(),
        restart_required: true,
    })
}

fn copy_legacy_payload(source: &Path, stage: &Path) -> Result<Vec<String>, AppError> {
    let mut copied = Vec::new();
    for name in LEGACY_PAYLOAD_FILES {
        let source_path = source.join(name);
        if !source_path.is_file() {
            continue;
        }
        fs::copy(&source_path, stage.join(name)).map_err(|error| {
            AppError::new(
                "brand_migration_copy_failed",
                "复制 mXterm 数据失败，原数据未修改。",
                format!("{}: {error}", source_path.display()),
                true,
            )
        })?;
        copied.push((*name).to_string());
    }
    Ok(copied)
}

fn validate_staged_database(stage: &Path) -> Result<(), AppError> {
    let db_path = stage.join("mxterm.db");
    if !db_path.is_file() {
        return Ok(());
    }
    let connection = Connection::open(&db_path).map_err(|error| {
        migration_error(
            "brand_migration_database_invalid",
            "迁移后的 SQLite 数据库无法打开。",
            error,
        )
    })?;
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|error| migration_error("brand_migration_database_invalid", "迁移后的 SQLite WAL 无法合并。", error))?;
    let integrity = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .map_err(|error| migration_error("brand_migration_database_invalid", "迁移后的 SQLite 完整性检查失败。", error))?;
    if integrity != "ok" {
        return Err(AppError::new(
            "brand_migration_database_invalid",
            "迁移后的 SQLite 完整性检查失败。",
            integrity,
            false,
        ));
    }
    drop(connection);
    let _ = fs::remove_file(stage.join("mxterm.db-wal"));
    let _ = fs::remove_file(stage.join("mxterm.db-shm"));
    Ok(())
}

fn write_marker(root: &Path, marker: &MigrationMarker) -> Result<(), AppError> {
    let value = serde_json::to_vec_pretty(marker).map_err(|error| {
        AppError::new(
            "brand_migration_marker_failed",
            "无法记录迁移回滚信息。",
            error,
            true,
        )
    })?;
    fs::write(root.join(MIGRATION_MARKER_FILE), value).map_err(|error| {
        AppError::new(
            "brand_migration_marker_failed",
            "无法记录迁移回滚信息。",
            error,
            true,
        )
    })
}

fn rollback_for_root(current_root: &Path) -> Result<LegacyAppDataRollbackResult, AppError> {
    let marker_path = current_root.join(MIGRATION_MARKER_FILE);
    let marker_bytes = fs::read(&marker_path).map_err(|error| {
        AppError::new(
            "brand_migration_rollback_unavailable",
            "没有可用的品牌迁移回滚记录。",
            error,
            false,
        )
    })?;
    let marker: MigrationMarker = serde_json::from_slice(&marker_bytes).map_err(|error| {
        AppError::new(
            "brand_migration_rollback_unavailable",
            "品牌迁移回滚记录损坏。",
            error,
            false,
        )
    })?;

    let parent = current_root.parent().ok_or_else(|| {
        AppError::new(
            "brand_migration_path_failed",
            "NexaTerm 数据目录没有可用父目录。",
            current_root.display(),
            false,
        )
    })?;
    let preserved = parent.join(format!(
        ".nexaterm-migrated-data-rolled-back-{}",
        uuid::Uuid::new_v4()
    ));
    fs::rename(current_root, &preserved).map_err(|error| {
        AppError::new(
            "brand_migration_rollback_failed",
            "无法保存迁移后的 NexaTerm 数据。",
            error,
            true,
        )
    })?;

    let restored_backup = if let Some(backup_root) = marker.backup_root {
        let backup_root = PathBuf::from(backup_root);
        if let Err(error) = fs::rename(&backup_root, current_root) {
            let _ = fs::rename(&preserved, current_root);
            return Err(AppError::new(
                "brand_migration_rollback_failed",
                "无法恢复迁移前的 NexaTerm 数据。",
                error,
                true,
            ));
        }
        true
    } else {
        fs::create_dir_all(current_root).map_err(|error| {
            let _ = fs::rename(&preserved, current_root);
            AppError::new(
                "brand_migration_rollback_failed",
                "无法恢复空的 NexaTerm 数据目录。",
                error,
                true,
            )
        })?;
        false
    };

    Ok(LegacyAppDataRollbackResult {
        restored_backup,
        preserved_migrated_root: preserved.to_string_lossy().to_string(),
        restart_required: true,
    })
}

fn migration_error(
    code: &'static str,
    message: &'static str,
    error: rusqlite::Error,
) -> AppError {
    AppError::new(code, message, error, true)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use rusqlite::Connection;

    use super::{
        apply_for_root, legacy_root_from_current, preview_for_root, rollback_for_root,
        CURRENT_APP_IDENTIFIER, LEGACY_APP_IDENTIFIER, MIGRATION_MARKER_FILE,
    };

    fn roots(name: &str) -> (std::path::PathBuf, std::path::PathBuf, std::path::PathBuf) {
        let parent = std::env::temp_dir().join(format!(
            "nexaterm-brand-migration-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        let legacy = parent.join(LEGACY_APP_IDENTIFIER);
        let current = parent.join(CURRENT_APP_IDENTIFIER);
        fs::create_dir_all(&legacy).unwrap();
        (parent, legacy, current)
    }

    #[test]
    fn derives_historical_mxterm_sibling_from_nexaterm_identifier() {
        let current = std::path::PathBuf::from("/tmp/data").join(CURRENT_APP_IDENTIFIER);
        assert_eq!(
            legacy_root_from_current(&current).unwrap(),
            std::path::PathBuf::from("/tmp/data").join(LEGACY_APP_IDENTIFIER)
        );
        assert!(legacy_root_from_current(std::path::Path::new("/tmp/custom")).is_none());
    }

    #[test]
    fn preview_offers_legacy_data_only_when_target_is_empty() {
        let (parent, legacy, current) = roots("preview");
        fs::write(legacy.join("connections.json"), "{}").unwrap();

        let preview = preview_for_root(&current).unwrap();
        assert!(preview.available);
        assert!(!preview.blocked);
        assert_eq!(preview.files, vec!["connections.json"]);

        fs::create_dir_all(&current).unwrap();
        let db = Connection::open(current.join("mxterm.db")).unwrap();
        db.execute_batch("CREATE TABLE connections(id TEXT); INSERT INTO connections VALUES ('nexa');")
            .unwrap();
        drop(db);

        let blocked = preview_for_root(&current).unwrap();
        assert!(blocked.available);
        assert!(blocked.blocked);
        assert!(blocked.target_has_user_data);

        let _ = fs::remove_dir_all(parent);
    }

    #[test]
    fn apply_preserves_legacy_root_and_can_restore_bootstrap_target() {
        let (parent, legacy, current) = roots("apply");
        let legacy_db = Connection::open(legacy.join("mxterm.db")).unwrap();
        legacy_db
            .execute_batch("CREATE TABLE connections(id TEXT); INSERT INTO connections VALUES ('legacy');")
            .unwrap();
        drop(legacy_db);
        fs::write(legacy.join("secrets.enc"), b"vault").unwrap();
        fs::write(legacy.join("secrets.local.key"), b"local-key").unwrap();

        fs::create_dir_all(&current).unwrap();
        let bootstrap = Connection::open(current.join("mxterm.db")).unwrap();
        bootstrap
            .execute_batch("CREATE TABLE schema_migrations(version INTEGER);")
            .unwrap();
        drop(bootstrap);
        fs::write(current.join(".data-version"), "2\n").unwrap();

        let result = apply_for_root(&current).unwrap();
        assert!(result.restart_required);
        assert!(legacy.join("mxterm.db").exists());
        assert!(current.join("mxterm.db").exists());
        assert!(current.join("secrets.enc").exists());
        assert!(current.join(MIGRATION_MARKER_FILE).exists());
        assert!(result.backup_root.as_ref().is_some_and(|path| std::path::Path::new(path).exists()));

        let migrated = Connection::open(current.join("mxterm.db")).unwrap();
        let id: String = migrated
            .query_row("SELECT id FROM connections", [], |row| row.get(0))
            .unwrap();
        assert_eq!(id, "legacy");
        drop(migrated);

        let rollback = rollback_for_root(&current).unwrap();
        assert!(rollback.restored_backup);
        assert!(current.join(".data-version").exists());
        assert!(std::path::Path::new(&rollback.preserved_migrated_root).exists());

        let _ = fs::remove_dir_all(parent);
    }

    #[test]
    fn apply_refuses_to_overwrite_existing_nexaterm_user_data() {
        let (parent, legacy, current) = roots("no-overwrite");
        fs::write(legacy.join("connections.json"), "{}").unwrap();
        fs::create_dir_all(&current).unwrap();
        let db = Connection::open(current.join("mxterm.db")).unwrap();
        db.execute_batch("CREATE TABLE connections(id TEXT); INSERT INTO connections VALUES ('current');")
            .unwrap();
        drop(db);

        let error = apply_for_root(&current).unwrap_err();
        assert_eq!(error.code, "brand_migration_target_not_empty");
        assert!(legacy.join("connections.json").exists());

        let db = Connection::open(current.join("mxterm.db")).unwrap();
        let id: String = db.query_row("SELECT id FROM connections", [], |row| row.get(0)).unwrap();
        assert_eq!(id, "current");

        let _ = fs::remove_dir_all(parent);
    }
}

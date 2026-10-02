//! v2 平面组升级为 v3 树；仅迁移连接短暂关闭 FK，失败必须恢复。
use rusqlite::{Connection, OptionalExtension};

use crate::app_error::AppError;

pub(crate) fn reject_newer_schema(db: &Connection) -> Result<(), AppError> {
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='schema_migrations')",
            [],
            |r| r.get(0),
        )
        .map_err(migration_error)?;
    if exists {
        let version: Option<i64> = db
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |r| {
                r.get(0)
            })
            .map_err(migration_error)?;
        if version.unwrap_or(0) > crate::storage_sqlite::SQLITE_SCHEMA_VERSION {
            return Err(migration_error("数据库版本较新，请升级应用后重试"));
        }
    }
    Ok(())
}

fn has_tree(db: &Connection) -> Result<bool, AppError> {
    db.query_row(
        "SELECT 1 FROM pragma_table_info('connection_groups') WHERE name='parent_id'",
        [],
        |_| Ok(true),
    )
    .optional()
    .map(|v| v.unwrap_or(false))
    .map_err(migration_error)
}

pub(crate) fn migrate(db: &Connection) -> Result<(), AppError> {
    if has_tree(db)? {
        return Ok(());
    }
    // VACUUM INTO 包含 WAL 中已提交内容，不能使用 fs::copy 只复制主数据库。
    let existing: bool = db
        .query_row("SELECT EXISTS(SELECT 1 FROM schema_migrations)", [], |r| {
            r.get(0)
        })
        .map_err(migration_error)?;
    if existing {
        if let Some(path) = db.path().filter(|p| !p.is_empty()) {
            let backup = format!("{path}.wf04a-v2-{}.bak", uuid::Uuid::new_v4());
            db.execute("VACUUM INTO ?1", [&backup])
                .map_err(migration_error)?;
        }
    }
    db.execute_batch("PRAGMA foreign_keys=OFF;")
        .map_err(migration_error)?;
    let result = (|| {
        let tx = db.unchecked_transaction().map_err(migration_error)?;
        // 抢占写锁后再检查：多个 repository 同时启动只迁移一次。
        tx.execute("UPDATE schema_migrations SET version=version WHERE 0", [])
            .map_err(migration_error)?;
        if !has_tree(&tx)? {
            tx.execute_batch(SCHEMA).map_err(migration_error)?;
            let broken: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM pragma_foreign_key_check)",
                    [],
                    |r| r.get(0),
                )
                .map_err(migration_error)?;
            if broken {
                return Err(migration_error("分组迁移后的外键校验失败"));
            }
        }
        tx.commit().map_err(migration_error)
    })();
    let restore = db
        .execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(migration_error);
    restore?;
    result
}

const SCHEMA: &str = r#"
CREATE TABLE connection_groups_v3 (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 parent_id TEXT REFERENCES connection_groups_v3(id) ON DELETE CASCADE,
 color TEXT NOT NULL DEFAULT '#64748b',
 CHECK(parent_id IS NULL OR parent_id<>id)
);
INSERT INTO connection_groups_v3(id,name,sort_order,created_at,updated_at)
 SELECT id,name,sort_order,created_at,updated_at FROM connection_groups;
DROP TABLE connection_groups;
ALTER TABLE connection_groups_v3 RENAME TO connection_groups;
CREATE UNIQUE INDEX connection_groups_root_name ON connection_groups(name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX connection_groups_sibling_name ON connection_groups(parent_id,name) WHERE parent_id IS NOT NULL;
CREATE TRIGGER connection_groups_cycle_insert BEFORE INSERT ON connection_groups
WHEN NEW.parent_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'connection_group_cycle') WHERE NEW.id IN (
  WITH RECURSIVE ancestors(id) AS (
   SELECT NEW.parent_id UNION SELECT g.parent_id FROM connection_groups g JOIN ancestors a ON g.id=a.id WHERE g.parent_id IS NOT NULL
  ) SELECT id FROM ancestors
 );
END;
CREATE TRIGGER connection_groups_cycle_update BEFORE UPDATE OF parent_id ON connection_groups
WHEN NEW.parent_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'connection_group_cycle') WHERE NEW.id IN (
  WITH RECURSIVE ancestors(id) AS (
   SELECT NEW.parent_id UNION SELECT g.parent_id FROM connection_groups g JOIN ancestors a ON g.id=a.id WHERE g.parent_id IS NOT NULL
  ) SELECT id FROM ancestors
 );
END;
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(3,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
"#;

fn migration_error(error: impl ToString) -> AppError {
    AppError::new(
        "connection_group_migration_failed",
        "会话分组迁移失败，原数据已保留。",
        error,
        false,
    )
}

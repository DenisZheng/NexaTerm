use super::*;
use crate::{storage_sqlite::SqliteStore, storage_vault::InMemorySecretStore};
use std::sync::Arc;

fn repo() -> (StorageRepository, std::path::PathBuf) {
    let path = std::env::temp_dir().join(format!("wf04a-{}.db", uuid::Uuid::new_v4()));
    (
        StorageRepository::open(&path, Arc::new(InMemorySecretStore::default())).unwrap(),
        path,
    )
}
fn input(id: Option<&str>, name: &str, parent: Option<&str>) -> GroupInput {
    GroupInput {
        id: id.map(str::to_owned),
        name: name.into(),
        parent_id: parent.map(str::to_owned),
        color: "#64748b".into(),
    }
}
fn create(repo: &StorageRepository, name: &str, parent: Option<&str>) -> ConnectionGroup {
    repo.save_connection_group(&input(None, name, parent), "2026-10-02T00:00:00Z")
        .unwrap()
}
fn connection(repo: &StorageRepository, group: &str) {
    repo.sqlite_connection().execute("INSERT INTO connections(id,name,host,port,username,credential_mode,proxy_json,jump_json,advanced_json,created_at,updated_at,group_id)
      VALUES('profile','profile','example.invalid',22,'test','prompt','{}','{}','{}','t','t',?1)",[group]).unwrap();
}

#[test]
fn tree_names_moves_and_restart_keep_identity() {
    let (repo, path) = repo();
    let prod = create(&repo, "Production", None);
    let dev = create(&repo, "Development", None);
    let linux = create(&repo, "Linux", Some(&prod.id));
    create(&repo, "Linux", Some(&dev.id));
    assert_eq!(
        repo.save_connection_group(&input(None, " Linux ", Some(&prod.id)), "t")
            .unwrap_err()
            .code,
        "connection_group_name_conflict"
    );
    assert_eq!(
        repo.save_connection_group(&input(None, "Production", None), "t")
            .unwrap_err()
            .code,
        "connection_group_name_conflict"
    );
    connection(&repo, &linux.id);
    let moved = repo
        .save_connection_group(&input(Some(&linux.id), "Web", Some(&dev.id)), "later")
        .unwrap();
    assert_eq!(moved.id, linux.id);
    assert_eq!(moved.sort_order, 1);
    assert_eq!(
        repo.sqlite_connection()
            .query_row(
                "SELECT group_id FROM connections WHERE id='profile'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        linux.id
    );
    drop(repo);
    let reopened = StorageRepository::open(path, Arc::new(InMemorySecretStore::default())).unwrap();
    assert_eq!(
        reopened
            .connection_groups()
            .unwrap()
            .iter()
            .find(|g| g.id == moved.id),
        Some(&moved)
    );
}

#[test]
fn rejects_cycles_orphans_and_failed_moves_without_mutation() {
    let (repo, _) = repo();
    let root = create(&repo, "Root", None);
    let child = create(&repo, "Child", Some(&root.id));
    for parent in [&root.id, &child.id] {
        assert_eq!(
            repo.save_connection_group(&input(Some(&root.id), "Root", Some(parent)), "t")
                .unwrap_err()
                .code,
            "connection_group_cycle"
        );
    }
    assert_eq!(
        repo.save_connection_group(&input(Some(&root.id), "Root", Some("missing")), "t")
            .unwrap_err()
            .code,
        "connection_group_parent_missing"
    );
    let db = repo.sqlite_connection();
    assert!(db
        .execute(
            "UPDATE connection_groups SET parent_id=?1 WHERE id=?2",
            params![child.id, root.id]
        )
        .is_err());
    assert!(db
        .execute(
            "UPDATE connection_groups SET parent_id='missing' WHERE id=?1",
            [&root.id]
        )
        .is_err());
    assert_eq!(
        repo.connection_groups()
            .unwrap()
            .iter()
            .find(|g| g.id == root.id),
        Some(&root)
    );
}

#[test]
fn delete_subtree_preserves_connections_and_other_groups() {
    let (repo, _) = repo();
    let root = create(&repo, "Production", None);
    let child = create(&repo, "Web", Some(&root.id));
    let other = create(&repo, "Development", None);
    connection(&repo, &child.id);
    repo.delete_connection_group(&root.id).unwrap();
    assert_eq!(repo.connection_groups().unwrap(), vec![other]);
    assert_eq!(
        repo.sqlite_connection()
            .query_row(
                "SELECT group_id FROM connections WHERE id='profile'",
                [],
                |r| r.get::<_, Option<String>>(0)
            )
            .unwrap(),
        None
    );
    assert!(repo
        .assign_connection_group("profile", Some("missing"), "t")
        .is_err());
    assert!(repo.assign_connection_group("missing", None, "t").is_err());
}

fn old_database(path: &std::path::Path, empty_name: bool) {
    let db = Connection::open(path).unwrap();
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES(2,'old');
      CREATE TABLE connection_groups(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      INSERT INTO connection_groups VALUES('group','Ops',7,'created','updated');
      INSERT INTO connection_groups VALUES('empty','Empty',9,'created','updated');
      CREATE TABLE assignment(id TEXT PRIMARY KEY,group_id TEXT REFERENCES connection_groups(id) ON DELETE SET NULL);
      INSERT INTO assignment VALUES('profile','group');").unwrap();
    if empty_name {
        db.execute("UPDATE connection_groups SET name='' WHERE id='empty'", [])
            .unwrap();
    }
}

#[test]
fn migrates_v2_with_empty_groups_foreign_keys_and_backup() {
    let path = std::env::temp_dir().join(format!("wf04a-old-{}.db", uuid::Uuid::new_v4()));
    old_database(&path, false);
    let store = SqliteStore::open(&path).unwrap();
    store.initialize().unwrap();
    store.initialize().unwrap();
    drop(store);
    let db = Connection::open(&path).unwrap();
    assert_eq!(list(&db).unwrap().len(), 2);
    let g = list(&db)
        .unwrap()
        .into_iter()
        .find(|g| g.id == "group")
        .unwrap();
    assert_eq!(
        (
            g.name,
            g.sort_order,
            g.parent_id,
            g.created_at,
            g.updated_at
        ),
        ("Ops".into(), 7, None, "created".into(), "updated".into())
    );
    assert_eq!(
        db.query_row("SELECT group_id FROM assignment", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "group"
    );
    assert!(!db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_foreign_key_check)",
            [],
            |r| r.get::<_, bool>(0)
        )
        .unwrap());
    let prefix = format!("{}.wf04a-v2-", path.file_name().unwrap().to_str().unwrap());
    let backups: Vec<_> = std::fs::read_dir(path.parent().unwrap())
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
        .collect();
    assert_eq!(backups.len(), 1);
    let backup = Connection::open(backups[0].path()).unwrap();
    assert_eq!(
        backup
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        backup
            .query_row("SELECT COUNT(*) FROM connection_groups", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        2
    );
}

#[test]
fn invalid_v2_rolls_back_without_changing_assignments_or_version() {
    let path = std::env::temp_dir().join(format!("wf04a-bad-{}.db", uuid::Uuid::new_v4()));
    old_database(&path, true);
    let store = SqliteStore::open(&path).unwrap();
    assert!(store.initialize().is_err());
    assert_eq!(store.schema_version().unwrap(), 2);
    let db = Connection::open(path).unwrap();
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM connection_groups", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        db.query_row("SELECT group_id FROM assignment", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "group"
    );
}

#[test]
fn newer_schema_is_rejected_before_initialization() {
    let (repo, path) = repo();
    repo.sqlite_connection()
        .execute("INSERT INTO schema_migrations VALUES(999,'future')", [])
        .unwrap();
    drop(repo);
    assert!(SqliteStore::open(path).unwrap().initialize().is_err());
}

#[test]
fn concurrent_v2_schema_upgrade_preserves_rows() {
    let path = std::env::temp_dir().join(format!("wf04a-concurrent-{}.db", uuid::Uuid::new_v4()));
    old_database(&path, false);
    let threads: Vec<_> = (0..4)
        .map(|_| {
            let path = path.clone();
            std::thread::spawn(move || SqliteStore::open(path).unwrap().initialize())
        })
        .collect();
    for thread in threads {
        thread.join().unwrap().unwrap();
    }
    let db = Connection::open(path).unwrap();
    assert_eq!(list(&db).unwrap().len(), 2);
}

#[test]
fn concurrent_directory_version_upgrade_is_atomic() {
    let root = std::env::temp_dir().join(format!("wf04a-dir-{}", uuid::Uuid::new_v4()));
    StorageRepository::open_root(&root, Arc::new(InMemorySecretStore::default())).unwrap();
    std::fs::write(root.join(".data-version"), "1\n").unwrap();
    let barrier = Arc::new(std::sync::Barrier::new(8));
    let threads: Vec<_> = (0..8)
        .map(|_| {
            let root = root.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                StorageRepository::open_root(root, Arc::new(InMemorySecretStore::default()))
                    .map(|_| ())
            })
        })
        .collect();
    for thread in threads {
        thread.join().unwrap().unwrap();
    }
    assert_eq!(
        std::fs::read_to_string(root.join(".data-version"))
            .unwrap()
            .trim(),
        "2"
    );
    // 只有首个持锁者升级；后续调用不得将升级前备份覆盖成新版本。
    assert_eq!(
        std::fs::read_to_string(root.join(".data-version.bak"))
            .unwrap()
            .trim(),
        "1"
    );
}

#[test]
fn directory_version_lock_failure_preserves_marker() {
    let root = std::env::temp_dir().join(format!("wf04a-lock-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(root.join(".data-version.lock")).unwrap();
    std::fs::write(root.join(".data-version"), "1\n").unwrap();
    let error = StorageRepository::open_root(&root, Arc::new(InMemorySecretStore::default()))
        .err()
        .expect("锁文件不可用时必须拒绝升级");
    assert_eq!(error.code, "storage_data_version_lock_failed");
    assert_eq!(
        std::fs::read_to_string(root.join(".data-version")).unwrap(),
        "1\n"
    );
    assert!(!root.join("mxterm.db").exists());
}

#[test]
fn legacy_name_never_guesses_between_namesakes() {
    let (repo, _) = repo();
    let a = create(&repo, "A", None);
    let b = create(&repo, "B", None);
    create(&repo, "Linux", Some(&a.id));
    create(&repo, "Linux", Some(&b.id));
    assert_eq!(
        ensure_legacy_group(repo.sqlite_connection(), "Linux", "t")
            .unwrap_err()
            .code,
        "connection_group_ambiguous"
    );
}

#[test]
fn profile_group_id_survives_rename_and_rejects_unknown_ids() {
    let (repo, _) = repo();
    let prod = create(&repo, "Production", None);
    let dev = create(&repo, "Development", None);
    let group = create(&repo, "Linux", Some(&prod.id));
    create(&repo, "Linux", Some(&dev.id));
    let input: crate::connections::ConnectionProfileInput =
        serde_json::from_value(serde_json::json!({
            "host":"example.invalid", "port":22, "username":"test",
            "credential_mode":"prompt", "prompt_auth_kind":"password", "group_id":group.id
        }))
        .unwrap();
    let saved = repo.connection_upsert(input.clone(), "t").unwrap();
    assert_eq!(saved.group_id.as_deref(), Some(group.id.as_str()));
    let mut renamed = super::GroupInput {
        id: Some(group.id.clone()),
        name: "Web".into(),
        parent_id: Some(dev.id),
        color: group.color,
    };
    repo.save_connection_group(&renamed, "t2").unwrap();
    let read = repo.connection_get(&saved.id).unwrap().unwrap();
    assert_eq!(read.group_id, saved.group_id);
    assert_eq!(read.group.as_deref(), Some("Web"));
    assert_eq!(repo.connection_list().unwrap()[0].group_id, saved.group_id);
    let mut bad = input;
    bad.group_id = Some("missing".into());
    assert_eq!(
        repo.connection_upsert(bad, "t").unwrap_err().code,
        "connection_group_missing"
    );
    renamed.name = "Linux".into();
    assert!(repo.save_connection_group(&renamed, "t").is_err());
}

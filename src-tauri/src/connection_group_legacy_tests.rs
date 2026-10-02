use super::*;
use crate::{connection_groups::GroupInput, storage_vault::InMemorySecretStore};
use std::sync::Arc;
fn repo() -> (StorageRepository, std::path::PathBuf) {
    let path = std::env::temp_dir().join(format!("wf04a-legacy-{}", uuid::Uuid::new_v4()));
    (
        StorageRepository::open(&path, Arc::new(InMemorySecretStore::default())).unwrap(),
        path,
    )
}
fn create(repo: &StorageRepository, name: &str) -> ConnectionGroup {
    repo.save_connection_group(
        &GroupInput {
            id: None,
            name: name.into(),
            parent_id: None,
            color: default_color(),
        },
        "t",
    )
    .unwrap()
}
fn marker(repo: &StorageRepository) -> i64 {
    repo.sqlite_connection()
        .query_row(
            "SELECT count(*) FROM app_meta WHERE key=?1",
            [MARKER],
            |r| r.get(0),
        )
        .unwrap()
}
#[test]
fn legacy_tree_preserves_existing_assignment_empty_groups_and_restart_changes() {
    let (repo, path) = repo();
    let web = create(&repo, "Web");
    repo.sqlite_connection().execute("INSERT INTO connections(id,name,host,port,username,credential_mode,proxy_json,jump_json,advanced_json,created_at,updated_at,group_id) VALUES('profile','profile','example.invalid',22,'test','prompt','{}','{}','{}','t','t',?1)",[&web.id]).unwrap();
    let raw = r##"[{"id":"prod","name":"Production"},{"id":"web","name":"Web","parentId":"prod","color":"#2563eb"},{"id":"empty","name":"Empty","parentId":"prod"}]"##;
    let report = repo.migrate_legacy_groups(Some(raw), None, "t").unwrap();
    assert!(report.complete);
    assert_eq!(fs::read_to_string(&report.backup_path).unwrap(), raw);
    let groups = repo.connection_groups().unwrap();
    let prod = groups.iter().find(|g| g.name == "Production").unwrap();
    let migrated = groups.iter().find(|g| g.id == web.id).unwrap();
    assert_eq!(migrated.parent_id.as_ref(), Some(&prod.id));
    assert_eq!(migrated.color, "#2563eb");
    assert_eq!(migrated.sort_order, 0);
    assert_eq!(
        groups
            .iter()
            .find(|g| g.name == "Empty")
            .unwrap()
            .sort_order,
        1
    );
    let assigned: String = repo
        .sqlite_connection()
        .query_row(
            "SELECT group_id FROM connections WHERE id='profile'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(assigned, web.id);
    repo.save_connection_group(
        &GroupInput {
            id: Some(web.id.clone()),
            name: "Renamed".into(),
            parent_id: None,
            color: default_color(),
        },
        "later",
    )
    .unwrap();
    drop(repo);
    let repo = StorageRepository::open(path, Arc::new(InMemorySecretStore::default())).unwrap();
    assert!(
        repo.migrate_legacy_groups(Some(raw), None, "later")
            .unwrap()
            .complete
    );
    let groups = repo.connection_groups().unwrap();
    assert_eq!(groups.len(), 3);
    assert!(groups
        .iter()
        .any(|g| g.id == web.id && g.name == "Renamed" && g.parent_id.is_none()));
}
#[test]
fn legacy_orphan_and_cycle_repairs_are_reported() {
    let (repo, _) = repo();
    let raw = r#"[{"id":"a","name":"A","parentId":"b"},{"id":"b","name":"B","parentId":"a"},{"id":"c","name":"C","parentId":"missing"}]"#;
    let report = repo.migrate_legacy_groups(Some(raw), None, "t").unwrap();
    assert!(report.complete);
    assert_eq!(report.repairs.len(), 2);
    let groups = repo.connection_groups().unwrap();
    assert!(groups
        .iter()
        .find(|g| g.name == "A")
        .unwrap()
        .parent_id
        .is_none());
    assert!(groups
        .iter()
        .find(|g| g.name == "C")
        .unwrap()
        .parent_id
        .is_none());
    validate_tree(&groups).unwrap();
}
#[test]
fn legacy_ambiguity_requires_explicit_mapping_and_rejects_cycles() {
    let (repo, _) = repo();
    let existing = create(&repo, "Linux");
    let raw = r#"[{"id":"same","name":"Linux"},{"id":"same","name":"Linux"}]"#;
    let pending = repo.migrate_legacy_groups(Some(raw), None, "t").unwrap();
    assert!(!pending.complete);
    assert_eq!(marker(&repo), 0);
    assert_eq!(repo.connection_groups().unwrap().len(), 1);
    let mut resolutions = vec![
        LegacyResolution {
            index: 0,
            name: "Production".into(),
            parent_index: Some(1),
            target_id: Some(existing.id.clone()),
        },
        LegacyResolution {
            index: 1,
            name: "Linux".into(),
            parent_index: Some(0),
            target_id: None,
        },
    ];
    assert!(
        !repo
            .migrate_legacy_groups(Some(raw), Some(&resolutions), "t")
            .unwrap()
            .complete
    );
    assert_eq!(marker(&repo), 0);
    resolutions[0].parent_index = Some(99);
    assert!(
        !repo
            .migrate_legacy_groups(Some(raw), Some(&resolutions), "t")
            .unwrap()
            .complete
    );
    resolutions[0].parent_index = None;
    let report = repo
        .migrate_legacy_groups(Some(raw), Some(&resolutions), "t")
        .unwrap();
    assert!(report.complete);
    assert_eq!(report.mappings[0].canonical_id, existing.id);
    // 显式重命名的报告必须包含原名与目标名，不能误记为仅清理空白。
    assert!(report
        .repairs
        .iter()
        .any(|entry| { entry.contains("Linux") && entry.contains("Production") }));
    assert_eq!(repo.connection_groups().unwrap().len(), 2);
}
#[test]
fn legacy_sql_failure_rolls_back_tree_and_marker_but_keeps_backup_for_retry() {
    let (repo, _) = repo();
    let raw = r#"[{"id":"a","name":"A"}]"#;
    repo.sqlite_connection().execute_batch("CREATE TRIGGER fail_legacy BEFORE INSERT ON connection_groups BEGIN SELECT RAISE(ABORT,'injected'); END;").unwrap();
    assert!(repo.migrate_legacy_groups(Some(raw), None, "t").is_err());
    assert_eq!(marker(&repo), 0);
    assert!(repo.connection_groups().unwrap().is_empty());
    assert_eq!(
        fs::read_to_string(backup(&repo.root_dir(), raw).unwrap()).unwrap(),
        raw
    );
    repo.sqlite_connection()
        .execute_batch("DROP TRIGGER fail_legacy")
        .unwrap();
    assert!(
        repo.migrate_legacy_groups(Some(raw), None, "t")
            .unwrap()
            .complete
    );
}
#[test]
fn legacy_malformed_input_is_backed_up_without_completing() {
    let (repo, _) = repo();
    let raw = "{invalid legacy";
    let report = repo.migrate_legacy_groups(Some(raw), None, "t").unwrap();
    assert!(!report.complete);
    assert!(report.issue.is_some());
    assert_eq!(fs::read_to_string(report.backup_path).unwrap(), raw);
    assert_eq!(marker(&repo), 0);
}
#[test]
fn legacy_concurrent_migration_is_idempotent() {
    let (_, path) = repo();
    let barrier = Arc::new(std::sync::Barrier::new(4));
    let handles: Vec<_> = (0..4)
        .map(|_| {
            let path = path.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let repo = StorageRepository::open(path, Arc::new(InMemorySecretStore::default()))
                    .unwrap();
                barrier.wait();
                repo.migrate_legacy_groups(Some(r#"[{"id":"a","name":"A"}]"#), None, "t")
                    .unwrap()
                    .mappings[0]
                    .canonical_id
                    .clone()
            })
        })
        .collect();
    let ids: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert!(ids.iter().all(|id| id == &ids[0]));
}

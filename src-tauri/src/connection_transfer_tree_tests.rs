use super::*;
use crate::{connection_groups::GroupInput, storage_vault::InMemorySecretStore};
use std::sync::Arc;

fn repository() -> StorageRepository {
    let root = std::env::temp_dir().join(format!("wf04a-transfer-{}", uuid::Uuid::new_v4()));
    StorageRepository::open(
        &root.join("mxterm.db"),
        Arc::new(InMemorySecretStore::default()),
    )
    .unwrap()
}
fn group(repo: &StorageRepository, name: &str, parent: Option<&str>) -> String {
    repo.save_connection_group(
        &GroupInput {
            id: None,
            name: name.into(),
            parent_id: parent.map(str::to_owned),
            color: "#2563eb".into(),
        },
        "t",
    )
    .unwrap()
    .id
}

#[test]
fn tree_file_roundtrip_preserves_empty_groups_order_and_profile_ids_after_reopen() {
    let source = repository();
    let prod = group(&source, "Production", None);
    let dev = group(&source, "Development", None);
    let web = group(&source, "Linux", Some(&prod));
    group(&source, "Database", Some(&prod));
    group(&source, "Linux", Some(&dev));
    let profile = source.connection_upsert(serde_json::from_value(serde_json::json!({
        "host":"example.invalid","port":22,"username":"test","credential_mode":"prompt","group_id":web
    })).unwrap(), "t").unwrap();
    let path = source.root_dir().join("tree.json");
    export_to_file(&source, &path, "test-password", "t").unwrap();
    let mut target = repository();
    let preview = preview_file(
        &target,
        &path,
        "test-password",
        ConnectionTransferConflictStrategy::Skip,
    )
    .unwrap();
    assert_eq!(preview.summary.groups.new, 5);
    import_from_file(
        &mut target,
        &path,
        "test-password",
        &preview.fingerprint,
        ConnectionTransferConflictStrategy::Skip,
    )
    .unwrap();
    let root = target.root_dir();
    drop(target);
    let reopened = StorageRepository::open(
        &root.join("mxterm.db"),
        Arc::new(InMemorySecretStore::default()),
    )
    .unwrap();
    assert_eq!(
        source.connection_groups().unwrap(),
        reopened.connection_groups().unwrap()
    );
    assert_eq!(
        reopened
            .connection_get(&profile.id)
            .unwrap()
            .unwrap()
            .group_id,
        Some(web)
    );
}

#[test]
fn legacy_v1_digest_and_aad_are_verified_before_default_tree_fields() {
    // 冻结旧结构字段顺序，不通过新版模型生成待验证的摘要。
    let raw = r##"{"version":1,"connection_groups":[{"id":"old","name":"Legacy","sort_order":7,"created_at":"t","updated_at":"t"}],"credentials":[],"connections":[]}"##;
    let digest = sha256_hex(raw.as_bytes());
    let secrets = encrypt_json(
        format!("mxterm-connections\0v1\0{digest}").as_bytes(),
        "old-password",
        &serde_json::json!({"version":1,"secrets":[]}),
    )
    .unwrap();
    let bundle = ConnectionTransferBundle {
        format: CONNECTION_TRANSFER_FORMAT.into(),
        version: 1,
        created_at: "t".into(),
        data: serde_json::from_str(raw).unwrap(),
        data_sha256: digest,
        secrets,
    };
    let mut target = repository();
    apply_bundle(
        &mut target,
        &bundle,
        "old-password",
        ConnectionTransferConflictStrategy::Skip,
    )
    .unwrap();
    let groups = target.connection_groups().unwrap();
    assert_eq!(groups[0].id, "old");
    assert_eq!(groups[0].parent_id, None);
    assert_eq!(groups[0].color, "#64748b");
    assert_eq!(groups[0].sort_order, 7);
}

#[test]
fn parent_mapping_uses_sibling_name_and_never_global_name() {
    let source = repository();
    let prod = group(&source, "Production", None);
    group(&source, "Linux", Some(&prod));
    let dev = group(&source, "Development", None);
    group(&source, "Linux", Some(&dev));
    let bundle = export_repository_bundle(&source, "password", "t").unwrap();
    let mut target = repository();
    let local_prod = group(&target, "Production", None);
    let local_linux = group(&target, "Linux", Some(&local_prod));
    for strategy in [
        ConnectionTransferConflictStrategy::Skip,
        ConnectionTransferConflictStrategy::Overwrite,
    ] {
        let preview = preview_bundle(&target, &bundle, "password", strategy).unwrap();
        let result = apply_bundle(&mut target, &bundle, "password", strategy).unwrap();
        assert_eq!(
            preview.groups.conflicts,
            result.groups.updated + result.groups.skipped
        );
        let groups = target.connection_groups().unwrap();
        assert_eq!(groups.len(), 4);
        assert_eq!(groups.iter().filter(|g| g.name == "Linux").count(), 2);
        assert_eq!(
            groups
                .iter()
                .find(|g| g.id == local_linux)
                .unwrap()
                .parent_id
                .as_deref(),
            Some(local_prod.as_str())
        );
    }
}

#[test]
fn invalid_tree_rolls_back_without_changing_local_groups() {
    let mut target = repository();
    group(&target, "Keep", None);
    let before = target.connection_groups().unwrap();
    let mut data = ConnectionTransferData::default();
    data.connection_groups.push(SyncConnectionGroup {
        id: "cycle".into(),
        name: "Cycle".into(),
        parent_id: Some("cycle".into()),
        color: "#64748b".into(),
        sort_order: 0,
        created_at: "t".into(),
        updated_at: "t".into(),
    });
    let bundle =
        build_bundle(data, &ConnectionTransferSecrets::default(), "password", "t").unwrap();
    assert!(apply_bundle(
        &mut target,
        &bundle,
        "password",
        ConnectionTransferConflictStrategy::Overwrite
    )
    .is_err());
    assert_eq!(target.connection_groups().unwrap(), before);
}

#[test]
fn id_and_sibling_name_conflict_is_rejected_by_preview_and_apply() {
    let mut target = repository();
    let id = group(&target, "A", None);
    group(&target, "B", None);
    let before = target.connection_groups().unwrap();
    let mut data = ConnectionTransferData::default();
    let mut imported = before.iter().find(|g| g.id == id).unwrap().clone();
    imported.name = "B".into();
    data.connection_groups
        .push(crate::connection_group_transfer::exported(imported));
    let bundle =
        build_bundle(data, &ConnectionTransferSecrets::default(), "password", "t").unwrap();
    for strategy in [
        ConnectionTransferConflictStrategy::Skip,
        ConnectionTransferConflictStrategy::Overwrite,
    ] {
        assert!(preview_bundle(&target, &bundle, "password", strategy).is_err());
        assert!(apply_bundle(&mut target, &bundle, "password", strategy).is_err());
        assert_eq!(target.connection_groups().unwrap(), before);
    }
}

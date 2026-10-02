use super::*;
use crate::{connection_groups::GroupInput, storage_vault::InMemorySecretStore};
use std::sync::Arc;

fn repository() -> StorageRepository {
    let root = std::env::temp_dir().join(format!("wf04a-sync-{}", uuid::Uuid::new_v4()));
    StorageRepository::open(
        &root.join("mxterm.db"),
        Arc::new(InMemorySecretStore::default()),
    )
    .unwrap()
}

#[test]
fn encrypted_sync_preserves_tree_and_connection_assignment() {
    let source = repository();
    let root = source
        .save_connection_group(
            &GroupInput {
                id: None,
                name: "Root".into(),
                parent_id: None,
                color: "#64748b".into(),
            },
            "t",
        )
        .unwrap();
    let child = source
        .save_connection_group(
            &GroupInput {
                id: None,
                name: "Child".into(),
                parent_id: Some(root.id),
                color: "#2563eb".into(),
            },
            "t",
        )
        .unwrap();
    let profile = source.connection_upsert(serde_json::from_value(serde_json::json!({"host":"example.invalid","port":22,"username":"test","credential_mode":"prompt","group_id":child.id})).unwrap(), "t").unwrap();
    let bundle = SyncSnapshotService::export_bundle(
        &source,
        SyncExportOptions::test("device", "test", Some("password")),
    )
    .unwrap();
    let mut target = repository();
    SyncSnapshotService::import_bundle(
        &mut target,
        &bundle,
        SyncImportOptions::test(Some("password")),
    )
    .unwrap();
    assert_eq!(
        target.connection_groups().unwrap(),
        source.connection_groups().unwrap()
    );
    assert_eq!(
        target
            .connection_get(&profile.id)
            .unwrap()
            .unwrap()
            .group_id,
        Some(child.id)
    );
}

#[test]
fn legacy_v2_sync_uses_original_envelope_aad_and_flat_group_defaults() {
    let password = "old-password";
    let snapshot = "old-snapshot";
    let data: serde_json::Value = serde_json::from_str(r#"{"version":2,"connection_groups":[{"id":"old","name":"Legacy","sort_order":5,"created_at":"t","updated_at":"t"}],"connections":[],"credentials":[],"known_hosts":[],"tunnels":[],"settings":{}}"#).unwrap();
    let data_enc = serde_json::to_vec(&RemoteDataEnvelope {
        format: SYNC_FORMAT.into(),
        protocol_version: 2,
        encrypted: encrypt_json(b"mxterm-sync|2|old-snapshot|data", password, &data).unwrap(),
    })
    .unwrap();
    let data_hash = sha256_hex(&data_enc);
    let secrets_enc = serde_json::to_vec(&RemoteSecretsEnvelope {
        format: SYNC_FORMAT.into(),
        protocol_version: 2,
        encrypted: encrypt_json(
            format!("mxterm-sync|2|old-snapshot|{data_hash}|secrets").as_bytes(),
            password,
            &serde_json::json!({"version":2,"secrets":[]}),
        )
        .unwrap(),
    })
    .unwrap();
    let mut manifest = build_manifest(
        snapshot.into(),
        "old-device".into(),
        "old".into(),
        "t".into(),
        &data_enc,
        Some(&secrets_enc),
    );
    manifest.protocol_version = 2;
    manifest.db_schema_version = 2;
    let bundle = SyncSnapshotBundle {
        manifest_json: serde_json::to_vec(&manifest).unwrap(),
        manifest,
        remote_data_enc: data_enc,
        remote_secrets_enc: Some(secrets_enc),
    };
    let mut target = repository();
    SyncSnapshotService::import_bundle(
        &mut target,
        &bundle,
        SyncImportOptions::test(Some(password)),
    )
    .unwrap();
    let groups = target.connection_groups().unwrap();
    assert_eq!(groups[0].parent_id, None);
    assert_eq!(groups[0].color, "#64748b");
    assert_eq!(groups[0].sort_order, 5);
}

#[test]
fn failed_sql_replacement_restores_vault_and_local_tree() {
    let mut target = repository();
    target
        .save_connection_group(
            &GroupInput {
                id: None,
                name: "Keep".into(),
                parent_id: None,
                color: "#64748b".into(),
            },
            "t",
        )
        .unwrap();
    let before = target.connection_groups().unwrap();
    let secret = SyncSecretEntry {
        slot_id: "test-slot".into(),
        kind: "password".into(),
        value: "new-test-secret".into(),
        updated_at: "t".into(),
    };
    let reference = crate::connection_transfer::secret_reference(&secret).unwrap();
    target.secret_set(&reference, "old-test-secret").unwrap();
    let data = target.export_sync_data().unwrap();
    target.sqlite_connection().execute_batch("CREATE TRIGGER test_reject_group BEFORE INSERT ON connection_groups BEGIN SELECT RAISE(ABORT,'test rejection'); END;").unwrap();
    let secrets = SyncSecretsPlaintext {
        version: SYNC_PROTOCOL_VERSION,
        secrets: vec![secret],
    };
    assert!(crate::sync_import_transaction::apply(&mut target, &data, Some(&secrets)).is_err());
    assert_eq!(target.secret_get(&reference).unwrap(), "old-test-secret");
    assert_eq!(target.connection_groups().unwrap(), before);
    assert!(!target
        .root_dir()
        .join(".connection-transfer-pending.json")
        .exists());
}

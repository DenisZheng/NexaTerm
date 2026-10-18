use super::*;
use crate::connections::{rlogin_tests::input, ConnectionProtocol, ConnectionStore};
use crate::storage_migration::StorageMigrator;
use crate::storage_vault::InMemorySecretStore;
use crate::sync_snapshot::{SyncExportOptions, SyncImportOptions, SyncSnapshotService};
use std::sync::Arc;

fn repository() -> StorageRepository {
    let root = std::env::temp_dir().join(format!("rlogin-roundtrip-{}", uuid::Uuid::new_v4()));
    StorageRepository::open_root(&root, Arc::new(InMemorySecretStore::default())).unwrap()
}

#[test]
fn encrypted_transfer_and_sync_preserve_real_rlogin_config_after_import_and_reopen() {
    let source = repository();
    let mut request = input();
    request.advanced.terminal_encoding = "big5".into();
    let saved = source.connection_upsert(request, "t").unwrap();
    let path = source.root_dir().join("connections-export.json");
    export_to_file(&source, &path, "fixture-password", "t").unwrap();
    let mut transferred = repository();
    let preview = preview_file(&transferred, &path, "fixture-password", ConnectionTransferConflictStrategy::Skip).unwrap();
    assert_eq!(preview.summary.connections.total, 1);
    import_from_file(&mut transferred, &path, "fixture-password", &preview.fingerprint, ConnectionTransferConflictStrategy::Skip).unwrap();
    let bundle = SyncSnapshotService::export_bundle(&source, SyncExportOptions { device_id:"device".into(), device_name:"test".into(), created_at:"t".into(), sync_password:Some("fixture-password".into()) }).unwrap();
    let mut synced = repository();
    SyncSnapshotService::import_bundle(&mut synced, &bundle, SyncImportOptions {sync_password:Some("fixture-password".into())}).unwrap();
    let roots = [source.root_dir(), transferred.root_dir(), synced.root_dir()];
    drop(source); drop(transferred); drop(synced);
    for root in &roots[1..] {
        let reopened = StorageRepository::open_root(root, Arc::new(InMemorySecretStore::default())).unwrap();
        let profile = reopened.connection_get(&saved.id).unwrap().unwrap();
        assert_eq!(profile.protocol, ConnectionProtocol::Rlogin);
        assert_eq!(profile.rlogin, saved.rlogin);
        assert_eq!(profile.advanced, saved.advanced);
        assert!(reopened.export_sync_secrets().unwrap().is_empty());
    }
    for root in roots { fs::remove_dir_all(root).unwrap(); }
}

#[test]
fn signed_legacy_transfer_retains_exact_nonempty_profile_bytes_and_aad() {
    // 独立冻结旧结构字段和顺序；不能让新模型生成被验证的摘要。
    let record = include_str!("../test-fixtures/rlogin-legacy-profile.json").trim();
    let raw = format!("{{\"version\":1,\"connection_groups\":[],\"credentials\":[],\"connections\":[{record}]}}");
    let digest = sha256_hex(raw.as_bytes());
    let data: ConnectionTransferData = serde_json::from_str(&raw).unwrap();
    assert_eq!(serde_json::to_string(&data).unwrap(), raw);
    let bundle = ConnectionTransferBundle {
        format: CONNECTION_TRANSFER_FORMAT.into(), version: 1, created_at: "t".into(), data,
        data_sha256: digest.clone(),
        secrets: encrypt_json(format!("mxterm-connections\0v1\0{digest}").as_bytes(), "fixture-password", &serde_json::json!({"version":1,"secrets":[]})).unwrap(),
    };
    let mut target = repository();
    apply_bundle(&mut target, &bundle, "fixture-password", ConnectionTransferConflictStrategy::Skip).unwrap();
    let profile = target.connection_get("legacy-profile").unwrap().unwrap();
    assert_eq!(profile.protocol, ConnectionProtocol::Ssh);
    assert!(profile.rlogin.is_none());
    let root = target.root_dir(); drop(target); fs::remove_dir_all(root).unwrap();
}

#[test]
fn legacy_transfer_rejects_rlogin_extensions_before_changing_existing_records() {
    let source = repository(); source.connection_upsert(input(), "t").unwrap();
    let mut data = export_repository_bundle(&source, "fixture-password", "t").unwrap().data;
    data.version = 1;
    assert_eq!(validate_transfer_data(&data).unwrap_err().code, "rlogin_config_unsupported");
    data.version = CONNECTION_TRANSFER_VERSION;
    data.connections[0].protocol = ConnectionProtocol::Ssh;
    assert_eq!(validate_transfer_data(&data).unwrap_err().code, "rlogin_config_unsupported");
    let root = source.root_dir(); drop(source); fs::remove_dir_all(root).unwrap();
}

#[test]
fn json_migration_preserves_rlogin_and_existing_character_protocols() {
    let root = std::env::temp_dir().join(format!("rlogin-json-migration-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let mut store = ConnectionStore::load(root.join("connections.json")).unwrap();
    let saved = store.upsert(input(), "t").unwrap();
    let telnet = store.upsert(serde_json::from_value(serde_json::json!({"protocol":"telnet","host":"127.0.0.1","port":23,"username":"","credential_mode":"prompt","telnet":{"enter_mode":"cr","backspace_mode":"ctrl_h"}})).unwrap(), "t").unwrap();
    let serial = store.upsert(serde_json::from_value(serde_json::json!({"protocol":"serial","host":"fixture-port","port":1,"username":"","credential_mode":"prompt","serial":{"port_name":"fixture-port","baud_rate":19200,"data_bits":"eight","parity":"none","stop_bits":"one","flow_control":"none","backspace_mode":"del"}})).unwrap(), "t").unwrap();
    drop(store);
    let secrets = Arc::new(InMemorySecretStore::default());
    StorageMigrator::new(root.clone(), secrets.clone()).migrate().unwrap();
    let repository = StorageRepository::open_root(&root, secrets).unwrap();
    for before in [saved, telnet, serial] {
        let after = repository.connection_get(&before.id).unwrap().unwrap();
        assert_eq!(after.protocol, before.protocol);
        assert_eq!(after.rlogin, before.rlogin);
        assert_eq!(after.telnet, before.telnet);
        assert_eq!(after.serial, before.serial);
    }
    assert!(root.join("connections.json.migrated.bak").exists());
    drop(repository); fs::remove_dir_all(root).unwrap();
}

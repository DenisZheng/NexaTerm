use super::*;
use crate::storage_vault::{InMemorySecretStore,SecretReference};
use std::sync::atomic::{AtomicUsize,Ordering};
fn input()->ConnectionProfileInput {
    serde_json::from_value(serde_json::json!({"protocol":"rlogin","host":"127.0.0.1","port":513,"username":"remote","credential_mode":"prompt",
        "rlogin":{"local_address":"127.0.0.1","local_user":"local","terminal":"vt100","speed":9600},
        "advanced":{"connect_timeout_ms":15000,"auth_timeout_ms":20000,"keepalive_interval_ms":20000,"terminal_encoding":"gbk","x11_forwarding":false}})).unwrap()
}
fn root()->PathBuf {let root=std::env::temp_dir().join(format!("rlogin-repository-{}",uuid::Uuid::new_v4()));fs::create_dir(&root).unwrap();root}
#[derive(Default)]struct UnavailableSecrets(AtomicUsize);
impl UnavailableSecrets {fn deny<T>(&self)->Result<T,AppError> {self.0.fetch_add(1,Ordering::SeqCst);Err(AppError::new("vault_locked","fixture","fixture",true))}}
impl SecretStore for UnavailableSecrets {
    fn set_secret(&self,_:&SecretReference,_:&str)->Result<(),AppError> {self.deny()}
    fn get_secret(&self,_:&SecretReference)->Result<String,AppError> {self.deny()}
    fn delete_secret(&self,_:&SecretReference)->Result<(),AppError> {self.deny()}
}
#[test]
fn rlogin_crud_copy_and_reopen_preserve_config_without_access_to_a_locked_vault() {
    let root=root();let secrets=Arc::new(UnavailableSecrets::default());
    let repo=StorageRepository::open_root(&root,secrets.clone()).unwrap();let saved=repo.connection_upsert(input(),"t").unwrap();
    assert_eq!(saved.protocol,ConnectionProtocol::Rlogin);assert_eq!(saved.rlogin,input().rlogin);assert_eq!(saved.advanced.terminal_encoding,"gbk");
    let mut duplicate=input();duplicate.source_connection_id=Some(saved.id.clone());duplicate.name=Some("copy".into());
    let copy=repo.connection_upsert(duplicate,"t2").unwrap();assert_ne!(copy.id,saved.id);assert_eq!(copy.rlogin,saved.rlogin);
    assert_eq!(repo.connection_list().unwrap().len(),2);assert!(repo.export_sync_secrets().unwrap().is_empty());drop(repo);
    let repo=StorageRepository::open_root(&root,secrets.clone()).unwrap();assert_eq!(repo.connection_get(&saved.id).unwrap().unwrap().rlogin,saved.rlogin);
    assert_eq!(secrets.0.load(Ordering::SeqCst),0);drop(repo);fs::remove_dir_all(root).unwrap();
}
#[test]
fn rlogin_sync_metadata_round_trips_and_refuses_legacy_or_secret_injection_before_replacement() {
    let source_root=root();let target_root=root();let mut source=StorageRepository::open_root(&source_root,Arc::new(InMemorySecretStore::default())).unwrap();
    let saved=source.connection_upsert(input(),"t").unwrap();let data=source.export_sync_data().unwrap();
    assert_eq!(data.connections[0].rlogin,saved.rlogin);assert_eq!(data.connections[0].protocol,ConnectionProtocol::Rlogin);
    let mut target=StorageRepository::open_root(&target_root,Arc::new(InMemorySecretStore::default())).unwrap();target.replace_sync_data(&data,false).unwrap();
    assert_eq!(target.connection_get(&saved.id).unwrap().unwrap().rlogin,saved.rlogin);
    let mut invalid=data.clone();invalid.connections[0].inline_secret_slot_id=Some("fixture-secret-ref".into());
    assert!(target.replace_sync_data(&invalid,true).is_err());assert_eq!(target.connection_get(&saved.id).unwrap().unwrap().rlogin,saved.rlogin);
    invalid=data.clone();invalid.version=2;assert!(source.replace_sync_data(&invalid,false).is_err());assert_eq!(source.connection_list().unwrap().len(),1);
    drop(source);drop(target);fs::remove_dir_all(source_root).unwrap();fs::remove_dir_all(target_root).unwrap();
}
#[test]
fn sqlite_rlogin_does_not_persist_permission_or_secret_references_and_rejects_invalid_updates() {
    let root=root();let secrets=Arc::new(UnavailableSecrets::default());let repo=StorageRepository::open_root(&root,secrets.clone()).unwrap();
    let saved=repo.connection_upsert(input(),"t").unwrap();
    let raw:String=repo.sqlite_connection().query_row("SELECT rlogin_json FROM connections WHERE id=?1",[&saved.id],|r|r.get(0)).unwrap();
    for forbidden in ["allow_plaintext","reservation_id","password","credential_id"] {assert!(!raw.contains(forbidden));}
    let refs:(Option<String>,Option<String>,Option<String>)=repo.sqlite_connection().query_row("SELECT credential_id,inline_secret_ref,inline_secret_slot_id FROM connections WHERE id=?1",[&saved.id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
    assert_eq!(refs,(None,None,None));let mut invalid=input();invalid.id=Some(saved.id.clone());invalid.inline_password=Some("fixture-private".into());
    assert_eq!(repo.connection_upsert(invalid,"bad").unwrap_err().code,"rlogin_config_unsupported");assert_eq!(secrets.0.load(Ordering::SeqCst),0);
    assert_eq!(repo.connection_get(&saved.id).unwrap().unwrap().rlogin,saved.rlogin);drop(repo);fs::remove_dir_all(root).unwrap();
}

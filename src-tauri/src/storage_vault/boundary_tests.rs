use super::*;
use crate::credentials::CredentialProfileInput;
use crate::storage_repository::StorageRepository;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self { Self(std::env::temp_dir().join(format!("nexaterm-vault-boundary-{}", uuid::Uuid::new_v4()))) }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
fn reference() -> SecretReference { SecretReference::credential("fixture", SecretKind::Password) }

#[test]
fn lock_revokes_old_access_and_drops_its_strong_store_reference() {
    let root = Fixture::new(); let state = VaultState::default();
    state.unlock(&root.0, "fixture-password").unwrap();
    let old = state.secret_store().unwrap(); old.set_secret(&reference(), "secret-marker").unwrap();
    let weak = Arc::downgrade(state.store.lock().unwrap().as_ref().unwrap());
    state.lock(&root.0).unwrap();
    assert!(weak.upgrade().is_none());
    assert_eq!(old.get_secret(&reference()).unwrap_err().code, "vault_locked");
    assert_eq!(old.set_secret(&reference(), "replacement").unwrap_err().code, "vault_locked");
    assert_eq!(old.delete_secret(&reference()).unwrap_err().code, "vault_locked");
    state.unlock(&root.0, "fixture-password").unwrap();
    assert_eq!(old.get_secret(&reference()).unwrap_err().code, "vault_locked");
    assert_eq!(state.secret_store().unwrap().get_secret(&reference()).unwrap(), "secret-marker");
}

#[test]
fn dropping_vault_owner_revokes_retained_access() {
    let root = Fixture::new(); let state = VaultState::default();
    state.unlock(&root.0, "fixture-password").unwrap();
    let access = state.secret_store().unwrap(); access.set_secret(&reference(), "secret-marker").unwrap();
    drop(state);
    assert_eq!(access.get_secret(&reference()).unwrap_err().code, "vault_locked");
}

#[test]
fn failed_unlock_keeps_current_handle_but_rekey_revokes_it() {
    let root = Fixture::new(); let state = VaultState::default();
    state.unlock(&root.0, "fixture-password").unwrap();
    let old = state.secret_store().unwrap(); old.set_secret(&reference(), " secret-marker ").unwrap();
    assert_eq!(state.unlock(&root.0, "wrong-fixture").unwrap_err().code, "vault_unlock_failed");
    assert_eq!(old.get_secret(&reference()).unwrap(), " secret-marker ");
    state.enable_master_password(&root.0, "new-fixture-password").unwrap();
    assert_eq!(old.set_secret(&reference(), "bad old write").unwrap_err().code, "vault_locked");
    assert_eq!(state.secret_store().unwrap().get_secret(&reference()).unwrap(), " secret-marker ");
    let reopened = VaultSecretStore::open(&root.0, "new-fixture-password").unwrap();
    assert_eq!(reopened.get_secret(&reference()).unwrap(), " secret-marker ");
}

#[test]
fn persist_failures_restore_cached_value_and_keep_original_ciphertext() {
    let root = Fixture::new(); let mut store = VaultSecretStore::open(&root.0, "fixture-password").unwrap();
    store.set_secret(&reference(), "original-marker").unwrap();
    store.path = root.0.join("directory-target"); fs::create_dir_all(&store.path).unwrap();
    assert!(store.set_secret(&reference(), "replacement-marker").is_err());
    assert_eq!(store.get_secret(&reference()).unwrap(), "original-marker");
    assert!(store.delete_secret(&reference()).is_err());
    assert_eq!(store.get_secret(&reference()).unwrap(), "original-marker");
    assert_eq!(VaultSecretStore::open(&root.0, "fixture-password").unwrap().get_secret(&reference()).unwrap(), "original-marker");
}

#[test]
fn delete_commit_lease_holds_access_lock_and_restores_on_commit_failure() {
    let root = Fixture::new(); let state = VaultState::default(); state.unlock(&root.0, "fixture-password").unwrap();
    let access = state.secret_store().unwrap(); access.set_secret(&reference(), "original-marker").unwrap();
    let error = access.delete_secret_with_commit(&reference(), &mut || {
        assert!(matches!(state.store.try_lock(), Err(std::sync::TryLockError::WouldBlock)));
        Err(AppError::new("fixture_commit_failed", "fixture", "fixture", true))
    }).unwrap_err();
    assert_eq!(error.code, "fixture_commit_failed"); assert_eq!(access.get_secret(&reference()).unwrap(), "original-marker");
}

#[test]
fn cached_repository_cannot_reveal_mutate_or_export_secrets_after_lock() {
    let root = Fixture::new(); let state = VaultState::default(); state.unlock(&root.0, "fixture-password").unwrap();
    let repo = StorageRepository::open(root.0.join("mxterm.db"), state.secret_store().unwrap()).unwrap();
    let input = CredentialProfileInput { id: None, name: Some("Fixture".into()), username: Some("fixture".into()), kind: ConnectionAuthKind::Password, password: Some("unique-secret-marker".into()), password_touched: true, private_key_path: None, private_key_passphrase: None, private_key_passphrase_touched: false, notes: None };
    let saved = repo.credential_upsert(input.clone(), "fixture-time").unwrap();
    state.lock(&root.0).unwrap();
    assert_eq!(repo.credential_reveal_secret(&saved.id).unwrap_err().code, "vault_locked");
    assert_eq!(repo.credential_delete(&saved.id).unwrap_err().code, "vault_locked");
    assert!(repo.credential_get(&saved.id).unwrap().is_some());
    assert_eq!(repo.credential_upsert(CredentialProfileInput { id: Some(saved.id.clone()), ..input }, "fixture-time").unwrap_err().code, "vault_locked");
    assert_eq!(repo.export_sync_secrets().unwrap_err().code, "vault_locked");
    assert!(!serde_json::to_string(&repo.export_sync_data().unwrap()).unwrap().contains("unique-secret-marker"));
}

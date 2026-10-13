use super::*;
use std::sync::Weak;

pub(super) type SharedVaultStore = Arc<Mutex<Option<Arc<VaultSecretStore>>>>;

/// 旧仓库仅持 weak 身份；锁定或发布新 store 后不能再访问旧明文/密钥。
pub(super) struct VaultAccess {
    pub current: SharedVaultStore,
    pub expected: Weak<VaultSecretStore>,
}

impl VaultAccess {
    fn with_store<T>(&self, action: impl FnOnce(&VaultSecretStore) -> Result<T, AppError>) -> Result<T, AppError> {
        let current = self.current.lock().map_err(|_| vault_locked())?;
        let store = current.as_ref().ok_or_else(vault_locked)?;
        if !Weak::ptr_eq(&Arc::downgrade(store), &self.expected) {
            return Err(vault_locked());
        }
        // 保持锁覆盖实际 I/O，lock 确认之后不再有旧 store 的读写。
        action(store)
    }
}

impl SecretStore for VaultAccess {
    fn set_secret(&self, reference: &SecretReference, secret: &str) -> Result<(), AppError> {
        self.with_store(|store| store.set_secret(reference, secret))
    }
    fn get_secret(&self, reference: &SecretReference) -> Result<String, AppError> {
        self.with_store(|store| store.get_secret(reference))
    }
    fn delete_secret(&self, reference: &SecretReference) -> Result<(), AppError> {
        self.with_store(|store| store.delete_secret(reference))
    }
    fn delete_secret_with_commit(&self, reference: &SecretReference, commit: &mut dyn FnMut() -> Result<(), AppError>) -> Result<(), AppError> {
        self.with_store(|store| store.delete_secret_with_commit(reference, commit))
    }
    fn delete_secrets_with_commit(&self, references: &[SecretReference], commit: &mut dyn FnMut() -> Result<(), AppError>) -> Result<(), AppError> {
        self.with_store(|store| store.delete_secrets_with_commit(references, commit))
    }
}

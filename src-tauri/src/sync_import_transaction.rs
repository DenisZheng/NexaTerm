//! 整份快照替换复用迁移的 Vault 恢复日志，数据库失败时恢复已写入的凭据。
use crate::{
    app_error::AppError,
    connection_transfer::{restore_secret_backups, secret_reference},
    connection_transfer_recovery::{ConnectionTransferRecovery, CONNECTION_TRANSFER_COMMIT_KEY},
    storage_repository::{StorageRepository, SyncRepositoryImportStats},
    sync_snapshot::{SyncDataDocument, SyncSecretsPlaintext},
};

pub(crate) fn apply(
    repository: &mut StorageRepository,
    data: &SyncDataDocument,
    secrets: Option<&SyncSecretsPlaintext>,
) -> Result<SyncRepositoryImportStats, AppError> {
    let recovery = ConnectionTransferRecovery::begin(&repository.root_dir())?;
    let mut backups = Vec::new();
    let mut data = data.clone();
    data.settings.insert(
        CONNECTION_TRANSFER_COMMIT_KEY.into(),
        serde_json::json!(recovery.transaction_id()),
    );
    let result = (|| {
        if let Some(secrets) = secrets {
            for secret in &secrets.secrets {
                let reference = secret_reference(secret)?;
                let previous = match repository.secret_get(&reference) {
                    Ok(value) => Some(value),
                    Err(error) if error.code == "secret_missing" => None,
                    Err(error) => return Err(error),
                };
                backups.push((reference, previous));
            }
            repository.import_sync_secrets(secrets)?;
        }
        repository.replace_sync_data(&data, secrets.is_some())
    })();
    match result {
        Ok(stats) => {
            recovery.commit()?;
            Ok(stats)
        }
        Err(error) => {
            restore_secret_backups(repository, &backups)?;
            recovery.abort()?;
            Err(error)
        }
    }
}

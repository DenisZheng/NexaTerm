use super::*;
use rusqlite::{Transaction, TransactionBehavior};

impl StorageRepository {
    pub fn credential_delete(&self, id: &str) -> Result<(), AppError> {
        let transaction = Transaction::new_unchecked(&self.connection, TransactionBehavior::Immediate)
            .map_err(sqlite_repository_error)?;
        let references = transaction
            .prepare("SELECT name FROM connections WHERE credential_mode = 'saved' AND credential_id = ?1")
            .and_then(|mut statement| {
                let rows = statement.query_map(params![id], |row| row.get::<_, String>(0))?;
                rows.collect::<Result<Vec<_>, _>>()
            })
            .map_err(sqlite_repository_error)?;
        if !references.is_empty() {
            return Err(AppError::new("credential_in_use", "该凭据正在被连接使用，请先修改连接。", references.join(", "), true));
        }
        let (_credential, secret_ref) = self.stored_credential(id)?;
        let changed = transaction.execute("DELETE FROM credentials WHERE id = ?1", params![id])
            .map_err(sqlite_repository_error)?;
        if changed == 0 {
            return Err(AppError::new("credential_missing", "凭据不存在。", format!("credential_id={id}"), false));
        }
        let mut transaction = Some(transaction);
        let mut commit = || transaction.take().ok_or_else(|| sqlite_repository_error(rusqlite::Error::InvalidQuery))?
            .commit().map_err(sqlite_repository_error);
        let mut references = vec![
            SecretReference::credential(id, SecretKind::Password),
            SecretReference::credential(id, SecretKind::PrivateKeyPassphrase),
        ];
        if let Some(reference) = secret_ref {
            if !references.iter().any(|item| item.account == reference.account) { references.push(reference); }
        }
        self.secret_store.delete_secrets_with_commit(&references, &mut commit)
        // 未提交的 transaction drop 回滚；secret commit 失败时由 store 恢复秘密。
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage_repository::tests::{password_connection_input, password_credential_input, temp_repository};
    use crate::storage_vault::{InMemorySecretStore, SecretStoreFailure};

    #[test]
    fn deletion_removes_metadata_and_secret_but_preserves_referenced_credential() {
        let (repo, _path, secrets) = temp_repository("credential-delete-boundary");
        let saved = repo.credential_upsert(password_credential_input(), "fixture-time").unwrap();
        let reference = SecretReference::credential(&saved.id, SecretKind::Password);
        let connection = repo.connection_upsert(ConnectionProfileInput { credential_mode: ConnectionCredentialMode::Saved, credential_id: Some(saved.id.clone()), inline_auth_kind: None, inline_password: None, ..password_connection_input() }, "fixture-time").unwrap();
        assert_eq!(repo.credential_delete(&saved.id).unwrap_err().code, "credential_in_use");
        assert!(repo.credential_get(&saved.id).unwrap().is_some()); assert!(secrets.get_secret(&reference).is_ok());
        repo.connection_delete(&connection.id).unwrap(); repo.credential_delete(&saved.id).unwrap();
        assert!(repo.credential_get(&saved.id).unwrap().is_none());
        assert_eq!(secrets.get_secret(&reference).unwrap_err().code, "secret_missing");
    }

    #[test]
    fn secret_delete_failure_rolls_back_database_row() {
        let root = std::env::temp_dir().join(format!("nexaterm-delete-failure-{}", uuid::Uuid::new_v4()));
        let secrets = Arc::new(InMemorySecretStore::failing(SecretStoreFailure::Delete));
        let repo = StorageRepository::open(root.join("mxterm.db"), secrets.clone()).unwrap();
        let saved = repo.credential_upsert(password_credential_input(), "fixture-time").unwrap();
        let reference = SecretReference::credential(&saved.id, SecretKind::Password);
        let old = secrets.get_secret(&reference).unwrap();
        assert_eq!(repo.credential_delete(&saved.id).unwrap_err().code, "secret_store_delete_failed");
        assert_eq!(repo.credential_get(&saved.id).unwrap().unwrap(), saved);
        assert_eq!(secrets.get_secret(&reference).unwrap(), old);
    }

    #[test]
    fn deferred_sql_commit_failure_restores_secret_and_database_row() {
        let (repo, _path, secrets) = temp_repository("credential-delete-commit");
        let saved = repo.credential_upsert(password_credential_input(), "fixture-time").unwrap();
        let reference = SecretReference::credential(&saved.id, SecretKind::Password); let old = secrets.get_secret(&reference).unwrap();
        repo.connection.execute_batch("CREATE TABLE guard_parent(id INTEGER PRIMARY KEY); CREATE TABLE guard_child(parent_id INTEGER REFERENCES guard_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER refuse_delete_commit AFTER DELETE ON credentials BEGIN INSERT INTO guard_child(parent_id) VALUES(999); END;").unwrap();
        assert!(repo.credential_delete(&saved.id).is_err());
        assert_eq!(repo.credential_get(&saved.id).unwrap().unwrap(), saved);
        assert_eq!(secrets.get_secret(&reference).unwrap(), old);
    }

    #[test]
    fn successful_delete_also_removes_old_auth_kind_secret_slot() {
        let (repo, _path, secrets) = temp_repository("credential-delete-old-slot");
        let saved = repo.credential_upsert(password_credential_input(), "fixture-time").unwrap();
        let old_kind = SecretReference::credential(&saved.id, SecretKind::PrivateKeyPassphrase);
        secrets.set_secret(&old_kind, "old-phrase-marker").unwrap();
        repo.credential_delete(&saved.id).unwrap();
        assert_eq!(secrets.get_secret(&old_kind).unwrap_err().code, "secret_missing");
    }

    #[test]
    fn second_slot_failure_restores_first_slot_and_metadata() {
        let root = std::env::temp_dir().join(format!("nexaterm-delete-second-slot-{}", uuid::Uuid::new_v4()));
        let secrets = Arc::new(InMemorySecretStore::failing_after(SecretStoreFailure::Delete, 1));
        let repo = StorageRepository::open(root.join("mxterm.db"), secrets.clone()).unwrap();
        let saved = repo.credential_upsert(password_credential_input(), "fixture-time").unwrap();
        let password = SecretReference::credential(&saved.id, SecretKind::Password);
        let phrase = SecretReference::credential(&saved.id, SecretKind::PrivateKeyPassphrase);
        let original = secrets.get_secret(&password).unwrap(); secrets.set_secret(&phrase, "old-phrase-marker").unwrap();
        assert_eq!(repo.credential_delete(&saved.id).unwrap_err().code, "secret_store_delete_failed");
        assert!(repo.credential_get(&saved.id).unwrap().is_some());
        assert_eq!(secrets.get_secret(&password).unwrap(), original);
        assert_eq!(secrets.get_secret(&phrase).unwrap(), "old-phrase-marker");
    }

    #[test]
    fn public_metadata_and_sync_data_exclude_password_and_passphrase_values() {
        let (repo, _path, _secrets) = temp_repository("credential-export-boundary");
        let password = repo.credential_upsert(CredentialProfileInput { id: None, password: Some(" password-unique-marker ".into()), ..password_credential_input() }, "fixture-time").unwrap();
        let key = repo.credential_upsert(CredentialProfileInput { id: None, kind: ConnectionAuthKind::PrivateKey, password: None, password_touched: false, private_key_path: Some("~/.ssh/fixture_key".into()), private_key_passphrase: Some(" phrase-unique-marker ".into()), private_key_passphrase_touched: true, ..password_credential_input() }, "fixture-time").unwrap();
        assert_eq!(repo.credential_reveal_secret(&password.id).unwrap().password.as_deref(), Some(" password-unique-marker "));
        assert_eq!(repo.credential_reveal_secret(&key.id).unwrap().private_key_passphrase.as_deref(), Some(" phrase-unique-marker "));
        for json in [serde_json::to_string(&repo.credential_list().unwrap()).unwrap(), serde_json::to_string(&repo.export_sync_data().unwrap()).unwrap()] {
            assert!(!json.contains("password-unique-marker")); assert!(!json.contains("phrase-unique-marker"));
        }
        assert!(password.password.is_none()); assert!(key.private_key_passphrase.is_none());
    }

    #[test]
    fn failed_restore_is_reported_without_secret_value_in_error() {
        let root = std::env::temp_dir().join(format!("nexaterm-delete-restore-failure-{}", uuid::Uuid::new_v4()));
        let secrets = Arc::new(InMemorySecretStore::failing_after(SecretStoreFailure::Write, 1));
        let repo = StorageRepository::open(root.join("mxterm.db"), secrets).unwrap();
        let saved = repo.credential_upsert(CredentialProfileInput { password: Some("unique-rollback-marker".into()), ..password_credential_input() }, "fixture-time").unwrap();
        repo.connection.execute_batch("CREATE TABLE guard_parent(id INTEGER PRIMARY KEY); CREATE TABLE guard_child(parent_id INTEGER REFERENCES guard_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER refuse_delete_commit AFTER DELETE ON credentials BEGIN INSERT INTO guard_child(parent_id) VALUES(999); END;").unwrap();
        let error = repo.credential_delete(&saved.id).unwrap_err();
        assert_eq!(error.code, "secret_store_delete_rollback_failed");
        assert!(repo.credential_get(&saved.id).unwrap().is_some());
        assert!(!serde_json::to_string(&error).unwrap().contains("unique-rollback-marker"));
    }
}

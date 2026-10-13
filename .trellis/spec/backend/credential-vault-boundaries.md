# Credential and Vault boundaries

## Scope
WF-09-03B, existing WS-C06/C07 contracts and the production StorageRepository facade. No new cipher, KDF, IPC, dependency or persisted schema.

## Access lifetime
- VaultState owns a shared current-store mutex. SecretStore handles issued by it hold a Weak store identity and that mutex, not a strong reference to old plaintext/key material.
- Every secret read/write/delete checks current identity while holding the access mutex across the operation. Lock clears current; re-unlock/rekey replaces identity; owner drop revokes retained handles. Old handles return vault_locked permanently, including after later unlock.
- Local unlock, master unlock and rekey hold the same mutex across native local-key/KDF/file publication. Lock acknowledgment waits for accepted secret operations. There is no SSH/network operation under this lock.
- This revokes Vault access, not credentials already copied for an authorized session or encrypted historical backups. Existing sessions are not closed; no forensic memory/disk erasure is claimed.
- Failed unlock/rekey retains the prior store. Vault set/delete rolls back its cached value when atomic persistence fails, instead of exposing a mutation that the command reported as failed.

## Credential deletion
- BEGIN IMMEDIATE precedes saved-connection reference checks and row deletion. Referenced credentials return credential_in_use without changing row/slots.
- Delete targets the authoritative row reference and the canonical password/private-key-passphrase slots for that credential ID, deduplicated by account. This includes stale slots from an earlier authentication kind.
- SecretStore.delete_secrets_with_commit snapshots existing values, deletes them and invokes SQL commit. Missing slots are benign. Other read/delete errors abort; successful earlier deletions are restored on later delete/commit failure.
- The production access proxy holds the Vault mutex across this entire operation, including restore, so lock/rekey cannot interrupt it. Failed SQL transactions roll back the row. Failed restore returns secret_store_delete_rollback_failed; do not conceal it as success.
- This is runtime error rollback, not a durable cross-file crash transaction. Existing encrypted backups/recovery remain; do not label it crash-atomic or secure erasure.

## Input and export
- Account passwords/passphrases preserve exact characters, including spaces. Only an empty string is absent. Metadata still trims; untouched UI secrets are omitted by the frontend and existing saved references are preserved. Master-password whitespace policy remains separate.
- Credential list/get responses and export_sync_data contain metadata/slot references, not password/passphrase values. Workspace snapshots exclude credentials/secret payloads through their existing contract.
- Explicit password-encrypted connection transfer/sync exports remain supported; export_sync_secrets through an old revoked repository fails. Never replace encryption with plaintext fallback.

## Tests
- storage_vault/boundary_tests.rs: revoked/drop/rekey handles, cache persistence failure, commit access lease and cached repository secret export.
- storage_repository/credential_delete.rs tests: successful/referenced deletion, provider failure, deferred SQL commit failure, multi-slot cleanup/rollback and public metadata exclusion.
- Existing saved SSH/RDP/VNC and credential reveal tests now assert exact account-secret characters. Native provider GUI evidence remains MANUAL_REQUIRED.

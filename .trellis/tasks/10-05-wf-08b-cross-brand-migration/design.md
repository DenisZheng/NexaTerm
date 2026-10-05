# WF-08B Design

## 08B-1 Core App Data

### Discovery

The current Tauri data root is expected to end in `com.nexaterm.app`. The historical root is derived only as its sibling `com.mxterm.app`. If an app-directory override/custom root is active, automatic discovery fails closed rather than guessing.

### Preview

Preview reports:
- old/current paths;
- recognized payload files;
- whether current NexaTerm contains substantive user data;
- whether migration is blocked.

An initialized-but-empty SQLite schema is not treated as user data; rows in user-facing tables, a vault, or legacy stores are.

### Apply

1. Copy legacy payload into a sibling staging directory.
2. Open staged SQLite, merge WAL and run `PRAGMA integrity_check`.
3. Rename current NexaTerm root to a sibling pre-migration backup.
4. Atomically rename staging root into the NexaTerm identifier path.
5. Write a migration marker containing rollback locations.
6. Require application restart.

Failure before switch leaves both roots untouched. Failure during switch attempts to restore the pre-migration NexaTerm root.

### Rollback

An explicit rollback command preserves the migrated root under a separate sibling path, then restores the pre-migration NexaTerm backup (or recreates an empty root if none existed).

### Vault

No secret is decrypted during brand migration. The encrypted vault and the historical local-key file are moved as files. Existing VaultState logic handles the local-key transition after restart.

## 08B-2 WebView settings

Do not copy an active WebView profile directory while the WebView is running.

- **Windows / Linux:** create a hidden Tauri WebView whose `data_directory` points at the historical `com.mxterm.app` local-data sibling. The probe loads only the current trusted frontend, reads only `mxterm.settings.v1`, returns the JSON through an internal Tauri command, then closes. The old store is never written.
- **macOS:** Tauri cannot redirect a new WKWebView to the previous default store through the same `data_directory` API. Instead, scan only historical mXterm WebKit roots for `localstorage.sqlite3`, open them read-only, read `ItemTable[key = 'mxterm.settings.v1']`, decode Text/UTF-16LE Blob values, and require valid JSON. Multiple different values, malformed databases, oversized values, symlinks or abnormal scan depth fail closed.
- **Fallback:** if the legacy settings store cannot be read safely, core App Data migration remains available but NexaTerm surfaces that UI/Local/WSL settings need manual review. The original mXterm data remains untouched.

After a successful settings migration NexaTerm writes the same historical key to its current localStorage, so existing `normalizeSettings()` remains the compatibility layer.

## UI

`LegacyAppDataMigrationGate` runs before `WorkspaceShell` mounts:
- migration available → explicit Migrate/Skip choice;
- target non-empty → warning only, no overwrite path;
- successful migration → process relaunch;
- VNC runner child window bypasses the gate.

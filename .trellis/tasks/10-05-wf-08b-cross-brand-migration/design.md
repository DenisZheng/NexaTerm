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

Do not copy an active WebView profile directory while the WebView is running. Investigate per-platform storage layout / pre-window migration or a one-time helper process. Until implemented, UI/local terminal settings remain an explicit gap.

## UI

`LegacyAppDataMigrationGate` runs before `WorkspaceShell` mounts:
- migration available → explicit Migrate/Skip choice;
- target non-empty → warning only, no overwrite path;
- successful migration → process relaunch;
- VNC runner child window bypasses the gate.

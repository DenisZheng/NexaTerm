# WF-07 Design

## Storage

Do not store workspace snapshots in `app_settings`: all app settings are exported by current WebDAV sync. Workspace layout is machine-local and may contain machine-specific Local/WSL/RDP/VNC references.

Add a dedicated singleton `workspace_snapshots` SQLite table:

- `current_json`
- `backup_json`
- `updated_at`

A save performs one SQLite UPSERT that copies previous `current_json` into `backup_json` before replacing current. This makes the previous valid snapshot available when a future schema decoder fails.

The Tauri command boundary accepts JSON but rejects:
- non-object payloads;
- payloads above the fixed size limit;
- recursively nested keys that look like passwords, passphrases, private keys, session ids, X11 cookies, runtime credentials, secrets/tokens, or broadcast state.

## Decode / rollback

Frontend decoding owns schema versions. V1 is parsed into a fresh object rather than trusted by type assertion.

Load policy:
1. decode current;
2. if invalid/unsupported, decode backup;
3. if backup succeeds, use it and report `source=backup`;
4. if both fail, start with an empty workspace instead of mutating persisted data.

Unknown future versions are never guessed into V1.

## Restore plan

The planner is pure and does not connect anything.

Each snapshot instance becomes one restore item:
- `ready`: referenced saved profile exists;
- `temporary-auth-required`: temporary reference is structurally valid but cannot silently restore credentials;
- `missing-profile`: saved profile was deleted.

Failures are item-local.

The plan carries the sanitized order/panes/Files/sidebar shell and always reports `multiExecMode="off"`. Auto reconnect candidates are derived only from an explicit boolean supplied by the caller; missing/temporary items never auto reconnect.

## 07B ordering

Startup ordering is intentionally two-phase:
1. load snapshot and restore shell projection;
2. schedule reconnect attempts.

This prevents slow network/auth/Host-Key prompts from blocking layout restoration.

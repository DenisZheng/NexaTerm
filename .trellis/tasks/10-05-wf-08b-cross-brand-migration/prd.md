# WF-08B PRD — mXterm → NexaTerm 跨品牌数据迁移

## Root cause

2026-09-29 branding commit changed the Tauri identifier from `com.mxterm.app` to `com.nexaterm.app`. Tauri app data paths are identifier-scoped, so a NexaTerm process does not automatically see the previous mXterm directory.

Historical fact:
- old product: `MXterm`, identifier `com.mxterm.app`;
- current product: `NexaTerm`, identifier `com.nexaterm.app`.

## User contract

- Detect the old mXterm data directory.
- Prompt before migration; never silently overwrite.
- Keep the original mXterm directory untouched.
- If NexaTerm already contains real user data, block automatic migration.
- Stage and validate migrated SQLite data before switching directories.
- Preserve the pre-migration NexaTerm directory as rollback material.
- Restart after successful migration.
- Secrets must not be logged or converted to plaintext.

## Data scope — 08B-1

Core App Data:
- `mxterm.db` (+ WAL/SHM when present);
- legacy JSON stores and `.migrated.bak` repair sources;
- `secrets.enc` and legacy `secrets.local.key`;
- `.data-version`.

The old mXterm release predates the later NexaTerm native-keychain local-key hardening, so preserving `secrets.local.key` allows the existing current vault path to migrate it into the NexaTerm native credential store after restart.

## Data scope — 08B-2

The old WebView local data directory contains `mxterm.settings.v1` localStorage state, including UI settings and custom Local/WSL profiles. It is a separate physical store from `appDataDir` and is not covered by 08B-1.

08B is not fully complete until this boundary is either migrated with a safe platform-specific mechanism or explicitly converted through a supported export/import path with real Windows/macOS/Linux evidence.

## Out of scope

- MobaXterm third-party session import (existing separate importer).
- Merging two non-empty NexaTerm/mXterm databases automatically.
- Deleting the old mXterm directory.
- Publishing a release/tag.

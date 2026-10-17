# Rlogin saved connections and terminal entry

## 1. Scope / trigger

Continue approved WF-09-08A L01-L03/C01-C02 under WORKFLOW_SPEC v0.7 WS-P01/P02/P04 and WS-R01/R02. User flow: save a Rlogin target, explicitly permit this one connection, use its native terminal, cancel/reconnect/close the same logical instance. This slice extends the connection model, storage and actual entry; the earlier IO adapter alone is not a usable terminal. No external rlogin client, DNS, elevation helper, logs/history/macros/MultiExec or permanent plaintext consent.

## 2. Signatures

ConnectionProtocol adds `Rlogin` / JSON `rlogin`. Profile/Input/Validated/SyncConnectionRecord add optional `rlogin:RloginConnectionConfig` and requires a matching TS model before frontend activation (next UI slice). Config is `{local_address:String,local_user:String,terminal:String,speed:u32}`; terminal defaults to xterm-256color and speed38400. Host/port/username hold numeric remote IPv4/default513/remote user; advanced.terminal_encoding selects the existing eight encodings. Config rejects unknown fields. No password, allow_plaintext, runtime ID or per-run window is persisted in it.

SQLite schema5 adds nullable `connections.rlogin_json TEXT`. Migration owns BEGIN IMMEDIATE, checks column under the write lock, adds it once and records version5 in that transaction. Existing on-disk databases get a unique consistent SQLite backup before upgrade; backup/migration failure aborts, no false schema success. Fresh/in-memory stores need no disk backup. Existing newer-schema rejection remains. Old profiles omit the field; all old protocol validation/defaults remain.

The consistent VACUUM backup must run outside SQL transactions. A stable sibling `.wf09-rlogin-schema.lock` file, keyed by the canonical DB path, serializes the backup/check/upgrade across processes; retain it rather than deleting it after unlock. Recheck version/column under BEGIN IMMEDIATE, require TEXT affinity, and record5 with the ALTER atomically. Failed SQL/version publication restores autocommit and preserves schema4; retry never overwrites earlier backups.

`rlogin_schema::migrate(db,backup_existing)` receives whether schema_migrations existed before the initial DDL, captured under its IMMEDIATE lock. Do not infer a fresh database from the post-bootstrap version: the group migration has already recorded3 by then. A truly fresh database skips disk backup; existing v2/v3/v4 databases keep their consistent pre-Rlogin backup.

Future runtime entry freezes a deep target/config/encoding/window snapshot before requesting this-run consent. It calls the existing reserve/start/close and controller APIs; reserve late after cancellation is only closed, never started. Reconnect awaits old actual close, gets a new consent and UUID. A workspace owner retains the attempt/controller across pane detach/remount; cleanup failure keeps a visible retryable instance rather than silently dropping ownership.

## 3. Contracts

Validate numeric local/remote IPv4 and the same BSD user/terminal/speed profile before persistence; remote user is independent of SSH credentials. Empty required fields or unsupported protocol settings fail with fixed errors, no truncation. Rlogin rejects credential/secret/proxy/jump/X11 settings instead of silently using them. Preserve only the selected terminal encoding from advanced settings; fixed native establishment budget remains15s. Saved configuration never authorizes a connection, and workspace restore never automatically reconnects Rlogin.

All persistence paths must retain the exact config: ordinary repository list/get/upsert/duplicate, legacy JSON migration, sync export/import and connection transfer. Normal Profile and SyncRecord have different SQL row layouts; append/read the new column explicitly for each, and round-trip real repository data. Before growing frozen connections/mod.rs and storage_repository.rs, extract existing helpers without behavior change; do not raise budgets. New schema rejects old binaries through the existing version guard; backup is the explicit rollback source.

The canonical Profile projection appends rlogin_json at index28; the SyncRecord projection independently appends it at index28. stored_connection_optional adds secret reference columns after the Profile projection, so its account/slot indices move from28/29 to29/30. Preserve SSH saved/inline secret lookup tests through this change. Omit optional rlogin=None from JSON serialization to retain historical transfer/sync digests; reject Rlogin extensions in old transfer-v1/sync-v2 data rather than silently extending their format.

Shared validate_stored_rlogin(record,old_format) runs before import side effects and on transfer/sync metadata validation. It rejects Rlogin secret-slot references, mixed-protocol payloads and legacy-format extensions, reuses the independent profile validator, and requires canonical target/user/config/advanced fields so import cannot retain settings the runtime would reject. It performs no secret-store or network access. replace_sync_data must validate before its DELETE batch even when called directly. Repository metadata export also validates before a subsequent secret export, and sync import validates before creating its import backup.

Frontend union expansion must not route Rlogin through default SSH normalization/open/test/reconnect. Keep protocol activation unavailable until its actual form and owner are connected. Before React UI changes, extend the existing prototype mother with fields, transient consent, cancel, reconnect and cleanup-failure states; reuse Radix, AppSelect, Lucide, global tokens and existing terminal appearance. Keyboard focus stays visible and errors have text. Local escape processing is disabled: ordinary `~.`/Enter/controls pass through.

Terminal input/output bypass public terminal events, unbounded TerminalOutputQueue, directory/recent-output/history/macro hooks and generic terminal_close. Raw xterm.onBinary and text must share the same bounded input owner before binary input is enabled. Status distinguishes initial protocol ACK from authentication; EOF does not imply exit code0. Source-port capability and Windows exact-boundary limitations are shown from actual backend results. No fake browser/provider success.

## 4. Validation / error matrix

| Condition | Result |
| --- | --- |
| Missing Rlogin config / invalid numeric address or BSD fields | fixed config/protocol/socket error, no persistence or IO |
| Credential/proxy/jump/X11 or consent/runtime fields in config | fixed invalid-config error, no secret lookup/write |
| Migration backup/ALTER/version record failure | rollback and fixed migration error; retain old data |
| Import/export/duplicate | exact config retained; no added consent or runtime ID |
| Unsupported platform/permission | actual fixed backend reason; no elevation/high-port fallback |
| Cancel before/after reserve/start | close only that generation, await issued work |
| Close fails | retain owner and retryable visible state |
| Restore or reconnect | new explicit consent/UUID; no automatic input replay |

## 5. Good / base / bad

Good: save a non-sensitive target, reload its config exactly, authorize only this attempt, then cancel while reserve is pending and close the returned old handle. Base: existing SSH/Telnet/Serial/desktop profiles retain their previous defaults and secret semantics. Bad: save allow_plaintext, deserialize a new profile and silently relabel it SSH, omit rlogin_json from sync, delete a tab before failed cleanup or auto-connect it during restore.

## 6. Required tests

Backend: closed config fields, numeric/BSD bounds, unsupported settings/no secret access, schema4->5 with data and backup, idempotence/concurrency/failure rollback/newer schema guard, real repository CRUD/duplicate and every sync/transfer/migration round trip. Frontend: normalization and entry routing never call SSH for Rlogin; prototype and form required fields/transient consent; owner reserve/start/cancel/close/reconnect races and generation isolation; direct credited rendering/encoding/input/resize integration; restore and privacy exclusions. Run types/build/source gates and full native/application CI. Real WebView/rlogind/platform/theme acceptance remains explicitly separate.

## 7. Wrong vs correct

Wrong: add only a UI option or reuse SSH credentials/default fallthrough; append a SQL column without updating both row layouts. Correct: introduce the independent typed config, validate it at the backend, carry it through all storage paths and only enable the entry when its real lifecycle is wired. Wrong: persist plaintext consent as a profile setting. Correct: freeze one target snapshot, request consent for that attempt and discard it with the generation.

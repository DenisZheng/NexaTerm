# WF-08B Implementation

## 08B-1 Core App Data
- [x] Confirm historical identifier `com.mxterm.app` and current `com.nexaterm.app`.
- [x] Add backend preview/apply/rollback commands.
- [x] Keep legacy mXterm root read-only.
- [x] Refuse automatic overwrite when NexaTerm has substantive user data.
- [x] Stage legacy payload and run SQLite WAL checkpoint + integrity check.
- [x] Preserve current NexaTerm root as rollback backup.
- [x] Preserve encrypted vault and legacy local-key file without plaintext conversion.
- [x] Add pre-WorkspaceShell migration prompt and restart flow.
- [x] Add en / zh-CN strings.
- [x] Add WF-08B source gate and CI step.
- [ ] First CI pass and Rust/Frontend regression evidence.

## 08B-2 WebView settings
- [ ] Migrate or explicitly bridge old `mxterm.settings.v1` WebView localStorage.
- [ ] Preserve custom Local/WSL profiles, shortcuts, appearance and startup settings.
- [ ] Verify on Windows / macOS / Linux without copying an active WebView store unsafely.

## Acceptance boundary

08B-1 passing CI is not enough to mark all cross-brand migration complete. 08B remains `in_progress` until 08B-2 has a supported path and real-platform evidence.

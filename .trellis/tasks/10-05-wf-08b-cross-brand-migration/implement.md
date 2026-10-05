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
- [x] First CI pass and Rust/Frontend regression evidence: CI #343 / run `37257491086` PASS on `5c800f14603917bd99e5417cb78d10afc06ff612`.

## 08B-2 WebView settings
- [x] Bridge old `mxterm.settings.v1` without copying an active WebView profile: hidden legacy-data WebView on Windows/Linux; read-only WebKit LocalStorage SQLite extraction on macOS.
- [x] Preserve the full historical `mxterm.settings.v1` JSON so current `normalizeSettings()` restores custom Local/WSL profiles, shortcuts, appearance and startup settings.
- [x] Automated verification on Windows/Linux/macOS: all three Cargo check + Cargo test PASS in CI #343; frontend migration cases and source gate PASS. Real installed-old-version migration remains an A15/WF-08E platform acceptance item.

## Acceptance boundary

08B implementation is code-complete after 08B-1 + 08B-2 and CI #343. It is **not** final A15 acceptance: a real installed mXterm → NexaTerm upgrade on Windows/macOS/Linux must still prove the discovered historical stores match actual shipped installations and that sessions/settings survive the upgrade. That real-platform evidence is deferred to WF-08E.

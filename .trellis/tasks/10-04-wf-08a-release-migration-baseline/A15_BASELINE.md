# A15 Baseline — 2026-10-04

> Branch: `feat/wf08a-release-migration-baseline`  
> Base: `feat/wf04c-multiexec-entry @ cc3b8e2`

A15 是“迁移、安装与完整 v1”的最终验收。本表只记录当前事实，不把源码存在或 CI 编译等同于真实发布通过。

| Area | Current evidence | Status for A15 |
| --- | --- | --- |
| Windows x64 package plan | `package:win` + release matrix | AUTOMATED BASELINE |
| macOS ARM64 package plan | `package:mac-arm64` + release matrix | AUTOMATED BASELINE |
| Linux x64 package plan | `package:linux` + release matrix | AUTOMATED BASELINE |
| Tag/package/Tauri/Cargo version match | `release.yml` validates tagged releases | AUTOMATED BASELINE |
| Tauri updater trust | public key + GitHub `latest.json` endpoint; private key required in release workflow | AUTOMATED BASELINE |
| Windows signing | Authenticode cert import + post-build signature verification | CODED / REAL TAG PENDING |
| macOS signing/notarization | Developer ID import + codesign/Gatekeeper/stapler checks | CODED / REAL TAG PENDING |
| License notices | bundle resources + license CI + release evidence files | AUTOMATED BASELINE |
| Legacy JSON → SQLite/Vault | `StorageMigrator` tests + backups + secret rollback/repair | AUTOMATED BASELINE |
| Newer data-dir downgrade protection | `.data-version` gate | AUTOMATED BASELINE |
| mXterm app-data → NexaTerm app-data | WF-08B implements safe core App Data migration plus `mxterm.settings.v1` bridging on Windows/Linux and read-only WebKit SQLite extraction on macOS; CI #343 passed all three Rust platforms and frontend gates | **CODE COMPLETE / REAL UPGRADE PENDING WF-08E** |
| English / zh-CN full-product completeness | WF-08C full-catalog audit locks exact en/zh-CN key + placeholder parity (170/170 at audit) | **AUTOMATED AUDIT PASS / REAL UI SWITCH PENDING WF-08E** |
| Light/Dark | existing product/acceptance evidence | FINAL REGRESSION PENDING |
| Security Critical/High | security CI/report exists | FINAL RELEASE AUDIT PENDING |
| Startup / idle / 10-session performance | WF-08D now provides opt-in startup interactive probe, cross-platform process-tree CPU/RSS sampler and fixed 10 SSH/resource-release workload | **MEASUREMENT HARNESS IN PROGRESS / REAL BENCHMARK PENDING** |
| Real installer launch/upgrade/rollback on all 3 platforms | no final A15 evidence yet | **PENDING** |
| A09/A10 MultiExec real Tauri | separate predecessor acceptance | **PENDING; blocks final A15 sign-off** |

## Completion rule

WF-08 development can continue while A09/A10 are pending. A15 is not PASS until the v1 mandatory scope, A09/A10 predecessor acceptance, three-platform release/install evidence, update/rollback, migration, locale, security/license and performance/stability evidence are all reconciled.


## CI evidence

- PR: #36
- Head: `568db8ea6d1d82c42a57747456481b51cd193db7`
- CI: #307 / run `37209951472` — PASS
- `WF-08A release and migration baseline`: PASS
- Frontend / Rust windows-x64 / Rust macos-arm64 / Rust linux-x64 / Test fixtures / Security / License: PASS
- Windows package build-only job: skipped by design on pull_request events; it remains a manual workflow-dispatch packaging channel.


## WF-08B CI evidence

- PR: #37
- Functional head: `5c800f14603917bd99e5417cb78d10afc06ff612`
- CI: #343 / run `37257491086` — PASS
- Frontend checks + `WF-08B cross-brand app-data migration`: PASS
- Rust windows-x64 / linux-x64 / macos-arm64: Cargo check + Cargo test PASS
- Test fixtures / Security / License: PASS
- Windows package build-only: skipped by design on pull_request
- Boundary: this is automated code evidence, not proof that a real previously-installed mXterm profile upgrades successfully on each OS. That remains WF-08E/A15.


## WF-08C CI evidence

- PR: #38
- Functional head: `40cdc07b94bb4f285dd39519a9f0793f15aa848a`
- CI: #357 / run `37262522837` — PASS
- Frontend checks + `WF-08C release surface`: PASS
- Rust windows-x64 / linux-x64 / macos-arm64: Cargo check + Cargo test PASS
- Test fixtures / Security / License: PASS
- Canonical active MCP identity: `nexaterm-mcp`, `get_nexaterm_mcp_status`, `X-NexaTerm-MCP-Token`
- Compatibility aliases retained only where explicit: legacy status/header/env/binary fallback
- Canonical bundled sidecar: `nexaterm-mcp`; Cargo externalBin placeholder keeps check/test compatible while Tauri hooks build the real sidecar for dev/package
- Boundary: real installer contents, About/title, language switching and updater behavior remain WF-08E/A15 real-platform evidence.

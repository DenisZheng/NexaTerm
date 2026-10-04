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
| mXterm app-data → NexaTerm app-data | requirement exists; automatic cross-brand discovery/import not yet proven | **MISSING / WF-08B** |
| English / zh-CN full-product completeness | catalogs and new-entry gate exist | **FULL AUDIT PENDING** |
| Light/Dark | existing product/acceptance evidence | FINAL REGRESSION PENDING |
| Security Critical/High | security CI/report exists | FINAL RELEASE AUDIT PENDING |
| Startup / idle / 10-session performance | requirements defined | **BENCHMARK PENDING** |
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

# WF-08A Design

## 1. 基线策略

A15 是最终发布验收，不应该用一个巨大的 release PR 一次完成。本阶段先建立 source-contract gate，防止后续开发把已经存在的发布信任链和迁移保护拆掉。

### Release contract

静态门禁至少锁定：

- Windows x64 / macOS ARM64 / Linux x64 三个平台；
- `package:win` / `package:mac-arm64` / `package:linux`；
- tag 与 package / Tauri / Cargo 版本一致性；
- updater private key 必须存在才生成可更新发布物；
- Windows Authenticode 验证；
- macOS codesign + Gatekeeper + stapler 验证；
- `latest.json` 和 SHA256SUMS；
- 第三方许可证随 bundle/release 产出。

### Migration contract

锁定当前已经存在的存储升级保护：

- `DATA_DIR_VERSION`；
- 新版本数据目录被旧版本打开时 fail closed；
- legacy JSON → SQLite；
- plaintext secret 迁入 SecretStore/Vault；
- SQL 事务失败时不写成功 marker，并清理已写 secret；
- legacy JSON 备份 `.migrated.bak`；
- 已迁移但 Vault secret 丢失时可从备份修复。

这不等于完成“旧 mXterm app-data 目录自动发现并迁入 NexaTerm”。该能力单独列入后续 WF-08B。

## 2. 后续切片

- **08A**：发布/迁移事实基线 + CI gate（本任务）。
- **08B**：mXterm → NexaTerm app-data discovery/import/rollback，明确不静默覆盖。
- **08C**：English/zh-CN 完整性 + branding/update channel + installer/release evidence。
- **08D**：startup/idle/multi-session performance、长稳和资源释放证据。
- **08E**：A15 三平台真实安装/升级/回滚与最终 v1 sign-off。

A09/A10 的真实 Tauri 验收可以与 08A–08D 并行；08E 最终签字前必须完成。

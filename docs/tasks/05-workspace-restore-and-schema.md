# Task 05：Workspace Restore 数据模型与迁移

> **迁移说明（2026-09-23，WF-00A）**：本文件是 2026-09-09 规划稿，作为历史参考保留。快照契约（非敏感字段集，见 `docs/WORKFLOW_SPEC.md` WS-R01）在 WF-01 定义；持久化、迁移与恢复实现在 WF-07（父任务 `09-23-nexaterm-workflow-mainline`），位于 WF-04 目标会话模型之后，避免先保存旧的 connection-group/tab 结构再推倒迁移。快照输入为目标实例模型加 `SplitState`（Task 04 已产出 `SplitState`；`SessionTabsState` 目前只有指针部分进 reducer，实例集合在 WF-01 投影）。安全、迁移、回滚与局部失败隔离要求继续有效（WS-R02）。

## Goal

定义并实现版本化 workspace snapshot、session/tab/split 恢复和局部失败隔离，使重启恢复可测试、可迁移、可回滚。

## Background

当前仅 `windowState.ts` 恢复窗口几何；SQLite schema v2 没有 workspace/session layout 表；需求要求 Workspace Restore。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/ARCHITECTURE.md、docs/DEVELOPMENT_PLAN.md、src-tauri/src/storage_migration.rs`

## Current Implementation

SQLite 已有 schema_migrations、backup/journal/rollback 和 Vault/known-host/connection 表；前端没有完整 session restore 链路。

## Reusable Components

storage_sqlite.rs/migration.rs、windowState.ts、ConnectionProfile、known_hosts/Vault、WorkspaceState seam（Task 04）。

## Scope

定义 snapshot schema/version、引用而非复制秘密、恢复顺序、凭据/host key 状态、单项失败记录、迁移/备份/回滚；随后接入 UI 入口和遥测/日志。

## Out of Scope

不把私钥/密码明文写入快照、不在一个连接失败时阻塞全 workspace、不删除旧 schema、不用静默截断或伪造恢复成功。

## Dependencies

Task 04 state owner；Task 01 secret/error 审计；Task 03 reducer tests；需要明确品牌数据目录兼容策略。

## Technical Approach

先写 schema 文档和 fixture，再加 SQLite migration；读取→校验→逐项恢复→汇总结果；失败保留原因和可重试动作；旧版本 backup 可恢复。

## Files likely affected

src-tauri/src/storage_sqlite.rs、storage_migration.rs、可能新增 workspace storage module/commands/events；src/layout/workspace；tests；docs。

## Acceptance Criteria

- [ ] schema 有版本、迁移、backup/rollback 和兼容矩阵。\n- [ ] 快照不含明文 secret/private key。\n- [ ] 单 session 失败不破坏其它项，错误可观察。\n- [ ] Windows/macOS/Linux 重启恢复有证据。\n- [ ] 旧数据库和无快照用户行为保持兼容。

## Test Plan

Rust migration/property tests、损坏/权限/中断恢复、前端 restore reducer/E2E、host key/credential missing、三平台 cold restart。

## Cross-platform Notes

窗口几何、数据目录、文件锁、Keychain/Secret Service 和外部 runner 恢复策略分别验证；WSL/Serial/RDP/VNC 不可用时显示明确 partial。

## Security Notes

快照只存 connection IDs、非敏感配置和受控引用；日志脱敏；恢复前重新执行 host key/权限校验，禁止自动信任 changed key。

## License Notes

schema/迁移代码为项目 MIT；外部序列化库若新增须经 license/security audit。

## Migration / Compatibility Notes

递增 SQLite schema version；migration 前备份，失败回滚；保留 windowState v1 兼容；品牌目录/旧版本数据通过显式迁移而非隐式重置。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。

# Canonical 分组存储契约（WF-04A-1）

## 1. Scope / Trigger

修改分组模型、SQLite 升级或 repository 分组方法时读取。产品规则只引用 WORKFLOW_SPEC v0.4 WS-G01–WS-G05。

## 2. Signatures

- `ConnectionGroup { id, name, parent_id, sort_order, color, created_at, updated_at }`
- `StorageRepository::connection_groups()`
- `save_connection_group(&GroupInput, now)`：id=None 创建，否则 rename/move；返回落库记录。
- `delete_connection_group(id)`、`assign_connection_group(connection_id, group_id, now)`。
- `validate_tree(&[ConnectionGroup])`：重复 ID、同级名称、父引用和环校验。
- SQLite schema v3；数据目录版本 v2，旧应用拒绝打开。

## 3. Contracts

`connection_group_schema.rs` 在初始化期间迁移旧平面表，保留 ID/名称/排序/时间，补 parent_id 和默认颜色。parent FK CASCADE 只级联分组；connections.group_id 仍为 SET NULL。root/non-root 唯一索引与 SQL 防环触发器保护直接写入路径。

变更在事务中执行；取得写锁后读取当前树、校验再写，不使用 UI 的旧快照做最终判断。旧名称入口存在歧义时拒绝选任意行。

迁移前 VACUUM INTO 备份覆盖 WAL 已提交内容；迁移连接短暂关闭 FK，事务 copy/drop/rename、foreign_key_check、版本记录，失败回滚，最后恢复 FK。`.data-version` 使用现有 JSON 原子写入工具（数字兼容旧文本解析），防止并发升级时版本文件截断。

目录版本检查先以标准库 `File::lock` 独占 `.data-version.lock`，持锁覆盖读取、判定、备份与原子替换。句柄释放即解锁，不删除锁文件，也不锁会被替换的 `.data-version`。后来者持锁重读，避免重复升级覆盖 `.bak`，以及 Windows 备份/替换句柄争用；锁失败必须在 SQLite 初始化前返回错误。

04A-1 尚未接通 UI/IPC 与新 transfer 格式；旧导出遇到 parent 或非默认颜色时报升级错误，不静默丢字段。04A-3 必须替换该临时保护为完整格式支持。

## 4. Validation & Error Matrix

| 情况 | 错误 |
| --- | --- |
| 重复/空 ID 或空白名 | connection_group_invalid |
| 同级同名 | connection_group_name_conflict |
| 自环/祖先环 | connection_group_cycle |
| 父节点不存在 | connection_group_parent_missing |
| 编辑/删除目标不存在 | connection_group_missing |
| 旧名称匹配多个组 | connection_group_ambiguous |
| 旧格式无法承载树 | connection_group_transfer_upgrade_required |
| 迁移失败或 schema 过新 | connection_group_migration_failed |
| SQL 写入/FK 失败 | connection_group_write_failed |
| 版本锁文件打开或加锁失败 | storage_data_version_lock_failed |

## 5. Good / Base / Bad

Good：两个不同父组下的 Linux 持不同 ID。Base：rename/move 后连接引用保持原 ID。Bad：按名称合并、以删除数据库完成升级、通过吞错假装成功。

## 6. Tests Required

`cargo test --manifest-path src-tauri/Cargo.toml --lib connection_groups`：同级冲突、rename/move/reopen、SQL 防环/FK、删除后连接保留、v2 数据与备份、失败回滚、并发升级、旧名歧义及旧导出保护。相关 storage_migration、storage_repository、sync_snapshot、connection_transfer 回归必须通过。

版本并发测试使用 barrier 同时启动 8 个调用，要求全部成功、最终版本为 2、备份仍为 1；锁文件不可用时旧标记不变且不能创建数据库。Windows runner 必须执行这些测试，macOS 通过不能替代 Windows 文件语义验证。

## 7. Wrong vs Correct

Wrong：`SELECT id ... WHERE name=? LIMIT 1` 随意关联同名组。

Correct：canonical ID 关联；只在旧输入兼容入口按名称解析，匹配多个时明确拒绝。

Wrong：仅用原子 rename 推断整个“读取→备份→替换”可并发执行。

Correct：先锁稳定的独立文件，再检查版本并写入；保留原子替换保证读者不见半写数据。

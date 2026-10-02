# WF-04A 实施切片草案

> 2026-10-02 维护者批准按建议实施，按 04A-1 → 04A-4 顺序推进；真实 A07 GUI 另行留证。

## 当前完成与下一门禁

- [x] 同步 main @ 92e2581，核对 PR #24/#25 与 main CI #199。
- [x] 阅读五份事实来源、审计相关链路、创建子任务并绑定原父任务与分支。
- [x] 记录 PRD、设计选项、审计和切片建议。
- [x] 确认名称、删除及 legacy 修复政策，回写 WORKFLOW_SPEC v0.4。
- [x] 明确 04A-1 repository 与事务迁移契约；维护者已批准实施。

## 04A-1 Canonical model + SQLite migration

- [x] 读取 trellis-before-dev、数据与 IPC 规范；建立纯校验与 repository 边界。
- [x] stable ID/parent/sort/color，原子 CRUD/move/连接归属，self/cycle/orphan/同级冲突校验。
- [x] 向前升级、备份及降级保护；旧 schema / FK / 空组 / 失败回滚 / 重开幂等回归。

## 04A-2 Frontend canonical groups

- [ ] typed IPC、profile 类型、useConnections、ConnectionDialog 一并接入 ID，保留旧输入兼容边界。
- [ ] tree controller 取代 localStorage 业务 owner，保留展开状态；迁移就绪门禁避免空数据覆盖旧树。
- [ ] 创建子组、rename、组移动、连接拖放和错误显示；行为测试覆盖同名路径选择与失败不假成功。
- [ ] 涉及 UI 入口时先读取 ui-ux-pro-max（缺失则查找并报告），在原型母版确认最小交互，不改主题。

## 04A-3 Sync + Export / Import

- [ ] 版本化与旧包读取；保留加密、fingerprint、锁、事务、vault recovery。
- [ ] 父 ID 映射、skip/overwrite 预览与应用一致；合并后冲突/环校验；空组/排序保留。
- [ ] export/import/reopen 与 sync round trip、旧包 fixture、坏版本/摘要、回滚、映射冲突测试。
- [ ] 旧 JSON / 第三方 importer 只做 canonical 边界兼容，不扩大导入功能。

## 04A-4 Legacy migration + A07

- [ ] 原文备份、映射/修复报告与完成标记；解析/写入失败、重复 ID/名称、orphan/cycle、重试/重启幂等测试。
- [ ] 在独立数据环境执行 PRD 的 A07 流程，保存 GUI、导出数据和重启比对证据。
- [ ] 四维证据齐全再评估 A07，不以 unit/mock 或 CI 代替 GUI PASS。

## 验证与交付

本轮仅规划：git diff --check、任务元数据/父子关系/文件引用检查；不运行产品测试/full build、不启动应用、不访问用户数据。

实现后每个切片：定向测试 → 全部相关测试 → source gate → line budget → commit → push → CI；先确认变更文件范围，不纳入原有未跟踪目录。Draft PR，不自行 merge。

可复用验证命令（新增测试名在实施前补齐）：

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib storage_sqlite
cargo test --manifest-path src-tauri/Cargo.toml --lib storage_repository
cargo test --manifest-path src-tauri/Cargo.toml --lib storage_migration
cargo test --manifest-path src-tauri/Cargo.toml --lib sync_snapshot
cargo test --manifest-path src-tauri/Cargo.toml --lib connection_transfer
cargo test --manifest-path src-tauri/Cargo.toml --lib mobaxterm_import
pnpm run check
pnpm test
node scripts/check-connection-transfer-source.mjs
node scripts/check-startup-module-boundary-source.mjs
node scripts/check-line-budget.mjs
git diff --check
```

触及首屏/工作区接线后执行 pnpm run build 并核对重模块未进入首屏。只调整与已批准行为冲突的 source gate，不修改 line-budget.json。GUI/dev server 在验收阶段明确环境后执行。

## 04A-1 自动化证据（2026-10-02）

- connection_groups：9/9，包含并发 v2 schema 升级和目录版本原子盖戳；cargo check 通过。
- 完整 cargo test --lib 在修正目录版本预期、允许现有私钥测试写临时 HOME 文件后 355/355；后续新增 3 项并发/兼容测试以 9/9 定向结果覆盖。
- line-budget、connection-transfer source gate、git diff --check 通过；预算表未修改。
- cargo fmt --check 失败：main 既有多文件格式差异（commands/MCP/X11/旧 importer 等），已通过 git show main:path + rustfmt 复核；不改无关文件。本次新模块经过 rustfmt。
- GUI / 数据：未执行；平台：macOS 本地。A07 尚未完成；UI、sync/transfer 树字段和 legacy 导入仍在后续切片。
- ui-ux-pro-max 已找到并读取 Claude Code 插件缓存 2.13.0 的 SKILL.md。定向 UX 搜索确认：拖动须有菜单/选择替代入口；错误靠近字段并用 role=alert 公告。04A-2 沿现有组件/token 落地。

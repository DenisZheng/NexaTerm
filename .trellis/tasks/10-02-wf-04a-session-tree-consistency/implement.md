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

- [x] typed IPC、profile 类型、useConnections、ConnectionDialog 一并接入 ID，保留旧输入兼容边界。
- [x] tree controller 取代 localStorage 业务 owner，保留展开状态；迁移就绪门禁避免空数据覆盖旧树。
- [x] 创建子组、rename、组移动、连接拖放和错误显示；行为测试覆盖同名路径选择与失败不假成功。
- [x] 涉及 UI 入口时先读取 ui-ux-pro-max（缺失则查找并报告），在原型母版确认最小交互，不改主题。

## 04A-3 Sync + Export / Import

- [x] 版本化与旧包读取；保留加密、fingerprint、锁、事务、vault recovery。
- [x] 父 ID 映射、skip/overwrite 预览与应用一致；合并后冲突/环校验；空组/排序保留。
- [x] export/import/reopen 与 sync round trip、旧包 fixture、坏版本/摘要、回滚、映射冲突测试。
- [x] 旧 JSON / 第三方 importer 只做 canonical 边界兼容，不扩大导入功能。

## 04A-4 Legacy migration + A07

- [x] 原文备份、映射/修复报告与完成标记；解析/写入失败、重复 ID/名称、orphan/cycle、重试/重启幂等测试。
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

## 04A-1 Windows CI 修复（2026-10-02）

- Draft PR #26，首轮 run 36964874600：六项通过，Windows 的目录版本并发升级测试失败（358 passed / 1 failed）。错误为 storage_data_version_write_failed / Access is denied，属于 A07 升级入口的实际并发缺陷。
- 根因：原子替换只保护单次发布，不能串行化多个调用的版本读取、备份和替换；Windows 文件句柄争用使替换失败。
- 修复：独立持久锁文件 `.data-version.lock`，标准库文件锁覆盖整个版本检查/写入，持锁重读，退出释放；失败不继续 SQLite 初始化。不新增依赖、不重试吞错、不跳过 Windows 测试。
- 回归：8 调用 barrier 并发成功，升级前备份不被覆盖；新增锁不可用时版本不变、无数据库副作用测试。
- macOS：`cargo test --manifest-path src-tauri/Cargo.toml --lib connection_groups -- --quiet` 10/10；同命令过滤 `storage` 57/57；line-budget、connection-transfer source gate、git diff --check 通过。Windows 修复结果待新 CI，不代表 A07 GUI PASS。


## 04A-2 实现与证据（2026-10-02）

- PR #26 的 6b96200 CI run 36966178042 七项通过，Windows 并发升级修复已获真实 runner 证据。
- 新增 group list/save/delete/assign typed IPC，与连接写入共用锁；ConnectionProfile/Input 增加 group_id，旧 group 保持名称语义。新 UI 用 ID，旧名称仅在无 ID 的兼容入口解析；未知 ID 拒绝。
- ConnectionPane 不再读写 localStorage 树；useConnectionGroups 持后端投影，展开状态仍本地。编辑框支持父组选择，排除自己和后代；同名组用路径显示、ID 选择，保存失败保留输入。删除整棵子树的确认明确范围，连接回未分组。
- 当前过渡门禁：旧 localStorage 原文非空时保留数据并阻止目录编辑，04A-4 将以一次性迁移替换此门禁；本切片不是可独立升级交付版本。
- 维护者已授权直接实施，沿用现有 Radix/AppSelect/token，不新建原型或视觉体系。真实 GUI、三主题及 A07 验收待完整链路实现后统一留证。
- 新增 profile 字段需要更新各协议的测试构造；连接与 RDP 内嵌测试机械移到相邻 tests.rs 以遵守预算，RDP 运行逻辑未改。删除已失去调用者的 connectionToInput/ensure_group。
- 验证：cargo test --lib 360/360；分组定向 11/11；pnpm test 429 passed / 1 todo；test:scripts 93 passed / 3 skipped；pnpm run check/build、lazy boundary 通过，TerminalPanel/RemoteFileEditor 保持独立 chunk。
- 相关 duplicate、jump、terminal-encoding、system-icon、dialog-host-key、remote-editor、workspace-activation、transfer source gate 通过；jump gate 的两个旧标识已对照 main 实现纠正，不改跳板行为。全仓已有 fmt 漂移仍不作为本切片清理范围。


## 04A-3 实现与证据（2026-10-02）

- 04A-2 commit 96db79c 的 CI run 36969978221 七项通过后开始。
- 新格式 sync v3 / transfer v2 保留完整树字段；旧 v2 sync / v1 transfer 按原版本验证，旧结构固定字面量测试覆盖 digest/AAD 与默认字段。临时 flat-export guard 已移除。
- 共用 group transfer model：先父映射、同级名称冲突、最终树验证，事务内按父优先持久化，保留 stable ID/FK/排序/空组。preview 接收 strategy，UI 切换重新预检，失败后仍能更换策略。
- 审计发现 sync 原先先写 Vault 后替换 SQLite，失败可留下半更新；这会影响 A07 数据安全，当前复用既有 recovery journal + secret restore 修复，新增 SQL 失败回滚测试。没有新增同步合并产品语义，sync 仍是整份替换。
- 本地证据：完整 Rust lib 367/367；随后补充 ID/同级名称双重冲突案例以 transfer 定向验证；sync 定向 11/11。pnpm check/test/build 与 transfer source gate、line budget 通过，重模块仍独立。真实 GUI/A07 尚未验收。

## 04A-4 实现与证据（2026-10-02）

- 04A-3 commit 8e6d444 / CI run 36979404915 七项通过后开始。
- 旧 localStorage 原文备份、事务迁移、完成报告、歧义显式逐行映射已接通；原始 key 保留。并发持锁重读，完成后不重放，后续 rename/move 不被旧树覆盖。
- 前端只在迁移完成后开放树写入；迁移失败不阻止其它启动流程，提供报告与重试。展开状态独立迁移到 v2；成功前不写默认值，旧 v1 保留。
- 本地验证：Rust lib 374/374；frontend 432 passed / 1 todo；scripts 93 passed / 3 skipped；pnpm check/build、transfer/startup source gate、line budget、git diff --check 通过。新模块 rustfmt；已有全仓 fmt 漂移不扩展处理。
- 真实 GUI / 数据证据仍待执行，当前不宣称 A07 PASS。平台：macOS 本地；Windows/Linux 以本切片新 CI 为准。

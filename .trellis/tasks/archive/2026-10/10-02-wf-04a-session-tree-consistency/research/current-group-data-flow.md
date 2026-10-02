# WF-04A 分组数据流审计

日期 2026-10-02；源码基线 main `92e2581f9b1b286a7a6c585bb8d98754b628a269`。未读取个人数据库/localStorage，未运行真实 GUI；建议不是已确认规则。

## 仓库与 CI

- 起点 feat/wf03a-left-files-view @ a13a200；执行 git status、git switch main、git pull --ff-only、git log -5 --oneline。main/origin/main 均 92e2581，PR #24 cf989bf 和 PR #25 92e2581 均在历史中。
- origin 实际指向 GitHub DenisZheng/NexaTerm，无 Gitee remote；不用旧文档远端约定覆盖事实。
- 原有未跟踪目录 `.trellis/tasks/10-01-10-01-sqlite-busy-timeout-fix/`、`.workbuddy/` 保留，因此不能称整个工作区干净；原有 tracked 文件无改动。
- [main CI #199](https://github.com/DenisZheng/NexaTerm/actions/runs/36959152885) jobs API：Frontend、Security、License、Fixtures、Rust Linux/macOS/Windows 全部 completed/success；Windows package completed/skipped。这不是 A07 GUI 或安装包通过证据。
- 无现有 WF-04A branch/task；创建 feat/wf04a-session-tree-consistency 与 10-02-wf-04a-session-tree-consistency，parent=09-23-nexaterm-workflow-mainline，base=main，planning。
- get_context.py 提示 developer 未初始化；使用 CLI 支持的 --assignee codex 创建，正常绑定当前 session，没有初始化额外 journal 或修改开发者身份。
- .codegraph 不存在，使用本地搜索，未初始化索引。PR #12 未修改。
- ROADMAP 与父 PRD 部分旧状态未更新；按真实 main 和用户最新范围继续，只补 WF-04A 链接，不重开旧阶段。

## owner 与调用链

| 层 | 已核实事实 | 源码定位 |
| --- | --- | --- |
| 前端树 | CustomGroup(id/color/name/parentId)，state 从 mxterm.connectionGroups.v2 加载并回写；组数组次序决定组显示顺序 | ConnectionPane.tsx:86、128、180、501、1163 |
| 前端关联 | connection.group 经 trim/旧 UI ID 回查转名称；组内连接按名称过滤 | ConnectionPane.tsx:535、1253 |
| dialog | label 是路径，value 是名称；seenValues 按名称去重 | ConnectionDialog.tsx:3123、3261 |
| 归属写入 | UI group ID 转名称 → WorkspaceShell.moveConnectionToGroup → useConnections.upsert → connectionUpsert → repository.ensure_group(name) | ConnectionPane.tsx:621；WorkspaceShell.tsx:7491；storage_repository.rs:765、2445 |
| SQLite | group UUID，name 全局 UNIQUE，sort_order 默认 0，无 parent/color；connection.group_id FK ON DELETE SET NULL | storage_sqlite.rs:36–88 |
| 连接读取 | LEFT JOIN group 返回 g.name 而非 stable group ID；按 created_at/name 排序 | storage_repository.rs:899–912、2486 |
| sync | SyncConnectionGroup 只有 id/name/sort_order/created_at/updated_at；连接用 group_id；从 SQLite 生成快照 | sync_snapshot.rs:64；storage_repository.rs:536 |
| sync 导入 | 校验 ID/连接引用，备份后整份 replace_sync_data，不是逐组名称合并 | sync_snapshot.rs:223–263、335；storage_repository.rs:326 |
| 原生 transfer | mxterm-connections v1，复用 SyncConnectionGroup；冲突按 ID 或全局名，映射 imported ID 到 local ID | connection_transfer.rs:21、274–337、608、633–680 |

## A07 缺口

1. 创建空组只写 localStorage，连接 upsert 才 ensure_group；空组、纯结构父组可能不在 export/sync 中。
2. rename 先更新 UI，再按名称逐条异步 upsert 连接；可能创建新数据库 group ID，旧 group 行仍保留，不是原子 rename。
3. deleteGroup 收集全部 descendant，从 UI 删除整棵子树，连接逐条回未分组；不删 connection，未相应删除 SQLite group 行，确认文案未明确全部子组。
4. 当前只有连接拖放/归属移动，没有 group reparent 路径。名称冲突直接 resetGroupForm，不显示错误。
5. readStoredGroups 弱检查 id/name/color，无 duplicate/cycle 校验。orphan 展示为 root；完整环可能无 root 而不可见。解析失败返回 []，随后 effect 回写可能覆盖旧原文。
6. UI 不写数据库 sort_order；连接无自定义 sort 字段，普通组内沿 repository 创建时间/名称顺序，不能宣称已有拖拽排序。
7. 没有 legacy 树 → SQLite 的幂等迁移/完成标记/映射与备份协议；sync/transfer 缺 parent/color。

## 版本与兼容

- SQLite v2：initialize 执行 CREATE IF NOT EXISTS 和若干 ensure_column，再记录 schema_migrations；没有 group tree migration（storage_sqlite.rs:9、235–254）。
- 目录 .data-version v1 与 SQLite/Vault 独立；StorageMigrator 按旧 JSON profile.group 名称建立平面组，保留 .migrated.bak（storage_migration.rs:16–20、194–222、485）。
- sync v2：manifest 含 db_schema_version，拒绝不匹配协议或过新 schema；AAD 包含版本。现有 ID/连接引用验证不能覆盖父关系和同级唯一。
- transfer v1：skip/overwrite，默认 skip；preview fingerprint，apply 重读校验，数据库备份、事务、vault recovery journal 均需保留。
- transfer 全局 name BTreeMap；ID/name 同时命中不同本地行则拒绝。方案 B 必须改成父映射后的同级冲突，并验证最终合并树。
- ConnectionProfile / Input.group 目前是名称，IPC spec 明确禁止传 UI tree ID；canonical ID 接入要同步改契约，不偷偷改旧字段语义。
- 旧 JSON migrator、mobaxterm_import.rs:715 仍传 group 名称/路径给 upsert，必须兼容；本任务不扩大第三方导入功能。
- 老包摘要依赖原序列化结构，AAD 绑定版本/摘要；先验证旧格式，再转新内部模型，避免新增默认字段破坏合法旧包。

## 证据边界

本轮完成静态审计与规划，不运行产品测试/build，不操作用户数据。main CI 仅为起点基线。A07 实现、自动化回归、真实 GUI / 数据证据与平台验收全部仍待完成。

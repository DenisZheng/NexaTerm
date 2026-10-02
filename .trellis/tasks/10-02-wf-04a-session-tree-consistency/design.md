# WF-04A 实施设计

2026-10-02 维护者批准推荐 B 及其它建议。下表保留决策比较；当前规则以 WORKFLOW_SPEC v0.4 WS-G01–WS-G05 为准。事实基线见 research。

## 名称唯一范围

| 影响 | A：全树唯一 | B：同一 parent 内唯一（推荐） |
| --- | --- | --- |
| 使用 | 不同环境不能都有 Linux，须加前缀 | Production/Linux 与 Development/Linux 可并存 |
| SQLite | 保留 UNIQUE(name)，增加树字段 | 移除全局唯一，约束 parent + name；root 的 NULL 须单独唯一约束 |
| import identity | stable ID 或全局名冲突，接近现有逻辑 | stable ID 或映射后 parent + name 冲突；先解父映射，不能全局同名合并 |
| sync identity | 保持 ID/group_id，增加 parent | 同样按 ID；名称只做同级合法性校验；保留整份快照导入，不新增多端合并模型 |
| legacy | 无歧义名称映射数据库 ID；重复仍须处理 | 原有效全局唯一数据兼容；只在迁移时用旧名映射，歧义报告 |
| rename/move | 任意位置重名拒绝；rename 不更换 ID | 校验目标 parent 同名；移动子树不改变连接 group_id |
| export/import | 都须版本化并保存 parent/sort/属性 | 同左，增加父映射后的同级冲突与最终树校验 |
| UI 路径 | 提供上下文，值仍建议 canonical ID | 路径区分同名组，value 必须 canonical ID，禁止按名称去重隐藏 |

推荐 B：目录层级本身提供命名空间；04A 本就要打通 ID，避免以后再迁移名称和关联。代价是唯一约束与导入映射复杂度增加。

建议名称 trim 后非空、大小写敏感，沿用现有比较，不额外引入 casefold。冲突报错且保留输入，不自动改名/覆盖。

## 其它语义

- 删除：建议沿用删除整棵分组子树、所有连接回未分组；一个事务完成，确认文案明确子组数量/范围。绝不级联删除 connection。提升子组或禁止非空删除需批准。
- 正常写入：repository 事务内拒绝 self/descendant/orphan，UI 禁用不能代替后端检查；FK 不能单独防环。
- legacy：原文备份后生成迁移计划。建议 orphan 提升 root、环按稳定规则断边并逐项报告（已确认）；重复 ID/名称造成关联歧义时保留数据并要求映射，不猜关联、不静默改名。
- 排序：建议把现有组数组的 sibling 相对顺序持久化，移动至目标末尾；连接保留现有 created_at/name 顺序。不顺便增加自定义连接排序能力。

## owner 与适配边界

SQLite/repository 为唯一业务 owner：stable ID、parent_id、name、sibling sort_order、现有 color；connections 通过 group_id 关联。前端纯 model/controller 持加载投影、编排 typed IPC，WorkspaceShell 只接线。rename/delete 不再逐条 upsert 连接模拟。

展开状态继续本地保存，用旧 UI ID → canonical ID 映射迁移 key。ConnectionProfile.group、ConnectionDialog、useConnections、旧 JSON / 第三方 importer 名称入口要一起适配；不偷偷改变旧字段语义。旧名匹配多个组时拒绝猜测；路径不是主键。

SyncConnectionGroup 与 transfer 贯穿 stable ID/parent；预览和 apply 共享映射校验，既检查文件内部，也检查合并后的最终树。

## 版本与恢复

- 当前 SQLite v2、目录 v1、sync v2、transfer v1 独立；确认后决定新版本及旧应用写入拒绝机制，不能只加常量。
- 表重建若必要，保留 ID/FK/时间和所有旧行，事务内校验、最后记录版本；失败回滚。
- 旧包先用原结构验证 digest/AAD，再迁移内部模型；不能加默认字段后才验证旧摘要。旧平面组映射 root，保留 ID。
- legacy 原始备份、摘要、ID 映射、完成标记可追溯；规范写入与标记原子化，失败可重试，成功后不重新导入。
- 04A-2 切换前必须有迁移就绪门禁，避免 SQLite 空树覆盖 legacy；04A-2 到 04A-4 的不完整组合不作为可升级交付。
- 回退使用升级前数据库与 legacy 备份，不承诺旧二进制直接读新树。

## 04A-1 具体边界

新增 connection_groups 纯模型与 repository 模块，提供 list/create/update(move+rename)/delete/assign；事务内读取并验证整棵树。旧名称 ensure_group 暂时继续支持，无歧义时沿用现有 ID，歧义拒绝，不选任意行。04A-1 不暴露 UI/IPC 树写入；直到 04A-3 格式支持前拒绝导出真实嵌套树，防止静默降为平面。

SQLite v3 通过独立迁移模块重建 groups，保留 ID/name/sort/timestamps，补 parent_id/color；FK 引用和环由数据库触发器保护，同级唯一使用 root/non-root 两个索引。迁移前用 VACUUM INTO 创建一致备份（涵盖 WAL），关闭 FK 仅在迁移连接、事务外；事务内 copy/drop/rename 后 foreign_key_check，失败 rollback，恢复 FK。旧 schema 高于应用版本时拒绝初始化。目录 v2 拒绝旧应用打开，失败保留备份与版本保护，不假装旧应用可直接读新版。

测试使用临时数据库，覆盖 v2 数据和空组/连接关系、重复初始化、同级冲突、环、orphan、删除回未分组、旧数据不满足新规则时原子回滚。新建 fresh DB 不需要老数据备份。

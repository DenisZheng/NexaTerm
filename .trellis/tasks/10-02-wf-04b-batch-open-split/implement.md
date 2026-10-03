# WF-04B 实施切片

## 04B-0 启动
- [x] 从 main @ df436408 建 `feat/wf04b-batch-open-split`。
- [x] 读取 9-23 mainline、Delivery Plan、WORKFLOW_SPEC、ROADMAP 与现有 split / ConnectionPane / open path。
- [x] 维护者授权“连接全部”性能保护 UX；WORKFLOW_SPEC 升 v0.5，WS-X09 已确认。

## 04B-1 Batch plan / lifecycle
- [x] canonical group 递归目标与 path。
- [x] 已打开默认跳过、最多 20 选择。
- [x] 最多 4 active，waiting-user 占槽。
- [x] partial failure 不回滚成功。
- [x] cancel remaining 与 failed retry 纯模型测试。

## 04B-2 Tree preview / orchestration
- [x] 自定义组“连接全部…”入口。
- [x] 预览：递归开关、选择、协议/path/auth/open 状态、20 限制。
- [x] 可取消的 4 并发执行器；waiting-user 保持占槽，active cancel 只触及本批 handle。
- [x] 批次进度与结果；状态面板留在 Sessions 侧栏，credential/host-key 可聚焦到具体实例处理。
- [x] 复用现有 open/cancel；batch handle 绑定新建实例 ID，取消不按 connectionId 关闭旧实例。

## 04B-3 Split
- [x] 复用现有 2/4 pane 与拖动比例，不新增布局引擎。
- [x] pane 明确选择已打开实例，binding 始终为具体 tabId。
- [x] pane 显式新建实例：SSH（即使 profile 已打开）、Telnet/Serial 与默认本地终端。
- [x] split host 改为具体 terminal binding；删除会漂移的数字 anchor，标签位置从 host 实例动态计算。
- [x] host 实例关闭但仍有 >=2 pane 时转移到第一个存活 binding；同 profile sibling 不冒充原 host。
- [x] 一次操作焦点唯一；现有 picker/move binding 行为继续复用。

## 04B-4 A08 / delivery
- [x] 自动化：成功 + 失败 + cancel + retry + pre-existing isolation（model / executor / workspace runtime 测试 + WF-04B source gate）。
- [x] 真实 Tauri A08 四维证据（2026-10-03，见 [验收记录](validation/a08.md)）。
- [x] Split 2/4 pane GUI smoke（真实 GUI 记录 + 维护者手动补验）。
- [x] Draft PR 保持未合并；最终 CI 全绿后等待维护者授权 merge。

每个切片：定向测试 → 相关全量 → source gate → line budget → commit → push → CI。不要修改 line-budget.json；不要启动 WF-04C / WS-X04。


## 04B-1 / 04B-2 自动化证据（2026-10-02）

- CI #214 @ `5ff62e9` 全绿，确认 WS-X09 文档与 04B-1 初始纯模型基线。
- 执行器首轮 CI #216 暴露主动 cancel 与 wait rejection 的竞态：active attempt 会被误记为 failed。
- `771ac08` 修复为先原子记录 cancelled 再调用底层 cancel；CI #217 Frontend / Fixtures / Rust Linux / macOS / Windows / Security / License 全绿。
- 04B-2 在此基线上新增：预览 UI、20 项选择保护、侧栏批次状态、实例级 focus/cancel、RDP/VNC/SSH/Telnet/Serial 运行态映射；最终代码基线 CI #223 全绿。
- `WorkspaceShell.tsx` 保持低于既有 13860 line budget，未修改 `scripts/line-budget.json`。
- 此阶段尚未执行真实 Tauri A08；2026-10-03 已完成，证据见 [验收记录](validation/a08.md)。


## 04B-3 实施说明（最终代码基线 CI #223 全绿）

- `TerminalSplitHost` 从 SSH connection / generic local owner 改为具体 `TerminalPaneBinding`，解决同 profile 多实例时标题、宿主和标签锚点歧义。
- 删除 `anchorIndex` / `split/setAnchorIndex`；分屏组插入位置由 exact host tab + 当前成员集合实时计算，避免前序 tab 关闭/增加后数字索引漂移。
- reducer 在 host binding 失效且布局仍 >=2 pane 时转移到第一个存活 pane；单 pane 仍沿原逻辑折叠回独立 tab。
- Split picker 继续列出已打开实例，同时所有 SSH profile 均提供“新建 SSH 实例”；Telnet/Serial 增加显式新建实例入口。批量连接仍不会自动进入 Split。
- 新增 WF-04B source gate，固定 20/4 限制、实例级 cancel、exact split host、无 numeric anchor 与已确认 WS-X09。
- `WorkspaceShell.tsx` 预计算版本 13848 行，低于既有 13860 预算；未修改 `scripts/line-budget.json`。


## 04B-4 验收准备

- A08 自动化映射：
  - success + failure / partial failure：`batchConnectExecutor.test.ts`
  - cancel queued + active 且主动 cancel 不误报 failed：`batchConnectExecutor.test.ts`
  - failed-only retry：`batchConnectModel.test.ts`
  - pre-existing 默认跳过：`batchConnectModel.test.ts`
  - cancel/focus 使用本批 exact instance ID、close plan 不带 connectionId：`batchConnectWorkspaceRuntime.test.ts`
- `tests/fixtures/README.md` 已给出真实 Tauri A08 场景：同一真实 SSH fixture 下的 pre-existing / success / wrong-user failure / prompt waiting-user 四 profile，以及 Split 2/4 pane smoke。
- 新增 Split picker 分组文案进入 English/zh-CN i18n；不把本轮新增中文硬编码留在 shell。
- 真实 A08 与 Split GUI smoke 已在 Tauri 窗口完成；自动化和人工证据分别记录于 [验收记录](validation/a08.md)，不互相替代。

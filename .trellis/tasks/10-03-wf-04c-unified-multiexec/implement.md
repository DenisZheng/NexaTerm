# WF-04C 实施切片

## 04C-0 启动
- [x] 从 main @ e2a8b99 建 `feat/wf04c-unified-multiexec`。
- [x] 读取 9-23 mainline、WORKFLOW_SPEC、旧 Command Sender / Sync Input 与已有 `workspace/multiExec`。
- [x] 维护者确认 WS-X04；WORKFLOW_SPEC 升 v0.6。

## 04C-1 状态模型
- [x] `off/live/send` 三态。
- [x] targets 显式选择后固定。
- [x] availability 只收缩，不因焦点自动加 target。
- [x] 断线 target 失效；重连同 profile 新实例不自动加入。
- [x] source 与 targets 分离的固定目标语义测试。

## 04C-2 目标投影
- [x] SSH / Local / Telnet/Serial 实例级 target 投影。
- [x] 同 profile sibling 可同时选择。
- [x] RDP/VNC 不进入 terminal target 列表。
- [x] 删除 Command Sender connectionId→active-tab target owner；Command Sender 与 Split Sync 共用 MultiExec target Set。

## 04C-3 live
- [x] 单一 source 输入链路：当前活动 terminal instance。
- [x] source 在 targets 时不重复写回。
- [x] 每目标每次输入最多写一次。
- [x] 写入失败 target 从固定集合收缩；其它目标继续，全部目标失效时 live 自动关闭。

## 04C-4 send
- [x] Command Sender 使用统一 targets。
- [x] written / failed / disconnected 逐项目标结果。
- [x] 未知结果不自动重发。
- [x] history/snippets 继续复用，不扩范围。

## 04C-5 A09/A10
- [x] 自动化边界覆盖。
- [ ] 真实 Tauri A09。
- [ ] 真实 Tauri A10。
- [ ] Draft PR；全绿 + 实测通过后等待维护者授权 merge。

每个切片：定向测试 → 相关全量 → source gate → line budget → commit → push → CI。不要修改 line-budget.json。


## 04C-1 自动化证据

- `multiExecReducer` 已支持 `off/live/send`。
- `setTargets` 是唯一显式增加 target 的 action；`targetsAvailable` 只做失效收缩。
- 测试覆盖：焦点切换不改变 targets；旧实例断线后新实例即使同 profile 且获得焦点也不会自动加入。
- 旧 Split Sync 的 `setLive` 与 `splitActive` 自动关闭暂时作为过渡兼容，后续 04C-2/3 迁移到统一 controller 后删除。
- 新增 `check:wf04c-multiexec` source gate，固定 WS-X04 v0.6，不修改 `scripts/line-budget.json`。


## 04C-2 目标投影准备

- 新增纯 `targets.ts`：只从已连接 SSH terminal 与 Local/Telnet/Serial runtime tab 生成实例 target。
- target key 严格复用 `terminalPaneBindingKey`：`ssh:<tabId>` / `local:<tabId>`；owner/profile 只保留展示/历史用途，不参与 identity。
- 同 profile 两个 SSH 实例会同时输出两个 target。
- `selectLiveFanoutTargets` 显式排除 source key，确保 source 自身不被重复写回，同时不修改固定 selected set。
- RDP/VNC 没有进入此 terminal projection 的输入类型，不能被误加入 MultiExec。
- 下一步才迁移 WorkspaceShell / Command Sender 的旧 connectionId→active-tab owner；本切片不伪称已完成该迁移。


## 04C-2 owner 迁移

- `useTerminalSplitController` 暴露通用 `multiExecTargets / setMultiExecTargets`，旧 Split participant setter 只保留兼容别名。
- MultiExec availability 从“当前 Split pane”扩大到全部已连接 terminal instance；reconcile 仍只收缩，不读取焦点。
- Command Sender 删除自己的 `selectedCommandTargetKeys`、`commandSenderTargetTabByConnectionId` 与 `syncCommandSenderTargetTab`。
- Command Sender 目标 UI 从“每 connection 一行 + 子 tab 下拉”改为“每实例一行”；同 profile 两个实例可以同时勾选。
- 打开 Command Sender / 插入历史或片段不会自动全选 targets；只有用户显式全选/勾选/取消会增加或删除 target。
- SSH/Local 的 focus/activate 路径不再修改 targets。
- 旧 `check-command-sender-active-tab-source.mjs` 改为固定实例 target contract；`check-command-sender-mvp-source.mjs` 同步移除 active-tab selector 旧要求，不删除实际发送/顺序写入/状态反馈门禁。
- `WorkspaceShell.tsx` 预构建为 13,696 行，低于既有 line budget；未修改 `scripts/line-budget.json`。


## 04C-3 live 实施准备

- 新增 `multiExec/live.ts`，从固定 selected keys 解析 fan-out；source key 始终排除。
- 单测覆盖：
  - source 本身被选中时不重复写回；
  - source 未被选中时仍可向固定 targets 广播；
  - 两个目标各写一次；
  - 单个目标失败不会重放成功目标。
- live source 使用 `activeTerminalToolbarTabId`：普通终端为当前实例，Split 为当前焦点 pane；切焦点只改变 source，不改 targets。
- “开启同步输入”不再自动全选 Split panes；没有显式 target 时拒绝开启并提示先选择目标。
- source target checkbox 不再锁定；source 与 target 是两个独立概念。
- 离开 Split / 激活 standalone terminal 不再自动关闭 live；Split reset 只结束 live mode，不清空 target Set。
- live 部分写入失败时移除失败 target 并保留其余 targets；不自动重试。
- `WorkspaceShell.tsx` 预构建 13,699 行，未修改 line budget。


## 04C-4 send 实施证据

- 新增 `multiExec/send.ts`：按显式 target key 顺序逐个解析当前 runtime instance，每个目标最多写入一次。
- runtime target 在轮到发送前已关闭/断线时返回 `disconnected`，不会尝试写入；write reject 返回 `failed`；成功仅表示 `written`。
- executor 不使用 `Promise.all`、不重试失败/断线/未知结果；后续目标仍继续一次。
- Command Sender 发送时进入统一 `send` mode，关闭面板后从 `send` 回到 `off`；AI 单目标直接发送不改变 MultiExec mode。
- history/snippets 仍只记录实际 `written` 的目标，失败/断线不计入成功 target_count，也不触发自动重发。
- 新增 `send.test.ts` 覆盖顺序一次写入、断线不写、部分失败继续且零重试；source gate 已迁移到新 executor。


## 04C-5 自动化与实机验收准备

- 新增 `multiExec/acceptance.test.ts`，按 Delivery Plan 的 A09/A10 原文串联 reducer + target projection + live + send，而不是只依赖分散单测。
- A09 自动化固定四个运行实例、显式选择两个：焦点变化不改 target Set；live 从任一已选 source 输入时只 fan-out 一次到另一个已选目标；send 只向两个已选实例各写一次，未选实例无写入。
- A10 自动化模拟同 profile 旧实例断线并出现新实例：availability 只移除旧 key；新 key 即使获得焦点也不自动加入。即使 send 拿到旧快照，旧 key 只返回 `disconnected`，不会写新实例、不会重试，剩余有效目标继续一次。
- `tests/fixtures/README.md` 与 `validation/a09-a10.md` 已写真实 Tauri A09/A10 操作清单；自动化通过不能替代 GUI 结果。真实验收通过前不得把 A09/A10 标记 PASS，也不得合并 PR #28。

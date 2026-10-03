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
- [ ] 删除 Command Sender connectionId→active-tab target owner。

## 04C-3 live
- [ ] 单一 source 输入链路。
- [ ] source 在 targets 时不重复写回。
- [ ] 每目标每次输入最多写一次。
- [ ] 目标断线立即失效并更新 UI。

## 04C-4 send
- [ ] Command Sender 使用统一 targets。
- [ ] written / failed / disconnected 逐项目标结果。
- [ ] 未知结果不自动重发。
- [ ] history/snippets 继续复用，不扩范围。

## 04C-5 A09/A10
- [ ] 自动化边界覆盖。
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

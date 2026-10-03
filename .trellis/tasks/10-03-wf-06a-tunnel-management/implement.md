# WF-06A 实施切片

## 06A-0 启动
- [x] 从 WF-05C @ 48579d839 建 `feat/wf06a-tunnel-management`。
- [x] 对齐 WS-N01 / A12，确认 local/remote/dynamic 与既有状态枚举已存在。
- [x] 确认顶部 `tools.tunnels` action 已存在，不重复造入口。

## 06A-1 connection lifecycle
- [x] backend 增加按 connection 停止全部 tunnel 的 API。
- [x] 删除 SSH connection 前等待 tunnel cleanup。
- [x] “关闭该 connection 全部会话”时触发 tunnel cleanup。
- [x] sibling connection 的 tunnel 不受影响。
- [x] source gate + CI。

## 06A-2 error/capability
- [ ] 端口冲突错误与 rule 状态关联。
- [ ] credential_required / Host Key 流程回归。
- [ ] rule 与 active/saved connection 展示关联回归。

## 06A-3 A12 tunnel phase
- [ ] local/remote/dynamic 真实 fixture。
- [ ] 关闭/取消后无 listener / remote-forward / SSH resource 残留。
- [ ] A12 tunnel phase 记录，等待 WF-06B 两级 Jump 一起验收。

不要修改 `scripts/line-budget.json`。


## 06A-1 实施证据

- 新增 `TunnelConnectionRequest` / `tunnel_stop_connection`。TunnelManager 从持久化 rule store 只筛选目标 `connection_id`，逐条复用既有 `stop_running`，不触碰 sibling connection 的 tunnel。
- `stop_running` 保持原资源语义：local/dynamic abort accept loop；remote cancel remote-forward + clear target；三类均关闭 reusable SSH forwarding session。
- 删除 saved SSH connection 前同步等待 `tunnelStopConnection(connection.id)`，避免先删 profile 后留下运行中的 forwarding session。
- “关闭该 connection 全部会话”路径在关闭 terminal/RDP/VNC 前触发 `tunnelStopConnection`；单独关闭一个 SSH terminal instance 不停止 connection 级 tunnel，避免兄弟实例误伤。
- Rust unit test `rules_for_connection_keeps_only_requested_connection` 锁定 connection 过滤边界；source gate 同时锁定顶部 `tools.tunnels` action、三类 tunnel、既有状态枚举、credential/Host Key seam 和 lifecycle wiring。
- 未修改 `scripts/line-budget.json`。

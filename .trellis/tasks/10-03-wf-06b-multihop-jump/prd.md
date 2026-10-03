# WF-06B 多级 Jump

> 父任务：`09-23-nexaterm-workflow-mainline`
> 堆叠基线：WF-06A `e7bf637b9cf93d57af926fed3e67be331999bf51`
> 规范：WS-N02 / A12。

## 目标

现有 profile schema 已能表达链：
`Target.jump -> Jump-1`，且 `Jump-1.jump -> Jump-2`。
WF-06B 不新增第二套 profile schema，而是让 backend 真正执行该链。

原 v1 要求是**两级跳板进入目标主机**。当前 `connection_jump_nested_unsupported` 明确拒绝嵌套，不能算完成。

必须做到：
- 连接计划明确为 Jump-2 → Jump-1 → Target；
- Terminal / Exec / Files(SFTP) / Tunnel 共用同一计划；
- 每一跳独立认证、Host Key、connect/auth/direct-tcpip timeout；
- 错误能定位到具体 jump connection；
- 任一阶段失败/取消时释放此前已建立的 jump clients/channels；
- 关闭最终 session 时反向释放全部中间 SSH clients；
- 两级真实 Docker fixture 验证 Terminal + Files；Tunnel 复用同一 backend 路由；
- A12 与 WF-06A Tunnel Phase 合并后再做真实 Tauri 验收。

## Out of scope

- 不引入无限多跳 UI；
- 不改变 RDP/VNC/Telnet/Serial；
- 不启动 WF-06C X11；
- 不修改 PR #12 或 `scripts/line-budget.json`。

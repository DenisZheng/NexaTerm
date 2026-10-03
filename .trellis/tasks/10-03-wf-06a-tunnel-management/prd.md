# WF-06A 隧道管理

> 父任务：`09-23-nexaterm-workflow-mainline`
> 堆叠基线：WF-05C `48579d83903db2c16188fa3869342cbca6d843de`

## 目标

复用已有 `TunnelPanel.tsx` 和 Rust `TunnelManager`，完成 WS-N01：

- 顶部 toolbar/menu 的 `tools.tunnels` 是正式入口；
- local / remote / dynamic 三类规则保持既有实现；
- 状态继续使用 `stopped / starting / running / failed / credential_required`，不另起状态机；
- 规则明确关联 saved SSH connection；
- 端口冲突、凭据缺失、Host Key 错误保持可定位；
- “关闭该连接全部会话”与删除 SSH connection 时，属于该 connection 的运行 tunnel 必须停止并释放 listener/remote-forward/session；
- A12 的三类 tunnel 真实连接测试在后续 06A 验收边界准备。

## 不在本切片

- 多跳 Jump（WF-06B）
- X11（WF-06C）
- 重做 TunnelPanel UI
- 修改 line budget / PR #12

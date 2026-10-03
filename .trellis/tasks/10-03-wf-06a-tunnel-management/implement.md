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
- [x] 端口冲突错误与 rule 状态关联。
- [x] credential_required / Host Key 流程回归。
- [x] rule 与 active/saved connection 展示关联回归。

## 06A-3 A12 tunnel phase
- [x] local/remote/dynamic 真实 fixture。
- [x] 关闭/取消后无 listener / remote-forward / SSH resource 残留。
- [x] A12 tunnel phase 记录，等待 WF-06B 两级 Jump 一起验收。

不要修改 `scripts/line-budget.json`。


## 06A-1 实施证据

- 新增 `TunnelConnectionRequest` / `tunnel_stop_connection`。TunnelManager 从持久化 rule store 只筛选目标 `connection_id`，逐条复用既有 `stop_running`，不触碰 sibling connection 的 tunnel。
- `stop_running` 保持原资源语义：local/dynamic abort accept loop；remote cancel remote-forward + clear target；三类均关闭 reusable SSH forwarding session。
- 删除 saved SSH connection 前同步等待 `tunnelStopConnection(connection.id)`，避免先删 profile 后留下运行中的 forwarding session。
- “关闭该 connection 全部会话”路径在关闭 terminal/RDP/VNC 前触发 `tunnelStopConnection`；单独关闭一个 SSH terminal instance 不停止 connection 级 tunnel，避免兄弟实例误伤。
- Rust unit test `rules_for_connection_keeps_only_requested_connection` 锁定 connection 过滤边界；source gate 同时锁定顶部 `tools.tunnels` action、三类 tunnel、既有状态枚举、credential/Host Key seam 和 lifecycle wiring。
- 未修改 `scripts/line-budget.json`。


## 06A-2 实施证据

- Rust 单测锁定三类规则级错误状态：本地端口冲突保持 `status=failed + rule_id + tunnel_local_bind_failed`；prompt 凭据保持 `status=credential_required + credential_prompt_required`；Host Key 未信任保持 `status=failed + host_key_unknown`，等待前端显式信任后重试。
- 实际 start path 仍按原逻辑：`TcpListener::bind` 失败时写入 `failed_state`；`resolve_saved_connection` 返回 prompt 错误时写入 `credential_required_state`；其它连接/Host Key 错误写入 `failed_state` 后向前端抛出结构化错误。
- TunnelPanel 继续用 `parseHostKeyError` 识别结构化 Host Key payload，用户显式信任后 `knownHostTrust -> startRule` 重试；credential prompt 仍保留当前 rule 上下文并把 runtime credential 传回同一 rule。
- 新增 `tunnelRuleConnectionState.ts`：rule 根据持久化 `connection_id` 解析 saved SSH connection。若 connection 已不存在，列表明确显示“连接不存在”且禁用“启动”，避免 orphan rule 点击后才由 backend 报错。
- WorkspaceShell 仍只把 `connections.filter(isSshConnection)` 传入 TunnelPanel，非 SSH profile 不会成为 tunnel rule 目标。
- 这些测试验证状态/交互契约，不冒充真实 SSH 凭据或真实 Host Key 互操作；真实 tunnel 连接留给 06A-3 / A12。


## 06A-3 实施证据

- 新增 ignored Linux fixture test `tunnel_fixture_local_dynamic_remote_real_ssh`，由现有 Docker fixture smoke 显式运行；普通三平台 Rust test 只编译、不依赖 Docker。
- test-only `ReusableForwardSession::connect_fixture` 仍使用生产 `KnownHostClient`、真实 host-key trust、russh public-key authentication 和生产 forwarding methods；不是 mock SSH transport。
- Local：生产 `run_tunnel_accept_loop -> forward_tcp_stream -> direct-tcpip` 访问 Docker 网络中的 `ssh-target:22`，读取真实 OpenSSH banner；`stop_running` 后同一 local port 必须可重新 bind。
- Dynamic：通过生产 SOCKS5 parser/CONNECT 打到 `ssh-target:22` 并读取真实 OpenSSH banner；`stop_running` 后 SOCKS listener 必须释放。
- Remote：生产 `set_remote_forward_target + request_remote_forward` 创建真实服务器端监听，从第二条真实 SSH session 在 jump host 内回连，数据穿过 forwarded-tcpip 到本机 TCP echo target；`stop_running` 执行 `cancel_remote_forward + clear target + close SSH`，第二条 SSH session 随后确认远端监听已不可连接。
- `tests/fixtures/fixtures.mjs smoke` 现通过 host key scan 启动该 ignored Rust test；密钥继续运行时生成、未提交 secret。
- 新增 `tests/fixtures/tunnel-probe.mjs` 供后续 GUI A12 集中验收使用：Local 读 banner、Dynamic 做真实 SOCKS5 CONNECT、Remote 可启动本机 echo target。
- 这些自动化证明底层三类 tunnel 真实数据流和 cleanup seam；A12 仍 PENDING，等待 WF-06B 两级 Jump 完成后一起做真实 Tauri/UI 验收。

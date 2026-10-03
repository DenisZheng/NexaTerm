# WF-06B 实施切片

## 06B-0 启动
- [x] 从 WF-06A @ e7bf637b9 建 `feat/wf06b-multihop-jump`。
- [x] 对齐 WS-N02 / A12：拒绝嵌套不算多跳完成。
- [x] 选择复用现有递归 profile 引用，不新增 parallel schema。

## 06B-1 connection plan / owner
- [x] 解析最多两级 Jump plan，拒绝 self/cycle/超深/缺节点。
- [x] `Option<SshHandle>` 升级为 jump client chain。
- [x] Terminal / Exec / SFTP / Tunnel 共享同一个 connect_target_client。
- [x] close/failure 释放所有已建立中间 client。
- [x] unit/source gate/CI。

## 06B-2 auth / Host Key / UX
- [x] 每跳 connect/auth/direct-tcpip 错误定位到具体 connection。
- [x] prompt credential 能针对具体 jump node 重试。
- [x] ConnectionDialog 展示实际两级 plan 并阻止明显循环。

## 06B-3 real fixture / A12
- [x] Docker 两级 Jump → Target 真链路。
- [x] Terminal + Files(SFTP) 都走同一路由。
- [x] Tunnel 复用同一 chain。
- [x] 中间失败/关闭无残留 SSH client/forward。
- [x] A12 合并 WF-06A Tunnel + WF-06B Jump 的自动化证据；真实 Tauri GUI 联合验收按主线集中验收策略后置。

不要修改 `scripts/line-budget.json`。


## 06B-1 实施证据

- 保留既有 `ConnectionJumpConfig`：Target 引用 Jump-1，Jump-1 可继续引用 Jump-2；不新增第二套 schema。
- 新增 `resolve_jump_chain_with`，从 target 向上解析引用并反转成实际建立顺序 `Jump-2 → Jump-1`。当前 v1 上限固定两级；self、cycle、第三层分别返回 `connection_jump_self_reference`、`connection_jump_cycle`、`connection_jump_depth_exceeded`。
- 删除原 `connection_jump_nested_unsupported` 拒绝逻辑；单测明确验证两级 plan 顺序为 `jump-002, jump-001`。
- TerminalSession、ReusableExecSession、ReusableSftpSession、ReusableForwardSession 全部从单个 `Option<SshHandle>` 升级为 `Vec<SshHandle>` owner。
- `connect_target_client` 先依次建立 Jump-2、Jump-1，再从最后一个 jump 打开 direct-tcpip 到 Target；四类 session 继续共用同一函数，因此 Terminal / Exec / Files / Tunnel 不会出现不同路由实现。
- 建链任一阶段失败时会反向 disconnect 已建立的 jump clients；正常 close 也统一反向释放全部 jump clients。
- 06B-1 的 owner/cleanup 基线由 CI #267 全绿确认。


## 06B-2 实施证据

- `AppErrorDetails` 新增 `CredentialPromptRequired` 与 `SshNodeFailure`：prompt 缺失时携带 connection_id/host/port/username/auth kind；connect/auth/direct-tcpip 失败携带具体节点与 stage，不再依赖 raw_message 猜测。
- 单次连接请求支持按 connection_id 保存多组临时 `runtime_credentials`。Target、Jump-1、Jump-2 的 prompt 凭据可逐个补齐，前面已输入的节点凭据在后续重试中保留且不会写入连接配置。
- Jump Host Key 仍复用既有结构化 HostKey details；因为 HostKeyInfo 自带 host/port，未知或变化指纹仍能精确指向实际 jump 节点。
- `jumpRuntime.ts` 负责解析具体 prompt/error 节点并构造多节点 runtime credential 请求；单测覆盖两级链逐节点凭据保留和结构化 node context。
- `jumpPlanPreview.ts` 从保存连接递归计算真实连接顺序；合法两级链显示 `Jump-2 → Jump-1 → Target`，编辑时会排除会回指当前连接或自身已成环的明显循环候选，并在保存/测试前拦截 cycle/depth/missing。
- `scripts/line-budget.json` 保持未修改；`commands.rs` 新增接线通过压缩回到冻结预算内。


## 06B-3 实施证据

- 新增隔离的真实两级拓扑：`host → ssh-jump-outer:2224 (Jump-2) → ssh-jump-inner:22 (Jump-1) → ssh-multihop-target:22 (Target)`。Jump-2 与 Target 不共享 Docker 网络，只能经 Jump-1 到达，不能退化成单跳。
- 保留既有 `127.0.0.1:2222 → ssh-target` fixture，不影响 WF-03 与 WF-06A 已有验收；WF-06B 使用独立 `2224` 入口与 `wf06b-edge / wf06b-target` 网络。
- `wf06b_fixture_two_hop_terminal_sftp_and_cleanup` 使用生产 `connect_target_client` 建立真实两级链，实际申请 PTY/shell、写入目标文件，再由 `ReusableSftpSession` 通过同一链读取；随后只破坏 Jump-1 用户名，断言返回 `jump_auth_rejected` 且 `SshNodeFailure.connection_id == wf06b-jump-1`、`stage == auth`。
- `wf06b_fixture_two_hop_tunnels` 让 Local、Dynamic SOCKS、Remote 三种 Tunnel 都绑定最终 Target profile，因此其 SSH owner 本身先穿过 Jump-2 / Jump-1；Local/Dynamic 读取最终 Target 的真实 SSH banner，Remote 在最终 Target 建 remote-forward 并验证取消后 listener 消失。
- fixture 在 Rust 测试进程仍存活时，通过容器内 `sshd:` child session 计数验证 Terminal、SFTP、Tunnel 正常关闭及 Jump-1 认证失败后 Jump-2 / Jump-1 / Target 会话全部 drain；Local/Dynamic listener 也验证停止后可重新绑定。
- CI #278（run `37130507433`，HEAD `14dd41cd8ac4822d6558961f062afbbd647ad950`）全绿。fixture 日志明确记录：
  - `wf06b_fixture_two_hop_terminal_sftp_and_cleanup ... ok`
  - `wf06b_fixture_two_hop_tunnels ... ok`
  - `PASS  NexaTerm true two-hop Terminal/SFTP/Tunnel + cleanup`
  - `all fixture checks passed`
- A12 当前状态：**实现与自动化真实协议证据完成；真实 Tauri GUI 联合验收待后续集中人工验收**。不以 CI 替代该人工步骤。

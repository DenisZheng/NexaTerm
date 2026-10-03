# WF-05C 实施切片

## 05C-0 启动
- [x] 从 WF-05B @ bcda79ec1 建 `feat/wf05c-rdp-vnc-entry` 堆叠分支。
- [x] 对齐 9-23 Delivery Plan：RDP/VNC=Experimental，不阻塞 v1。
- [x] 复核现有 RDP/VNC probe、launch、close、runner/bridge 路径，不重写引擎。

## 05C-1 统一入口与 capability
- [x] New Session 增加 RDP… / VNC… 直达入口。
- [x] runner probe 映射为明确的 embedded/external/unavailable 状态。
- [x] ConnectionDialog 继续复用 initialProtocol，不复制表单。
- [x] capability probe 失败可见，但不阻止保存配置。
- [x] unit/source gate/CI 接线。

## 05C-2 lifecycle
- [x] RDP close 对 embedded/external cleanup 有自动化证据。
- [x] VNC bridge close/abort 有自动化证据。
- [x] workspace close 清理 runner host payload / backend session。
- [x] sibling session 关闭隔离。

## 05C-3 A11 Phase 3
- [x] RDP/VNC instance regression。
- [x] A11 追加 Windows embedded RDP、macOS/Linux external RDP、VNC bridge/runner phase。
- [x] A09/A10/A11 真实 Tauri 仍延后集中执行。

每个切片：定向测试 → 相关全量检查 → source gate → line budget → commit → push → CI。不要修改 `scripts/line-budget.json`。


## 05C-1 实施证据

- 新增 `newSessionRemoteDesktopEntries.ts`，将现有 `rdp_test_runner` / `vnc_test_runner` 结果投影为 `unknown / probing / probe_failed / embedded / embedded_with_fallback / external / unavailable`。
- RDP 只有 Windows + `mstsc_activex` 才标记 embedded；同时存在 mstsc 等外部 runner 时明确显示 external fallback。Linux/macOS 只有真实 external runner 才标记 external；零 runner 明确 unavailable。
- VNC 只有 `novnc` + `supports_embedded` 才标记 built-in bridge；检测到 RealVNC/TigerVNC/custom 时显示 external viewer fallback。
- New Session 新增 Remote desktops 分组和 RDP… / VNC… 直达入口；状态文字始终可见。unavailable/probe_failed 仍允许打开现有 ConnectionDialog 配置，不把 capability 探测失败变成“无法保存配置”。
- WorkspaceShell 只执行 probe，不启动任何 RDP/VNC session；ConnectionDialog 继续通过既有 `initialProtocol` 预选协议，未复制配置 UI，也未静态加载 VNC viewer。
- 新增 Vitest capability projection tests 与 `check:wf05c-rdp-vnc` CI source gate；未修改 `scripts/line-budget.json`。


## 05C-2 实施证据

- 修复了一个真实 lifecycle 缺口：此前 external RDP/VNC 启动后立即 `drop(child)`，backend manager 不再拥有 runner，关闭 NexaTerm 标签只能删 workspace tab，不能回收仍在运行的 external client。现在 external runner 与 embedded/bridge 一样登记进对应 session manager。
- RDP `ManagedRdpSession` 新增共享 external child owner。external launch 创建 backend `session_id` 后注册 child、process id 与临时 `.rdp` cleanup path；close 时若 child 仍存活则 kill + wait，并立即删除临时文件。原 60 秒兜底清理仍保留，重复删除安全。
- RDP ActiveX/native host 路径继续走原 `CloseSession` command，不改变 Windows embedded/native 行为。external close 只作用于对应 backend session。
- RDP 跨平台单测实际启动长生命周期 child，断言 close 后进程退出、临时 `.rdp` 文件消失，并验证关闭一个 external sibling 不移除另一个 session owner。
- VNC `ManagedVncSession` 同时支持 `bridge_handle` 与 shared external child。noVNC close 继续 abort 本地 bridge；external viewer close 现在 kill + wait 对应 child。
- VNC 单测继续覆盖 bridge owner 只移除一次，并新增 external child 实际退出与 sibling owner 隔离断言。
- WorkspaceShell 关闭 VNC 前已清理 `pendingVncRunnerWindowPayloadsRef`，通知 backend `vncCloseSession` 并按需通知 runner host window；RDP 关闭通知 `rdpCloseSession`。source gate 现锁定这些 cleanup seam。
- 对 macOS RDP 这类通过系统 `open` helper 拉起的 external app，backend 能可靠管理的是其直接 child/helper；真实客户端是否随 helper 退出仍归 A11 平台实测，不在自动化里夸大结论。
- 未修改 `scripts/line-budget.json`，未进入 05C-3。


## 05C-3 实施证据

- 新增 `wf05cRdpVnc.integration.test.ts`：同一 RDP/VNC profile 的 sibling sessions 各自投影为独立顶层 workspace item（`rdp:<sessionId>` / `vnc:<sessionId>`）。
- 活动 RDP/VNC sibling 被关闭时，session pointer reducer 只切到同 profile 存活 sibling，并只从全局 order 裁剪被关闭实例；不关闭或替换其它实例。
- 普通 RDP/VNC 打开继续允许聚焦已有 session；明确 new-instance / batch 路径继续调用 `startRdpSession` / `startVncSession` 创建 sibling。
- MultiExec 仍只从 SSH + Local/WSL/Telnet/Serial terminal runtime 投影目标；RDP/VNC 虽是顶层 workspace item，但不会伪装成 terminal target，符合 WS-X05。
- A11 README 已追加 Phase 3：Windows embedded RDP、macOS/Linux external RDP、VNC/noVNC bridge 与 external viewer 的真实能力/关闭清理步骤。
- WF-05A/05B/05C 三个阶段的 A11 自动化边界至此齐全；A11 仍 PENDING，等待维护者按既定决定与 A09/A10 一起做真实 Tauri 集中验收。
- RDP/VNC 继续 Experimental/non-blocking；没有因为 A11 文档完成而提升为 v1 release blocker。

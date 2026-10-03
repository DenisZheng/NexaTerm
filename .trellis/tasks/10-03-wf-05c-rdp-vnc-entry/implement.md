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
- [ ] RDP close 对 embedded/external cleanup 有自动化证据。
- [ ] VNC bridge close/abort 有自动化证据。
- [ ] workspace close 清理 runner host payload / backend session。
- [ ] sibling session 关闭隔离。

## 05C-3 A11 Phase 3
- [ ] RDP/VNC instance regression。
- [ ] A11 追加 Windows embedded RDP、macOS/Linux external RDP、VNC bridge/runner phase。
- [ ] A09/A10/A11 真实 Tauri 仍延后集中执行。

每个切片：定向测试 → 相关全量检查 → source gate → line budget → commit → push → CI。不要修改 `scripts/line-budget.json`。


## 05C-1 实施证据

- 新增 `newSessionRemoteDesktopEntries.ts`，将现有 `rdp_test_runner` / `vnc_test_runner` 结果投影为 `unknown / probing / probe_failed / embedded / embedded_with_fallback / external / unavailable`。
- RDP 只有 Windows + `mstsc_activex` 才标记 embedded；同时存在 mstsc 等外部 runner 时明确显示 external fallback。Linux/macOS 只有真实 external runner 才标记 external；零 runner 明确 unavailable。
- VNC 只有 `novnc` + `supports_embedded` 才标记 built-in bridge；检测到 RealVNC/TigerVNC/custom 时显示 external viewer fallback。
- New Session 新增 Remote desktops 分组和 RDP… / VNC… 直达入口；状态文字始终可见。unavailable/probe_failed 仍允许打开现有 ConnectionDialog 配置，不把 capability 探测失败变成“无法保存配置”。
- WorkspaceShell 只执行 probe，不启动任何 RDP/VNC session；ConnectionDialog 继续通过既有 `initialProtocol` 预选协议，未复制配置 UI，也未静态加载 VNC viewer。
- 新增 Vitest capability projection tests 与 `check:wf05c-rdp-vnc` CI source gate；未修改 `scripts/line-budget.json`。

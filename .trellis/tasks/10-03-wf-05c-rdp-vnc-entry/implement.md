# WF-05C 实施切片

## 05C-0 启动
- [x] 从 WF-05B @ bcda79ec1 建 `feat/wf05c-rdp-vnc-entry` 堆叠分支。
- [x] 对齐 9-23 Delivery Plan：RDP/VNC=Experimental，不阻塞 v1。
- [x] 复核现有 RDP/VNC probe、launch、close、runner/bridge 路径，不重写引擎。

## 05C-1 统一入口与 capability
- [ ] New Session 增加 RDP… / VNC… 直达入口。
- [ ] runner probe 映射为明确的 embedded/external/unavailable 状态。
- [ ] ConnectionDialog 继续复用 initialProtocol，不复制表单。
- [ ] capability probe 失败可见，但不阻止保存配置。
- [ ] unit/source gate/CI 接线。

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

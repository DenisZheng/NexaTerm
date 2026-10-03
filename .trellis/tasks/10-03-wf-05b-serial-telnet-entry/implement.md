# WF-05B 实施切片

## 05B-0 启动
- [x] 从 WF-05A @ c1d662f18 建 `feat/wf05b-serial-telnet-entry` 堆叠分支。
- [x] 对齐 9-23 Delivery Plan：Serial=v1 核心；Telnet=Experimental；A11 真机集中验收。
- [x] 复核现有 serial.rs / telnet.rs / TerminalManager / Character tab 路径，不重写 provider。

## 05B-1 统一入口与实例语义
- [ ] New Session 增加 Telnet… / Serial… 直达入口。
- [ ] ConnectionDialog 支持 initialProtocol，不复制配置表单。
- [ ] 普通打开保持“聚焦已有”，明确 new-instance 路径创建 sibling。
- [ ] unit/source gate/CI 接线。

## 05B-2 capability / lifecycle
- [ ] Serial port availability 状态明确：loading / available / no ports / list failure。
- [ ] Telnet 本机 TCP fixture 覆盖 open/write/close。
- [ ] Serial/Character close 后 terminal manager / reader 收敛证据。
- [ ] 不把 mock/SSH 冒充真实 Serial 互操作。

## 05B-3 workspace integration
- [ ] Serial/Telnet Split instance 回归。
- [ ] Serial/Telnet MultiExec target 回归。
- [ ] A11 追加 Serial/Telnet phase；真实 A09/A10/A11 继续集中验收。

每个切片：定向测试 → 相关全量检查 → source gate → line budget → commit → push → CI。不要修改 `scripts/line-budget.json`。

# WF-05B 实施切片

## 05B-0 启动
- [x] 从 WF-05A @ c1d662f18 建 `feat/wf05b-serial-telnet-entry` 堆叠分支。
- [x] 对齐 9-23 Delivery Plan：Serial=v1 核心；Telnet=Experimental；A11 真机集中验收。
- [x] 复核现有 serial.rs / telnet.rs / TerminalManager / Character tab 路径，不重写 provider。

## 05B-1 统一入口与实例语义
- [x] New Session 增加 Telnet… / Serial… 直达入口。
- [x] ConnectionDialog 支持 initialProtocol，不复制配置表单。
- [x] 普通打开保持“聚焦已有”，明确 new-instance 路径创建 sibling。
- [x] unit/source gate/CI 接线。

## 05B-2 capability / lifecycle
- [x] Serial port availability 状态明确：loading / available / no ports / list failure。
- [x] Telnet 本机 TCP fixture 覆盖 open/write/close。
- [x] Serial/Character close 后 terminal manager / reader 收敛证据。
- [x] 不把 mock/SSH 冒充真实 Serial 互操作。

## 05B-3 workspace integration
- [x] Serial/Telnet Split instance 回归。
- [x] Serial/Telnet MultiExec target 回归。
- [x] A11 追加 Serial/Telnet phase；真实 A09/A10/A11 继续集中验收。

每个切片：定向测试 → 相关全量检查 → source gate → line budget → commit → push → CI。不要修改 `scripts/line-budget.json`。

## 05B-1 实施证据

- New Session 新增 Character terminals 分组，提供 Telnet… / Serial… 直达入口；仍保留通用“新建连接…”。
- 直达入口只通过 `initialProtocol` 预选现有 ConnectionDialog；Telnet host/port/enter/backspace 与 Serial port/baud/8N1/flow-control 全部继续复用原表单。
- Shell 用 `pendingConnectionProtocol` 区分新建预选，不污染 edit/duplicate；关闭对话框后清空。
- 普通 `openCharacterConnectionSession` 继续允许聚焦已有同 profile tab；明确 `openNewConnectionSessionWithActivation` 与 Split picker 继续调用 `openCharacterTerminalInConnection` 创建 sibling instance。
- 新增 `newSessionCharacterEntries.test.ts` 与 `check:wf05b-serial-telnet` source gate；未修改 `scripts/line-budget.json`。

## 05B-2 实施证据

- 新增 `serialPortAvailability.ts`，将 Serial 枚举结果收敛为 `loading / available / no_ports / list_failed` 四态；ConnectionDialog 使用同一状态控制下拉可用性和显式提示，区分“读取失败”和“成功但没有设备”。
- Telnet Rust 测试使用 `127.0.0.1:0` 真实 `TcpListener`，覆盖 greeting、输入转换后的 write、close 后 server EOF、reader channel 关闭以及关闭后拒绝新写入；不是 parser-only mock。
- Serial 将 reader 线程依赖的关闭状态抽成共享 `SerialCloseSignal`。TerminalManager connect 时把 signal 交给 reader；provider close 后 reader loop 观察同一 signal 并退出。单测覆盖共享与幂等关闭。
- TerminalManager 的 `close()` 仍先从 session store 移除实例，再调用具体 provider close；reader 稍后收尾不会让已关闭实例继续作为可写 session。
- Serial 真正端口打开、设备回显和物理句柄释放仍必须用真实设备或明确记录的模拟串口做 A11；本阶段没有用 SSH、cmd 或纯 mock 冒充真实 Serial 互操作。
- 未修改 `scripts/line-budget.json`，未进入 WF-05B-3。


## 05B-3 实施证据

- 新增 `wf05bSerialTelnet.integration.test.tsx`：Telnet + Serial 共享既有 local pane binding，但 MultiExec target kind 分别保持 `telnet` / `serial`，owner 仍是 connection/profile id，instance key 始终是 `local:<tabId>`。
- 同一 Telnet profile 的 sibling instances 具有相同 ownerId，但 tab key / sessionId 独立；不会因 profile 相同被合并。
- 在 2-pane Split 中关闭 Telnet instance 后，Split 收缩且旧 Telnet target 从 MultiExec Set 移除，Serial sibling 保留；不会拿同 profile 的其它 instance 静默替换。
- 现有 Split picker 已明确显示 `Telnet` / `串口`，并且 Character picker 的 new-instance seam 继续调用 `openCharacterTerminalInConnection`。
- 新增 `tests/fixtures/telnet-loopback.mjs`，集中验收时可用 Node 在 `127.0.0.1:2323` 启动可回显的真实 TCP fixture，不依赖外部 Telnet 服务。
- A11 README 已追加 Phase 2：Telnet 使用 loopback fixture 做真实 Tauri I/O；Serial 必须使用真实设备或明确记录的模拟串口，不能以 Telnet/SSH/mocked provider 代替。
- A11 仍保持 PENDING，等待 WF-05C 的 RDP/VNC Phase 3 后与 A09/A10 一起集中验收。

# WF-05B Serial / Telnet 统一入口

> 父任务：`09-23-nexaterm-workflow-mainline`。
> 堆叠基线：WF-05A `c1d662f18aa0640378949fe57449625691e74e24`。
> Delivery Plan：Serial 属于 v1 核心；Telnet 为 Experimental，但继续纳入统一入口和实例模型。

## 用户流程

新建会话 → 明确选择 Serial… 或 Telnet… → 复用现有 ConnectionDialog 配置 → 保存并连接/直接连接 → 获得独立 terminal instance → 可进入 Split/MultiExec → 关闭后释放 terminal session。

## 范围

- New Session 明确暴露 Serial / Telnet 入口，不要求用户先进入泛化“新建连接”再寻找协议。
- 复用现有 ConnectionDialog 的 Serial port 枚举、8N1/flow-control 与 Telnet enter/backspace 配置。
- “打开”可以聚焦已有 Character tab；“新建实例”必须真正创建 sibling instance。
- Serial/Telnet 继续复用 LocalTerminalTab 的 character source，不新建第二套 terminal owner。
- Telnet 自动化允许使用本机 TCP fixture 验证真实 socket lifecycle。
- Serial 自动化只能证明配置/实例/资源边界；真实串口互操作必须用真实设备或明确记录的模拟串口，不能拿 SSH 代替。
- Split/MultiExec 按 instance key 工作，关闭只移除对应 instance。
- A11 追加 Serial/Telnet phase，但整体继续 PENDING，等待 WF-05C 的 RDP/VNC 后集中验收。

## Out of scope

- 不重写 Telnet parser / serialport crate。
- 不实现串口设备管理器。
- 不做 RDP/VNC（WF-05C）。
- 不启动 WF-06。
- 不修改 PR #12 或 `scripts/line-budget.json`。

# WF-09-08A Rlogin 原生协议实现

状态：IN_PROGRESS（L0和L1 socket/控制/建立、headless会话owner、typed IPC/应用生命周期、前端有界交付桥及终端IO适配器均已过原生与完整应用CI）。父任务：09-23-nexaterm-workflow-mainline。

用户流程：在 NexaTerm 内明确连接 Rlogin 并直接使用终端，调整窗口、断开或重连。

范围依据：[三协议实现计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md)。本任务交付实际功能，评估报告不替代实现。产品规则仅引用 WS-P01/P02/P04、WS-R01/R02；当前尚无完整可用协议入口。

验收编号：L01–L03、C01/C02，正文以计划§7为准；记录实现/自动化/原生集成/真实互通/平台分发五类状态。缺环境只阻塞相应证据，不推迟无依赖开发，也不能标记可用。

前一轮计划文档已交付，维护者后续已授权按计划开工。XDMCP的X1三平台原生与完整CI已通过，桌面/随包引擎未交付；X0 的具体组件/构建与许可缺口不阻塞本任务的独立协议核。已加载 trellis-before-dev 和相关规范；此前已扩展为保留源端口、原生 urgent/mark/flush/flow/window 控制组件及真实 TCP fixture；本轮 IPC 接入按下述边界推进，完整终端仍未可用。不得自动引入未批准的许可证义务、提权 helper 或放宽访问控制。

当前L1边界：Unix精确flush已验证；Windows当前adapter不能给出精确边界，明确错误并保留数据，仍须开发。原生建立/ACK尾部adapter与headless会话owner已过三平台原生及完整应用CI；typed IPC/应用生命周期已过三平台原生与完整CI；终端UI、DNS与真实服务端验收未完成。会话owner证据见research/session-owner-evidence.md，IPC证据见research/runtime-evidence.md，前端桥证据见research/frontend-delivery-evidence.md。

此前headless会话owner slice未注册IPC，PR #72随后已接入；当前前端交付桥继续沿用该接口，不修改终端UI或声明完整协议可用。

PR #72接入实际主窗口IPC和应用生命周期，边界以rlogin-runtime.md为准；终端UI、DNS和Windows精确flush仍待实现。

本轮推进前端typed IPC和有界交付桥，契约见frontend/rlogin-delivery.md；不改变布局或注册完整协议能力。验收仍为L01–L03、C01/C02，实际终端/编码与真实服务端继续后续。

后续终端接入先实现编码、键盘/粘贴背压与renderer生命周期适配器，冻结契约见frontend/rlogin-terminal.md。它是完整终端的工程依赖，不把尚未接入的连接配置/界面标为完成；随后继续原型和统一会话入口接线。沿用上述用户流程、验收编号及WS规则；不变更产品布局或启用日志/历史/宏/广播。

终端IO适配器现已在Draft #74通过原生28、XDMCP原生8及完整CI642，执行代码9f81d3e；57项新增前端行为测试和8项新增原生编码/IPC测试通过。配置/SQLite/同步与母版/实际终端接线继续开发，当前不开放完整协议能力。

当前继续连接/存储及真实终端入口，具体字段、schema5、历史序列化兼容与本次许可见backend/rlogin-connections.md；仍沿用本任务用户流程、验收编号和WS规则。母版原型先于React，UI和完整能力尚未开放。

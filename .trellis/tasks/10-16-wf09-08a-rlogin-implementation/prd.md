# WF-09-08A Rlogin 原生协议实现

状态：IN_PROGRESS（L0和L1 socket/控制/建立及headless会话owner均已过三平台原生与完整应用CI）。父任务：09-23-nexaterm-workflow-mainline。

用户流程：在 NexaTerm 内明确连接 Rlogin 并直接使用终端，调整窗口、断开或重连。

范围依据：[三协议实现计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md)。本任务交付实际功能，评估报告不替代实现。产品规则仅引用 WS-P01/P02/P04、WS-R01/R02；当前尚无完整可用协议入口。

验收编号：L01–L03、C01/C02，正文以计划§7为准；记录实现/自动化/原生集成/真实互通/平台分发五类状态。缺环境只阻塞相应证据，不推迟无依赖开发，也不能标记可用。

前一轮计划文档已交付，维护者后续已授权按计划开工。XDMCP的X1三平台原生与完整CI已通过，桌面/随包引擎未交付；X0 的具体组件/构建与许可缺口不阻塞本任务的独立协议核。已加载 trellis-before-dev 和相关规范；本轮范围扩展为保留源端口、原生 urgent/mark/flush/flow/window 控制组件及真实 TCP fixture，不注册 IPC 或声明完整终端可用。不得自动引入未批准的许可证义务、提权 helper 或放宽访问控制。

当前L1边界：Unix精确flush已验证；Windows当前adapter不能给出精确边界，明确错误并保留数据，仍须开发。原生建立/ACK尾部adapter与headless会话owner已过三平台原生及完整应用CI；IPC/应用/终端UI、DNS与真实服务端验收未完成。执行证据见research/session-owner-evidence.md。

本轮扩展到headless会话owner与有界交付，尚不注册IPC/修改终端UI或声明完整协议可用。

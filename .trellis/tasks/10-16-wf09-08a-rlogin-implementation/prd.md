# WF-09-08A Rlogin 原生协议实现

状态：PLANNED，未开始实现。父任务：09-23-nexaterm-workflow-mainline。

用户流程：在 NexaTerm 内明确连接 Rlogin 并直接使用终端，调整窗口、断开或重连。

范围依据：[三协议实现计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md)。本任务交付实际功能，评估报告不替代实现。产品规则仅引用 WS-P01/P02/P04、WS-R01/R02；当前运行时尚不支持该协议。

验收编号：L01–L03、C01/C02，正文以计划§7为准；记录实现/自动化/原生集成/真实互通/平台分发五类状态。缺环境只阻塞相应证据，不推迟无依赖开发，也不能标记可用。

维护者要求本轮先写计划，不开工。本任务保持 planning；后续实际开发前加载 trellis-before-dev 和相关规范，按计划阶段推进。不得自动引入未批准的许可证义务、提权 helper 或放宽访问控制。

# WF-09-08B Rsh 原生协议实现

状态：IN_PROGRESS（S0协议核已实现；当前S1双连接；尚无实际Rsh命令入口）。父任务：09-23-nexaterm-workflow-mainline。

用户流程：在 NexaTerm 内明确执行远端 Rsh 命令，查看分离输出、发送输入/信号并取消或重跑。

范围依据：[三协议实现计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md)。本任务交付实际功能，评估报告不替代实现。产品规则仅引用 WS-P01/P02/P04、WS-R01/R02；当前运行时尚不支持该协议。

验收编号：S01–S03、C01/C02，正文以计划§7为准；记录实现/自动化/原生集成/真实互通/平台分发五类状态。缺环境只阻塞相应证据，不推迟无依赖开发，也不能标记可用。

前一轮计划文档已交付，维护者后续已授权按计划开工。本任务已进入in_progress；执行前已加载trellis-before-dev和相关规范，继续按计划阶段推进。不得自动引入未批准的许可证义务、提权 helper 或放宽访问控制。


2026-10-18继续已授权开发：Rlogin真实入口#77完整CI649/原生30已通过，DNS#78三平台原生32和完整CI651已通过；Windows精确urgent缺口不阻塞不依赖urgent的Rsh协议核。用户流程和S01–S03/C01–C02、WS规则保持不变。S0只形成实际字节协议、固定BSD profile和loopback fixture，不等于真实rshd/保留双连接/UI已可用。

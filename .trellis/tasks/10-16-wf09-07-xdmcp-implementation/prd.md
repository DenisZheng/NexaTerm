# WF-09-07 XDMCP 内置 X server 实现

状态：IN_PROGRESS，2026-10-16 维护者授权按计划开工。父任务：09-23-nexaterm-workflow-mainline。

2026-10-19当前：X1应用退出的实际资源完成屏障已在Draft #83修复并通过CI666/原生10三平台，覆盖启动前阻塞worker、实际进程树停止和认证目录清理。仍沿用X01–X04/C01–C02及同一用户流程；不新增产品交互、不更改许可/提权/网络策略。随包X server、打包/桌面接入和Unix宿主硬崩溃监督仍未完成。

同日X0续作：Draft #84已交付固定官方21.1.25源码/签名/公钥核验入口，专用CI2的21项测试和真实在线GPG验证通过。采集仅为REVIEW-REQUIRED，发行批准与bundled仍为false；继续原生Windows构建、逐文件/依赖许可及PE/资源闭包，不重复源码核验入口。精确完整CI结果与下一刀见research/source-review-evidence.md。

2026-10-20 Windows续作：Draft #85 code898abaa的source CI24与完整CI691七执行job通过；原生21已过80回归、真实DLL数据导入、15依赖、五探针、完整引擎/PE/头来源及105项实际链接输入，随后libXau编译依赖解析FAIL；已补未编译目标的空bootstrap识别和当前依赖记录定位，本地104回归通过、待新Windows验证；四DLL五份及CRT三份实际notice均匹配固定原文。完整C输入/最终版本、xkbcomp/XKB数据、DLL内部静态/资源和随包/桌面仍须开发，见research/windows-build-evidence.md与research/windows-runtime-license-review.md。

用户流程：选择 XDMCP 目标后启动远程桌面，查看状态，取消/重连/关闭并回收所属 X server。

范围依据：[三协议实现计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md)。本任务交付实际功能，评估报告不替代实现。产品规则仅引用 WS-P01/P02、WS-N03/N04/N05、WS-R01/R02；当前运行时尚不支持该协议。

验收编号：X01–X04、C01/C02，正文以计划§7为准；记录实现/自动化/原生集成/真实互通/平台分发五类状态。缺环境只阻塞相应证据，不推迟无依赖开发，也不能标记可用。

前一轮仅写计划的限制已由2026-10-16后续开工授权替代。当前先实施 X0 选型记录和 X1 运行核心；X2/X3 尚未完成。已加载 trellis-before-dev 和相关规范，按计划阶段推进。不得自动引入未批准的许可证义务、提权 helper 或放宽访问控制。

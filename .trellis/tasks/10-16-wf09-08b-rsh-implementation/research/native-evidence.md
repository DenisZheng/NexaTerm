# Rsh S1 双连接传输验证证据

依据已批准三协议计划§6/7、S01–S03/C01–C02和WS-P01/P02/P04、WS-R01/R02；前置S0 Draft#79已过完整CI652及三平台原生33。本阶段是已授权的S1实现，任务整体保持in_progress，S2任务owner/IPC/UI和真实rshd仍待开发/验证。

## 实际实现

保留端口stderr listener先于主连接；固定数字IPv4回连和512–1023源端口验证，16个非法候选上限，15秒原始总截止/25ms取消检查；等待回连时仍处理主拒绝与EOF。验证回连后才写用户/原始命令，每块最多32KiB，与回复读取交替；拒绝一开始停止剩余写入，命令没全部写出前ACK非法。ACK尾部只转移一次，无重试/重放/高端口回退/自动提权。

RshTransport独占两个NativeSocket，独立stdout/stderr与EOF；stdin只半关闭主写端，可继续两个输出尾部、次连接普通写入固定BSD信号。完整close两条都执行，drop/实际task abort回收所属句柄。IO单块≤32KiB、ACK尾部≤32KiB；owner输入后缀/队列预算仍属S2。无新IPC、schema、UI、能力或依赖，不宣称用户已能从NexaTerm运行Rsh，也不把EOF当exit0。

## 已通过代码与CI

代码 `11f9e3d521da84bbc0eb72c305045f1ae8287729`，Draft [#80](https://github.com/DenisZheng/NexaTerm/pull/80)，base Draft#79。完整 [CI655](https://github.com/DenisZheng/NexaTerm/actions/runs/39108101461) 的前端、Linux/macOS/Windows Rust、fixture、安全和许可证七项均SUCCESS；条件package既有skip，不计打包验收。Rust lib Linux597通过/4既有ignore、mac598通过、Win597通过；各平台binary19、integration1、doc0。前端131文件1105通过/1既有todo，脚本188通过/3既有envskip；新增13项测试在完整应用中再次执行通过，没有新增ignore/skip/todo。

原生 [36](https://github.com/DenisZheng/NexaTerm/actions/runs/39108101503) 全三平台SUCCESS：独立wire各10，core Linux101/mac102/Win100通过且0ignore。新增13项（connect9、transport4）包括64KiB准确请求分块、提前ACK/碎片拒绝停止写入、callback等待拒绝/EOF/超限、16个真实高端口冒名回连、原始截止/取消/abort回收listener和两个流、binary独立流/晚stderr/half-close/五项信号/无损预算/close/drop。

| 实际执行 | job |
| --- | --- |
| 原生 Linux / macOS / Windows | 117618214596 / 117618214732 / 117618214911 |
| 完整 Rust Linux / macOS / Windows | 117618214514 / 117618214407 / 117618214504 |
| 完整前端 | 117618214276 |

## 权限和互通边界

Windows原生日志 `rsh_reserved_dual_stream: available; reserved main/listener/callback verified`，核对三个低端口、callback验证前零用户/命令、精确字段、stdin EOF后双输出尾部和信号。Linux/mac当前非特权进程日志为access_denied，明确验证权限失败，不能计为其低端口正向互通；三平台普通socket双流/预算/清理均通过。真实rshd、Unix低端口权限集成、任务owner背压与真实GUI仍待后续，Windows正向不外推为Unix通过。

本地无Rust，以远端真实编译/执行为准。本地脚本188通过/3既有环境skip，行数、启动边界、diff和Trellis上下文通过。初次脚本运行因新worktree未接已有依赖而报typescript缺失，接相同已装依赖后原命令通过，未改测试/断言。收口仅更新文档，生产代码、workflow、依赖与tested SHA一致；保持Draft，未合并/发布。

后续具体owner边界见 [task-owner-next-step.md](task-owner-next-step.md)，它是待实现约束，不是已交付接口。

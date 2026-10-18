# Rsh S1 双连接传输（验证中）

前置S0 Draft#79已过完整CI652及三平台原生33；本阶段按既定§6/S01–S03/C01继续，不是新的范围或权限升级。

实际实现：保留端口listener先于主连接、固定数字IPv4回连和源低端口验证、16个非法候选上限、15秒原始总截止/取消、等待回连时仍处理主连接拒绝与EOF。验证后才写用户/原始命令，最多32KiB逐块并与回复读取交替；拒绝一开始停止剩余写入，命令未全部写出前ACK非法。无重试/重放/高端口回退。ACK尾部只转移一次。

RshTransport独占两个NativeSocket，独立stdout/stderr与EOF；stdin只半关闭主写端，可继续读取两个尾部、在次连接普通写入固定BSD信号。完整close两条都执行，drop/实际task abort回收所属句柄。没有新增IPC/命令任务owner/UI/能力/依赖，尚不声明用户可以运行Rsh。

新增13项测试（connect9、transport4）：64KiB精确请求分块、提前ACK/碎片拒绝停止写入、callback等待时拒绝/EOF/超限、16个真实高端口冒名回连、取消/超时/abort释放listener与两个流、binary双流/晚stderr/half-close/固定信号/无损预算、close/drop。实际保留端口夹具核对主源、listener、callback端口与分离输出/输入EOF/信号；进程真实AccessDenied为负向权限证据，普通socket夹具单独证明传输逻辑，不写成真实rshd通过。未新增ignore/skip/todo。

本地无Rust，新增原生测试实际结果待后续三平台harness和完整应用CI。静态检查不能代替原生执行。真实rshd、多实例owner/队列背压/GUI/平台分发仍待后续阶段。

本地脚本188通过/3既有环境skip，行数预算、启动边界、diff和Trellis上下文通过。首次脚本检查因新worktree尚未接已有依赖目录而报typescript缺失，接入相同已安装依赖后原命令通过，未改测试或断言。

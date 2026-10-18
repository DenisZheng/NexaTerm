# Technical design

唯一详细设计为 [三协议计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md) §3、§6、§7–9。阶段：S0–S2。

该设计是拟实现契约；具体 IPC 与结构签名在开工前结合现有 manager/能力/存储接入确认，并写入 code-spec，不能当作现有接口调用。组件候选、显示模式和受限端口策略按计划中的决策门槛落定。

默认执行顺序为 XDMCP → Rlogin → Rsh；无环境的阶段可以先完成协议核/fixture。Rlogin/Rsh 共享保留端口分配适配，不共享 Telnet 编解码，也不复用 SSH 信任语义。迁移、回滚与运行 generation 按计划§3/8处理。


## S0接口边界

采用BSD16-byte user profile，主/次连接源端口512–1023；stderr listener不可省略。port NUL与user/command NUL分开编码，后续S1先建listener再发port、验证所属回连，然后发送用户/命令，避免服务端等待回连时双方阻塞。命令为有界原始字节，不本机shell执行、不trim或注入。状态字节与拒绝计数复用项目已有NUL ACK纯parser，通过独立Rsh错误映射隔离；不复制第二套同结构状态机。ACK尾部为stdout原样数据；stderr独立。信号使用固定BSD白名单，不读取宿主数值。EOF无exit code0。具体签名及测试见backend/rsh-protocol.md。

## S1 实际双连接契约

S1 数字 IPv4 目标固定后建立保留 stderr listener，再分配主连接保留源端口。沿用单个15秒绝对截止，25ms检查取消，无高端口兜底/自动提权。发 port NUL，核对回连源IP和512–1023端口，最多丢弃16个非法候选；等待时也读取主连接拒绝/EOF。只有回连验证后才发送用户与有界原始命令。拒绝首字节立即停止后续写入，初始命令没全部发出前的ACK非法。ACK后的stdout尾部只转移一次。

RshTransport 独占主/次NativeSocket，不克隆、不合并输出；stdin半关闭仅shutdown(Write)，两条输出独立EOF并可继续drain。固定信号在次连接普通写入。close无论第一条结果如何都执行两条关闭；丢弃建立future或transport通过RAII回收。无IPC/运行任务owner/输出队列，后续S2在其上实现有界工作流。详细签名见backend/rsh-native.md。

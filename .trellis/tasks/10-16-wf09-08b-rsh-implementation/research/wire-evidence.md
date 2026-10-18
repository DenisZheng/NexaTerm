# Rsh S0协议核（进行中）

依据已批准三协议计划§6/7、WS-P01/P02/P04和WS-R01/R02，S01–S03/C01–C02。Rlogin实际入口#77已由完整CI649和原生30验证；DNS#78三平台原生32通过、完整CI651最终结果待收口。Windows精确urgent边界不阻塞Rsh普通双流的独立实现。

S0已实现端口NUL与用户/命令分阶段编码（无Rlogin起始NUL）、固定BSD16-byte用户/64KiB命令预算、原样命令字节、固定Rsh错误、借用尾部的ACK解析、精确远端IPv4/512–1023回连来源校验，以及独立于宿主平台的五项BSD信号。ACK parser复用项目已有纯字节状态机并映射独立错误，不复制第二套逻辑；不借用Telnet、SSH凭据或外部rsh客户端。

11项native行为测试包括字节边界/非NUL控制透明、16-byte/多字节用户名、完整命令预算、所有非零拒绝status、1024拒绝上限/碎片/粘性错误、EOF三态、callback伪造/IPv6/高源端口拒绝、信号固定值，以及实际loopback请求/ACK+binary stdout/拒绝/EOF前ACK。loopback只验证wire，不伪装为真实rshd、低端口双连接或stderr drain。

本地无Rust；新增测试须由native三平台harness与完整应用CI实际编译/执行，当前不计通过。既有脚本188通过/3既有envskip，line budget/diff/Trellis上下文通过。没有新增依赖、IPC、配置schema、能力标志或UI。S1保留listener/主连接、验证回连和deadline/cleanup，S2实际任务/双流stdin/信号/半关闭/取消仍待继续；不归档整个任务。

协议依据为官方BSD服务端手册 https://man.openbsd.org/OpenBSD-5.3/rshd.8 ：该profile使用16字符用户与512–1023主/回连源端口；具体服务端字段/ARG_MAX可能不同，拒绝应如实处理。无复制外部实现。

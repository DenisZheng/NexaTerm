# Rsh S0协议核验证证据

依据已批准三协议计划§6/7、WS-P01/P02/P04和WS-R01/R02，S01–S03/C01–C02。Rlogin实际入口#77已由完整CI649和原生30验证；DNS#78三平台原生32和完整CI651均已通过。Windows精确urgent边界不阻塞Rsh普通双流的独立实现。

S0已实现端口NUL与用户/命令分阶段编码（无Rlogin起始NUL）、固定BSD16-byte用户/64KiB命令预算、原样命令字节、固定Rsh错误、借用尾部的ACK解析、精确远端IPv4/512–1023回连来源校验，以及独立于宿主平台的五项BSD信号。ACK parser复用项目已有纯字节状态机并映射独立错误，不复制第二套逻辑；不借用Telnet、SSH凭据或外部rsh客户端。

11项native行为测试包括字节边界/非NUL控制透明、16-byte/多字节用户名、完整命令预算、所有非零拒绝status、1024拒绝上限/碎片/粘性错误、EOF三态、callback伪造/IPv6/高源端口拒绝、信号固定值，以及实际loopback请求/ACK+binary stdout/拒绝/EOF前ACK。loopback只验证wire，不伪装为真实rshd、低端口双连接或stderr drain。

本地无Rust；新增测试须由native三平台harness与完整应用CI实际编译/执行，当前不计通过。既有脚本188通过/3既有envskip，line budget/diff/Trellis上下文通过。没有新增依赖、IPC、配置schema、能力标志或UI。S1保留listener/主连接、验证回连和deadline/cleanup，S2实际任务/双流stdin/信号/半关闭/取消仍待继续；不归档整个任务。

协议依据为官方BSD服务端手册 https://man.openbsd.org/OpenBSD-5.3/rshd.8 ：该profile使用16字符用户与512–1023主/回连源端口；具体服务端字段/ARG_MAX可能不同，拒绝应如实处理。无复制外部实现。

## 已验证代码与边界

代码提交 `3c37125fc4797e5e47e2e8e3219dce698b2da4d5`，Draft [#79](https://github.com/DenisZheng/NexaTerm/pull/79)，base Draft#78。完整 [CI652](https://github.com/DenisZheng/NexaTerm/actions/runs/39107002648) 的前端、Linux/macOS/Windows Rust、安全、许可证和fixtures七项全部SUCCESS；条件package任务既有skip，不计打包验收。Rust lib Linux584通过/4既有ignore、mac585通过、Win584通过；各平台binary19、integration1、doc0。前端131文件1105通过/1既有todo，脚本188通过/3既有envskip，无新增skip/ignore/todo。

[原生33](https://github.com/DenisZheng/NexaTerm/actions/runs/39107002614) 三平台全部SUCCESS：独立wire10各平台，应用生产模块harness Linux88/mac89/Win87；新增11项Rsh测试均实际运行通过。完整应用CI再次执行这11项。具体job：原生Linux117614927763/Win117614927872/mac117614927877；完整Linux117614928290/Win117614928301/mac117614928359/前端117614928230。

以上覆盖S0 wire，不把普通loopback证明写成低端口双流、真实rshd或UI已通过。S1在独立后续分支继续开发。文档收口同步#78最终状态，生产代码/workflow/依赖与上述tested SHA保持一致；PR继续Draft，未合并/发布。

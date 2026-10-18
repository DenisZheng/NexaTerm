# Execution plan

状态：后续开工已授权；本任务按顺序尚未执行，当前由 XDMCP 先推进。

- [ ] S0：主/次连接与握手协议核、受控服务端 fixture，字段与身份校验。
- [ ] S1：保留端口分配/权限探测、回连归属、截止和双流清理；不自动提权。
- [ ] S2：显式命令任务、stdin/独立stdout/stderr/信号/取消/半关闭，EOF 不伪造远端 exit code。
- [ ] S2：服务端互通、冒名回连/拒绝/背压/重试、三平台/三主题验收。
- [ ] 更新可执行 code-spec、能力矩阵和错误/资源预算契约；加入各阶段有意义的回归测试。
- [ ] 运行受影响测试、类型/构建及既有 source/security/license gates，三平台 CI；不以静态检查代替 socket/进程运行。
- [ ] 维护 Draft PR 和平台证据，真实验收统一后续；未通过项逐一标明。


## S0当前执行

先固定backend/rsh-protocol.md七段契约与官方BSD服务端文档依据；实现分阶段NUL编码、固定错误、复用ACK parser、回连源IP/低端口校验、远端BSD信号映射，再用现有native harness执行真实loopback字节测试。无新IPC/配置/菜单，不改Windows Rlogin能力，不引入依赖/客户端/提权。全量应用CI与原生三平台分别留证据。后续仍需S1保留双流owner/半关闭/取消和S2实际任务UI。

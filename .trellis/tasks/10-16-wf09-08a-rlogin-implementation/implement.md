# Execution plan

状态：后续开工已授权；本任务按顺序尚未执行，当前由 XDMCP 先推进。

- [ ] L0：原生握手、字段/分片/拒绝/EOF 协议核和可复现服务端 fixture。
- [ ] L1：Unix/Windows urgent/OOB、flush、流控/resize、源端口分配与真实 socket 测试。
- [ ] L1：会话 manager/typed IPC、连接许可、UI/能力/编码和清理；不执行外部客户端。
- [ ] L2：具体服务端 profile 的真实互通、权限拒绝与三平台/三主题验收。
- [ ] 更新可执行 code-spec、能力矩阵和错误/资源预算契约；加入各阶段有意义的回归测试。
- [ ] 运行受影响测试、类型/构建及既有 source/security/license gates，三平台 CI；不以静态检查代替 socket/进程运行。
- [ ] 维护 Draft PR 和平台证据，真实验收统一后续；未通过项逐一标明。

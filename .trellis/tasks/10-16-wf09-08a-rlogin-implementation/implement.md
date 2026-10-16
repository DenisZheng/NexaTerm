# Execution plan

状态：已获开工授权；XDMCP X1 原生核心已推进，本任务开始独立的 L0 协议核，组件/靶机缺口不阻塞此阶段。

- [ ] L0：原生握手、字段/分片/拒绝/EOF 协议核和可复现服务端 fixture。
- [ ] L1：Unix/Windows urgent/OOB、flush、流控/resize、源端口分配与真实 socket 测试。
- [ ] L1：会话 manager/typed IPC、连接许可、UI/能力/编码和清理；不执行外部客户端。
- [ ] L2：具体服务端 profile 的真实互通、权限拒绝与三平台/三主题验收。
- [ ] 更新可执行 code-spec、能力矩阵和错误/资源预算契约；加入各阶段有意义的回归测试。
- [ ] 运行受影响测试、类型/构建及既有 source/security/license gates，三平台 CI；不以静态检查代替 socket/进程运行。
- [ ] 维护 Draft PR 和平台证据，真实验收统一后续；未通过项逐一标明。

## L0 implementation evidence (CI pending)

已实现无外部依赖的原生请求编码、初始 ACK/拒绝增量处理、原样返回 banner 尾部、固定错误与1024字节拒绝上限，以及12字节窗口帧。十项测试涵盖字节契约、每种非零拒绝码、分片/合包/EOF、UTF-8字段预算、复用拒绝，以及三个真实 loopback TCP fixture。独立三平台 workflow 直接编译生产模块；完整应用 CI 同时保留。本地无 Rust 工具链，执行结果由 CI 记录。

尚未实现 urgent/OOB、flow control/flush、保留源端口、连接许可、终端 manager/IPC/UI 或真实服务端联调；当前不提供可用的 Rlogin 会话入口，不把 ACK 作为登录成功。

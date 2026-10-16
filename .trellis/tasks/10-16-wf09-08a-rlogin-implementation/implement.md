# Execution plan

状态：已获开工授权；XDMCP X1 原生核心已推进，本任务开始独立的 L0 协议核，组件/靶机缺口不阻塞此阶段。

- [x] L0：原生握手、字段/分片/拒绝/EOF、窗口帧协议核和可复现 loopback 服务端 fixture（不是完整 rlogind）。
- [ ] L1：Unix/Windows urgent/OOB、flush、流控/resize、源端口分配与真实 socket 测试。
- [ ] L1：会话 manager/typed IPC、连接许可、UI/能力/编码和清理；不执行外部客户端。
- [ ] L2：具体服务端 profile 的真实互通、权限拒绝与三平台/三主题验收。
- [ ] 更新可执行 code-spec、能力矩阵和错误/资源预算契约；加入各阶段有意义的回归测试。
- [x] L0：受影响测试、完整应用类型/构建与既有 source/security/license gates、三平台 CI 均通过；L1/L2 新实现仍须继续验证。
- [x] L0：维护 Draft PR 和平台证据，真实验收统一后续；L1/L2 未完成。

## L0 implementation evidence

已实现无外部依赖的原生请求编码、初始 ACK/拒绝增量处理、原样返回 banner 尾部、固定错误与1024字节拒绝上限，以及12字节窗口帧。十项测试涵盖字节契约、每种非零拒绝码、分片/合包/EOF、UTF-8字段预算、复用拒绝，以及三个真实 loopback TCP fixture。独立三平台 workflow 直接编译生产模块；完整应用 CI 同时保留。本地无 Rust 工具链，执行结果由 CI 记录。

L0 交付时未实现 urgent/OOB、flow control/flush、保留源端口；这些后续组件的当前状态见下节。连接许可、终端 manager/IPC/UI 和真实服务端联调仍未完成，不把 ACK 作为登录成功。

代码基准 `82af029bdf45a9dbf67943ee2760df6fb552a825`；[Draft #68](https://github.com/DenisZheng/NexaTerm/pull/68)，基于 #67。

- [原生协议核 #2](https://github.com/DenisZheng/NexaTerm/actions/runs/38904491347)：Windows/macOS/Linux 全部通过，每平台10项，无忽略/跳过。
- [完整应用 CI #614](https://github.com/DenisZheng/NexaTerm/actions/runs/38904491808)：全部7个实际执行 job 通过；条件打包 job 未触发。Linux Rust484通过/4ignored、macOS484通过/0ignored、Windows485通过/0ignored，各平台新增10项 Rlogin 全通过；其它二进制/集成/doc 测试通过。前端888通过/1todo、脚本/source gates、安全、许可证、fixture 全通过。
- 首轮 Linux 通过、macOS9通过/1失败；根因是非阻塞 listener 的 accepted socket 在 macOS 继承模式，fixture 却按阻塞 IO 读取。已显式设置 accepted socket 模式和2秒 IO 超时；没有忽略 WouldBlock、提高截止或修改协议断言。修复后原生三平台全部通过。

下一阶段已核对的 BSD 字段/源端口约束与来源固定在 research/bsd-rlogin-profile.md；未把资料核对标作 L1 实现。

## L1 native foundation

代码基准 `76ddffecf8b308272ab441c9391922d08b0b8869`；[Draft #69](https://github.com/DenisZheng/NexaTerm/pull/69)，基于 #68。实现共用保留 socket：1023–512有界扫描、持有真实绑定句柄、Windows独占绑定、取消/截止与真实句柄回收。Rlogin控制器实现原生OOB分离、组合控制位、窗口请求/resize、本地流控与背压；Unix精确flush通过，Windows当前adapter缺失精确边界，真实flush明确失败并保留数据，不能标作完整协议可用。

- [x] 已执行三平台生产模块 harness：Linux24/macOS24/Windows25通过，无skip/ignore；应用锁子集核对通过。Unix CI真实低端口结果为AccessDenied，Windows实际连接源端口与所持低端口一致，不将前者称为协议联调成功。
- [x] [完整应用 CI #620](https://github.com/DenisZheng/NexaTerm/actions/runs/38932285024)：7个实际执行job全通过；Rust Linux/macOS498、Windows500通过，Linux另有4个既有ignored；前端888通过/1todo，类型/构建/source/security/license/fixture全部通过。条件打包未触发。
- [ ] Windows精确flush backend、完整握手adapter、session manager/队列、typed IPC、单次许可、UI和真实rlogind互通继续开发。L1整体未完成；本轮不算Rsh已实现。

只为既有windows-sys开启WinSock feature，无新crate版本或传递依赖。详细平台证据、失败根因和后续资源约束见 [research/native-socket-evidence.md](research/native-socket-evidence.md)。收口只修改文档、注释和测试名称，运行逻辑及断言不变。本地无Rust工具链，实际Rust执行以CI为准。

## L1 establish / ACK adapter（下一刀）

- [x] 先验证BSD profile/地址/窗口；复用L0编码，不截断或静默改参数。
- [x] connect接收绝对截止，全部建立阶段复用同一15秒预算；处理partial write、增量ACK/拒绝、取消/EOF/drop。
- [x] ACK尾部转入现有reader有界区，恰好一次且支持背压/urgent；无登录成功推断。
- [ ] loopback回归验证请求、合包尾部、固定拒绝错误、无ACK EOF、取消/超时/实际task abort回收。
- [ ] 更新规范和生产模块harness，原生三平台与完整CI通过后维护堆叠Draft PR。

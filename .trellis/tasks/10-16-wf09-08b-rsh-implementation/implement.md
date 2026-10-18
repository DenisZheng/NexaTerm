# Execution plan

状态：已授权持续推进；S0已实现且原生33三平台通过，完整CI652全部通过；S1已过完整CI655/原生36；S2任务owner、typed IPC和实际命令入口已开发交付，code44529a0已过完整CI660/原生41三平台。

- [x] S0：分阶段字节握手协议核与受控TCP fixture、字段及回连来源纯校验（原生33/完整CI652）。
- [x] S1：保留端口分配/权限结果、回连归属、截止和双流清理（完整CI655/原生36）；Windows低端口正向，Unix权限负向，不自动提权。
- [x] S2：显式命令任务、stdin/独立stdout/stderr/信号/取消/半关闭，EOF 不伪造远端 exit code。
- [ ] S2：服务端互通、冒名回连/拒绝/背压/重试、三平台/三主题验收。
- [x] 更新可执行 code-spec、能力矩阵和错误/资源预算契约；加入各阶段有意义的回归测试。
- [x] 运行受影响测试、类型/构建及既有 source/security/license gates，三平台 CI；不以静态检查代替 socket/进程运行。
- [x] 维护 Draft PR 和平台证据，真实验收统一后续；未通过项逐一标明。


## S0当前执行

先固定backend/rsh-protocol.md七段契约与官方BSD服务端文档依据；实现分阶段NUL编码、固定错误、复用ACK parser、回连源IP/低端口校验、远端BSD信号映射，再用现有native harness执行真实loopback字节测试。无新IPC/配置/菜单，不改Windows Rlogin能力，不引入依赖/客户端/提权。全量应用CI与原生三平台分别留证据。后续仍需S1保留双流owner/半关闭/取消和S2实际任务UI。

## S1当前执行

- 固定backend/rsh-native.md七段契约，复用legacy_socket保留端口和S0纯协议，不引入外部客户端/新依赖。
- 实现先listener后主连接、回连归属/有界拒绝、一次总截止/取消、握手双向推进及双流传输。
- 真实loopback覆盖64KiB命令分块、提前拒绝停止写、16个冒名回连、独立EOF/晚尾部、半关闭和信号；实际低端口夹具记录当前进程能绑定或真实AccessDenied，不新增ignore/skip。
- 执行现有三平台native harness和完整应用CI，证据明确区分普通socket夹具/保留双流/真实rshd。S1仍不宣称UI已可用。

S1收口：Draft#80 code11f9e3d，完整CI655七项全过、原生36三平台全过，13项新增行为测试实际执行。下一步owner/IPC/UI见research/task-owner-next-step.md；整个Rsh任务仍in_progress，未把真实rshd或GUI验收写成通过。

## S2当前执行

- [x] 提取共用lease/registry和DNS，保留Rlogin全部回归与错误映射。
- [x] Rsh任务actor：公平双流/有界flight、串行输入EOF、独立信号、可选运行超时及真实清理。
- [x] 主窗口typed IPC及应用生命周期，真实socket/lease/DNS/DTO负向行为测试。
- [x] 同一原型母版/现有UI规范审查后接入实际命令任务，命令和输出瞬态且不自动重放。
- [x] 原生三平台、完整应用CI及相关前端/启动/安全/许可门禁，记录代码SHA与真实环境缺口。

S2交付：Draft#81 code44529a0，入口为“新建会话 → Rsh远端命令”。完整CI660七执行作业SUCCESS，原生41三平台SUCCESS；前端1160/脚本191、类型/构建/启动等通过。最新证据见research/task-evidence.md。真实rshd/Unix低端口正向/WebView未写成通过，任务继续in_progress。

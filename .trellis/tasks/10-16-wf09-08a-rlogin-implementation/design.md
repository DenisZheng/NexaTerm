# Technical design

唯一详细设计为 [三协议计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md) §3、§5、§7–9。阶段：L0–L2。

该设计是拟实现契约；具体 IPC 与结构签名在开工前结合现有 manager/能力/存储接入确认，并写入 code-spec，不能当作现有接口调用。组件候选、显示模式和受限端口策略按计划中的决策门槛落定。

默认执行顺序为 XDMCP → Rlogin → Rsh；无环境的阶段可以先完成协议核/fixture。Rlogin/Rsh 共享保留端口分配适配，不共享 Telnet 编解码，也不复用 SSH 信任语义。迁移、回滚与运行 generation 按计划§3/8处理。

## L0 selected slice

具体可执行契约见 `.trellis/spec/backend/rlogin-protocol.md`。无依赖 wire 模块编解码首次交换与窗口帧；增量握手按首字节判断，保留同包 banner 尾部，不把握手 ACK 当作认证成功。拒绝消息有界计数后丢弃，错误不保留原文。真实 loopback TCP fixture 与纯字节测试共用生产模块；单独 rustc 三平台 workflow 加速反馈，完整应用 CI 继续保留。OOB/urgent、流控/flush、保留源端口、会话管理、连接许可和 UI 是后续 L1，当前不新增协议能力。

## L1 native foundation slice

本轮实现 `.trellis/spec/backend/legacy-native-sockets.md` 的共用保留 socket 和 Rlogin urgent/mark 控制器。保留实际绑定句柄直至 connect/listen/drop；固定预算、取消和错误类型。控制器拥有单一 socket，优先处理 OOB，在输出背压/暂停时继续接收 urgent；flush 按 mark 只丢弃前段，最新窗口帧按请求发放。真实 native TCP fixture 逐平台验证。完整握手 adapter、session owner/队列、IPC、单次连接许可和 UI 仍是后续 L1，不把该底层组件当成可用终端入口。

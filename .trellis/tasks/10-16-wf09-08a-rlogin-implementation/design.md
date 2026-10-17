# Technical design

唯一详细设计为 [三协议计划](../../../docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md) §3、§5、§7–9。阶段：L0–L2。

该设计是拟实现契约；具体 IPC 与结构签名在开工前结合现有 manager/能力/存储接入确认，并写入 code-spec，不能当作现有接口调用。组件候选、显示模式和受限端口策略按计划中的决策门槛落定。

默认执行顺序为 XDMCP → Rlogin → Rsh；无环境的阶段可以先完成协议核/fixture。Rlogin/Rsh 共享保留端口分配适配，不共享 Telnet 编解码，也不复用 SSH 信任语义。迁移、回滚与运行 generation 按计划§3/8处理。

## L0 selected slice

具体可执行契约见 `.trellis/spec/backend/rlogin-protocol.md`。无依赖 wire 模块编解码首次交换与窗口帧；增量握手按首字节判断，保留同包 banner 尾部，不把握手 ACK 当作认证成功。拒绝消息有界计数后丢弃，错误不保留原文。真实 loopback TCP fixture 与纯字节测试共用生产模块；单独 rustc 三平台 workflow 加速反馈，完整应用 CI 继续保留。L0之后的OOB/urgent、流控/flush与保留源端口见下节；会话管理、连接许可和UI仍待实现，当前不新增完整协议能力。

## L1 native foundation slice

本轮实现 `.trellis/spec/backend/legacy-native-sockets.md` 的共用保留 socket 和 Rlogin urgent/mark 控制器。保留实际绑定句柄直至 connect/listen/drop；固定预算、取消和错误类型。控制器拥有单一 socket，优先处理 OOB，在输出背压/暂停时继续接收 urgent；Unix flush按mark只丢弃前段；Windows当前adapter缺失精确边界，flush明确失败并保留数据，功能目标仍待实现。最新窗口帧按请求发放。真实 native TCP fixture 逐平台验证。此基础slice不含握手adapter，接管实现见下节；session owner/队列、IPC、单次连接许可和UI仍是后续L1，不把该底层组件当成可用终端入口。

## L1 原生建立连接 adapter

原生建立adapter使用已选定BSD profile（用户名各30 UTF-8字节、terminal/speed共58字节），在任何bind前验证完整字段、窗口和数字IPv4目标。单一future独占socket，将保留源端口、connect、完整请求partial write、增量ACK/拒绝串入同一个15秒建立截止；同步有界bind前后检查预算，取消轮询25毫秒，不创建脱离owner的任务。ACK只表示初始交换完成。

ACK同包尾部转入reader已有有界隔离区，恰好一次、原样、有序地交付，继续受urgent优先、有效Unix flush和背压控制；不增加第二个无界banner缓存。拒绝正文不存入错误，不做提示文本或登录状态推断。真实loopback的协议交换在普通测试socket上执行，明确不把它称为Unix低端口登录成功；现有原生低端口测试保留。

接口与测试点先固定于 .trellis/spec/backend/rlogin-connect.md。无新IPC、UI或持久化模型；尚不承担主窗口许可、四会话配额和DNS，后续会话owner负责，完整能力保持关闭。Windows精确flush缺口不被该adapter覆盖。

后续owner的既有接口核对与开发顺序见 research/session-owner-seams.md；其中credit/pull/typed IPC具体签名仍须在对应实现前写入code-spec，不能当作已实现接口。

## L1 会话owner与有界交付

本轮实现独立Rust会话manager/单owner actor，字段在reserve时校验并冻结，单次许可绑定目标和新UUID generation；未用租约15秒，最多16个瞬时句柄、4个真实worker。worker到实际socket关闭后才归还额度，关闭会等待该完成信号，caller future丢弃只触发取消，不提前释放资源。已关闭但输出尚未确认的句柄不静默逐出，最终读取或显式close释放。

输出采用pull/ACK，最多一个已交付但未确认的块，重复pull不复制该数据；输入/输出各1MiB，块≤32KiB且队列条目也有上限，保留partial write后缀。输出预算为quarantine/read scratch/交付副本合计预留3×32KiB。flush清未交付队列并递增epoch，已交付块保留额度至前端确认/丢弃；旧确认只能释放它本身，不影响下一块。具体签名与状态见rlogin-session.md。

本轮先落实headless owner与真实socket回归，不接现有Telnet无界通道，不修改终端UI/存储或开放完整协议标志。IPC接入前仍须核验主窗口与Windows边界能力；DNS和UI为后续独立接入。

## L1 IPC与应用生命周期（本轮）

按rlogin-runtime.md接入实际主窗口核验、numeric IPv4冻结许可、typed DTO和独立status。u64在JSON边界保留十进制字符串；数据交付继续pull/ACK/epoch，不走公共terminal emit或日志。Windows精确边界不足在IO前拒绝，cleanup/status仍可使用。main销毁关闭入口并取消，Exit显式await真实worker完成；不持锁等待。此轮无UI/编码/存储或DNS改动。

## L1 前端有界交付（本轮）

新建每generation单owner的无渲染器依赖桥；先poll再显式render，最多一个ready/writing帧，解析回调后才确认。poll合并并发，ready帧遇flush直接丢弃并精确ACK；已交给renderer的帧等回调，不清屏。读失败可能已消费backend帧，固定失败并关闭，不自动重读。close先失效回调，再等待backend及已发IPC；失败保留lease供重试。write/resize仅单个在途调用，无隐藏输入队列。具体签名、字节/owner预算与错误矩阵先写入frontend/rlogin-delivery.md。本轮无UI/编码/连接模型变更。

## L1 终端IO适配器

PR #73之后先接编码和renderer owner，具体签名/预算/错误矩阵先固定在frontend/rlogin-terminal.md。reserve默认UTF-8并冻结既有八种编码；新增严格text write与raw write共用实际输入额度。后端保留encoding_rs既有版本，不接Telnet改写。前端纯controller按epoch增量解码、128KiB/256块有界输入、单个实际write、最新resize合并和dispose后丢弃确认；close等待实际IO完成。controller不依赖React或xterm、不挂定时器、不发公共输出事件。连接模型/原型与挂载UI继续下一层，能力暂保持false，不将adapter测试称为完整终端。

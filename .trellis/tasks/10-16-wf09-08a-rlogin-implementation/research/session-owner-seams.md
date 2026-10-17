# 下一阶段：原生会话owner接入点

这是已授权L1的工程接入记录，不是另行确认的产品交互。headless session owner与pull/ACK契约现已在PR #71实现，执行证据见session-owner-evidence.md。当前只接受选定的数字IPv4；typed IPC/应用生命周期已在PR #72接入并通过三平台原生与完整CI；DNS和终端UI仍待接入。

## 已核对的仓库边界

- `terminal/telnet.rs`的会话命令与输出都用unbounded channel，close只发送命令；不能照搬为legacy的有界资源/关闭完成契约，也不复用Telnet IAC或输入改写。
- `terminal/manager.rs`的start_log仅允许SSH/Local，保留该默认拒绝，不扩大到Rlogin/Rsh。公共emit_terminal_output经过SessionLogs；接入时保证legacy无可开启日志路径，不自动接历史/宏/MultiExec。
- `connection_probe_runtime.rs`已有main窗口核验、一次消费reservation、15秒未用租约、过期/重复/owner测试。其window清理不代表不可中断worker已结束，不能直接把registry删除当legacy任务清理完成。
- `xdmcp/mod.rs`由worker持有Lease到真实清理完成；stop_pending时保留资源占用。原生socket owner也须以真实任务结束释放四会话配额，并隔离新的generation。

## 实现顺序与硬约束

1. 先独立的单owner actor/有界byte队列，再接app管理和typed IPC；同一socket只由actor读写和处理urgent。取消、窗口销毁与应用退出均由owner收口；错误固定code，无输入/命令/服务端拒绝正文。
2. 输入、输出各1MiB，事件≤32KiB；32KiB隔离区必须计入输出预算。队列按**字节**记账，已取出但尚未写完的输入后缀仍占预算。resize可保留最新尺寸，不建无限控制队列。会话数据用原始bytes，编码在统一终端边界处理。
3. 发出Tauri事件不等于前端已渲染。现有pull/ACK/epoch的具体签名见rlogin-session.md；IPC中尚未消费的数据仍占输出预算，不能出队即释放全部额度再无界emit。下一阶段将该契约接到typed IPC与前端。
4. flush清owner中尚未交付渲染的数据；generation隔离重连，必要的output epoch用于清前端尚未渲染的旧段，不能删除已显示内容掩盖协议错误。背压时继续处理urgent与取消，普通输出停止读取。
5. 主窗口一次许可必须绑定本次目标和generation，先reserve再consume，未用15秒过期；不自动恢复连接、不使用SSH凭据，不接自动命令重放。Windows缺精确flush时完整Rlogin能力继续关闭。
6. 加DNS时总15秒必须从解析前开始；当前owner已在调度前计算绝对deadline并传入numeric adapter。后续DNS继续沿用该截止，不可中断解析的真实worker保留独立解析配额至返回；取消ACK不证明OS lookup已结束。

## 下一刀验证点

四会话配额/不排无限等待队列、未用租约过期、重复/foreign/main限制、取消在reserve/start/ACK/active各阶段、worker abort/drop及close等待真实EOF、慢消费者byte预算、partial write保留、输出ACK/flush epoch、过期generation拒绝、quiet终端不触发建立超时。真实rlogind/三主题/完整窗口IPC另行验收，不由actor fixture替代。

## IPC与应用接入顺序（PR #72已编码，保留设计时核对记录）

1. `lib.rs` 当前只manage XdmcpManager，Destroyed与RunEvent::Exit也只有现有服务清理。为Rlogin增加app托管state；main销毁立即取消，Exit显式await真实worker完成。当前core.shutdown只发信号，不能直接当作退出等待，需补可测试的完成屏障；Drop仍只负责兜底取消。
2. 独立runtime模块沿用 `xdmcp_runtime.rs` 的实际WebviewWindow参数和main标签核验，调用方不得传owner冒充。先核验窗口/平台，再处理reservation；Windows精确边界不足在IO前固定拒绝，能力对象分别说明native core、runtime和终端入口状态。
3. DTO按现有Tauri snake_case和AppError契约映射固定code，不放原始OS/端点/拒绝正文；reserve一次冻结全部配置及本次明文许可，start只收reservation ID。无保存配置、SSH凭据或自动重连旁路。
4. 将write/resize/read/ACK/cancel/close映射到typed命令；u64 epoch/sequence在JSON边界使用十进制字符串，避免JS number损失精度。加入不消费输出的status元数据查询，不能用read当状态轮询而遗失未确认帧。
5. read仍只交付一个有额度的帧；前端以后在xterm写入完成或明确丢弃后才ACK，同一实例串行pull。runtime不引入unbounded channel、公共terminal output emit或SessionLogs。flush epoch、新generation和旧ACK语义保持rlogin-session.md契约。
6. 下一刀先完成无UI的DTO/owner/平台拒绝/生命周期集成及三平台回归，再进入终端连接模型、原型与真实UI；实际窗口IPC、安全属性提示、主题及真实rlogind证据继续单列，不由纯Rust DTO测试冒充。

当前运行边界见rlogin-runtime.md，执行结果见runtime-evidence.md。上述“当前/下一刀”按核对当时的headless基线理解，不覆盖PR #72之后的实现状态。

# 下一阶段：原生会话owner接入点

这是已授权L1的后续工程准备，不是已实现的接口或另行确认的产品交互。当前建立adapter只接受选定的数字IPv4；session owner、DNS、IPC和终端UI仍未交付。

## 已核对的仓库边界

- `terminal/telnet.rs`的会话命令与输出都用unbounded channel，close只发送命令；不能照搬为legacy的有界资源/关闭完成契约，也不复用Telnet IAC或输入改写。
- `terminal/manager.rs`的start_log仅允许SSH/Local，保留该默认拒绝，不扩大到Rlogin/Rsh。公共emit_terminal_output经过SessionLogs；接入时保证legacy无可开启日志路径，不自动接历史/宏/MultiExec。
- `connection_probe_runtime.rs`已有main窗口核验、一次消费reservation、15秒未用租约、过期/重复/owner测试。其window清理不代表不可中断worker已结束，不能直接把registry删除当legacy任务清理完成。
- `xdmcp/mod.rs`由worker持有Lease到真实清理完成；stop_pending时保留资源占用。原生socket owner也须以真实任务结束释放四会话配额，并隔离新的generation。

## 实现顺序与硬约束

1. 先独立的单owner actor/有界byte队列，再接app管理和typed IPC；同一socket只由actor读写和处理urgent。取消、窗口销毁与应用退出均由owner收口；错误固定code，无输入/命令/服务端拒绝正文。
2. 输入、输出各1MiB，事件≤32KiB；32KiB隔离区必须计入输出预算。队列按**字节**记账，已取出但尚未写完的输入后缀仍占预算。resize可保留最新尺寸，不建无限控制队列。会话数据用原始bytes，编码在统一终端边界处理。
3. 发出Tauri事件不等于前端已渲染。需要明确的credit/ACK或受限pull契约，确保IPC中尚未消费的数据也不绕过输出预算；不能出队即释放全部额度再无界emit。该具体签名在owner开发时写入code-spec，再接前端。
4. flush清owner中尚未交付渲染的数据；generation隔离重连，必要的output epoch用于清前端尚未渲染的旧段，不能删除已显示内容掩盖协议错误。背压时继续处理urgent与取消，普通输出停止读取。
5. 主窗口一次许可必须绑定本次目标和generation，先reserve再consume，未用15秒过期；不自动恢复连接、不使用SSH凭据，不接自动命令重放。Windows缺精确flush时完整Rlogin能力继续关闭。
6. 加DNS时总15秒必须从解析前开始；当前numeric adapter的默认connect从入口计时，后续需要把原绝对deadline传入整个建立过程。不可中断解析的真实worker保留独立解析配额至返回；取消ACK不证明OS lookup已结束。

## 下一刀验证点

四会话配额/不排无限等待队列、未用租约过期、重复/foreign/main限制、取消在reserve/start/ACK/active各阶段、worker abort/drop及close等待真实EOF、慢消费者byte预算、partial write保留、输出ACK/flush epoch、过期generation拒绝、quiet终端不触发建立超时。真实rlogind/三主题/完整窗口IPC另行验收，不由actor fixture替代。

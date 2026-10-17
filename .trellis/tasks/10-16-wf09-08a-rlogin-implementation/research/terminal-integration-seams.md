# 后续终端接入：已核对的工程边界

PR #72只交付后端IPC和应用生命周期；本文登记下一刀的复用约束，不把终端接入或产品交互标为完成。已批准目标与验收仍以三协议计划§5/7及WORKFLOW_SPEC所引规则为准；UI改动前继续走既有原型、ui-ux-pro-max和token流程。

- `src/features/terminal/terminalOutputFlow.ts` 的 `TerminalOutputQueue` 按字符拆批，但 `enqueue` 本身不设总容量，也没有Rlogin帧/epoch/ACK概念。不能把pull结果持续塞入该队列并提前ACK；后续桥接须维持每实例一个已交付帧，只在xterm完成解析或明确丢弃后确认，覆盖销毁、写入失败和旧generation回调。flush只处理尚未渲染的旧帧，不靠清屏删除已显示内容。
- `src/features/terminal/characterSessionTypes.ts` 当前只含Telnet/Serial。Rlogin需原始字节与现有用户编码衔接，不套Telnet IAC或Enter改写；十进制epoch/sequence直接透传，不能转成JS number、用前端计数重建或由字符长度计算字节额度。
- `src-tauri/src/terminal/manager.rs` 的公共输出会经过SessionLogs；当前日志仅允许SSH/Local。后续Rlogin reader/输入桥接必须继续绕开公共输出日志路径，不放开SessionLogs、不自动接宏/历史/MultiExec；认证交互仅在瞬态终端中发生。
- 运行时IPC已有九项命令，签名以rlogin-runtime.md为准。后续frontend关闭/重连要await所属generation真实close；旧异步结果只能清理旧句柄，不能接管新实例。主窗口生命周期由backend托管，不以React组件卸载代替实际socket完成。
- 当前runtime仅接受数字IPv4；DNS需要解析前开始的同一15秒绝对截止，以及不可中断解析的真实配额持有策略，不能只增加lookup包装就宣称取消回收完成。Windows capability仍拒绝运行时IO，直到精确urgent边界实现并验证；UI必须忠实显示该能力。

下一刀应先完成有界前端交付桥与generation/ACK/flush回归，再接连接模型、原型和终端交互；真实WebView负向IPC、服务端互通、三主题与原生体验继续统一后续验收。

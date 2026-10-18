# 下一切片：实际Workspace / TerminalPanel接线

这是对9a92f48生产代码的核对及下一步具体实现契约，不是已经挂载的UI。已完成组件见ui-foundation-evidence.md；真实终端能力仍false，必须接线及回归后才开启。继续同一用户授权、WS-P01/P02/P04及WS-R01/R02；人工原生界面/主题验收统一后续。

## TerminalPanel实际边界

- xterm/fit/search/Unicode/semantic-highlighter与主题沿用已有实现。原生分支必须在TerminalOutputQueue、startupBuffer、公共event listeners、onData目录/历史/宏逻辑之前返回；controller.write(text,onParsed)直达xterm，不接公共日志/recent-output/OSC7/AI上下文。
- 自定义Ctrl+V关闭模式目前直接terminalWrite；原生分支改走同一有界text/raw输入owner。onBinary字节字符串必须走sendBinary，不按文本重编码。原生关闭后普通Enter不自动建立连接。
- 公共状态回调、autoConnect/reconnect、initialOutput补写、prompt-directory注册必须明确排除原生模式；原生sessionId始终为空，不把UUID传进React状态、公共事件或terminal_close。logSupported=false；上下文粘贴/重连根据独立状态走native回调。
- search controller可移至公共xterm初始化阶段；原生渲染attach只交给该generation一个renderer。pane卸载先停止observer/input handlers，再真正dispose xterm，最后detach/明确丢弃ACK；不在pane卸载关闭workspace owner。generation改变时重建renderer，旧回调不接新实例。
- 原有font/active/layout fit函数在sessionId=null时仍fit，但不发公共resize；可复用这点。原生onResize在public sessionId guard前分流，初始化attach后显式发送当前cols/rows，避免首个fit事件发生在listener注册前。ResizeObserver沿用既有debounce，controller保留最新resize有界合并。

## 原生start与owner

- 实际SessionManager.start等待协议ready/ACK，不只是dispatch。取消时必须立即close同一UUID以唤醒建立过程，再等待issued start及真实cleanup；#76 owner已经覆盖该竞态。
- 下一步可在实际start成功后发布initial_exchange_ready（只代表初始交换，非认证），让输入与窗口发送以此为门槛。不要把预备state starting当可写状态；Rust resize/write尚未ready时会返回NotReady。
- 面向pane的适配器使用type-only接口，含controller/输入可用状态/send/sendBinary/resize/reconnect；跨generation的class保持workspace私有map，渲染侧用cached getSnapshot/subscribe。

## Workspace归属与入口

- LocalTerminalTab新增source rlogin，只有逻辑tab/profile/ordinal/status，不保存native UUID或输出。创建owner/runtime模块必须动态import，避免主窗口首屏静态引入重模块。
- 动态import尚未完成时关闭也要保留pending记录：取消后晚到模块不得创建/连接新owner，关闭await初始化/实际close成功后才删除逻辑tab。失败保持可见、可重试记录；不能沿用当前closeLocalTerminalTabs先public close再删数组的方式。
- open/new/copy/split/batch与saved-profile路由必须显式处理Rlogin；通用SSH step的真实拒绝保护保留，不能再用浏览器假成功。每次connect/reconnect固定当时profile/window后新许可；旧清理失败不替换owner。
- 许可用现有Radix组件，固定目标快照；单次请求/队列有界，AbortSignal关闭并settle对应promise，不能覆盖另一实例的pending resolver。Windows与browser显示真实不可用；不自动提权或高端口fallback。
- close计划中的Rlogin项异步完成后才移除；混合关闭可先处理其它实例，但snapshot/active/split后续必须用真实剩余集合。分屏移动仅detach renderer，不关连接；同一实例不能同时attach两个renderer。

## 恢复与隐私

- Snapshot source枚举与Rust校验一起扩展；只存逻辑profile/instance，恢复Rlogin一律等待新的显式许可，排除通用autoReconnect分支。已删除profile显示不可连接，但仍允许关闭保留实例。
- Files/MultiExec/宏/命令历史/AI最近输出的选择器必须显式排除source rlogin；不能只碰巧依赖sessionId为空。输出从控制器直达解析确认，不启用generic warmup/public terminal manager。
- 主窗口/Exit清理由已接入Rust生命周期提供最后屏障；frontend workspace map仍需停止timer并发起自身close，不在React cleanup伪称已await完成。

## 必需回归

真实TerminalPanel私有分支的write/onParsed/dispose、文本/二进制/粘贴/resize、无公共事件或历史日志；workspace动态import/迟到reserve/start/cancel、close失败保留、重连新许可、混合关闭、split detach/重附着、restore不自动连接、batch/Files/MultiExec/宏/历史排除。类型/完整build/startup/source gates、完整应用及实际native CI；组件测试不冒充WebView或真实rlogind联调。

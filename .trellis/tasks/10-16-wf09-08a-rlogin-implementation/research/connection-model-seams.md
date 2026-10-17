# 后续连接模型与真实终端接线

以下为对现有生产路径的核对和后续工程顺序，不是已实现API；实施前仍须把最终字段/迁移/错误矩阵写入对应code-spec。用户流程和验收继续沿用本任务及三协议计划§5/7，产品规则为WORKFLOW_SPEC v0.7。

## 配置与存储

- 现有ConnectionProtocol仅SSH/RDP/VNC/Telnet/Serial；Rlogin要有独立配置（本地IPv4、本地用户、terminal/speed），远端地址/端口和远端用户复用通用目标字段，显示编码沿用advanced.terminal_encoding。运行时目前只接受numeric IPv4，表单不能伪造DNS可用性。
- ConnectionProfileInput/Validated/Profile、JSON旧文档、SQLite repository和SyncConnectionRecord分别承载同一配置。SQLite当前schema4；新增独立配置列须覆盖初始化、升级、各SELECT/行映射、普通upsert、sync导入/导出、connection_transfer及旧JSON迁移。不能只加表单字段，导致重读、复制、迁移或同步后丢失。
- storage_repository当前有两套连接行布局：普通Profile不读secret slot，SyncRecord带slot引用；不能按其中一套列下标机械扩展另一套。connections/mod.rs与storage_repository.rs均受冻结行数预算约束，先抽现有验证/行映射/查询片段，再加字段，不能提高预算。
- 不保存allow_plaintext、reservation/session ID或认证输入；不套用SSH credential/proxy/jump。必须在backend拒绝不兼容的实际配置，不能只依赖前端隐藏控件。旧协议的默认值和secret保留语义继续回归。

## 原型、入口与能力

- NewSessionMenu共用newSessionCharacterEntries；ConnectionDialog目前五种protocol和对应port/normalize分支。必须先在既有母版实现Rlogin字段、本次许可、连接中取消、失败/重连/清理失败的可点击状态，再迁移到现有Radix/token组件。UI-UX审查已完成相关focus/cleanup部分，视觉与三主题仍需实际验收。
- 新协议不能落入normalizeForSubmit或openConnection末尾的SSH默认分支，所有入口/复制/快开/批量/恢复均需显式处理或给出真实不可用原因。
- Windows runtime IO仍被backend拒绝；Unix的runtime_available也不保证当前用户能绑定低端口，实际权限错误必须保留，不自动提权或改用高端口。

## 生命周期与终端

- WorkspaceShell已有LocalTerminalTab承载Telnet/Serial，但关闭路径是公共terminal manager，不能把Rlogin UUID交给terminal_close。新owner按逻辑tab持有attempt/controller，pane只attach renderer。若清理失败保留所属记录和可重试状态，不能先删标签后吞掉错误。
- 每次连接先固定目标/用户/窗口/编码快照，再请求本次许可；reserve迟到且已取消时只关闭该旧ID，不得start。start迟到、旧parsed/resize回调不能接管新generation；重连先await旧close，再获得新许可和UUID。恢复布局不恢复许可，不自动连接Rlogin。
- TerminalPanel已含统一外观、搜索与主题；公共输出路径会进入日志/recent-output/目录推断，onData会进入宏/历史。Rlogin接线必须在这些公共路径之前分流，通过controller直达解析回调，不自动开启上述功能或MultiExec。ctrl-V、粘贴、重连和resize也要一致分流。
- 当前controller.send负责Unicode text，bridge仍有raw write。后续接xterm.onBinary时必须先让raw/text共用同一个有界输入队列，不能直接并发调用raw bridge，不能把二进制鼠标/控制数据再按文本编码。
- controller.tick无隐式定时器；后续scheduler必须有界、可取消、保持单poll，允许未渲染/后台pane继续必要控制处理。局部unmount先实际dispose renderer再丢弃其write，真正会话关闭由workspace owner负责。

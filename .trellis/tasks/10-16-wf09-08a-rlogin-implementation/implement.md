# Execution plan

状态：已获开工授权；XDMCP X1 原生核心已推进，本任务开始独立的 L0 协议核，组件/靶机缺口不阻塞此阶段。

- [x] L0：原生握手、字段/分片/拒绝/EOF、窗口帧协议核和可复现 loopback 服务端 fixture（不是完整 rlogind）。
- [x] L1组件：保留源端口、原生OOB/流控/resize、Unix精确flush及真实socket测试。
- [ ] L1：Windows精确flush backend（当前明确失败并保留数据），不缩减产品目标。
- [x] L1组件：headless会话manager、冻结配置/单次许可、有界pull/ACK/epoch和真实worker清理。
- [x] L1组件：typed IPC、应用/窗口生命周期（原生三平台及完整CI635通过）。
- [ ] L1：终端UI/能力/编码；不执行外部客户端。
- [ ] L2：具体服务端 profile 的真实互通、权限拒绝与三平台/三主题验收。
- [x] 更新已实现L0/L1组件的可执行code-spec、能力边界、错误/资源预算契约及回归测试；后续IPC/应用/终端接入仍须补齐对应契约。
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
- [ ] 该slice收口时Windows精确flush、完整握手adapter及session接入仍未完成；握手adapter的后续实现见下节，Windows精确flush与session manager/队列、typed IPC、许可、UI、真实互通继续开发。L1整体未完成；本轮不算Rsh已实现。

只为既有windows-sys开启WinSock feature，无新crate版本或传递依赖。详细平台证据、失败根因和后续资源约束见 [research/native-socket-evidence.md](research/native-socket-evidence.md)。收口只修改文档、注释和测试名称，运行逻辑及断言不变。本地无Rust工具链，实际Rust执行以CI为准。

## L1 establish / ACK adapter（PR #70）

- [x] 先验证BSD profile/地址/窗口；复用L0编码，不截断或静默改参数。
- [x] connect接收绝对截止，全部建立阶段复用同一15秒预算；处理partial write、增量ACK/拒绝、取消/EOF/drop。
- [x] ACK尾部转入现有reader有界区，恰好一次且支持背压/urgent；无登录成功推断。
- [x] [原生 #14](https://github.com/DenisZheng/NexaTerm/actions/runs/38943343620)：三平台各34项全通过，无skip/ignore；覆盖请求、ACK尾部/urgent接管、拒绝、EOF、取消/共享截止/实际task abort回收。Unix公共adapter真实低端口结果为AccessDenied，Windows实际低端口完成请求/ACK/清理；普通socket协议交换不冒充低端口或真实rlogind互通。
- [x] 维护规范与生产模块harness、[Draft #70](https://github.com/DenisZheng/NexaTerm/pull/70)（基于#69），保留全部语义断言。
- [x] [完整应用 CI #626](https://github.com/DenisZheng/NexaTerm/actions/runs/38943343704)：7个实际执行job全部通过；Rust Linux/macOS各508、Windows509通过，Linux另4个既有ignored；其它二进制/集成/doc、前端888通过/1todo及全部source/security/license/fixture通过。条件打包未触发。

该adapter slice执行代码基准：`0cd5cf53bb2553b35408fccec701d66acb3d0f25`。Darwin通知和peek位置副作用根因、最终平台矩阵见 research/establish-evidence.md。L1整体保持in_progress，下一阶段为会话owner/队列/许可/IPC/终端接入；Windows精确flush仍须继续开发。

## L1 session owner（PR #71）

- [x] 实现冻结配置/许可、一次消费/过期、16句柄与4worker额度、generation与取消清理。
- [x] 实现单socket actor、按字节有界输入/输出、partial write、最新resize、pull/ACK和flush epoch。
- [x] [原生 #21](https://github.com/DenisZheng/NexaTerm/actions/runs/38992242838)：Linux49/macOS50/Windows48通过，无skip/ignore；真实socket验证背压、flush、输入顺序、窗口请求、close/abort回收及配额不提前释放。macOS含32轮重复窗口控制，修复旧NOTE_OOB再交付。
- [x] [完整CI #633](https://github.com/DenisZheng/NexaTerm/actions/runs/38992242862)全部7个实际执行job通过：Rust Linux523/macOS524/Windows523，Linux另4个既有ignored；其它二进制/集成/doc、前端888通过/1todo及source/security/license/fixture通过。XDMCP原生#5三平台各1项通过。

执行代码基准`32323da32c965c42aa878b03161d6d5d5fdc1f98`；[Draft #71](https://github.com/DenisZheng/NexaTerm/pull/71)基于#70。具体平台矩阵、Linux urgent关闭语义、Darwin旧filter状态及XDMCP PID夹具竞态复盘见research/session-owner-evidence.md。收口仅文档/规范/任务更新；下一刀为typed IPC和应用生命周期，L1整体保持in_progress。

## L1 IPC / application lifetime（PR #72）

- [x] 实际main窗口核验、typed DTO、平台能力与IO门禁。
- [x] 不消费输出的status、main销毁取消和Exit真实完成屏障。
- [x] JSON/owner/生命周期/真实socket回归，三平台harness与完整CI。
- [x] 规范/进度/执行证据及Draft PR收口；UI/DNS/Windows精确flush继续后续。

后续终端接入已核对的队列/字节/日志/generation边界见research/terminal-integration-seams.md；它不是已实现UI或额外产品交互批准。

本轮执行代码`ae8644ee3d26c15d6da183ee2930409d6dabee63`；[Draft #72](https://github.com/DenisZheng/NexaTerm/pull/72)基于#71。[原生#23](https://github.com/DenisZheng/NexaTerm/actions/runs/38995284463) Linux58/macOS59/Windows57全部通过，无skip/ignore；[完整CI635](https://github.com/DenisZheng/NexaTerm/actions/runs/38995284424)7个执行job全通过，应用library Linux532/macOS533/Windows532（Linux另4个既有ignored），前端888通过/1todo。详情见research/runtime-evidence.md。L1整体仍in_progress，下一刀先完成有界前端交付桥，再接连接/终端UI。

## L1 frontend delivery（本轮）

- [x] 固定typed DTO/响应校验与九项wrapper。
- [x] 单帧poll/render/ACK/epoch、错误停机、generation隔离及真实close屏障。
- [x] 行为测试、类型/完整前端构建与source gates、完整CI。
- [x] 更新执行证据和Draft PR；UI/编码/DNS/Windows精确flush继续后续。

当前前端交付代码251f2e2、Draft #73，71项新增测试及本地959项全量测试/类型/构建/23项source checks已通过，完整CI637的7个实际执行job全部通过；三平台Rust532/533/532，Linux另4个既有ignored。详情见research/frontend-delivery-evidence.md。

## L1 terminal IO adapter（PR #74）

- [x] 严格编码与冻结配置、text write IPC和原生socket回归。
- [x] 增量decoder、输入背压、renderer detach/close与resize合并。
- [x] 行为/类型/构建/source gates、三平台原生与完整CI。
- [x] 证据和Draft PR收口；继续连接模型、母版原型和实际终端UI。

ui-ux-pro-max已核对官方MIT来源并执行针对focus/modal与React异步cleanup的审查；落实为既有Radix焦点/显式错误/实际清理与token，不引入新视觉体系。本adapter slice无界面变更；后续UI必须先改母版并记录可点击交互证据。

执行代码9f81d3e、Draft #74：Rlogin原生28为66/67/65、XDMCP原生8各1项、完整CI642全部7个执行job成功，Rust541/542/541（Linux另4既有ignored），前端1016/1既有todo。详细失败定位、原句柄复验和最终矩阵见research/terminal-io-evidence.md。主任务及L1整体仍in_progress；继续配置/存储与终端UI。

## L1 saved connections / mounted terminal（当前）

- [ ] 独立模型、schema5备份/原子升级、CRUD/复制、旧JSON/同步/transfer全通路。
- [ ] 母版交互、统一配置表单、本次许可与真实能力入口。
- [ ] Workspace generation owner、原始/文本输入统一队列、TerminalPanel直连解析及关闭/重连/恢复隔离。
- [ ] 受影响行为/隐私/迁移回归、类型/构建/source gates、完整CI和Draft PR证据。


### 当前交付边界：先提交配置存储，再接表单与终端

本轮先形成独立、可审查的backend配置存储变更，完整CI验证后继续下一堆叠UI切片。TS协议联合、母版、表单和真实终端入口仍未接入；不能把后端模型落库称为可用终端功能。当前无Rust本地工具链，迁移/加密往返/凭据行索引的实际测试依赖三平台完整CI，不能用source checks替代。


## L1 实际终端入口（当前）

基于已验证PR76文档头cee7e736，原型体验仍按同一母版和同一用户流程。先加入私有renderer绑定与实际TerminalPanel分支（局部10项测试已通过），再接workspace私有owner map/冻结许可、异步关闭/重连、split与restore、Files/MultiExec/宏/历史排除。终端能力保持false直至实际路径与回归齐备。代码契约见frontend/rlogin-mounted-terminal.md；全量测试/构建/source及完整CI仍需执行，局部测试不称为WebView或真实rlogind验收。


### 实际入口本轮进展（2026-10-18）

#75配置存储完整CI645与#76表单/attempt组件完整CI646已通过。当前入口已实现：实际菜单/协议表单、保存后立即连接、saved/new/split/batch、冻结许可队列、动态owner、取消、重连、失败重试关闭、工作区恢复不自动连接，以及公共终端/日志/历史/宏/广播/Files/AI隔离。Unix terminal_available按exact_flush启用，Windows继续真实不可用。实际TerminalPanel私有解析交付、输入/原始字节/resize复用有界controller；EOF保留既有显示，pane卸载只detach。新增45项前端行为回归及8项真实shell脚本回归；本地全量1104通过/1既有todo。完整build/source及GitHub三平台CI证据在research/mounted-entry-evidence.md收口；未将组件测试称为原生WebView/主题/真实rlogind互通。

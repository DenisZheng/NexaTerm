# WF-09：XDMCP、Rlogin、Rsh 实现计划

日期：2026-10-16。状态：**维护者已于2026-10-16授权开工；XDMCP 的 X1 运行核心与 X0 组件审查推进中，Rlogin 的 L0、L1 socket/控制/建立/会话owner已过三平台原生与完整CI，typed IPC/应用生命周期也已过三平台原生与完整CI，Rsh 尚未开工**。

## 1. 范围与状态变更

维护者本次要求先将三个协议的实现方案写入计划，再进入开发。最初计划提交只包含文档和任务元数据；后续实现另立代码 PR。此前“07/08 评估完成”仍是历史交付事实，不代表三个协议的功能已经完成。

产品目标以 [WORKFLOW_SPEC](../WORKFLOW_SPEC.md) 的 WS-P01、WS-P02、WS-P04、WS-N03–N05、WS-R01/R02 为准。以下阶段、组件和接口是后续实现设计，不是当前软件能力说明。前一轮“先不要实现”的文档阶段限制，已由后续“可以按实现计划开工了”授权替代。

| 项目 | 原评估 | 当前开发方向 | 当前实现状态 |
| --- | --- | --- | --- |
| WF-09-07 XDMCP | 评估完成，真实集成被环境阻塞 | 集成并随包管理 X server，交付完整桌面会话流程 | IN_PROGRESS（X1）；组件未定、无真实桌面互通证据 |
| WF-09-08A Rlogin | 原生实现 DEFER | 独立原生协议实现和终端接入 | IN_PROGRESS（L1）；L0 三平台 CI 已过，保留socket/OOB控制组件已过三平台原生与完整应用CI；Unix精确flush通过，Windows精确边界仍待开发；建立/ACK尾部adapter也已过三平台原生与完整应用CI，headless会话owner/有界pull-ACK也已过三平台原生与完整应用CI，typed IPC/应用生命周期已过三平台原生与完整CI；前端有界交付桥已通过行为/类型/构建和完整CI（Draft #73），终端IO适配器（编码/输入背压/renderer生命周期）已过原生与完整CI（Draft #74），配置/存储和表单组件已过完整CI（Draft #75/#76）；真实Workspace入口/许可/取消/重连/关闭/恢复及隐私隔离已实现、本地验证通过，Draft #77完整CI649和三平台原生30均通过；Unix能力按exact_flush开放，Windows精确边界、DNS和真实互通仍待完成 |
| WF-09-08B Rsh | 原生实现 DEFER | 独立原生远程命令执行 | PLANNED；双流、信号及端口权限未实现 |

缺少靶机不阻止编解码、资源管理、平台能力和可复现 fixture 开发；缺少许可证结论只阻止相关组件引入/分发。真实环境缺口必须具体记录，不以“全部暂缓”代替可继续的开发工作，也不以 mock 成功宣布协议互通完成。

## 2. 任务与执行顺序

唯一父任务保持 `09-23-nexaterm-workflow-mainline`。三个实现任务是同一主线下的独立子任务，不改变已交付评估任务的历史状态。

| 顺序 | 任务 | 阶段交付 |
| --- | --- | --- |
| 0 | `10-16-wf09-protocol-implementation-plan` | 本文、规范确认、路线图与旧评估指向修正；仅文档 |
| 1 | `10-16-wf09-07-xdmcp-implementation` | X0 组件/构建清单 → X1 runner 所有权 → X2 Windows 打包与真实桌面 → X3 macOS/Linux 适配 |
| 2 | `10-16-wf09-08a-rlogin-implementation` | L0 协议核/fixture → L1 三平台 socket 控制与终端 → L2 真实服务端兼容性 |
| 3 | `10-16-wf09-08b-rsh-implementation` | S0 协议核/fixture → S1 端口权限与双流 → S2 命令工作流及真实互通 |

默认按上述顺序推进。某个平台的组件、签名、权限或靶机未就绪时，记录该项依赖后继续不依赖它的协议核/fixture 工作；不得把 Windows 通过推定为 macOS/Linux 通过。首次打包前完成精确依赖审查，真实验收按维护者安排统一进行。

## 3. 共用接入和生命周期设计

当前接入点：`src/features/connections/connectionTypes.ts`、`src/shared/tauri/platformCapabilities.ts`、`src-tauri/src/terminal/manager.rs`、`src-tauri/src/terminal/telnet.rs`、`src-tauri/src/x11_forward.rs`、`src-tauri/src/rdp.rs` / `vnc.rs`。现有 TerminalManager 使用各类 session 的枚举管理；本计划不假设仓库已经存在统一 provider trait。

后续各任务先补自己的 backend 模块及可测试协议核，再扩展既有会话/能力模型。保留协议专属配置，不复用 SSH 的 Host Key、认证或代理成功语义。UI 模块按需加载，样式、原型流程、图标、主题与中英双语沿用仓库规范。

拟定契约（具体 IPC 命名在实现任务设计审查时落定，当前不注册命令）：

| 操作 | 输入与归属 | 结果与边界 |
| --- | --- | --- |
| capabilities | 本机平台与已审查组件清单；不发网络请求 | available / unavailable、bundled / external、原因代码及已验证模式；依赖存在不等于协议可用 |
| reserve / start | 逻辑 instanceId、单次 operationId、协议配置、显式连接许可 | backend 发放单次运行句柄；取消发生在 reserve 返回前也能释放晚到句柄 |
| input / control | backend 句柄、操作归属、协议允许的消息类型 | Rlogin 支持输入/resize；Rsh 支持 stdin/信号/半关闭；图形会话支持聚焦/停止 |
| status / output | backend 句柄 + generation，固定阶段、stdout/stderr 标签 | 旧运行事件不覆盖重连；原始端点、用户名、命令及认证内容不进入诊断 |
| cancel / close | 精确句柄和所有者 | 幂等；清理 reader、writer、listener、子进程和临时文件后确认；失败保留可重试状态 |

候选默认资源预算：并发建立连接最多4个；未消费租约15秒；建立阶段总截止15秒（包括解析和协议握手，不包含等待人工输入或桌面登录）；用户名字段各≤256 UTF-8字节、命令≤64KiB并拒绝 NUL；输入/输出每流队列各≤1MiB、单事件≤32KiB，达到上限施加背压。具体服务端更小的字段限制按兼容 profile 校验，禁止静默截断。预算在实现时集中定义并测试，不复制现有无界 channel。活动终端不套用15秒总寿命；Rsh 运行超时是独立可配置策略，不能把长命令或安静终端误判为握手超时。不可中断的系统 DNS/读取持有配额直到真实结束。

快照只保留非敏感连接配置/引用和逻辑布局，不保留运行句柄、许可令牌、cookie、输入和命令正文。Rlogin/Rsh 不自动套用 SSH 凭据，不自动恢复连接；命令历史、宏、MultiExec 和会话日志默认不接入这两个协议，后续如扩展须明确处理敏感输入边界。

## 4. XDMCP：内置 X server 与桌面会话

### 4.1 组件与打包路线（X0）

目标是随 NexaTerm 安装、由应用管理的组件。用户自行安装的 X server 可作为开发验证/兼容模式，必须标为 external，不能用于宣布 bundled 目标完成。X server 以独立受管进程交付；自行编写完整 X server 不在范围内。

| 平台 | 候选 | 实现前需落定的事项 |
| --- | --- | --- |
| Windows（首个平台） | X.Org/XWin 最小构建；VcXsrv、Cygwin/X 用作具体候选比较 | 锁定版本、直接和传递依赖、构建复现、运行库、XDMCP/认证支持、许可证与签名；尚未批准任何候选进入发行包 |
| macOS | XQuartz / X.Org 的 macOS 实现 | 验证私有 app bundle 路径和依赖重定位、启动方式、签名/公证及目标架构；官方系统安装包存在不等于可直接搬进 NexaTerm |
| Linux | X.Org / Xephyr | 选定发行版和 ABI/依赖基线；区分 X11、Wayland+Xwayland 与无桌面环境，验证嵌套 display 和输入；不承诺无宿主依赖 |

现有 AGENTS 的许可证约束继续有效：优先 MIT/BSD/Apache 等允许的组件。VcXsrv 仓库标注 GPL-3.0；Cygwin API 库采用 LGPLv3+，其工具包另有不同许可证；XQuartz 含多种许可，quartz-wm 为 APSL2。候选不是依赖批准。不得因为“独立进程”就断言无分发义务，不得仅凭 X.Org 核心多为宽松许可就给整个包标 MIT。若候选需要改变项目现有许可策略，必须形成精确组件清单和可审阅决定；未解决前继续 runner/fixture，不静默引入或自行放宽规则。

每个平台形成 manifest：来源 URL、精确 tag/commit、构建脚本、哈希、target 架构、所需动态库、许可证文件、source/notice 提供方式、签名身份和更新方式。release gate 校验实际打包文件和 manifest 一致；只记录版本名不算供应链验证。

### 4.2 受管运行与会话接入（X1/X2）

初版只做显式目标的 direct query；broadcast/indirect discovery 后置。每个逻辑会话分配独立 display 和运行目录，以参数数组启动锁定的程序路径，不拼接本地 shell。路径、参数和网络目标分别验证；锁/display 冲突显式报错，不能抢占用户已有 X server。

状态区分 starting、display_ready、querying、awaiting_login、active、stopping、closed、failed；进程存在或端口开放只证明对应阶段。active 必须有候选引擎可核实的会话证据；若引擎只能报告已发起 query，就如实停留在该阶段，不解析密码或伪造“登录成功”。等待人工登录不套用15秒建立截止，也不能因为超时切换成 active；保留显式取消与可配置等待策略。真实桌面、输入和 logout 由平台验收取证。

建议初版以独立桌面窗口呈现，NexaTerm 会话实例负责状态、聚焦、重连和关闭；嵌入 Tauri/WebView 是额外平台工作，不作为基础 XDMCP 的默认假设。此处为待实现的显示设计，进入 UI 代码前按原型规范确认具体交互。

XDMCP 使用 UDP 协商，远端 X 客户端还需要访问本地 X server；普通 SSH TCP 转发不能直接替代它。按显式目标/本地接口定义所需通信方向，支持的 NAT/多网卡拓扑逐项验证。认证优先使用引擎支持的机制及受限临时文件；不得默认使用 `-ac`、全局放开访问控制、修改防火墙或提权。必要权限/网络条件不满足时给具体原因，不默默开放监听范围。现有 SSH X11 forwarding 路径继续独立管理，两者不能互作成功证据。

取消、连接失败、logout、标签关闭、窗口销毁和应用退出均只清理所属进程/子进程、display、socket、认证文件。不能按进程名终止用户已有 X server。实现平台进程树回收与崩溃残留识别；重连创建新 generation，旧 PID 或端口复用不能误伤新会话。

### 4.3 macOS/Linux 扩展（X3）

复用 runner 契约，分别实现引擎/打包适配，不承诺同一二进制跨平台。各平台 bundled 能力在实际包内组件、原生启动和真实桌面均通过后开启；外置依赖可用时显示 external。构建成功不代替安装、签名和 GUI 证据。

## 5. Rlogin：原生终端协议

### 5.1 协议核与平台 socket（L0/L1）

新增独立 Rust 协议模块，按 RFC1282 的基础 BSD Rlogin 契约建立连接：默认 TCP513、初始 NUL、客户端/服务端用户名、终端类型/速度、服务端握手确认；处理拒绝、分片和 EOF。禁止调用系统 rlogin 程序，也不能复用 Telnet IAC 编解码。

将 TCP urgent/OOB 和正常字节流分别适配到 Unix 与 Windows socket API，测试控制字节的位置、flush、流控开关和窗口请求；控制字节不得显示成终端文本。窗口尺寸按协商发送网络字节序帧，处理连接时尺寸与后续 resize。输入保留字节语义，终端编码沿用现有用户设置；本地 escape 的默认禁用/显式开启行为在 UI 设计中记录，不能吞掉用户普通输入。

部分传统服务端也检查客户端保留源端口；采用与 Rsh 共用的小型 reserved-port allocator/能力探测，按具体服务端和平台验证。低端口不可绑定必须显示权限原因，不能改用高端口后仍宣称兼容。首轮不增加提权 helper，也不要求整个 GUI 以管理员/root 运行。

### 5.2 终端与连接工作流（L1/L2）

扩展连接类型、表单校验、能力对象、TerminalManager session 分支、typed IPC 与 terminal reader。UI 标明协议安全属性，要求本次连接明确同意，backend 校验对应的单次许可；保存配置不等于永久许可。认证交互直接经瞬态终端流，不保存或预填 SSH 密码，不用匹配口令提示来推断可靠的登录完成状态。

取消在 DNS、bind、connect、握手及 reader 阶段都可生效；close 必须等待所属 socket/task 回收。复用会话实例和新 generation 隔离重试，不复用旧 transport。基础 BSD 变体为首轮目标，Kerberos/加密扩展另行兼容，不因支持基础协议而声称支持所有变体。

## 6. Rsh：原生命令执行

### 6.1 协议核和双流（S0/S1）

新增独立 Rust 模块，按指定 BSD rshd profile 实现主连接、NUL 结尾的 stderr 回连端口、客户端/服务端用户名和命令、握手确认及拒绝；默认目标端口514，按 profile 验证。命令作为协议字段原样发送给服务端，服务端按其 shell 解释；本机不执行 shell，也不在命令前后拼接用户名、路径或环境注入。UI 必须明确这是远端命令执行。

在主连接前创建所属 stderr/signal listener 并绑定选定本地接口；通过该主连接选定的远端地址验证回连归属，并核对该 profile 的源端口约束。一次只接纳有效所属回连；无效候选及时关闭，有界重试且受建立总截止限制。不能监听任意来源并把第一条回连当成服务端。

传统 profile 要求客户端源端口512–1023，stderr 次连接也有保留端口约束。先在实际平台以当前进程权限尝试绑定并返回真实能力结果，避免把“Windows 可 bind”推成三平台保证。POSIX 权限不足时给具体不可用原因；特权 helper/capability 授予属于另行设计的系统集成，不在首轮自动安装或提权。高端口仅用于明确支持该变体的服务端和测试场景，不能作为传统 profile 的静默回退。

### 6.2 命令 UI、信号和结束语义（S2）

Rsh 以命令任务接入会话实例，提供一次显式运行、stdin、分离的 stdout/stderr、取消和重跑；不伪装成 SSH 交互 PTY。信号号经固定映射白名单发送到次连接，不能照搬宿主平台信号数值。stdin EOF、stdout EOF、stderr EOF 和连接失败分别处理；允许有界 drain，不能关闭一个流就丢掉另一流的尾部输出。

基础 Rsh 没有可依赖的独立远端退出码消息。结果应区分 transport 完成/失败、取消和远端退出码 unknown，**不得因 socket EOF 显示 exit code 0 或命令成功**。远端进程是否被取消成功也不能只凭本地连接关闭推定。重跑需用户明确操作，不因重连自动重放有副作用的命令。

## 7. 验证矩阵与完成条件

每项分别记录实现状态、自动化、原生集成、真实互通、平台与许可证/分发证据。固定 CI、私有测试 fixture、真实目标三类证据不能互相替代。测试服务仅置于授权的隔离环境；不修改维护者主机的信任文件或开启公网 legacy 服务。

| 编号 | 必须验证的行为 |
| --- | --- |
| X01 | 实际安装包内组件/哈希/许可证/架构/签名一致，无需用户另装即可启动；external 不算该项通过 |
| X02 | 真实 XDMCP 登录与桌面输入/显示、认证拒绝、目标拒绝、超时和连接中取消；阶段状态不虚报 |
| X03 | 两个独立 display、一个会话关闭、重连及 logout；关闭/崩溃/退出无所属资源残留、不影响既有 X server |
| X04 | 按平台验证必要扩展、分辨率、剪贴板策略、多网卡/网络访问控制；不默认关闭认证 |
| L01 | 真实字节级握手，分片/拒绝/EOF、NUL/字段上限；mock 不冒充服务端兼容 |
| L02 | Unix/Windows 实际 OOB、flush、流控、resize、字符输入与编码；控制字节不泄漏到输出 |
| L03 | 源端口拒绝/权限不足、各建立阶段取消、两实例/重试/断网/窗口销毁、敏感输入不进入持久化 |
| S01 | 主/次连接握手、来源与源端口验证、冒名回连拒绝、部分握手及回连缺失超时 |
| S02 | 分离 stdout/stderr、大输出背压、stdin EOF、信号、双流尾部数据、取消与运行超时 |
| S03 | 传输 EOF 不伪造远端退出码或命令成功；不自动重跑、无本地 shell 执行或敏感命令持久化 |
| C01 | 三平台编译/协议及真实 socket 测试，既有 SSH/Telnet/Serial/RDP/VNC 回归，启动/i18n/快照/权限/许可证/安全门禁不降低 |
| C02 | 原生 UI/IPC、亮色/暗色/system-dark、保存/导入/重启、能力不足说明与资源清理；真实验收按平台取证 |

完成标准：完成计划文档≠实现完成；协议核单测通过≠原生集成完成；某平台 fixture 通过≠三平台实际可用。开发可在真实验收前交付 Draft PR，但缺口必须逐项标记。三项功能不能再次仅以“评估交付”结束。

## 8. 回滚与未决工程项

按各阶段独立提交/Draft PR；新增 schema 使用版本化迁移且保留旧配置，未知协议在旧版本必须可解释地拒绝，不被误当 SSH。回滚先禁用相应能力和新连接入口、回收所属运行资源，再回退实现；不自动删除保存配置、凭据或用户安装的 X server。打包组件以独立清单控制，卸载仅删除应用所属文件。

未决项仅限具体工程选择：X server 精确组件及许可、平台签名/重定位、socket OOB 行为、保留端口权限、legacy 服务端 profile、图形窗口交互与具体环境。它们不改变已确认的三个功能目标；涉及许可策略、系统提权或新增分发义务的决定须在对应阶段提供可审阅材料，不能静默决定。

## 9. 一手依据与历史记录

以下来源于2026-10-16核对。许可证说明仅用于候选筛选，最终以实际构建包含的文件/包为准。历史手册不代表当前系统默认提供服务。

- [X.Org 许可证指南](https://xorg.freedesktop.org/archive/current/doc/xorg-docs/License.html)：逐文件/包核对；多数为 MIT/X/BSD。
- [VcXsrv 官方仓库](https://github.com/marchaesen/vcxsrv)：Windows X server、构建与 GPL-3.0 标识。
- [Cygwin 官方许可](https://cygwin.com/licensing.html)：API 库 LGPLv3+、工具许可和链接例外。
- [XQuartz 官方说明](https://www.xquartz.org/)：macOS 实现、混合许可及 quartz-wm APSL2。
- [X.Org Xephyr 文档](https://www.x.org/releases/X11R7.5/doc/RELNOTES.pdf)：嵌套 X server 的宿主依赖；历史架构资料，不作为选用版本。
- [Cygwin/X XDMCP 文档](https://x.cygwin.com/docs/ug/using-remote-session.html)：direct query、独立 display、UDP 与多接口。
- [RFC1282](https://www.rfc-editor.org/rfc/rfc1282.html)：Informational BSD Rlogin 握手、OOB、流控、resize；不是加密扩展承诺。
- [OpenBSD 5.3 rshd 历史手册](https://man.openbsd.org/OpenBSD-5.3/rshd.8)：传统端口与双流握手 profile；不代表当前 OpenBSD 默认提供该服务。
- [原 XDMCP 评估](../decisions/WF09-XDMCP-ASSESSMENT.md)、[原 Rlogin/Rsh 评估](../decisions/WF09-LEGACY-PROTOCOL-ASSESSMENT.md)：保留环境与证据缺口，开发方向以本计划和新版工作流规范为准。

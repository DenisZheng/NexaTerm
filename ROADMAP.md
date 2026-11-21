# NexaTerm 当前路线图

> 更新：2026-11-21
> WF-04A 交付：PR #26（基于 GitHub `main` @ `a0fcc0d`）
> 本文件是当前项目级执行顺序的唯一入口。需求范围仍以 `NEXATERM_REQUIREMENTS.md` 为准；交互规则仍以 `docs/WORKFLOW_SPEC.md` 为准。旧阶段计划、差距分析和工作流交付计划保留用于追溯，不再覆盖本文件的当前优先级。

## 当前下一阶段：核心工作流与首版收口（2026-11-21 确认）

维护者确认按实际使用价值调整优先级：**保留XDMCP开发入口、受管运行、测试与三桌面人工验收成果；暂缓正式随包X server、剩余VCS/独立签名/许可及资源分发核验、macOS/Linux XDMCP适配。** 这些未交付项不作为当前首版试用/Pre-release的阻塞项，不标为完成、不删除代码，不据此批准任何未审查组件进入安装包。再次启动该产品化工作须先由维护者确认，旧三协议顺序和“继续补VCS”的记录不再是当前执行指令；本轮不删除Rlogin/Rsh的目标或改写其完成状态。

当前顺序：

1. **关闭与资源回收复核**：沿用 `09-23-wf-00b-close-lifecycle`，先对当前代码回归，再核对已存在的A01验收记录与旧任务待办；不重复实现已经完成的关闭action，不把历史PASS写成当前版本新GUI验收。
2. **SSH/Files日常流程收口**：按已有WF-03/WF-07与WF-09-01/02记录处理真实剩余项，重点是活动实例归属、文件操作、取消/重连及未保存编辑保护；无已证实问题不追加重构。
3. **性能与安装升级**：回到WF-08D/WF-08E及A15，核对启动/空闲/资源释放、试用安装、迁移与升级回滚。既有凭据/Host Key、安全、许可证、updater签名、平台发布签名/正式A15门禁不放宽；Pre-release仍不等于完整v1签字。

当前安装清单没有随包X server；因此暂缓其产品化不要求修改bundle或绕过发布校验。源码核验代码与隔离CI保留为既有成果，不继续扩展为当前发布的依赖条件。主线任务已重新关联到核心关闭生命周期；原XDMCP任务保留未完成状态并显式记录暂缓决定，不归档冒充完成。

**本会话收尾后停止开发**，后续会话从 [2026-11-21交接](.trellis/tasks/09-23-wf-00b-close-lifecycle/handoff-2026-11-21.md) 接续。本轮核心自动化132/24项和类型/静态检查通过，原A01已有历史人工PASS；下一项是迟到SSH会话关闭失败的受控回归与资源所有权核对，风险未修，不重复原action迁移或重新启动XDMCP产品化。

## 历史阶段：三协议功能实现（2026-10-16 至 2026-11-21）

以下保留已完成范围、CI与验收历史；“下一项”均受上述最新排期覆盖。

2026-11-21 接续：**维护者确认三桌面整批人工操作全部通过，W07的桌面/输入/取消重连/独立对照隔离记为人工PASS，不再重复验收。** 保留日志仅有前置启动与等待Apply超时，未取得该批最终桌面观察；重启后无引擎、监听、私有目录、防火墙两store与基线一致、专用服务停止仅作为当前环境检查，不补造重启前自然回收证据。结果见 [复验结果](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/private-xdm-desktop-retest.md)。X0固定GCC/pixman/zlib上游归档字节门禁已实现：在线/离线报告相同，Windows/WSL相关31项、MSYS完整200项及类型/行数/任务检查通过，CI已接入但未推送执行；证据见 [本阶段结果](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/research/windows-upstream-archives-evidence.md)。下一项为winpthreads精确VCS导出与独立签名；不采用未批准组件、不改安全策略，资源许可、源码供给批准、随包及X3仍开放。以下待Apply/W07未通过是历史快照，不覆盖本次人工签字。

2026-11-01 修正版三桌面复验已进入新的受控批次：新观察工具不再使用提前/缓存的退出元数据，双PowerShell红绿与原始句柄测试、原有防火墙/远端观察回归及真实只读前检通过。已核对私有XDM的有效启动路径和空靶机，标准用户验证程序已启动，**当前等待维护者在新窗口人工Apply及一次完整桌面清单，W07尚未通过**。范围及状态见 [本轮复验准备](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/private-xdm-desktop-retest.md)；不复用旧恢复文件或反复单步确认。

2026-11-01 专用靶机认证修复已完成：经授权私有构建XDM，原版/同参数重建原版各3轮稳定失败，修正版10轮及最终安装副本均通过16项真实协议断言，首次Accept与Manage回连认证保持一致。只切换专用unit，已实际验证回滚，系统xdm/greeter/PAM及既有包不变；服务最终停止，未开启新网络窗口。旧窗口防火墙恢复已独立核验，远端最终为空来自发行版后续关机，不是自然回收通过。**下一项为修正版下新的同范围三桌面复验，W07仍未通过**；先关闭仍开着的验证版并修正新观察器的退出时间判定，见 [私有靶机修复与保留边界](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/private-xdm-request-fix.md)。

2026-11-01 整批现场出现明确认证故障：display101与独立102在登录前被拒绝，W07失败。真实有界协议探针证明专用靶机XDM对重复Request保留Session ID却更换认证，另有10秒反向解析阻塞；后续按上述授权完成私有修复，不再把无依据重复登录作为下一步。原始故障证据保留于 [故障诊断](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/isolation-batch-diagnosis.md)。

2026-11-01 接续改为整批验收：新的本机批次工具和双宿主回归已就绪，在人工Apply后自动核对并启动服务/独立对照/观察，许可与登录仍手动完成。窗口范围不变，不逐项等待聊天确认；本轮真实三桌面隔离仍待执行，不能提前标W07通过。见 [整批准备与操作范围](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/isolation-batch-preparation.md)。

2026-11-01 三实例窗口已收尾，但**W07仍未通过**：两个受管引擎中的display101提前退出，没有取得三个桌面同时可用及关闭/重连互不影响的证据。Windows应用/引擎/监听/认证目录及两store防火墙恢复均已独立核验。持续WSL观察确认两个远端session残留；经维护者单独同意，仅停止其精确scope，13:54:57在原发行版仍存活时确认原始pidfd退出、测试UID/session为空，全部观察器已结束。此为人工收尾，不是自然回收通过。下一项仍是明确的“两条NexaTerm会话加一个独立对照”隔离验证，须在网络窗口到期前完成操作；不重复安装、改全局策略或把人工清理当PASS。详见 [窗口实际结果](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/isolation-window-result.md)。

2026-11-01 单实例交互已取得真实证据：本机外置模式的XFCE桌面、输入/退格、手动注销、重连后登录框取消及带活跃桌面的正常应用退出完成核对，应用exit0、所属引擎先退出，Windows监听/私有目录无残留。专用WSL服务已停止，**12:29已独立确认防火墙原规则完整恢复、临时规则移除**。后续journal确认远端最后无残留来自WSL发行版自动关机，不能判为会话清理成功；各辅助进程的session/cgroup归属仍待现场核对。下一项是独立受控的双实例/外部引擎隔离及持续保活的远端生命周期观察，单端口顺序重连不替代W07，新增端口须单独确认。正式随包、完整X2/X3与许可/分发仍未交付，能力标志不变。详见 [最新现场结果](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/native-desktop-preflight.md)。

以下为此前阶段快照，其中待输入/注销/重连及非零应用退出不覆盖本轮已取得的对应子项证据。

2026-10-31 首次真实桌面联调与恢复已收尾：权限修复后，维护者成功登录 XFCE，专用会话进程有现场证据。到期退出后，原始引擎句柄、Windows监听/私有目录、WSL服务/runtime及专用UID进程的清理检查通过。**21:09已独立核实防火墙原规则在 PersistentStore/ActiveStore 完整恢复、临时规则移除，验证版和引擎均已退出**。验证版退出码为 `0xC000013A`，不作为正常应用退出屏障通过的证据。下一阶段为新受控窗口内的桌面输入、手动注销/取消/重连及双实例隔离；正式随包仍未交付，不能将外置开发互通写成完整 X2/X3。详见 [最新现场结果](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/native-desktop-preflight.md)。

下列同日及更早快照保留推进过程；其中待重试、待恢复或未登录状态不覆盖上述最新结果。

2026-10-31 首次真实登录联调：已到达登录后的 Xsession 执行，但因配置目录被 umask077 建成root0700而以errno13退出。已通过真实 UID/实际构造路径的红绿回归修复该目录权限，保留私有文件0600；**等待维护者重试桌面，不将权限检查当 XDMCP 可用**。细节见 [原生联调故障记录](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/native-desktop-preflight.md)。

2026-10-31 原生联调前置：WSL 专用账号口令已设置；预装引擎与官方包核对、独立验证 exe 构建、PowerShell 5.1/7 只读检查及各 13 组 mock 已完成。**维护者已手动执行临时防火墙 Apply，实际有效规则复核通过；WSL 前台 owner 与标准用户原生验证进程已启动，下一项是界面中的两项单次许可和真实登录**。代理没有提权或自动操作许可/登录；真实桌面、清理及防火墙恢复仍未验收，测试窗口到期后须重新核实。详见 [原生联调前置](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/native-desktop-preflight.md)。

2026-10-31 WSL 靶机阶段完成：维护者授权的 Ubuntu-24.04 WSL2 NAT 已安装隔离 XDM + 轻量 XFCE，Windows direct Query、广播/间接拒绝、非许可来源拒绝及两轮精确停止均通过；未改 Windows 防火墙/杀软、WSLg 或既有业务服务。测试服务已停，专用账号待人工设置密码。**下一项仍是干净 Windows 开发引擎 + 原生 WebView 的真实登录/桌面，不把 UDP WILLING 当桌面可用**；本机操作和回滚见 [WSL 靶机验收](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/wsl-target.md)。开发入口的 `56ca831` 九项执行 CI 已全部成功，PR #89 保持原有分发/桌面边界。

2026-10-31 开发接入已实现：统一新建菜单已有 **XDMCP（开发）** 临时实例，实际 typed IPC/私有 owner、两项单次许可、状态/取消/重连/关闭以及非 PTY/隐私边界已接线。本地新增 42 项前端反例与 3 项真实 shell 路由反例、三主题/窄窗口浏览器检查通过；当前批远端 CI 以 PR #89 的新 SHA 为准。**下一项是原生 WebView + 已核验开发引擎 + 授权 Linux 靶机的真实桌面联调**，不是再循环材料报告；无现场环境不冒充可用，X01 随包与 X2/X3 仍未完成。细节和环境差异见 [开发入口验收](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/development-entry.md)。

2026-10-31 维护者调整主线：**优先交付 Windows XDMCP 开发会话端到端接入，不再连续以材料审查为主要阶段**。下一步是统一新建入口、临时独立实例、明确外置引擎/网络许可、真实状态及取消/重连/关闭；能落实的接入开发不等正式分发批准。正式随包、资源许可和真实 Linux 桌面互通仍须各自验收，不以 UI 或外置模式代替。具体切片与边界见当前 XDMCP 任务 PRD/design/implement；下文“下一阶段补材料”由本条调整。

2026-10-31 最新阶段完成：**PR #89 四个预编译运行库的包/精确配方材料门禁已通过**。代码 `d18b651` 的完整 CI `41175645356`、源码 `41175645308`、Windows 原生 `41175645305` 全成功；187 项原生反例、完整构建/资源/最终版本通过，artifact 已独立核验。四包 61 成员、32 普通文件、27 配方文件及独立远端 patch 已绑定当次实际 DLL/notice，与独立源码 CI 一致。本机未重跑完整引擎构建，未放宽杀软或发行门禁。接下来补独立包/源码签名与完整 source/VCS 材料；预编译 DLL 内部、成员许可/源码供给、资源授权及 X2/X3 仍未完成，详见 [阶段证据](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/research/windows-prebuilt-materials-evidence.md)。

2026-10-31 最新结果：**PR #89 资源审查实现阶段已完成原生验证**。代码 `61c0192` 的完整 CI `41169134355`、源码 `41169134350`、Windows 原生 `41169134366` 全部 SUCCESS；169 项原生反例、完整构建/安装、资源/PE 闭合及最终版本 probe 通过，artifact ZIP/JSON 已独立核验。XWin 的 21 个资源输入、重放对象、manifest/9 个图标、固定工具链默认 manifest 及 14 个私有 PE 目标已留证；四 DLL 的 B0 身份重绑完成。仍保持 Draft，不合并或发行；三个资源授权、预编译 DLL 内部、分发材料和 X2/X3 未完成，`distributionApproved/bundled/desktopVerified=false`。本机未重跑受杀软干扰的完整构建。精确证据与下一阶段见 [资源审查记录](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/research/windows-resource-evidence.md)。下列更早快照仅保留历史，不覆盖本条。

2026-10-31 推送后接续（CI 快照 10:16，UTC+08:00）：PR #89 已更新到 `f46a5fb`，完整 CI 与源码审查通过；原生前置反例测试通过，正在编译/审查固定目标，最终 JSON 尚未取得。等待期间已完成 [资源历史与权限核实](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/research/windows-resource-rights-review.md)、[四个预编译运行库的精确配方/义务记录](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/research/windows-prebuilt-runtime-obligations.md) 和 [X2 Windows 环境交接与 14 项验收用例](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/x2-windows-desktop-preparation.md)。新证据纠正 pixman 的旧配方引用，确认预编译 DLL 的构建环境不能由当前 XWin 证据覆盖；三个资源授权仍待澄清或经评审的独立替换。不重跑本机受杀软干扰的构建，不改正在验证的构建代码；真实互通、随包和发行批准仍未完成。精确 run 见 [接续证据](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/research/windows-resource-evidence.md)。

2026-10-31 状态校正：Draft #89 的 `ec2d332` 已通过完整 CI #712 / 源码审查 #44，但原生 Windows #41 在前置碰撞测试失败，未执行引擎编译。已在本机 MSYS2 复现并修复测试夹具的 `.exe` 隐式覆盖，148 项原生脚本回归通过；本地完整构建因杀软重复删除 `conftest.exe` 已主动停止，未取得最终原生资源报告，修复尚未提交或推送。详见 [资源审查接续证据](.trellis/tasks/10-16-wf09-07-xdmcp-implementation/research/windows-resource-evidence.md)。X0 尚未收口，X2/X3 及发行/随包/桌面状态不变。

2026-10-30续作：XDMCP 继续沿 Draft #87 的 Windows private-link evidence 开发，新增堆叠 Draft #88 跟踪 WINDRES/GCC 输入、XWin.o 资源段、最终 PE manifest/icon 和所有可达私有 PE 对象的资源扫描。新代码验证 pending；不改变 distributionApproved/bundled/desktopVerified=false。

维护者明确要求先补实现计划，再开发。XDMCP 以随包 X server 和完整桌面会话管理为目标（Windows 优先，再适配 macOS/Linux）；Rlogin 为原生终端协议；Rsh 为原生命令执行和双流/信号管理。详细阶段、组件候选与许可、端口权限、生命周期及验收见 [三协议实现计划](docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md)。

顺序：`10-16-wf09-07-xdmcp-implementation` → `10-16-wf09-08a-rlogin-implementation` → `10-16-wf09-08b-rsh-implementation`，维护者已授权按计划开工：XDMCP 当前 **in_progress（X1退出屏障Draft #83已过完整CI666/原生10三平台；X0固定官方源码Draft #84已过CI669/专用CI2；Draft #85 code4e4e4a8已过source CI27、完整CI694七执行job与Windows原生24：93回归、完整引擎、16文件PE、105链接、47archive/942选择成员、1720份C输入及最终-version均成功；544工具链成员匹配官方包，333份工具链头来源与56份生成输入独立重生成已核对；四DLL五份及CRT三份notice匹配固定原文；#85最新HEAD8c3e90b的CI695/source28/原生25全部通过、artifact已下载复核；Draft #86 code9a815d5已过完整CI699/source32/Windows原生29，四组XKM往返与两个负向、SDK宏顺序探针、293键盘数据及1756 C输入完整，JSON已下载复核；当前Draft #87沿build/wf09-07-private-links补实际私有DLL/工具自身map与选择成员：初版c595ac41已过CI700/source33，原生30在前置夹具盘符路径测试失败、未执行构建，正修复并重新取证，见任务research/windows-private-links-evidence.md；预编译DLL内部、资源及逐文件许可闭包仍须开发；随包/打包/桌面、完整许可/资源闭包及Unix宿主硬崩溃监督仍须开发）**，Rlogin 已开始 **in_progress（L0已过CI，L1 socket/控制组件已过三平台原生与完整应用CI，原生建立/ACK尾部adapter也已过三平台原生与完整应用CI，headless会话owner/有界pull-ACK也已过三平台原生与完整应用CI；typed IPC/应用生命周期已过三平台原生与完整CI（Draft #72），前端有界交付桥已过行为/类型/构建及完整CI（Draft #73）；终端IO适配器（冻结编码、有界键盘/粘贴与renderer生命周期）已过三平台原生与完整CI（Draft #74）；配置/存储和表单组件已过完整CI（Draft #75/#76）；实际Workspace终端/许可/取消/重连/清理/恢复及隐私隔离已实现，本地回归通过、Draft #77完整CI649和三平台原生30均通过；Unix入口能力按exact_flush开放，DNS已过完整CI651和三平台原生32（Draft #78），Windows精确flush仍待开发，Draft #82的代码99bffa6/完整CI664/原生45已验证新API组合仍无可靠边界（不是功能完成，详见任务Windows证据），真实rlogind及WebView统一后续验收）**，Rsh 已in_progress（S0字节核和TCP fixture进入Draft #79、原生33三平台通过，完整CI652全部通过；S1实际双连接/半关闭/信号/取消清理进入Draft #80、原生36三平台已通过（Windows低端口正向、Unix权限负向），完整CI655全部通过；S2任务owner、typed IPC与实际命令入口已在Draft #81开发交付，code44529a0已过原生41三平台/完整CI660，前端1160与脚本191通过；真实rshd、Unix保留端口正向与WebView验收仍待后续）。X server 发行组件尚未采用，桌面互通尚未验证。旧 BLOCKED/DEFER 结论保留为历史证据，开发排期已更新为 PLANNED；具体环境/许可缺口只阻塞相应阶段。当前执行入口是本文及该计划，下方为此前交付记录。

## WF-09 开发交付（2026-10-16）

按九个大项计：01–06、09共7项已完成开发交付；07/08实际协议功能仍未全部完成。7/9仅为范围计数，不能当作工时完成度。

维护者已授权连续完成 WF-09，并将真实验收统一后置。01–06 功能及07/08评估已在 Draft PR #58–#64交付，各自最新 CI SUCCESS；09回环文件服务也已在 Draft PR #65 完成开发。代码提交的最终自动化结果与统一验收边界见下列交付清单。此前范围的交付证据见 [WF-09 交付清单](docs/WF09-DELIVERY.md)，涵盖九项范围、堆叠关系、失败修复及后续验收。

07/08完成的是批准范围内的评估，不是新增协议支持。所有 PR 保持 Draft，不合并发布；PR #12/#54不变。下方早期工作流和发布记录继续保留，不能用其验收状态替代 WF-09 的真实验收。

## 当前工作流进展（2026-10-04）

唯一产品主线继续使用 `09-23-nexaterm-workflow-mainline`。WF-02B / WF-03 与图标更新已在 main；WF-04A 由 [PR #26](https://github.com/DenisZheng/NexaTerm/pull/26) 交付，A07 macOS 的真实 GUI / 导入 / 重启、legacy 冲突映射和三主题均 PASS（[归档证据](.trellis/tasks/archive/2026-10/10-02-wf-04a-session-tree-consistency/validation/a07.md)），Windows/Linux 仍仅 CI 自动化证据。

WF-04B/04C/05/06/07 及 WF-08A–08E 已通过 integration PR #40 合入 `main`；当前 release-candidate 基线为 `main @ 4bd88f9060fe089ee6e52a042a5e589c1bb739bd`，main CI #383 SUCCESS。维护者在 Windows 真实 Tauri 已确认 A01/A02/A04/A11/A12/A13，通过项及平台边界见 [A01–A15 报告](.trellis/tasks/09-23-nexaterm-workflow-mainline/validation/acceptance-report-2026-10-04.md)；A08、A14 另有既有验收记录。WS-X09 / WS-X04 已在 WORKFLOW_SPEC v0.5 / v0.6 确认。

当前执行顺序（2026-10-04 维护者确认并行）：`10-04-wf04c-multiexec-entry` 已提交并进入 WF-08 堆叠；A09/A10 已于 2026-10-05 在最终 WF-08E 分支完成真实 Tauri 验收并 PASS，已不再是 A15 / v1 sign-off blocker。WF-08A 从“发布与迁移基线门禁”开始，证据见 `10-04-wf-08a-release-migration-baseline/A15_BASELINE.md`。 WF-08B 实现已完成并由 CI #343 验证三平台编译/测试，真实旧版本升级留到 WF-08E/A15；WF-08C 已完成代码收口并由 CI #357 验证品牌、English/zh-CN parity、canonical MCP sidecar 与三平台编译/测试。WF-08D 已完成测量工具并由 CI #364 验证三平台编译/测试、sampler 单测与性能/稳定性门禁；WF-08E 自动化证据框架已由 CI #369 验证，并通过 PR #40 合入 main。A09/A10 已于 2026-10-05 由维护者在真实 Tauri 验收中确认 PASS；main CI #383 的 final CI / Security / License 也已 PASS。A15 仍进行中，剩余三平台真实安装/签名/升级回滚、迁移、性能、updater 任一未通过都阻止最终签字。

## 2026-10-07 首版预发布安排

维护者确认先交付无平台证书的 Pre-release，A15 完整验收继续保持未完成。候选版本为 `0.1.17-rc.1`；工作流创建预发布草稿并排除 latest，保留 updater 签名、哈希和许可证门禁。普通正式 tag 仍要求 Windows/macOS 发布签名。公开草稿前完成 Windows/macOS 安装与基本功能验收；Linux 真实桌面、平台签名、公证、旧版迁移及升级回滚等缺口按 WF-08E 记录，不视为已通过。

本次 workflow/版本改动尚待提交和候选构建，不能把旧 main CI 或源码测试视为安装包验收。

## 当前评审整改状态

| 项目 | 状态 | 边界 |
| --- | --- | --- |
| 发布签名 / 更新信任链 | 代码与 workflow 门禁已完成 | 真正的 Windows Authenticode、macOS Developer ID + notarization/staple、updater 签名仍需一次带真实凭据的 tagged release 留下发布实证 |
| X11 feasibility / 产品化 | 技术路径 GO，Windows A13 通过 | WF-06C 核心与 Windows 真 GUI 已有维护者验收证据；macOS/Linux X server 环境与真实 GUI 仍需分别验收，不等于正式跨平台发布承诺 |
| MCP 暴露面 | 已收口 | Remote MCP 采用 loopback-only；远程访问走认证隧道，不支持直接 LAN/public HTTP 绑定 |
| 许可证 / third-party notices | 已收口 | 依赖清单、bundled notices 与 CI/release license gate 已进入 main |
| Linux IME 原生自动化验收（P2-3） | **暂缓** | draft PR #12 未合并。当前 IBus/Fcitx5 CI harness 未完成可靠验收；失败不能当作产品输入法必然故障，也不能当作已通过 |
| 文档 / 语言尾项（P2-4） | **进行中** | 统一当前路线图入口，标记历史计划，修正文档中过时的发布状态；不改产品运行时行为 |

## P2-3 处理原则

- PR #12 保持 draft、未合并，不作为 main 的完成证据。
- 不为了“让 CI 变绿”继续扩展不稳定的桌面输入法自动化。
- 后续若出现可复现的真实 Linux 输入法问题，再以具体发行版、桌面环境、WebKitGTK、IBus/Fcitx5 版本和复现步骤单独处理。
- 在没有真实验收前，状态固定写为“验收未完成”，而不是“已通过”或“已确认故障”。

## P2-4 完成后

1. 对最初评审报告逐条做一次最终对账，只接受可追溯到 main、CI、真实运行或明确暂缓项的结论。
2. 把“正式 Release 实证”单独作为发布操作任务：真实证书、真实 tag、三平台产物和 updater 验证必须留证据。
3. 把 X11 从 feasibility spike 转为独立产品化任务，不再与本轮评审整改混在一起。
4. 回到正常产品路线时，按 `docs/WORKFLOW_SPEC.md` 和 Trellis 当前任务推进，不重新开启已关闭的评审项。

## 文档优先级

发生冲突时按以下顺序判断：

1. `NEXATERM_REQUIREMENTS.md`：产品范围与 v1 要求。
2. `docs/WORKFLOW_SPEC.md`：已确认的交互规则。
3. **`ROADMAP.md`：当前执行顺序、评审整改状态和暂缓项。**
4. Trellis 当前任务 PRD / design / implement：具体任务边界。
5. `docs/CURRENT_STATE.md`、`docs/DEVELOPMENT_PLAN.md`、`docs/GAP_ANALYSIS.md`、`NEXATERM_WORKFLOW_DELIVERY_PLAN.md`：历史审计、计划和迁移依据；只有明确标注为当前事实的内容可以作为现状证据。

## 证据规则

- “代码存在”不等于“真实平台验收通过”。
- “CI check/test 通过”不等于“安装包、GUI、远程服务或硬件已验证”。
- “自动化 harness 失败”不自动等于“产品功能失败”；必须先证明失败发生在被测功能本身。
- 暂缓项必须保留原因和恢复条件，不能伪装成完成。

## XDMCP Windows resource audit continuation (2026-10-30)

PR #88 documentation CI passed. The implementation is now in stacked Draft PR #89 (code HEAD 6e08efca76893b8a2a8e5c6a9ed9c0ac9ec02f0e): WINDRES/GCC provenance, RC dependency graph, XWin.o resource bytes, final PE manifest/icon payload checks, and resource-section scans across XWin/private PE objects. Local synthetic suite: 16 tests passed. Exact-HEAD GitHub CI and Windows-native build remain pending; no native success is inferred. Resource rights, prebuilt DLL internals, distribution, bundling and desktop verification remain open.

## XDMCP Windows resource audit correction (2026-10-30)

Native Windows #34 compiled/installed XWin and passed counterexample tests but failed the resource audit because GNU make VPATH leaves the `$<` token as bare `XWin.rc`. PR #89 latest HEAD 85d2f0323fd26d648a830da76f01582183b7dfce now resolves that token against the fixed source directory when it is absent in the build directory, and normalizes drive-letter paths. Local path reproduction passed; Native Windows #37, Source Review #40 and CI #708 are pending. No native success is claimed.

# NexaTerm 当前路线图

> 更新：2026-10-19
> WF-04A 交付：PR #26（基于 GitHub `main` @ `a0fcc0d`）
> 本文件是当前项目级执行顺序的唯一入口。需求范围仍以 `NEXATERM_REQUIREMENTS.md` 为准；交互规则仍以 `docs/WORKFLOW_SPEC.md` 为准。旧阶段计划、差距分析和工作流交付计划保留用于追溯，不再覆盖本文件的当前优先级。

## 当前下一阶段：三协议功能实现（2026-10-16）

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

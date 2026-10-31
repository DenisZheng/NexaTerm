# Execution plan

状态：2026-10-16 已获开工授权；X1 运行核心已实现，X0 组件审查推进中。任务整体保持 in_progress；X2/X3 尚未交付。

## 当前阶段：预编译包与精确配方材料（2026-10-31 续作）

维护者在资源阶段完成后授权继续，阶段内不逐次汇报。沿用任务/分支/PR #89；以最终成功 native `41170743513` / HEAD `15e4dae` 的四个实际 DLL provider 为固定输入，不重跑本机引擎构建，不采用/替换发行组件。

- [x] 将四个实际 DLL 绑定固定官方发布归档、`.PKGINFO` / `.BUILDINFO`、完整随包 notice，以及 `.BUILDINFO` 指定的精确 PKGBUILD；补齐 r569/zlib `-3`，不挪用旧版本结论。
- [x] 记录固定配方目录中实际 source/patch 材料的原始身份、上游源码引用及环境声明；不执行配方、不把声明环境当内部链接贡献，不把尚未取得的上游源码写成已供给。
- [x] 实现可重复运行的只读材料核验入口和有意义反例，验证 provider/版本/hash/配方/notice 漂移、缺材料、非零工具退出和旧成功报告替换；在线固定输入与离线复查均留证。
- [x] 检查、更新 code-spec/阶段记录，按既有授权提交推到同一 PR 并等待本阶段门禁完成。完成范围限包/配方证据，不关闭内部 map/member、独立签名、逐文件权限、源码供给方式或 X2/X3。

资源授权的上游联系、独立图标/manifest/配置替换和 libgcc 分发方式仍需明确人审；本阶段不代作该决定，也不通过反复整理同一份旧证据宣称这些项完成。

本阶段完成：代码 `d18b651` 的完整 CI `41175645356`、源码 `41175645308`、原生 `41175645305` 全成功，187 项原生反例及完整构建/最终版本通过；新增 `prebuilt-runtime-materials` 门禁绑定当次实际 provider，JSON-only artifact 已独立核验。实现、材料数量、本地在线/离线验证和保留边界见 [预编译材料阶段证据](research/windows-prebuilt-materials-evidence.md)。下一阶段继续独立包/源码签名与完整 source/VCS 材料，B2–B4、资源授权和 X2/X3 仍开放，不归档整个任务。

2026-10-31 阶段完成：代码 `61c0192` 已通过完整 CI `41169134355`、源码 `41169134350`、原生 `41169134366`；169 项 native 反例及完整构建/版本/资源检查成功，精确 artifact ZIP/JSON 已独立核验。资源路径、COFF BSS/长名、固定默认 manifest 和最终 PE 闭合，四 DLL 的 B0 实际身份已重绑。详见 [阶段完成与排除范围](research/windows-resource-evidence.md)；不归档整个任务、不合并/发版，发行/随包/桌面仍为 false。下文的待提交/CI 失败是已被本条替代的历史快照。

2026-10-31 最新接续：已按维护者授权将前一批修复/调研作为 `1a7bb15` 推到同一 PR #89，完整/源码 CI 成功，原生 `41164964134` 在 COFF `.bss` 范围校验失败。已用与 CI 精确一致的对象定位；扩查又发现 XWin/xkbcomp 的固定工具链默认 manifest，不能按名称跳过。当前修复同时补纯 BSS/长节名解析、观察到的 `-xc` 预处理模式、默认对象的固定来源/section/payload 与最终 PE 绑定。MSYS/WSL 各 50 项相关测试、只读 609 对象 corpus 通过；未重跑本机完整构建。待提交后取得新精确 SHA 的 CI/native 结果，再关闭本阶段；整体任务不归档。详见 [COFF 与默认 manifest 证据](research/windows-resource-evidence.md)。下文较早的“未授权/未推送”均为当时状态，不覆盖维护者后续“全 OK 就推”的授权。

2026-10-31 11:28 接续：PR #89 的原生 run `41158110445` 已失败，完整 CI/源码审查成功。已下载精确 SHA 的失败 JSON/日志：前置测试及 XWin 编译安装通过，实际 windres 重放仍传裸 `XWin.rc`，导致 `resource-compiler-inputs / BUILD_EXIT`。本地将已验证源路径按原 cwd 相对化后传到实际 argv，避免真实探针新发现的带空格绝对输入预处理失败；未改 cwd、源身份或其他 flags。Windows 新增 3 项、MSYS/WSL 各 27 项资源测试通过，三组最终变异均被检出；仅生成 `.o` 的真实资源探针通过，未链接/生成新程序、未重跑完整本机构建。修复与许可/X2 准备尚未提交/推送，详见 [结果与根因](research/windows-resource-evidence.md)。先修复并重验 PR #89，再判定资源审查阶段是否可完成。

2026-10-31 后续授权：维护者确认在 PR #89 原生 CI 等待期间，先核实 X0 资源/预编译运行库剩余许可与来源缺口，并准备 X2 Windows 真实桌面验收。沿用本任务与分支；不修改正在验证的构建代码，不恢复本机原生构建，不自动采用/分发组件、配置靶机服务或修改安全策略。X2 准备见 [环境交接与用例](validation/x2-windows-desktop-preparation.md)，当前均未执行真实互通。

本轮已完成的取证与下一项：

- [x] [资源权限与配置边界](research/windows-resource-rights-review.md)：四项固定资源已对齐官方 tag/commit/blob 与历史，`winresource.h` 有直接许可；另三项仅解决历史定位，仍缺可审阅授权。stock 配置含外部工具菜单及 HOME 优先级，不作为已批准的产品配置。
- [x] [预编译运行库义务](research/windows-prebuilt-runtime-obligations.md)：四个基线 `.BUILDINFO` 已绑定精确配方；纠正 pixman 的旧配方引用，记录不同 GCC/CRT 环境，以及 winpthread 实际 `.rsrc`/fake-libgcc 的待审查输入。不将声明环境当实际链接成员。
- [x] X2 环境交接、14 项验收用例及状态/诊断边界已准备；无靶机/引擎/UI 的项保持 NOT-RUN，不修改系统、监听或认证策略。
- [x] 原生 `41169134366` 成功后按实际 provider/version/size/hash 完成 B0 重绑，四 DLL 与此前失败报告集合相同。不同版本不能复用旧结论；其自身 map/member/depfiles/resource 输入仍须对应原构建材料或另经授权的精确重建方案，B1–B4 未闭合。
- [ ] 三个资源的授权澄清或独立替换、libgcc 本体的源码供给与采用方式须人审；本轮不联系上游、不改变组件、链接方式、打包或能力标志。

2026-10-31 接续 PR #89：已切到 `build/wf09-07-resource-audit`，保留原有未跟踪文件。原生 #41 的失败已在本机隔离 MSYS2 复现：碰撞测试先创建 `.exe`，再写无扩展名路径，实际覆盖了同一文件。已修正夹具创建顺序并增加目录项、文件身份和精确字节断言，生产校验不变；MSYS 148 项回归通过，移除字节校验的内存变异被测试检出。完整原生构建因杀软重复删除 libX11 的 `conftest.exe`，已于 09:55（UTC+08:00）主动停止；未取得最终原生资源报告，不认定误报或验证通过，不修改防护/排除设置。本机前端英文断言和 POSIX 专用脚本的环境缺口单独保留，不伪装成全绿。详见 [本轮证据](research/windows-resource-evidence.md)。本轮不自动提交/推送，不归档整体任务；经人工审核提交后再以新 CI 验证，本机重跑须先确认告警处理方式并使用全新构建状态。

2026-10-19下一刀：Windows原生构建及依赖/许可闭包。

2026-10-20续作：#85最新HEAD8c3e90b的CI695/source28/原生25已全部SUCCESS，原生artifact下载复核；在同一X0任务补Windows XKB编译工具/运行数据，见[精确接续证据](research/windows-xkb-evidence.md)及`.trellis/spec/backend/xserver-windows-xkb.md`。

- [x] 固定官方xkbcomp1.5.0、xkeyboard-config2.48、实际签名/公钥及不同许可声明；17依赖隔离签名本地核验。
- [x] 版本化私有数据根、严格8别名转换、原始数据/生成输出/owner及11独立生成参考门禁。
- [x] 实现目标规则库/实际XKM编译与Y/Z语义反编译、空根/缺规则负向、双PE根与C输入接线。
- [x] 新代码已接入并触发独立Windows与完整CI门禁；实际执行结论只采用[Draft #86](https://github.com/DenisZheng/NexaTerm/pull/86)正文的精确SHA/run/artifact，不能借用#85基线结果。
- [ ] 工具及DLL内部静态/资源、逐文件权限、notice/运行库本体义务、打包/签名/桌面和X3仍继续，不归档整体任务。

原生28已取得Windows数据293文件/3341129字节及11参考，但xkbcomp/listing.c真实编译暴露SDK TypeString/ERROR宏冲突；先载入SDK/Xlib再定义私有宏的精确修复、提前执行的真实SDK旧/正确顺序探针，以及后续重新取证均见#86正文和research/windows-xkb-evidence.md。

- [x] 固定15项直接/传递X库的官方源码、分离签名、构建参数及51项许可文件hash，区分host工具与target库；source CI27通过（代码4e4e4a8）。
- [x] 在真实Windows UCRT64完成固定上游的编译/链接/安装：原生16（代码6e1f8fd）已通过，五项探针与递归PE导入也通过；后续曾因来源门禁FAIL；当前原生24已完成整条门禁。
- [x] 实际AMD64 PE、XDMCP配置、原生版本probe、递归导入与完整C输入及成员门禁已过原生24（code4e4e4a8）。
- [x] archive实际选择成员取证本地114回归及原生24通过：47归档/942成员，544工具链成员匹配官方包payload。
- [ ] 继续成员权限、SDK逐文件/IDL、DLL内部静态/资源与运行库本体义务、发行notice及源码供给。333份工具链头来源和56份生成输入重生成已核对，来源一致不等于权限批准。
- [x] 有意义反例、本地检查、原生构建与完整CI留证；堆叠Draft到#84，不批准随包/桌面或归档整体任务。

2026-10-18续作：先修复应用退出的实际完成屏障。旧shutdown在两秒后忽略timeout并返回，可能让Tauri进程在worker/认证目录仍被持有时退出；改为关闭入口、快照有界completion watch并在锁外等待真实清理，保留用户stop的两秒stop_pending。三平台fixture同时覆盖实际进程树、阻塞spawn前worker及清理目录前worker，不能用延长退出超时掩盖。此修复不代表随包组件/桌面或Unix宿主SIGKILL回收已完成。

- [ ] X0：精确源码/许可/依赖已部分核对，继续缩小运行组件闭包，建立可复现构建与分发 manifest；候选不等于采用。
- [x] X1：受管 runner、独立 display、状态与取消/关闭所有权，以及真实 native 进程 fixture。
- [ ] X2：Windows 随包组件、安装/签名和 direct-query 真实桌面；会话配置、原型与能力入口。
- [ ] X3：macOS/Linux 引擎与打包适配；逐平台留证，不用外置模式替代 bundled 完成。
- [x] 更新可执行 code-spec、错误/资源预算和精确能力边界；加入有意义的回归测试。
- [x] 三平台完整应用 CI：全部7个实际执行 job 通过；条件打包 job 未触发。
- [x] 维护 Draft PR 和原生快速测试证据；真实 GUI/桌面验收按维护者安排统一后续。

## X1 implementation and validation

本次X0核验小步（2026-10-19）：

- [x] 固定源码、分离签名、公钥和构建/许可文件锚点；新增标准库核验入口及具体code-spec。
- [x] 反例覆盖损坏cache/签名、错误签署者、失效签名、非零退出、恶意tar和旧报告；真实官方输入本地及专用CI执行。
- [x] JSON-only审查artifact，保留REVIEW-REQUIRED及所有发行/原生构建缺口；不改既有许可证门禁。
- [x] 堆叠Draft到#83，保留精确代码/CI证据，任务整体保持in_progress。

代码基准：`1a5b7cd40a175fb67cba4914dbc82bbe704eb108`；[Draft #67](https://github.com/DenisZheng/NexaTerm/pull/67)，基于计划 #66，不合并、不发布。八项真实 native fixture/契约测试包括独立运行及后代、旧句柄/外部 owner 隔离、自然/失败退出、配额/过期、端口占满、窗口关闭/shutdown、字段/许可校验及实际 start future abort。worker 在异步调用被取消或超时后仍持有租约，直到阻塞 OS 操作、进程及私有认证目录真正回收。

| 证据 | 精确结果 |
| --- | --- |
| [原生快速测试 #3](https://github.com/DenisZheng/NexaTerm/actions/runs/38902476123) | Windows/macOS/Linux 全通过；导入实际生产平台模块；依赖固定为应用 lockfile 的子集 |
| [完整 CI #611](https://github.com/DenisZheng/NexaTerm/actions/runs/38902476142) Linux | 474通过/4ignored；新增8项 XDMCP 全通过；其它二进制/集成/doc 测试通过 |
| 同次 macOS | 474通过/0ignored；新增8项全通过；其它二进制/集成/doc 测试通过 |
| 同次 Windows | 475通过/0ignored；新增8项 XDMCP 全通过；其它二进制/集成/doc 测试通过 |
| 同次其余门禁 | 前端888通过/1todo、脚本和全部 source gates、安全、许可证、fixture 全通过；条件 Windows 打包 job 未触发，不代表安装包验收 |
| 本地 | line-budget、capability/CSP、diff 检查通过；没有 Rust 工具链，不把本地静态检查当作原生执行证据 |

## Resolved native failures

CI607 暴露 AppError 代码参数类型问题，已改为引用 String 而不改变错误契约。CI608 的 Linux/Windows 全部新增测试通过；macOS 的三个生命周期测试暴露回收故障，快速原生 harness 将其定位为 EPERM。Darwin 修复只在有界原生查询证明组内无活跃成员时接受该 EPERM；活跃/未知/查询失败/缓冲区满继续失败，保留未 reap 的 leader 避免 PID 复用。快速与完整测试均断言不能把自身活跃组误判为空。

快速 Windows harness 另暴露立即删除目录的 sharing violation。生产 worker 原有逻辑已经保留配额并持续重试真实删除；harness 改为按相同契约等待删除，5秒截止仍报原始错误，并断言目录确实消失。没有忽略删除错误、释放未清理配额或提高生产 stop 截止。

## Remaining boundaries

`querying` 仅表示已创建引擎并提交 query，绝不表示登录/桌面成功。当前 bundled=false、desktop_verified=false；external 开发模式只对 Windows/Linux 开放，macOS 的原生 fixture 不开启 macOS 产品能力。未引入任何外部 X server 源码或发行二进制。

Unix 宿主硬崩溃回收仍需 X2 supervisor/parent-death 策略；当前组回收针对显式 stop、窗口销毁和正常退出。Windows job 句柄提供宿主句柄关闭后的回收。真实引擎的认证协商、日志/OS socket 清理、多网卡、桌面和安装签名证据仍未取得。X0 精确审查记录见 docs/decisions/WF09-XSERVER-COMPONENTS.md；X2/X3 未完成。上述缺口仅阻塞相关阶段，按已批准计划继续独立 Rlogin/Rsh 协议核。


## 应用退出屏障交付（2026-10-19，Draft #83）

- [x] `shutdown_wait`真实完成watch、锁外等待和Tauri Exit接线，用户stop仍保留两秒stop_pending。
- [x] 原生harness导入实际manager及同一套9项测试，保留原platform测试与完整依赖锁子集门禁。
- [x] 代码d1bc04f通过完整CI666全部七执行job、XDMCP原生10三平台各10项；新增超过stop预算的实际退出回归在三平台harness/完整应用均执行通过。
- [x] 类型/本地脚本191通过（3既有环境skip）、line-budget/startup/权限/CSP/TOML/任务manifest/diff检查完成。

详细计数、真实资源断言和继续入口见[research/shutdown-evidence.md](research/shutdown-evidence.md)。仅修复正常应用退出；X0组件、X2随包/桌面、X3及Unix宿主硬崩溃监督仍未完成，不归档整体任务。

## X0源码核验入口交付（2026-10-19，Draft #84）

代码bfbd225，专用源码CI2（21项、真实GPG/JSON-only artifact）及完整CI669七执行job均SUCCESS。精确文件树、首次安全误报审查、远端artifact与本地超时边界见[research/source-review-evidence.md](research/source-review-evidence.md)。本刀不是X0整体或随包完成；继续Windows原生构建及逐文件/依赖许可、PE/资源闭包，任务保持in_progress。

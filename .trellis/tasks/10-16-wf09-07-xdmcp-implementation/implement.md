# Execution plan

状态：2026-10-16 已获开工授权；X1 运行核心已实现，X0 组件审查推进中。任务整体保持 in_progress；X2/X3 尚未交付。

2026-10-19下一刀：Windows原生构建及依赖/许可闭包。

- [x] 固定15项直接/传递X库的官方源码、分离签名、构建参数及51项许可文件hash，区分host工具与target库；source CI12通过。
- [ ] 在真实Windows UCRT64执行上游MinGW构建，保留实际失败并从源头修正；不使用未经审查的聚合源码。
- [ ] 核对实际AMD64 PE、XDMCP编译配置、原生版本probe、递归导入库及资源/许可清单。
- [ ] 有意义反例、本地检查、原生构建与完整CI留证；堆叠Draft到#84，不批准随包/桌面或归档整体任务。

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

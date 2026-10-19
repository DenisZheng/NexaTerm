# XDMCP 应用退出完成屏障：执行证据

2026-10-19收口。执行代码 `d1bc04f3f9341422b1a2e3c93ab8d0ba8c8c5928`，堆叠 [Draft #83](https://github.com/DenisZheng/NexaTerm/pull/83)，基于Windows原生API反例Draft #82。沿用原XDMCP任务及父任务 `09-23-nexaterm-workflow-mainline`，没有重建计划、合并或发布。

## 问题与实现

原`XdmcpManager::shutdown`在两秒后忽略timeout并正常返回。Tauri RunEvent::Exit显式等待了该方法，但方法返回并不保证阻塞中的OS启动、所属进程树或认证目录清理真正结束；随后宿主进程可能直接退出。

现`shutdown_wait() -> Result<(),AppError>`在registry锁内关闭入口、取消所有条目、移除未消费租约并订阅最多4个真实worker的done watch，随后释放锁再等待每个true完成值。done仍由原worker在实际process/RunDirectory清理之后发布。无成功超时，无锁内await，无按PID或进程名猜测完成。Tauri Exit与其它owner并行等待，异常只打印固定xdmcp code。用户手动stop仍有原两秒`xdmcp_stop_pending`响应，不改成无界请求等待。

在真实清理未结束时，应用退出会继续等待。这是完成屏障的实际含义，不能再把“已发送取消”或“超过两秒”作为已完成清理。

## 真实回归

新增`app_shutdown_waits_past_stop_budget_for_actual_start_and_directory_cleanup`：

1. 启动实际原生fixture及后代，记录实际认证目录并在Windows提前捕获原进程身份handle。
2. 第二个实际worker卡在启动前，第一个在真实进程树停止后卡在认证目录删除前；另留一个未消费租约。
3. 调用退出屏障，等待超过原stop预算后仍必须pending；入口已关闭，两个used条目仍被持有，未用租约被移除，原目录仍在。
4. 只释放启动gate，要求返回Cancelled且不产生新进程；退出屏障仍等目录清理。
5. 释放清理gate后，要求真实目录消失、registry为空，原后代进程已停止；不接受仅job accounting为零或删除目录后忽略进程身份。

夹具的观察预算没有替换生产超时，也没有增加任意清理宽限。旧自然/失败退出、stop超时保留额度、两个独立run、旧句柄/foreign owner、真实abort、认证权限和固定参数断言全部保留。

## 自动化证据

| 证据 | 实际结果 |
| --- | --- |
| [XDMCP原生10](https://github.com/DenisZheng/NexaTerm/actions/runs/39145023610) | Linux/macOS/Windows各10项通过，0失败/skip/ignore；9项同源manager测试加原platform测试，三个runner均明确执行新增退出回归 |
| [完整CI666](https://github.com/DenisZheng/NexaTerm/actions/runs/39145023622) | 七个执行job全SUCCESS；条件Windows打包未触发 |
| 完整Rust library | Linux617通过/4既有ignored，macOS618通过/0ignored，Windows620通过/0ignored；三平台均执行新增退出回归 |
| 其它Rust | 三平台binary各19、integration各1、doc0，全部通过 |
| 前端及脚本 | 139文件1160通过/1既有todo；脚本191通过/3既有环境skip；类型、构建、startup/source、权限/CSP、安全、许可证和服务fixture门禁全部通过 |
| 本地 | 类型检查、脚本191/3既有环境skip、line-budget/startup/capability/CSP、任务manifest、TOML/直接版本pin和diff检查通过；本地无Rust，未冒充Rust运行证据 |

快速harness现在导入实际manager和同一测试文件；只在快速边界用极小AppError code stub，不声称该stub验证Tauri错误序列化。实际AppError及Tauri Exit接线仍由完整CI编译/测试。harness补入的Tokio/serde/serde_json精确版本均来自应用锁，三个runner的传递依赖子集检查均通过，没有新增应用crate或版本、放宽许可证或安全门禁。

## 交付边界与继续入口

本轮完成X1退出清理修复，XDMCP整体仍in_progress，未归档。当前仍是显式选择外部引擎的开发运行核心，bundled=false、desktop_verified=false。没有引入发行X server，也没有取得真实XDMCP桌面证据。

按原计划继续X0精确源归档/哈希/签名、逐文件许可与实际运行链接闭包核验，再进入X2随包资源/构建/安装签名、会话与桌面接入；不要重做本轮退出屏障，也不能把它当作X2交付。Unix宿主被SIGKILL时的监督回收仍须另外开发；本轮只修复正常应用Exit完成等待。Windows Rlogin精确flush仍待替代backend，#82的原生反例不是功能完成。

2026-10-19后续：固定源码/签名核验入口已进入Draft #84，继续时先读[source-review-evidence.md](source-review-evidence.md)，不要重复#83退出屏障或#84采集入口。X0整体及X2/X3未完成。

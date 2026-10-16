# WF-09-07：XDMCP 平台评估

> **后续状态更新（2026-10-16）**：维护者已要求编写实际功能实现计划。后续已授权开工，当前 **IN_PROGRESS / X1 运行核心（Draft PR #67）**，详见 [三协议实现计划](../plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md) 和 WORKFLOW_SPEC v0.7。下文保留原评估时的环境与结论，不再作为整项暂缓开发的依据；尚未取得真实互通证据的事实不变。

评估日期：2026-10-16。源码基线：`c1dda4e`。范围依据：`docs/wf09-feature-roadmap` 的 `.trellis/tasks/10-11-wf-09-feature-roadmap/WF-09-07-xdmcp/prd.md`（blob `6c59b11b52b97d6f4df4145e623c80e792c00cf1`）。该项验收允许真实最小演示或三平台阻塞记录。

**原评估决定（历史）：评估交付完成，运行时集成 BLOCKED / MANUAL_REQUIRED。** 当前不声明 NexaTerm 支持 XDMCP，不增加连接协议或分发 X server。WS-N03 要求真实 GUI 证据；当时 WS-N04 的 Windows 分发目标尚待确认；该目标已由后续 v0.7 确认，具体组件仍待选型。本记录不改变 WF-06C / A13 或发布验收状态。

## 已检查的实现与环境

`src/features/connections/connectionTypes.ts` 的协议集合为 SSH、RDP、VNC、Telnet、Serial；`src-tauri/src/x11_forward.rs` 是既有 SSH X11 forwarding 路径。SSH forwarding 不能作为 XDMCP 会话管理互通的证据。未修改 provider、权限、安装器、凭据或快照 schema。

本次实际执行 Python `platform.platform()`、`shutil.which()` 与 display 环境变量存在性检查：Linux 6.18.44 x86_64 / glibc2.39；Xorg、Xephyr、Xvfb、Xwayland、XQuartz、Xwin、docker 均未找到；DISPLAY、WAYLAND_DISPLAY 均未设置。未提供真实 XDMCP display manager、测试账号或桌面靶机。未执行 XDMCP 连接，不存在成功截图、远端日志或清理实测。CI 编译或静态检查不补足这些证据。

| 平台 | Server / X server 证据 | Auth / extensions | Cleanup 证据 | 许可证 / 阻塞结论 |
|---|---|---|---|---|
| Windows | 无 Windows GUI 环境及 display manager 靶机；Cygwin/X 官方文档描述 query 模式，未安装或运行 | 未验证认证方式、cookie、XKB/剪贴板/GLX/RANDR；不得推断兼容 | 未验证子进程、display 端口及窗口关闭 | 未审计拟分发的完整组件集；当时 WS-N04 未决定；现已确认内置目标，组件未定。历史 BLOCKED |
| macOS | 无 macOS GUI 环境及靶机；XQuartz 是候选，query 模式及目标版本未实测 | 全部 MANUAL_REQUIRED，不能用 X11.app 存在推断远程桌面成功 | 未验证关闭会话是否仅终止本实例、是否影响用户已有 X server | 官方说明组件包含不同许可证，quartz-wm 使用 APSL2；未批准打包分发。BLOCKED |
| Linux | 当前环境无 X server、display、容器工具或靶机；未来可在有 GUI 的测试机评估独立/nested X server | 未验证具体 display manager 配置、认证与扩展协商 | 未验证取消、超时、logout、崩溃与端口释放 | 未选定发行版/软件包/组件版本，许可证清单缺失。BLOCKED |

## 原评估设计结论与演示门槛（历史）

Cygwin/X 官方说明每个并发会话需要独立 display，XDMCP 使用 UDP，不能直接等同于普通 SSH TCP 转发。官方文档给出的远端 Xnest 经 SSH 方案是另一种部署路径，也需要独立验证。本评估据此推断：复用已有 SSH X11 开关不足以实现完整 XDMCP 生命周期。

后续最小演示须在授权的隔离测试网络进行，登记 OS、X server/display manager 的精确版本、安装来源、目标认证方式、扩展列表和许可文件。原评估限定只接入用户显式选择的现有程序（后续内置目标已由新计划替代）；不静默安装、提权、开放防火墙或关闭访问控制。建立前展示能力/不可用原因；失败与重试保留实例身份并创建新运行句柄，超时和取消必须收回所属子进程/套接字。关闭仅清理本实例创建的资源，不能按进程名杀掉用户已有 X server。令牌、cookie、账号输入及原始端点不进入诊断、日志、快照、导出。

未执行的验证步骤（不是成功证据）：

1. 为每个平台准备一个指定的远端 display manager、最低权限测试账号及隔离网络；采集 X server `-version` / `-help`、服务端配置和许可证清单，记录允许的通信方向。
2. Windows 可从官方 `X :1 -query <test-host>` 模式开始；具体路径/display 必须显式选取。macOS/Linux 先核对实际候选对 query/nested 模式的支持，不套用未验证的通用命令。
3. 验证登录、真实桌面、输入/分辨率/必要扩展；记录密码拒绝、目标拒绝、网络超时、启动取消、两实例并存、一个实例关闭和重试。
4. 验证 logout、主窗口销毁与程序退出后无所属进程、端口、临时认证文件残留；保存脱敏证据。完成每个平台及许可证审查后才能将能力状态改为可用。

## 一手来源（2026-10-16 查阅）

- [Cygwin/X：Remote sessions via XDMCP](https://x.cygwin.com/docs/ug/using-remote-session.html)：query、多 display、UDP 与部署边界。
- [XQuartz 官方站点](https://www.xquartz.org/)：macOS X server 项目、组件许可证说明；不据此推断 query 互通。
- [产品规则](../WORKFLOW_SPEC.md)：WS-N03 / N04；文档阻塞记录不等于 GUI 或发布验收完成。

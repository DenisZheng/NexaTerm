# WSL XDMCP 靶机阶段验收

2026-11-21更新：维护者已确认修正版下三桌面整批操作人工PASS，见 [复验结果](private-xdm-desktop-retest.md)；机器已重启，当前空资源状态不能证明重启前自然回收。以下11月1日的双实例待验和后续步骤是历史快照，不覆盖此次签字或根目录ROADMAP的产品化暂缓决定；不重新开放旧网络窗口。

更新：2026-11-01。状态：**靶机准备、发现协议及本机外置模式桌面/基本输入通过；完整交互与远端辅助进程即时清理未完成**。

2026-11-01续作：维护者完成输入/退格、手动注销、重连后登录框取消及带活跃桌面的正常应用关闭。Windows所属引擎/监听/私有目录完成回收，应用exit0；远端辅助进程在应用退出及停专用XDM后仍存在，后续journal确认是发行版自动关机时才停止其会话作用域，详见 [回收补充核对](remote-lifecycle-followup.md)。XDM原始pidfd确认退出，最终服务inactive、测试UID无进程；12:29独立核对防火墙完整恢复，详见 [最新现场结果](native-desktop-preflight.md)。最终空UID不作为单次会话清理成功；各进程归属、双实例及完整X2/X3仍待验证。

2026-10-31后续（历史）：维护者设置专用口令后已成功登录 XFCE。首次 Xsession 父目录权限故障已修复，实际构造和真实 UID 红绿回归通过；随后测试窗口到期，服务/UDP177/runtime及专用UID进程均已清理。维护者手动 Restore 后，两条防火墙原规则在 PersistentStore/ActiveStore 均与基线一致，临时规则已移除，详见 [现场结果](native-desktop-preflight.md)。下文 locked/待设置及安装阶段状态是历史快照，不覆盖后续记录；到期退出不是手动注销通过。

维护者已明确授权在现有 Ubuntu-24.04 中安装/配置测试服务。沿用当前任务、分支与 PR #89；不更改产品入口、IPC、发行组件或 Windows 安全策略。用户流程与验收仍引用 PRD 中的 X02/X03、C02，本阶段不替代 W03/W10–W14。

## 靶机准备阶段的环境与改动

- Ubuntu 24.04.4 LTS、WSL2、systemd、NAT；不是 WSLg 完整桌面，也不是独立 Linux 主机。
- 安装 Ubuntu 仓库的 XDM `1:1.1.11-3ubuntu4`、XFCE session `4.18.3-1build2`、窗口管理器/桌面/面板/设置和 xterm；已有 dbus-x11 复用。共新增 58 包、约 72.7 MB 安装空间；**零升级、零移除**，原有包版本与 manual 标记未改变。
- 安装前保存包、manual 标记、服务、网络、APT、debconf 与 alternatives 基线。临时 `policy-rc.d` 阻止包安装启动服务，安装结束精确核对并删除自建策略；原先不存在的默认 display-manager 文件/别名恢复为不存在。新装的系统 `xdm.service` 保持 masked，SysV 自启禁用。安装前后 Docker/containerd 的 PID 一致。
- 使用独立 `/etc/nexaterm-xdmcp-test/` 和手动专用 service，不改全局 XDM 配置/PAM、不安装本地 Xorg、不替换 WSLg。独立 Xservers 为空，不管理本地图形 seat。
- `Xaccess` 只 `LISTEN` 当前 WSL NAT IPv4，只有 Windows NAT 网关一条 `NOBROADCAST` 许可；没有 `*`、间接 chooser、IPv6/多播或公网监听。每次启动重新验证 NAT/单默认路由/单 eth0 IPv4，UDP 177 已占用或拓扑不符合时明确失败，不接管已有服务。
- 专用非特权账号初始锁定、无附加管理组，HOME 0700；未设密码、未进行真实登录。保留发行版 PAM 栈，通过 service 的只读 bind mount 增加专用账号限制，**仅该服务看到限制版 `/etc/pam.d/xdm`**。真实文件保持包内原文。未加 `-ac`、`xhost +` 或空口令。
- session 明确使用 X11 与独立 D-Bus，清除 Wayland/旧 session bus 环境，再启动 XFCE；保留 XDM 提供的 DISPLAY/XAUTHORITY。此启动路径尚未经真实桌面执行，不声称键盘、输入法、剪贴板或 logout 可用。

## 靶机准备阶段已执行验证

| 检查 | 结果与边界 |
| --- | --- |
| Windows NAT direct Query | 两次收到结构有效的 `WILLING`；只发送发现查询，不发 REQUEST/MANAGE，不创建登录会话 |
| Windows 广播 opcode / indirect Query | 均无响应；发向精确目标，不实际发送网段广播 |
| 非许可来源（WSL 自身 IPv4） | direct 返回 `UNWILLING`，广播 opcode / indirect 均无响应 |
| 实际监听与权限 | 仅预期 WSL IPv4:UDP177；无通配/IPv6监听；独立 PAM 的真实 mount 为只读、内容匹配 |
| PAM 负向 | 在服务真实 mount namespace 调用 PAM，root 和现有用户在任何口令提示前被拒绝；未提供/读取口令。专用账号仍为 locked |
| 系统状态 | 原有包/manual 标记与全局 PAM/default DM 保持基线；专用 unit 为 static，最大运行 30 分钟，未 enable |
| 两轮启动/停止 | 分别通过显式 stop 和前台 owner 的 SIGTERM 结束；预先打开原始 XDM 的 pidfd，确认同一进程已退出、UDP177 与专用 runtime 目录消失；同轮 Docker/containerd PID 不变。重复前台 owner 被锁拒绝，原进程继续运行 |
| 最终状态 | 测试服务已停止，UDP177 未监听；账号仍锁定，配置和包保留供下一次联调 |

初次 Windows 查询失败时，服务已被 WSL idle shutdown 停止，WSL 本机查询也返回 connection refused；不是由该结果推断防火墙阻断。官方说明 systemd 服务本身不会保持 WSL 存活。修正为**前台持有 WSL 调用的 `run`** 后，重跑全部 7 个发现协议断言通过；不修改 `.wslconfig`、切换网络模式或放宽防火墙。关闭前台 owner 能回收服务；强杀 Windows/WSL 宿主仍不作为本轮用例。

## 本机操作入口

以下命令在 PowerShell 执行；账号名是本阶段新建的固定测试身份，不是维护者原有账号。密码由维护者本机交互输入，**不要发送到聊天或写进命令参数**。本次网络窗口已结束，后续连接前须重新准备受控窗口，不直接复用旧规则/地址。

```powershell
# 仅首次准备时设置；本机维护者已完成，不需要重复执行。
wsl.exe -d Ubuntu-24.04 -u root -- passwd nexaterm-xdmcp

# 联调时保持此命令运行；Ctrl+C 停止，最长 30 分钟。
wsl.exe -d Ubuntu-24.04 -u root -- /usr/local/sbin/nexaterm-xdmcp-test run

# 另一个终端查看当前地址，映射到 NexaTerm 表单的目标/本机 IPv4。
wsl.exe -d Ubuntu-24.04 -u root -- /usr/local/sbin/nexaterm-xdmcp-test info

# 独立停止/查询；不会按全局进程名杀 X server。
wsl.exe -d Ubuntu-24.04 -u root -- /usr/local/sbin/nexaterm-xdmcp-test stop
wsl.exe -d Ubuntu-24.04 -u root -- /usr/local/sbin/nexaterm-xdmcp-test status
```

地址、系统基线、包增量、账号 UID/HOME、安装/服务日志和本机复验脚本仅保存在 WSL `/var/lib/nexaterm-xdmcp-test/` 或仓库忽略的 `.trellis/.runtime/xdmcp-wsl-*`，不提交原始认证材料。公网/其他拓扑不得复用这套许可。

## 回滚边界

1. 先执行精确 `stop`，确认无监听/运行目录；本机已进行真实登录，还必须检查专用账号的 session scope/进程，不能仅凭 service inactive 认定桌面子进程全部退出。本次到期后已额外确认专用 UID 无剩余进程。
2. 配置回滚清单：专用 unit、`/usr/local/sbin/nexaterm-xdmcp-test`、`/etc/nexaterm-xdmcp-test/` 及专用账号/HOME。删除前核对本机 `test-account.json` 的 UID/HOME、配置清单/hash，拒绝符号链接、地址范围外路径或后来新增的用户数据；只处理本次创建项，然后 daemon-reload。完整操作说明另存本机 `README.md`。
3. 可保留新增包供后续使用；系统 xdm 必须继续 masked。若需卸包，先根据 `added-packages.txt` 做 APT purge 模拟并人工检查依赖影响，再精确卸载选定包；不 `autoremove` 原有软件，不还原整份 dpkg/debconf 数据库。只有 xdm 已卸载且默认 DM 仍符合基线时，才删除本次创建的 xdm mask。
4. 原有 Docker、WSLg、APT 源、杀软与 `.wslconfig` 均不在回滚修改范围，靶机准备未改动它们。后续另行授权的 Windows 防火墙临时窗口使用其独立快照和 Restore，不由 WSL 卸载脚本回滚；本次已核实恢复。

## 下一步与证据边界

靶机准备、专用口令、桌面/基本输入及本轮最终清理/防火墙恢复已完成，见 [现场结果](native-desktop-preflight.md)。PR native artifact仍是JSON，不是可启动的exe。不得复用杀软干扰的prefix或未经批准发布CI引擎包。后续独立窗口检查双实例隔离和未明的远端辅助进程归属，不重复安装/设密码、不复用已结束的窗口，也不以杀专用UID全部进程的兜底代替单次会话生命周期核对。

当前实现与此前提交 `56ca831` 的九项执行门禁保持已有成功记录；本轮未改应用代码，不把旧CI冒作新提交验证。W03仅在本机外置VcXsrv/WSL NAT场景通过，W06/W08为部分子项；X01随包、双实例W07及完整X04仍未完成，`distributionApproved/bundled/desktopVerified=false`。整体任务保持in_progress。

本轮仓库检查：`npm run check`、Trellis context manifest 验证及 `git diff --check` 通过；应用代码未改，没有重跑完整应用/原生构建。新增本机脚本的验证是上述真实 WSL/Windows 用例，不是新 CI 门禁。

依据：[Microsoft WSL networking](https://github.com/microsoftdocs/wsl/blob/main/WSL/networking.md)、[WSL systemd 生命周期](https://github.com/microsoftdocs/wsl/blob/main/WSL/systemd.md)、[X.Org XDM 手册](https://www.x.org/archive/X11R7.5/doc/man/man1/xdm.1.html)，并以实际 Ubuntu XDM 包的维护脚本、`xdm(1)` 和本机 systemd 255 行为复核。

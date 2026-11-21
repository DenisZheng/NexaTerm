# 原生桌面联调前置检查

## 最新现场结果（2026-11-01 12:29，UTC+08:00）

本轮使用与上一轮 SHA256 一致的 `56ca831` 独立验证版和预装 VcXsrv `21.1.16.1`，未重建或重装。重启后重新核对配置权限、程序身份及当前 NAT；维护者提前按 Enter 结束的窗口已独立确认恢复，旧收据保留，新窗口使用字节一致的脚本。真实 Apply 后再次核对两个 policy store 的完整规则/过滤器，只允许当前单 display TCP6100，不扩展网络范围。

原生 UI 控制仍报 native pipe unavailable；以下界面与输入结果来自维护者实际操作，资源证据来自预先持有的原始 Windows 进程句柄、WSL XDM pidfd 和只读现场检查，不冒充自动化 UI 验收。

| 子项 | 本轮结果与证据边界 |
| --- | --- |
| W03，本机外置模式桌面与基本输入 | PASS：维护者确认进入 XFCE，`NexaTerm123` 输入及退格正常；同时观察到受管引擎和专用 UID 下的实际桌面进程。不是完整键位、输入法或剪贴板验收。 |
| W08，远端手动注销 | PASS：维护者点击 XFCE Log Out，桌面退出、NexaTerm 显示已关闭；原始引擎句柄确认12:20:02退出、code0，随后 X 监听、私有目录及专用 UID 进程均不存在，NexaTerm 仍运行。 |
| W06，重连后在登录框取消 | PASS：新原始引擎句柄已捕获；维护者在登录框取消，窗口退出、状态已关闭。12:21:35引擎code1退出，监听、目录及专用 UID 进程回收。code1与 Windows runner 的显式 Job 终止码一致，不记成自然exit0；启动前/启动中的竞态仍是其它子项。 |
| W08，带活跃桌面的正常应用退出 | Windows 子项通过：维护者按再次登录后直接关闭应用的步骤操作，确认两个窗口退出。最后一轮引擎12:25:04.301以code1退出，原始应用句柄12:25:04.320以code0退出；首个退出后观察点无活跃所属引擎、X监听或私有目录。没有用强制结束进程或空白应用退出替代此项。 |

### 远端回收与未归因事件

正常应用退出后的首次检查仍有专用 UID 的 systemd、认证代理和辅助 D-Bus 进程；12:26:05停止专用 XDM 服务后，原始 pidfd已就绪、UDP177及服务runtime消失，但即时 UID 复查仍见辅助进程。12:27及最终复查时该 UID 已无进程。后续持久化journal已确认12:26:20–21发行版自动关机时才停止后两个会话作用域，随后查询重新触发启动；**最终无残留来自发行版关机，不是单次会话即时清理通过**。代理未手动重启、批量杀进程或删目录；先前内核启动时间不足以排除发行版重启。具体辅助进程的session/cgroup归属仍缺现场证据，详见 [回收补充核对](remote-lifecycle-followup.md)。

观察中另有12:24:04的一次引擎code0退出，之后维护者再次连接并完成最终应用关闭；中间一次的具体用户操作未单独确认，不补记为额外的自然退出/故障用例通过。观察器以500ms间隔采样，目录/监听的退出后空快照不充当精确删除时刻的证据。

### 窗口收尾与剩余范围

维护者按 Enter 得到 RESTORED 后，12:29独立只读检查确认：原规则在 PersistentStore/ActiveStore 的完整配置及过滤器均匹配基线，所属临时规则均不存在；验证版、引擎、X监听及私有目录无残留。WSL 服务 inactive/dead/static，最终专用 UID 无进程。Windows观察器、原始应用等待、WSL前台owner及pidfd观察均已正常结束；无需再次 Restore。原始收据只保留在忽略的本机目录，不提交认证材料或机器规则。

W03仅对本机外置 VcXsrv + WSL NAT 场景通过；W06/W08是上述子项证据，不是所有分支通过。W07双实例/外部引擎对照、完整W10/W11、固定XWin真实桌面、正式随包及许可/分发仍未完成，`distributionApproved/bundled/desktopVerified=false`。单端口顺序重连不替代双实例隔离。下一轮先明确双实例端口安排，并在保持靶机存活的独立观察下核对远端会话/辅助进程归属；不为这些缺项放宽产品能力声明。

本轮未修改应用代码或新增依赖；`npm run check`、Trellis上下文校验及暂存/未暂存差异检查通过。没有重跑完整构建或将旧CI当作本轮验证。规范仅补充本地引擎与远端UID回收的证据分界；整体任务仍in_progress，不自动提交、推送或归档。

## 历史现场结果（2026-10-31 21:09，UTC+08:00）

- 目录权限修复后，维护者明确确认进入 XFCE 桌面；现场同时观察到专用 UID 下的 xfce4-session、xfwm4、xfce4-panel、xfdesktop 等实际桌面进程，以及属于独立 NexaTerm 验证进程的 VcXsrv。首次 Windows 开发入口 → 受管外置引擎 → WSL XDM 登录/桌面显示已取得真实证据，不是仅有 UDP WILLING 或 querying。
- 维护者随后确认因测试窗口到期退出；**不记录为手动注销成功**。已在退出前持有原始 VcXsrv 进程句柄，确认同一进程于20:47:22退出、exit code0。不是按回收后的 PID 推断原进程死亡。
- 退出后复核：Windows 无 VcXsrv 进程、无6100–6131监听、无 runner 私有临时目录；WSL 专用服务 inactive/MainPID0，UDP177和服务runtime消失，专用测试 UID 下无剩余进程。没有读取认证文件或通过手动删目录/全局杀进程制造成功。
- 独立验证版退出后，维护者手动执行 Restore，返回 `RESTORED`。21:09 独立只读复核：两条原规则在 PersistentStore 和 ActiveStore 的完整配置/过滤器均与保存基线一致，两个 store 均无本次临时规则，本机恢复状态为 Restored；无验证版/引擎进程、X 端口监听或 runner 私有目录。不是仅凭脚本成功提示认定恢复。
- 原始 NexaTerm 验证进程句柄于21:06:23确认退出，exit code为 `-1073741510`（`0xC000013A`），与此前引擎的exit0分开记录。具体结束原因未进一步确认；本次不能作为正常应用退出屏障或 W08 已通过的证据。
- 桌面内输入样例、手动注销、取消/重连、双实例隔离、键盘/剪贴板和正式随包仍未完成。本次为外置 VcXsrv + WSL NAT 的开发互通，不替代固定 XWin、其它拓扑/平台或分发批准；不更改 bundled/desktopVerified 产品能力标志。

以下为本次测试的前置与故障过程，时点状态不覆盖最新结果。

2026-10-31，接续 [WSL 靶机阶段](wsl-target.md)。维护者已设置专用测试账号口令；仅通过 `passwd -S` 确认状态为 `P`，不读取或记录口令/hash。同日 20:20（UTC+08:00）观察：维护者已执行临时防火墙 Apply，WSL 前台 owner 与独立原生验证进程已启动；尚未启动 XDMCP 引擎或进行真实登录。两个前台测试窗口均有时限，后续操作须重新确认仍有效。

## 已完成

- 本机已有 VcXsrv `21.1.16.1`，不是受杀软干扰的私有 XWin prefix。下载[官方同版本发布安装包](https://github.com/marchaesen/vcxsrv/releases/tag/21.1.16.1)，SHA256 为 `df7fed8f49665d0592528ab6be9d07111ea73c6848283d128b77690e05b8f90b`，与公开包校验记录一致。安装器未执行；只使用下载后解包的 Ubuntu 7zip 工具读取，未安装新包。
- 预装目录中 5200 个文件与官方 payload 逐字节相同；NSIS 生成的卸载器不作为运行输入核验。复用项目 PE 解析器，只读核对 vcxsrv/xkbcomp 的 9 项相邻 PE 导入闭包；本机引擎 SHA256 为 `c7c54444eeacf1820d3f1ee2781209d011bad4373aa7893aef24b54a14cfc961`。这些是来源/完整性证据，不是无漏洞证明、Authenticode 签名或发行采用批准。
- 仅执行 `vcxsrv.exe -version`，正常返回 `21.1.16.1` 并退出，无残留引擎进程。没有启动 XDMCP/X TCP 监听。版本输出中的兼容性 OS 字段不作为真实 Windows 版本证据。
- 当前源码 `56ca831` 通过 `tauri build --debug --no-bundle --config <本机覆盖文件> -- --locked`，包含新建 XDMCP 实际入口。生成 `src-tauri/target/debug/nexaterm-xdmcp-validation.exe`，SHA256 `3d07f7b3cacec6d61532a60c114c2ed4139e221e63db2feaec0b5c6c182285cc`。覆盖文件仅放 `.trellis/.runtime/`；独立 identifier `com.nexaterm.xdmcpvalidation`、独立程序名，不复用维护者现有 app-data/WebView profile。同日已复核 hash 后以标准用户启动，两个独立数据目录实际存在；保留原始进程句柄等待退出。进程存活不等于 UI、登录或桌面通过。
- 前端 build、首屏 module boundary 通过，XDMCP pane/runtime 仍为独立 lazy chunk。原生编译保留现有 unused/deprecated 警告，没有为了通过构建修改无关代码。没有打包、安装或重建 X server。

## 启动前必须确认

发现预装 VcXsrv 的 **TCP 和 UDP 入站规则均允许 Public profile、Any 本机/远端地址与 Any 端口**，当前 WLAN 正是 Public。`-from` 不限制引擎监听接口，不能沿用这两条宽规则并把测试宣称为只对 WSL 开放。

维护者已明确同意并手动执行：备份并临时禁用这两条精确规则，增加仅供本次程序、本机 NAT 地址、WSL 来源和单个 display TCP 端口的临时规则。Apply 后实际读取 ActiveStore，确认两条原规则 disabled、所属临时规则 enabled，完整过滤器与记录一致；三个 profile、其它相关允许规则及当时 NAT/端口均复核通过。首个会话预期使用 display100；启动后仍须核对实际分配，若不同则停止并重新核实，不放行全部 6100–6131。代理没有提权或修改规则。测试结束后的真实恢复现已另行核实，见最新现场结果；不改全局默认策略或杀软。

## 已准备的临时防火墙窗口

- 本机 `.trellis/.runtime/xdmcp-firewall.ps1` 提供 `-Mode Check|Apply|Restore`，默认只读 Check。脚本、原规则精确 Name/配置快照及恢复状态不提交；不是产品提权或防火墙管理功能。
- Apply 重新核对引擎 hash、原规则完整配置、ActiveStore、三个防火墙 profile、通用入站允许规则、动态 NAT 接口/地址和端口占用。按精确 Name 修改 PersistentStore，不按显示名称批量操作；不改其它应用、全局策略或杀软。
- 先独占创建并 flush 恢复状态，再禁用原规则。新规则先以 disabled 创建，保存精确快照后才启用；仅该程序、WSL 接口、两个单独 IPv4 和单个 TCP 端口。Windows UDP177 不开放。成功后显示 `READY`，前台窗口最多保持 30 分钟，维护者关闭 XDMCP 会话后按 Enter 进入恢复。
- 恢复先移除所属临时允许，再确认没有 VcXsrv 进程，核对原配置后恢复原 Enabled。若引擎仍活跃，保留原规则禁用状态和恢复凭据，要求关闭会话后单独执行 Restore；不通过恢复宽规则使尚未关闭的引擎暴露。发现配置漂移则报错，不覆盖用户并发修改。重复 Restore 不撤销完成之后的人为变更。
- 窗口异常有恢复路径，但强制结束 PowerShell/关机不能保证 finally 执行；此时必须保留本机状态文件，重新以管理员运行 Restore。不能把“30 分钟前台截止”说成进程被强杀后仍有后台自动恢复。

### 本次验证边界

Windows PowerShell 5.1 与 PowerShell 7 的只读 Check 均通过；两套宿主的 13 组内存 mock 用例覆盖正常回滚、部分禁用失败、创建前/后失败、有效策略验证失败、异常退出路径、活跃引擎禁止恢复宽规则、恢复幂等与并发漂移、恢复文件碰撞、临时规则范围/安全过滤器漂移和 IPv4 反例。mock 调用防火墙接口均为内存替身，不是管理员真实写入证据。测试使用真实临时文件验证恢复记录的独占创建和原子替换，修复了 PS5 JSON 顶层数组枚举差异及 `$null` 被转换为空字符串导致 `File.Replace` 失败的问题。

接口依据：[Microsoft NetSecurity Set-NetFirewallRule](https://learn.microsoft.com/en-us/powershell/module/netsecurity/set-netfirewallrule)、[Remove-NetFirewallRule 的 policy store 契约](https://learn.microsoft.com/en-us/powershell/module/netsecurity/remove-netfirewallrule)。后续已分别独立只读确认管理员 Apply 与 Restore 的实际结果；桌面互通和清理另留真实证据，不能由 mock 或规则检查推断。没有为了这些脚本重建或发布引擎。

## 故障过程与后续入口

### 首次真实登录后的退出故障（同日 20:39 修复）

维护者报告输入密码回车后引擎窗口退出。NexaTerm 原始进程仍存活，XDM 服务 active，临时防火墙仍 Applied。仅提取会话执行错误，最近两次 XDM 记录为 `Session ".../Xsession" execution failed (err 13)`；没有读取密码、Xauthority 或原始认证报文。此证据把退出定位到 Linux 登录后的会话 exec，而不是凭 `start_failed` 猜测网络或口令问题。

准备脚本先设置 umask077，再调用 `config.mkdir(mode=0o755)`，导致实际父目录为 root0700；Xsession 文件虽为0755，会话 UID 仍不能遍历父目录。新增本机回归从实际准备脚本抽取目录构造语句，在 umask077 下得到0700，并以真实测试 UID 检查 Xsession 可读/可执行，两个断言均先失败。修复为创建后显式 chmod0755，同时对本机已存在的精确目录校验 owner/类型/原mode 后仅调整该目录；目录身份和七个文件的 owner/mode/hash 均核对未变，私有配置继续root0600。

修复后实际构造0755、真实 UID 的 read/execute 和 `sh -n` 通过，五个私有配置的不可读反例通过；未改密码、PAM、HOME、引擎参数、网络或服务时限，没有重跑安装。问题属于 umask 隐含假设与跨 UID 测试缺口，发现协议/PAM拒绝不能替代登录后的执行边界。随后维护者重试已进入桌面，见最新现场结果；W03 的桌面内输入尚未单独确认，不把整项标为 PASS。

Computer Use 插件的 `list_windows` 返回 `native pipe is unavailable / os error 2`；已按规定等待重试并重置后再试，仍不可用。没有改用 PowerShell UI Automation 或伪造窗口句柄。后续实际许可与账号登录需由维护者在界面完成；密码不经聊天，不能把已有 fixture/进程创建当登录成功。

本次测试窗口已结束且原规则已恢复，不能直接复用旧地址或点击连接。后续继续 W02/W03/W06–W08 前，须保留本次恢复凭据，准备新的受控网络窗口、动态核实 NAT/实际 display、重新检查原生验证进程与 WSL 前台 owner；许可和登录仍由维护者操作。不删除或覆盖 Restored 状态来强行重复 Apply，不重复安装或设置密码。新 exe、原始比较结果和本机配置不提交。单个端口窗口不覆盖 W07 双实例用例，后者仍须单独安排。X01、固定 XWin 的桌面验证与 X04、许可/分发仍未完成。

# 专用 XDM 重传认证修复

2026-11-01，维护者已批准私有靶机修正版及必要编译依赖。**私有构建、真实协议红绿对照、专用服务切换及回滚已完成；修复后三桌面 W07 尚未复验。** 不修改 NexaTerm 产品代码或发行能力标志。

## 根因与最小修复

原故障见 [整批诊断](isolation-batch-diagnosis.md)。XDM 对相同未开始的 Request 复用 proto-display / Session ID，却再次生成 MIT 授权；随后 Manage 回连呈现的授权不再是客户端首次 Accept 收到的值。这与登录前的 `Invalid MIT-MAGIC-COOKIE-1 key` 相符。

私有补丁只改 `xdm/auth.c` 的 `SetProtoDisplayAuthorization`：若 proto-display 已有授权，且方案名长度和字节均与本次选中方案相同，保留首次授权。调用前原有的方案选择、认证检查和错误拒绝不变；不同方案仍走原路径。没有跨会话缓存，不改变访问控制、PAM、客户端重传、超时或 UI 状态。

已用真实 XDM 和伪 X server 证明“首次 Accept 的认证”与“Manage 后 X11 setup 的认证”在原版不相同、修正版相同。仍未抓取用户失败连接的实际包序列，不能把该协议对照冒充原三桌面场景已经修复。先前测得的约 10 秒反向 DNS 阻塞未改；不得以串行启动或延长超时掩盖认证缺陷。

## 来源、构建与作用域

- 固定 Ubuntu `xdm 1:1.1.11-3ubuntu4`。独立 APT sources/lists 使用 Ubuntu archive keyring 验证 noble InRelease；`gpgv` 独立确认签名，再由签名 Sources 记录核对 dsc、上游归档和发行版 diff 的大小及 SHA256。未改系统 sources，也未使用跳过认证选项。
- 应用发行版 9 个 patch，随后增加上述 8 行私有修复。Autotools 与编译均以 `nobody` 身份运行，只编译 daemon，不执行系统 `make install`。
- 依赖先模拟、锁定全部版本、再次模拟，安装后逐包比较：新增 54 个编译/开发包，既有包无升级、降级、删除或状态变化。为避免 Xft 开发闭包升级桌面库，保留系统原有 `libXdmGreet.so`，不构建或替换 greeter。
- daemon 保持 PAM / SELinux、发行版禁用 XDM-AUTH 的配置及原 greeter 路径；Xft 开关只影响未构建的 greeter，已搜索确认不影响 daemon/include。系统 daemon 的 153 个动态导出符号均保留，不将符号检查当真实登录验收。
- 原版和修正版在当前编译器下各有 231 条既有警告；归一化位置后警告多重集合完全一致，没有新增警告，也没有关闭告警。未扩大范围清理旧源码。
- 私有安装目录：`/opt/nexaterm-xdmcp-test/xdm-1.1.11-3ubuntu4-request-v1/`，root 所有、无组/其他用户写权限，保留原许可与补丁。该目录不是 NexaTerm 随包组件。

| 材料 | SHA256 |
| --- | --- |
| 上游 `xdm_1.1.11.orig.tar.gz` | `38c544a986143b1f24566c1a0111486b339b92224b927be78714eeeedca12a14` |
| 发行版 `xdm_1.1.11-3ubuntu4.diff.gz` | `57d3cbbd699ff05d015ccfe22e386f637b191ab86c2f6ba6d9091639c35704b0` |
| 本机未修复重建 daemon | `731c63b6a952279746e8d8b7900a22e52a43109b35879dca2a563417dc807fe6` |
| 私有补丁 | `5d6f1fefe5f787d18df987461cc262115c78e5617847e035cbe6a7ac11621bbf` |
| 私有修正版 daemon | `23cf6b0b2698e0e0df1bb6001d9de513a2e51d8becbad6bfb31b9ccbb2a5f3f0` |

构建核验时曾误用此版本不支持的 `-version`，以非特权用户执行后明确失败，未尝试用 root 重跑未知启动参数；保留原失败记录，改用 ELF 核验及真实协议执行。首次公开源码下载目录不可写导致 APT 自动退回 root 下载，随后在仅存公开源码、由 `_apt` 所有的新目录重新下载并核验，未关闭 APT sandbox。两项工具问题均不冒充构建或协议通过。

## 自动回归结果

每轮在新的 network namespace 中只启用 loopback，不改变宿主接口或 Windows 网络规则。真实 XDM 使用测试专用配置；伪 X server 读取自己这轮的 X11 setup 后明确返回测试结束，greeter 路径无效、登录脚本为 `/bin/false`，不进入 PAM/真实账号登录。授权只在内存比较，不记录值或其 hash；显式持有的可变认证缓冲清零，原始 daemon pidfd 和子进程清理完成后移除临时测试目录。

| 对象 | 轮数 | 结果 |
| --- | --- | --- |
| 系统原版 XDM | 3 | 稳定红色：重复认证稳定性、截断消息后有效重传的认证稳定性、Manage 使用首次认证三项失败，其余断言通过 |
| 相同源码/参数的未修复重建版 | 3 | 同样三项失败，排除仅靠重建改变结果 |
| 私有修正版 | 10 | 每轮 16 项断言全部通过 |
| 最终 `/opt` 中的私有二进制 | 1 | 同一 16 项全部通过，hash 与构建输出一致 |
| 切换/回滚工具 | 12 项 | 活跃服务、closing session/残留进程、命令/配置漂移、文件碰撞、重复回滚、reload 失败后续作等通过 |

16 项包含多次相同 Request、交错的不同 display/源 UDP socket 独立性、其它源地址拒绝、错误 Session ID 的 Manage 拒绝、截断消息、未知授权方案拒绝、拒绝后新会话独立性、实际 Manage 回连及测试进程清理。没有把单次 UDP WILLING 当桌面成功。

原合成协商诊断器的 4 项测试、Trellis implement/check manifests、`npm run check` 与差异空白检查通过。没有产品/启动路径代码改动，本轮未重跑 Windows 引擎、完整应用构建或远端 CI；不能借用旧 CI 声称新桌面验收通过。

## 切换、回滚与最终状态

专用 unit 原文件保持不变，仅新增：

```text
/etc/systemd/system/nexaterm-xdmcp-test.service.d/50-private-request-idempotency.conf
```

内容只清空并重设 `ExecStart`，指向私有 daemon，保留原 `-nodaemon -config` 参数。工具持有既有前台 owner 的同一独占锁；要求专用服务完全停止、测试账号无 session/进程、原文件/二进制/greeter/PAM/controller hash 未漂移。回滚只删除内容与身份符合的自有 drop-in，不用 `systemctl revert` 或覆盖整个 unit。

实际执行过切换 → 回滚到 `/usr/bin/xdm` → 再切换，并逐次核对 systemd 的有效命令；`systemd-analyze verify` 通过。16:32:53（UTC+08）最终核验：专用服务 inactive、UDP177 无监听、runtime 目录不存在、测试账号无 session/进程。原系统 xdm 仍 masked；没有启动新桌面窗口。

本机工具位于 `.trellis/.runtime/xdmcp-private-fix-1/`；Linux 材料/收据位于 `/var/lib/nexaterm-xdmcp-build/20261101-request-idempotency/`。Windows PowerShell 的显式回滚入口：

```powershell
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Projects/NexaTerm/.trellis/.runtime/xdmcp-private-fix-1/private-service.py rollback
```

`status` 只核验，`apply` 重新切换；均不启动/停止服务。若有活跃桌面或文件漂移，先停止并核实，不绕过保护。构建依赖仍保留，不自动卸载它们或使用 autoremove；私有二进制保留供精确回滚/复查。

## 原窗口收尾，不能覆盖的失败

- 原批次于 16:24:15 因截止前未关闭桌面记录失败，并由所属 owner 停止专用服务。不是维护者正常注销或三实例隔离通过。
- 16:26:16 独立远端观察结束时，仍保留测试 user-manager、ssh-agent 等进程。16:26:31 journal 记录发行版 powering down；随后检查的 PID1 身份已不同。当前空账号来自后续发行版生命周期，不是该 session 自然清理成功；没有手动终止该 UID/session。
- 16:30:43 独立只读核验两 policy store 中原规则完整恢复、临时规则不存在，三个 X 端口无监听且所有 VcXsrv 已退出；验证版 NexaTerm 窗口仍开着。这不是本轮应用正常退出验收。
- 旧 Windows 观察器的两个 1601 零值退出时间不能用于排序；下一轮新观察工具必须先确认原句柄 signalled，再读取有效退出时间，不覆盖旧日志。

## 防止再次走回重复试登录

根因属于跨层契约/隐含假设：Session ID 不变不代表认证没变；单次握手测试遗漏了重传。原先的权限修复针对另一条已证实故障，不能用于解释本次登录前拒绝。现在保留真实守护进程红绿矩阵，并在 runner spec 固化“首次 Accept → Manage X11 setup”的断言与私有切换保护。

11月1日的下一项为新的同范围受控窗口，以修正版完成两条受管会话和一条独立对照的同时登录、输入隔离、分别关闭/重连。后续观察器已修正；2026-11-21维护者确认整批桌面操作全部通过，W07桌面隔离记为人工PASS，不重复该清单，见 [复验结果](private-xdm-desktop-retest.md)。远端自然回收的后台证据、完整X2/X3和正式分发仍分别保留未完成边界；接续X0源码归档/VCS与独立签名。

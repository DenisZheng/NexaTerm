# 三实例窗口实际结果

日期：2026-11-01；代码基准仍为`56ca831`，没有修改产品、重建引擎或采用发行组件。范围W07/X03及清理观察。**本轮没有完成三个桌面同时可用、关闭/重连互不影响的验收，W07仍未通过。**

## Windows与恢复

| 时刻（UTC+08:00） | 实际证据 |
| --- | --- |
| 13:05–13:08 | 维护者Apply；独立核对两store和三个精确端口范围后，启动WSL服务、独立对照及验证版。 |
| 13:23:41 / 13:23:46 | 两个受管引擎先后启动，分别使用display100/101；原始句柄均已捕获。 |
| 13:24:12 | display101原始句柄exit0，端口和认证目录随后消失。是否人为关闭未确认，不能从exit0猜测原因。 |
| 维护者反馈后 | “面都进去了”与实际只剩display100/102不一致；随后澄清应为NexaTerm两个会话加独立对照一个，不是NexaTerm内建三个会话。没有把含糊反馈登记成三个桌面同时成功。 |
| 约13:35 | 30分钟防火墙窗口到期。之后实际读取显示临时规则已移除、两条原宽规则仍禁用；活跃引擎保护阻止恢复宽规则。没有延长窗口或自动重新放行。 |
| 13:36:19 | 维护者正常关闭应用；受管引擎先exit1，应用约16ms后exit0。独立对照原始句柄仍存活，不把这11秒进程存活外推为“仍接受输入”。 |
| 13:36:30 | 独立对照原始句柄exit0，私有认证文件和目录回收。 |
| 13:44:58 | 维护者Restore后独立核对PersistentStore/ActiveStore原规则完整快照与基线一致，临时规则不存在；应用/引擎、display监听和私有目录均不存在。随后显式结束Windows观察器。 |

Windows资源采样不是原子快照：跨退出时刻的一次端口枚举曾同时带有旧监听和已退出句柄，下一次枚举已清空。真实退出先后采用保留的原始句柄ExitTime；最终端口清理另经独立读取确认，不把混合时刻采样解释成退出屏障失败或即时清理成功。

## 观察器故障与补测

原远端观察器13:24:49在首次发现真实登录session时失败：把`systemctl`可接受的逗号属性列表传给`loginctl -p`，实际返回空输出，严格解析正确报Missing property。原先“无测试登录”的冒烟没有覆盖此路径；仅增加默认值或允许缺字段会掩盖错误，未采用。

保留原脚本、输出和准备收据，在独立`remote-restart-1`目录修复为逐字段重复`-p`并使用`--all`保留合法空值。真实已登录session测试先复现同一错误，再验证修复；停止服务后完整10项测试通过，包含真实session字段、pidfd、解析反例及前台观察/显式停止。13:27:53重新捕获当时仍存活的进程，**不声称持有首次登录以来连续的全部句柄**。

两个session的公开Display均为空，未编造显示号。后续仅采集限定测试端口的TCP元数据及进程cgroup，确认一组对应独立对照、另一组对应受管display100；没有读取环境、完整命令行、认证文件或数据包内容。

## 远端残留与人工收尾

13:37:19显式停止专用XDM；主进程原始pidfd退出，UDP177/runtime消失，两个logind会话从active转为closing。独立WSL前台观察仍继续，原PID1保持存活，未依赖发行版自动关机。

恢复后的只读快照仍有两个会话作用域、13个活跃测试UID进程和4个僵尸进程。活跃项包括每会话ssh-agent及若干XFCE组件，另有共享user manager/gpg-agent；剩余X TCP连接仍为ESTAB且部分有待发送字节。保留cgroup、起始身份、原始pidfd退出事件及限定端口元数据。pidfd已退出但`/proc`仍存在的僵尸单列，不能把它们当活跃进程，也不能从活跃句柄集合消失推断所有进程目录已回收。

这次窗口在桌面关闭前已撤销网络许可，因此不是未受干扰的正常logout/断开环境。现有证据证明残留发生在同一持续存活的发行版中，但不证明全部残留由NexaTerm、XFCE或logind某个单一缺陷导致；不修改全局KillUserProcesses/PAM，也不杀整个UID来获得PASS。

维护者随后明确同意精确人工收尾，实际执行如下；这不是自然会话回收通过：

- 重新核对独立观察器存活、原PID1、服务已停、同一测试UID/session创建时间/Leader/Scope及closing状态。身份校验的正向和9个漂移/未授权ID反例通过，只读预检先通过；没有按整个UID终止。
- 13:52:29逐个执行`loginctl terminate-session`，命令均返回成功，但60秒后原始句柄和会话仍未清理，明确登记超时，未将exit0登记为完成。实际scope为`active/abandoned`且没有停止Job；[systemd v255的session_stop](https://github.com/systemd/systemd/blob/v255/src/login/logind-session.c)对已stopping会话直接返回，说明为何此时不能用该命令返回值判断资源退出；未修改logind实现或策略。
- 13:54:47再次核对同一session以及scope的精确名称、ControlGroup、abandoned状态和`KillMode=control-group`，仅对这两个scope执行`systemctl --no-block stop`。沿用系统现有停止预算，不改全局超时或信号配置，也不停止user slice/整个账号。
- 13:54:57原始进程pidfd全部退出、测试UID为空、两个session消失；共享user manager/gpg-agent在约10秒后自行退出。另行读取确认两个scope已not-found/inactive/dead。独立观察器同时记录同一原PID1仍存活，排除WSL关机替代清理。
- 13:56:14明确结束独立WSL观察器，原前台调用exit0；Windows观察器、专用服务owner和独立引擎helper也已结束。Windows防火墙恢复证据不变，本次受控环境已收尾，不立即开新窗口。

首次未完成收据与精确scope人工清理收据分别保留；不能覆盖原失败记录，不能把人工结果升级为自然回收或W07通过。

原始材料位于忽略目录`.trellis/.runtime/xdmcp-isolation-1/`，包括`windows-events.jsonl`、`control-events.jsonl`、两版远端观察记录、`remote-after-restore.json`、`restoration-verified.json`、首次未完成的`remote-manual-cleanup.jsonl`、已验证的`remote-manual-scope-cleanup.jsonl`及最终复核/记录hash收据`final-cleanup-verified.json`；不提交机器信息或认证材料。`distributionApproved/bundled/desktopVerified=false`不变，任务不归档。

收尾门禁：`npm run check`、Trellis implement/check manifest验证、diff空白检查通过。没有产品代码变更，未重跑构建或CI；本地文档暂存待人工审核，不提交或推送。

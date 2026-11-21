# 三实例批次：登录前认证拒绝

日期：2026-11-01。验证程序仍为 `56ca831` 对应的独立构建；本轮没有修改产品、引擎、认证配置或系统网络策略。**W07失败，不能继续按“用户操作未完成”解释。**

后续状态：维护者已批准专用靶机修复，现已完成签名源索引核验、私有构建、真实协议红绿对照及可回滚服务切换，见 [私有靶机修复](private-xdm-request-fix.md)。该文件同时记录旧窗口实际收尾；本文“仅诊断/待授权/待恢复”保留为故障发生时的历史状态，不覆盖后续结果，W07仍待原场景复验。

## 实际现场

本轮后台在人工Apply后成功核验网络并启动专用服务、独立对照及观察器。受管display100/101和独立display102均有监听与原始进程捕获，随后：

- 15:55:39，独立display102退出；XDM同一时段记录 `Invalid MIT-MAGIC-COOKIE-1 key`。
- 15:55:49，受管display101退出，同样发生X连接认证拒绝。
- 15:56:28，维护者再次连接display101，约12秒后仍exit0，远端再次出现同一认证错误。
- 只有display100进入登录后的Xsession；其远端session已经被独立观察器捕获。101/102没有建立登录session，不能归因于XFCE多用户会话或账号密码错误。
- XDM随后分别记录两个显示的XOpenDisplay失败。失败前网络窗口仍处于Applied，和上轮的“网络到期后退出”分开。

本轮也暴露出观察工具的时间字段限制：两个记录的 `.NET Process.ExitTime` 为1601零值；该值无效，不用于排序或时长推断。使用其它有效捕获/事件区间及之后监听、目录状态说明退出事实，不把零值转换为有效退出时刻；未来观察应以原始句柄真正signalled后再读取结束时间。

## 实测缩小到远端XDM重传缺陷

本机忽略目录 `xdmcp-isolation-2/diagnosis/` 增加有界合成协商探针。它在重新核对有效窗口后，从已授权的本机地址向同一靶机UDP177发一次Query和两次完全相同的Request；**不发Manage，不创建X监听，不登录，不读取现有Xauthority或会话环境，不输出认证字节/哈希**。只比较本探针得到的临时协商数据是否相等。

16:02:48，真实已安装XDM返回：

```text
sameSessionId = true
sameAuthorization = false
query / request1 / request2 = 0.0005 / 0.0002 / 0.0002 seconds
FAIL: identical unstarted REQUEST changed its accepted session authorization
```

该探针直接覆盖真实守护进程处理重复请求的路径，已构成修复前的红色回归。当前只证明这一协议缺陷真实存在；没有抓取维护者实际连接的数据包，不能声称已经直接观察到其全部重传顺序。它与原生引擎的登录前认证拒绝高度吻合，但最终因果闭合仍须修复后的原始三桌面场景。

探针自身4组离线测试通过，覆盖Accept字段/长度/方案校验、逐字节截断反例、精确响应来源/opcode/长度，以及比较后的临时缓冲清零。这些测试验证诊断器，不把真实协议红色结果改写为通过。

## 固定源码与阻塞因素

已安装靶机是Ubuntu的XDM `1:1.1.11-3ubuntu4`。通过官方仓库取得对应dsc、原始源码及发行版diff；两个归档SHA256和dsc一致。仅只读研究，没有编译/运行下载源码或采用组件；dsc签名未独立验证，不能充当发行材料批准。

实际调用链：

1. `xdm/xdmcp.c:998` 对重复请求找到已有proto-display，并继续复用其Session ID。
2. 同一函数仍调用 `SetProtoDisplayAuthorization`（`:1046`附近）。
3. `xdm/auth.c:224` 无条件清空该proto-display的认证指针，随后调用生成器产生新的MIT cookie。
4. 如果引擎已经收到较早Accept并携带其Session ID发送Manage，XDM会用后来替换的认证连接它，双方不再一致。

另外，实际对NAT客户端地址的反向解析花费 **10.008秒后失败**。`NetworkAddressToName`在XDM主处理路径调用阻塞的`gethostbyaddr`；`sourceAddress=true`也不跳过该调用。并发启动时的十秒级间隔与此一致，足以形成客户端重传条件，但不能把DNS延迟单独等同于认证缺陷的唯一原因。

另行只读对照官方归档的XDM1.1.17：相同的已有proto-display分支仍无条件调用相同的认证生成路径。因此**没有依据建议“升级XDM就能解决”**；未安装或采用该版本。

## 修复方向与边界

推荐先修专用靶机XDM的重复Request幂等：未开始的同一个proto-display应保留首次已经接受的认证，不因重传换钥匙；跨显示、不同来源及新会话必须仍各自独立。复用这次真实协议探针验证，再回到三桌面场景完成因果闭合。DNS阻塞另作有限作用域处理，不以串行启动、延长重传时间或隐藏错误掩盖协议缺陷。

此修复涉及专用WSL服务使用的组件/启动路径及可能的构建依赖，需要维护者明确确认后实施；当前只完成诊断。优先私有修正版和可回滚服务配置，不覆盖系统xdm、不改默认显示管理器/WSLg/PAM/logind，不关闭认证、不开放更多端口、不更改Windows引擎或NexaTerm能力标志。没有证据支持修改产品的实例编号或关闭路径。

16:00前后已请维护者退出仍活跃的桌面并恢复网络。最终清理和Restore须在真实收据核对后补记；本文件不预先声称已经恢复。

## 依据

- [XDMCP协议](https://xorg.freedesktop.org/archive/current/doc/libXdmcp/xdmcp.txt)：重复消息处理、Request重传、Accept/Manage与授权数据的对应关系。
- [Ubuntu精确源码说明](https://archive.ubuntu.com/ubuntu/pool/universe/x/xdm/xdm_1.1.11-3ubuntu4.dsc)：本轮只读源码身份。
- [上游对照归档](https://xorg.freedesktop.org/archive/individual/app/xdm-1.1.17.tar.xz)：仅用于判断升级建议是否有实现依据，不构成采用或现场验证。

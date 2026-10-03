# WF-06C X11 Forwarding

> 父任务：`09-23-nexaterm-workflow-mainline`
> 堆叠基线：WF-06B `dccb26dbb08a9f57252108bedbbad60d382bba03`
> 规范：WS-N03 / WS-N04 / A13。

## 目标

把 2026-09-29 的 X11 feasibility spike 升级为可由真实 SSH profile 使用的生产路径。

必须做到：
- 继续使用当前锁定的 `russh 0.61.1`，不替换 SSH backend；
- X11 request / incoming X11 channel / Host Key 继续走现有生产 SSH session；
- 按 RFC 4254 使用随机 fake MIT-MAGIC-COOKIE-1，不把本机真实 cookie 发给远端；
- 从本机 DISPLAY + xauth 读取真实 cookie，首个 X11 setup packet 验证 fake cookie 后才替换；
- Linux/macOS 支持 Unix socket，TCP DISPLAY 可跨平台使用；本地 X server 不可达时 fail closed；
- profile 能显式启用 X11；未启用时不接受有效 X11 forwarding；
- session close / connect failure / X11 request failure 清理 forwarding state；
- Linux fixture 继续用 NexaTerm/russh 真路径打开远端 X client，作为 A13 自动化真实协议证据。

## 参考实现与边界

- RFC 4254 §6.3.1/6.3.2：fake cookie、hex 编码和 X11 channel 生命周期是规范基线。
- NyaTerm（MIT）已有 russh X11 forwarding，可参考其随机 cookie、xauth、Unix/TCP fallback 与通道生命周期设计，但实现保持 NexaTerm 自己的数据/错误模型。
- ezTerm（GPLv3）展示了 Windows + VcXsrv 的产品形态，只参考架构/UX，不复制 GPL 代码。
- VcXsrv 本身 GPLv3；是否随 NexaTerm 分发属于 WS-N04 单独的许可证/安装器决策，本切片不把它打进安装包。

## Out of scope

- 本切片不把 GPL X server 打包进 NexaTerm；
- 不承诺 Windows 开箱即用 X11；
- 不实现完整 OpenSSH `-X` / `-Y` trusted/untrusted SECURITY extension 语义；
- 不改 RDP/VNC；
- 不提前做 WF-07；
- 不修改 `scripts/line-budget.json`。

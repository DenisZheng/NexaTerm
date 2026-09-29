# NexaTerm vs 上游 mXterm：差异化一页纸

## 一句话

NexaTerm 是 mXterm 的 hard fork：继承它的 Rust + Tauri 轻量架构，但走一条独立的产品路线——**现代化、跨平台的 SSH/SFTP 优先工作台，MobaXterm 式工作流**。

## 与上游的关系

- Fork 自 `syscryer/mxterm`（MIT），hard fork：不以合并回上游为目标。
- 上游仍在活跃开发；NexaTerm 只定期评估上游的**安全修复**做 cherry-pick，不跟进功能。

## 今天已经不同的（已落地）

- 独立发布身份：bundle ID `com.nexaterm.app`、自有更新签名密钥与更新通道——更新从本仓库的 GitHub Release 获取，不再指向上游。
- 安全加固：vault 本地密钥文件强制 0600；SSH 隧道本地监听强制 loopback（LAN 绑定直接拒绝）。
- 品牌与文档：NexaTerm 命名、中文文档体系。

## 方向上的不同（路线图）

- **SSH/SFTP 优先**：v1 收敛到 SSH 日常流（连接管理、SFTP、分屏、批量执行）；RDP/VNC/X11 标 experimental，进 v2 再说。
- **MobaXterm 式工作流**：统一会话入口、MobaXterm 会话导入（迁移 on-ramp）、运维工具面板——而不是"又一个终端 + 一堆协议"。
- **AI/MCP**：默认关闭、按命令审批；先把安全边界做实再谈能力。

## 诚实说明

- 目前用户可感知的差异还很小：大部分提交是发布身份、安全修复和文档，功能层面的分叉刚起步。
- 上面"方向上的不同"是路线图，不是现状。v1 的 SSH 日常流公开试用版，是验证这条路线的第一步。

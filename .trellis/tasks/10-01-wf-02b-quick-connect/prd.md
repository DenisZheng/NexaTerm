# WF-02B Quick Connect 临时会话

> 前置：WF-02A / A03 已通过真实 Tauri 验收并合入 main `17f0bc5`；main CI #157 全绿。
> 用户流程：**Quick Connect 输入地址 → 补齐认证 → 临时 SSH 终端与 Files 可用 → 可保存为正式会话；取消/失败不留伪配置。**
> 验收：**A04**。规则：WS-C03～WS-C07、WS-F07。

## Requirements

1. 结构化解析 `user@host` 与 `ssh://user@host:port`；默认端口 22。
2. URL 不接受密码；IPv6、端口 1–65535、空白和非法输入均有明确结果与测试。
3. Quick Connect 默认只创建临时上下文，不写正式连接数据库，不污染最近成功记录。
4. 用户名或认证材料缺失时复用现有连接步骤/Host Key UI。
5. Rust 内存上下文持有认证材料和完整 `ResolvedSshConfig`；前端长期状态只持非敏感目标元数据和 opaque context ref。
6. 同一临时 context 要同时支持终端和 SFTP/Files。
7. 关闭最后一个所属实例时释放临时 context；认证失败允许重新询问凭据，网络失败可重试同一 context。
8. “保存为会话”写入正式 profile 后把当前实例关联到新 profile，不隐式重复建立终端。
9. 保存后重启应用，Sessions 能找到正式配置；取消/失败时不存在伪配置或孤立临时 context。

## Delivery slices

- **B1 临时终端**：地址 parser + Quick Connect 入口 + Rust temporary context + SSH terminal + close/retry lifecycle。
- **B2 临时 Files/SFTP**：remote_file 公共解析入口支持 saved id / temporary ref，已保存与临时 SSH 文件能力一致。
- **B3 保存为会话**：临时 context 转正式 profile 关联，不重连；完成 A04 真实 GUI 验收。

## Out of scope

- Files 左侧真实视图迁移、目录跟随与 pane 请求防串（WF-03）。
- RDP/VNC/Telnet Quick Connect。
- 把 URL 交给 shell、接受 URL 密码、自动插入伪正式 profile。

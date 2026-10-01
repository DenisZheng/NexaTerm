# WF-02A 保存并连接

> 前置：WF-01 已在 main `a4ba7b2` 收口，main CI #152 全绿且真实 GUI 验收通过。
> 用户流程：新建连接 → 填写配置 → **保存并连接** → 只产生一个新运行实例；也可“仅保存”。编辑已有配置默认只保存，不打断现有实例；需要新连接时显式“保存并新建连接”。
> 验收：**A03**。规则：WS-C01、WS-C02、WS-C07。

## Requirements

1. 新建/复制主操作“保存并连接”，辅助“仅保存”；提交中不可重入。
2. 编辑主操作“保存连接”，不终止或重连已有实例；辅助“保存并新建连接”。
3. 保存后的权威 `ConnectionProfile` 回到 shell；只有 `save-and-connect` 才创建运行实例。
4. 显式新建绕过普通入口的“激活已有实例”语义；普通 Sessions 打开行为保持原样。
5. 继续复用现有 SSH 认证/Host Key、RDP/VNC runner、Telnet/Serial runtime。
6. 测试连接仍不保存、不打开运行实例。

## Acceptance

- [ ] 新建保存并连接只保存一条 profile、只新增一个实例。
- [ ] 仅保存不打开实例。
- [ ] 编辑保存不影响现有实例。
- [ ] 编辑保存并新建连接只新增一个实例。
- [ ] prompt/password/private-key/PPK/Host Key 流程无回归。
- [ ] 自动化、CI、真实 Tauri A03 GUI 验收通过。

## Out of Scope

Quick Connect / 临时 Rust 上下文 / A04（WF-02B）；Files 真实视图（WF-03）。

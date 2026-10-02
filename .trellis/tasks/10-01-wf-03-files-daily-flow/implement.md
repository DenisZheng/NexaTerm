# WF-03 执行记录

## 03A 左侧真实 Files

- [x] 创建 stacked 分支 `feat/wf03a-left-files-view`。
- [x] 导出 `RemoteFilesView`，复用 RemoteFilePanel 文件状态与请求保护，隐藏右侧工具 tabs。
- [x] WorkspaceSidebar 有 SSH context 时渲染真实 Files；无 SSH context 继续 fail-closed。
- [x] stateKey 继续使用 terminal tab id，支持同 saved connection 多实例隔离。
- [x] 右侧 SSH 工具移除 Files tab；文件定位动作改为左侧 Files。
- [x] 同 connectionId 两 pane 不同目录 selector 测试。
- [x] WF-03A source gate 接 CI。
- [ ] PR / CI。

## 03B

- [ ] 跟随终端目录状态按实例保存。
- [ ] 快速 pane 切换与慢请求过期保护自动化。
- [ ] 断线/重连目录状态。

## 03C

- [x] 编辑冲突与 dirty close 回归。
- [ ] 传输队列/retry/关闭实例策略。
- [x] A05/A06 真实 GUI 验收。

## 2026-10-02 真实 GUI 验收前置阻塞

沿用主线与当前分支，按用户要求改用现有 SSH 连接及独立目录，不启动容器。启动时系统钥匙串授权未完成，前端误显示“创建加密保险库”；已修正未知状态和显式重试流程。用户确认“已恢复，原连接可直接连接”。证据与验证边界见 [保险库启动恢复记录](../../../docs/research/wf03-vault-startup-gate.md)。此确认仅解除启动阻塞，不替代 A05/A06 验收。

## 2026-10-02 A05 / A06 真实验收进展

- A05：同 profile 两实例目录隔离、快速焦点切换、Files 跟随、sibling context 隔离、断线不借用 sibling Files、原逻辑 pane 重连均获用户确认通过。慢响应逆序返回仍区分为自动化证据。
- A06：打开测试 txt 时稳定失败，确认远端 ImmortalWrt 没有 GNU/BSD/BusyBox `stat`。文件存在、可读，SFTP 下载已落盘且内容一致。
- 已将编辑器元数据与版本校验收拢到 `remote_files/metadata.rs`；仅 mtime 探测失败时读取严格校验的 SFTP 属性，保存沿用真实 mode，不降低 mtime/size 冲突检测。
- 相关 Rust 测试 35/35 通过（新增 11 项），editor / WF-03 / line-budget 门禁通过。Tauri watcher 重编译后，用户确认“能打开，内容正确”；冲突提示及三个入口、取消不覆盖、重新加载、dirty close 取消保留和明确放弃均获真实 GUI 确认，A06 通过。
- 完整操作、证据与未覆盖边界见 [真实 Tauri 验收记录](../../../docs/research/wf03-real-tauri-acceptance.md)。

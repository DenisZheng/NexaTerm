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

- [ ] 编辑冲突与 dirty close 回归。
- [ ] 传输队列/retry/关闭实例策略。
- [ ] A05/A06 真实 GUI 验收。

# WF-03 设计

## 03A

现有 `resolveWorkspaceSidebarFileContext` 已能在非 split 模式绑定 active SSH tab，在 split 模式 fail-closed 地绑定 focused SSH pane；03A 不重写 selector。

`RemoteFilePanel` 增加 files-only 的 `RemoteFilesView` 外观：共享原有目录状态、请求 generation、拖放、编辑/传输回调和 tab stateKey，但不显示右侧工具 tabs。左侧 Files 使用 `ssh-file-panel:<terminalTabId>` 作为 stateKey，因此同一 saved profile 的两个运行实例不会共享目录缓存。

右侧 SSH 工具移除 Files，仅保留 monitor / commands / tools / tunnels / AI。现有“定位远程文件所在目录”动作改为展开左栏并切 Files。

## 03B / 03C

03B 在实例级 owner 中增加 follow state；不向终端写探测命令，只消费已有 OSC7/简单 cd 路径。手动浏览自动暂停的具体 UX保持待确认。

03C 不改 RemoteFileEditor 的 mtime/size 冲突语义，重点验证布局迁移不破坏 dirty close、transfer retry 和连接生命周期。

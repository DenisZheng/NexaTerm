# 技术方案

沿用 `aef55f8` 的最小修复。`WorkspaceSnapshotV1.files` 增加可选 `followTerminalDirectories`，键为 `ssh:<逻辑 tab id>`，值为 boolean；V1 版本不变，旧快照缺失字段时沿用默认关闭。

数据路径：RemoteFilesView 的实例开关 → `publishWorkspaceRemoteFileNavigation` → bridge revision 通知 → WorkspaceShell 的 `toSnapshot` → 既有 500ms debounce / 串行保存 → JSON 解码 → `seedWorkspaceRemoteFileDirectories` → 实例面板恢复。继续使用原有 SQLite snapshot 存储与 Tauri 命令，不增加后端接口或依赖。

投影只保留当前 SSH 实例，解码只接受仍存在 SSH 实例的 boolean；同 profile 的实例仍使用不同 ID。全局 `followActivePane` 保持原语义。目录不变而开关改变时 revision 仍须更新。

兼容性重点是 #42 对组件测试的 locale 初始化以及 #43 的 Files 工具栏和实例标题；保留这两项，只移植快照接线。没有 UI 布局/产品规则变更。若 cherry-pick 有冲突，逐处按当前 main 的行为解决；若发现需改方案或扩大范围，停止说明。

回滚可撤销本分支补丁；旧读取器忽略新增可选字段，原 snapshot 字段保持兼容。人工验收前不修改用户数据库或凭据。

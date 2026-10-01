# WF-02A 设计

- `ConnectionDialog` 只表达 `save | save-and-connect` 意图。
- 新建/复制：primary = 保存并连接；secondary = 仅保存。
- 编辑：primary = 保存连接；secondary = 保存并新建连接。
- `saveConnectionFromDialog` 先拿到 `saveConnection()` 返回的保存 profile，再按 intent 启动。
- `openNewConnectionSession` 是显式创建路径：SSH → `startConnectionStep`；RDP/VNC → starter；Telnet/Serial → `openCharacterTerminalInConnection`。
- RDP/VNC starter 收窄为纯创建器；普通 `open*ConnectionSession` 仍先复用已有实例，因此旧行为不变。
- 继续用 Dialog 的 `busyRef` 防止重复提交；辅助按钮先 `reportValidity()`。

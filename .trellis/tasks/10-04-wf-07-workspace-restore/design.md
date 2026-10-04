# WF-07 Design

## Storage

Do not store workspace snapshots in `app_settings`: all app settings are exported by current WebDAV sync. Workspace layout is machine-local and may contain machine-specific Local/WSL/RDP/VNC references.

Add a dedicated singleton `workspace_snapshots` SQLite table:

- `current_json`
- `backup_json`
- `updated_at`

A save performs one SQLite UPSERT that copies previous `current_json` into `backup_json` before replacing current. This makes the previous valid snapshot available when a future schema decoder fails.

The Tauri command boundary accepts JSON but rejects:
- non-object payloads;
- payloads above the fixed size limit;
- recursively nested keys that look like passwords, passphrases, private keys, session ids, X11 cookies, runtime credentials, secrets/tokens, or broadcast state.

## Decode / rollback

Frontend decoding owns schema versions. V1 is parsed into a fresh object rather than trusted by type assertion.

Load policy:
1. decode current;
2. if invalid/unsupported, decode backup;
3. if backup succeeds, use it and report `source=backup`;
4. if both fail, start with an empty workspace instead of mutating persisted data.

Unknown future versions are never guessed into V1.

## Restore plan

The planner is pure and does not connect anything.

Each snapshot instance becomes one restore item:
- `ready`: referenced saved profile exists;
- `temporary-auth-required`: temporary reference is structurally valid but cannot silently restore credentials;
- `missing-profile`: saved profile was deleted.

Failures are item-local.

The plan carries the sanitized order/panes/Files/sidebar shell and always reports `multiExecMode="off"`. Auto reconnect candidates are derived only from an explicit boolean supplied by the caller; missing/temporary items never auto reconnect.

## 07B ordering

Startup ordering is intentionally two-phase:
1. load snapshot and restore shell projection;
2. schedule reconnect attempts.

This prevents slow network/auth/Host-Key prompts from blocking layout restoration.

## 2026-10-04 验收前审查修复

- 恢复 hook 通过 layout 层提供的 runtime 注入加载、保存、计时与错误报告，workspace 层不直接依赖 Tauri/DOM。
- 一次性加载只在成功处理结果后完成；就绪条件撤销时丢弃旧结果并允许重试，普通快照变化不取消加载。保存按序列化内容 debounce，不按对象引用重置，并串行提交避免慢请求覆盖新布局。
- SSH 每次连接 attempt 使用独立请求标识，原位恢复保留逻辑 tab ID；重试和 Host Key/凭据续接也不复用旧 attempt 的输出通道。
- Files 保存活动浏览目录，重启时恢复从根到该目录的导航，保留现有树形浏览方式。
- 正常删除 profile 仍关闭对应实例。A14 缺失目标通过应用完全退出后，将一个专用测试实例的快照引用替换为不存在的 profile ID 构造；工具保留原快照到 backup，提供逆向恢复，不删除任何真实 profile 或凭据。

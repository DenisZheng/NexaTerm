# WF-02B 设计

## B1：temporary context

`TemporaryConnectionManager` 是 Rust 进程内 context registry。创建时只保存 owner、host、port、可选 username；用户在现有认证 UI 提交后，Rust 使用 `resolve_transient_connection` 复用当前 SSH 校验逻辑，并把得到的 `ResolvedSshConfig` 保存在内存中。

前端 React state 只保留临时 profile 的目标元数据和 opaque `temp-ssh-<uuid>` 引用。密码/私钥口令只在现有 prompt 表单提交瞬间存在，提交到 Rust 后立即从 running step 投影中清空，不写 localStorage/workspace snapshot。

终端连接只向后端传 context ref + PTY 尺寸。Rust 从内存 context 取完整配置后调用既有 `TerminalManager.connect`；Host Key 继续走现有 known_hosts。

生命周期：
- 创建 Quick Connect → context 存在但未持有认证配置。
- 用户提交凭据 → context 持有完整运行配置。
- 认证类失败 → 回 prompt，可覆盖 context 凭据。
- 网络类失败 → 同一 context 重试。
- 最后一个对应 terminal tab 关闭 → release context。
- B2 接入 Files 后，活动传输/编辑收尾规则在该切片补齐。

## B2：Files/SFTP

不复制一套 remote_file 命令。公共 connection-context resolver 应先识别 temporary ref，再回退 saved profile，并向现有 `RemoteFileManager` 统一提供 `ResolvedSshConfig`。

## B3：保存为会话

保存动作从 temporary context 获取非敏感目标配置并经现有 `connection_upsert` 创建正式 profile；当前实例只替换逻辑 profile 关联，不重新打开 terminal。认证材料按用户选择写入现有 vault/credential 体系。

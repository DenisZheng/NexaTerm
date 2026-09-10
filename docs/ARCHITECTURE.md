# 当前架构与演进边界

## 1. 分层图

```
React entry: src/main.tsx
  └─ App.tsx
      ├─ query-selected VNC runner window
      └─ lazy WorkspaceShell.tsx
          ├─ connection tree / tabs / split / panels
          ├─ terminal, remote files, monitor, RDP/VNC UI
          └─ shared/tauri/commands.ts (typed invoke wrappers)
              └─ Tauri invoke_handler (src-tauri/src/commands.rs)
                  ├─ connections / credentials / known_hosts
                  ├─ TerminalManager + local/SSH/serial/telnet/PTY
                  ├─ remote_files / monitor / Docker / tunnels
                  ├─ RDP/VNC runner managers
                  └─ storage SQLite/Vault/WebDAV/AI-MCP
```

Rust 事件常量在 `src-tauri/src/events.rs`：`terminal:output`、`terminal:state_changed`、`terminal:connect_progress`、`terminal:error`、transfer/docker/RDP/AI stream 等。事件提供异步反馈，typed command 提供请求/响应；二者是当前最重要的跨层边界。

## 2. 模块、接口和深度

### 入口与首屏

`main.tsx` 负责启动主题、窗口几何恢复和轻量 App 动态 import；`App.tsx` 仅根据 query 选择视图并包裹 Suspense。当前启动边界检查通过，符合“重模块不进入首屏”的长期约束。任何后续设置、Monaco、noVNC、监控、Docker、AI 或终端修改都不能把静态 import 拉回入口。

### WorkspaceShell 编排层

`src/layout/WorkspaceShell.tsx` 约 14,381 行，约 65 个 import、108 个 `useState`、40 个 `useEffect`、29 个 `useMemo`、20 个 `useCallback` 和 464 个本地函数。它同时维护 active connection/tab/view、terminal/rdesktop/VNC session、command sender history/targets、split layout/sync、remote file tabs/layout、settings/tool 状态，并创建大量 lazy feature loader。这里的模块深度低于其职责广度：调用者、状态、渲染和副作用混在一个文件，导致测试局部性差、恢复和错误隔离难。

### Rust 运行时层

`src-tauri/src/lib.rs` 注册约 31 个模块、多个 managed state，并把约 115 个 command 汇入 handler。连接/known-host/session/PTY、remote files、tunnels、RDP、VNC、storage、Vault、WebDAV、MCP 已按领域分模块，整体边界比 WorkspaceShell 清晰。风险集中在 manager 生命周期、错误序列化和跨模块事件语义，而不是缺少所有底层能力。

### 数据层

`storage_sqlite.rs` schema 版本为 2，包含 connection groups、credentials、connections、known_hosts、tunnels、commands、AI sessions/messages 等；`storage_migration.rs` 负责 legacy JSON→SQLite/Vault 的备份、journal、rollback。Vault 以 Argon2id 派生密钥并使用 AES-256-GCM。当前没有 workspace snapshot/session layout 的独立 schema，窗口几何仍由前端 localStorage 处理。

## 3. 运行时数据流

1. React 组件发起 `commands.ts` typed wrapper。
2. Tauri invoke 分发到 `commands.rs`，验证输入并调用领域 manager/repository。
3. 长任务通过 `events.rs` 发出 output/progress/state/error。
4. WorkspaceShell 将响应和事件合并进局部状态，驱动 tab、panel、split 和 runner UI。
5. 退出/重连时 Rust manager 清理 PTY、reader、forward channel 或外部 runner；前端应保留 workspace 描述而不把一次 session 失败升级为全局失败。

## 4. 模型所有权表

| 模型 | 当前单一事实来源 | 需要守住的边界 |
| --- | --- | --- |
| ConnectionProfile | Rust connections + SQLite，前端树为投影 | 保存/校验/API 字段同步 |
| Runtime session | Rust TerminalManager/RDP/VNC manager | 句柄和子进程不能泄露到 React |
| Tab/view | WorkspaceShell state | 先 characterization，再抽 state seam |
| Split/sync | WorkspaceShell handlers + terminal views | 纯状态转换与副作用分离 |
| Workspace snapshot | 尚未实现完整模型 | 必须先定义版本、局部失败和迁移 |
| Secrets | VaultState/encrypted files | UI 只收到最小必要结果，日志不含秘密 |
| Events | Rust event constants + payload structs | 事件名、payload、订阅/取消生命周期固定 |

## 5. 渐进式 seam

1. **WorkspaceState seam**：包装 active IDs、tab/view/snapshot 选择和恢复状态，先不改变渲染。
2. **SessionTabs seam**：把 tab 建立、关闭、激活和运行时 session 映射抽为可测试状态转换。
3. **SplitWorkspace seam**：把布局、pane、sync input 和 command sender target resolution 分离。
4. **Feature controllers**：FileWorkspace、ToolPanelController、CommandSenderController 只接收已定义的 state/actions。
5. **Runner adapters**：将 RDP/VNC 启动、退出、错误和窗口生命周期统一为可观察状态；平台实现留在 Rust。
6. **Persistence adapter**：Workspace snapshot 与 SQLite migration 独立，读取/恢复失败按 session 隔离。

这些 seam 是切分顺序和所有权假设，不是本轮要新增的公共 API。

## 6. 关键失败路径

- SSH/PTY：连接失败、host key changed、认证失败和 reader 退出必须有区分状态；不能通过隐藏输出制造成功。
- SFTP/remote files：请求超时或权限错误不得破坏其它 tab。
- Tunnel：bind/forward/SOCKS 任一失败应可停止并释放资源，日志需脱敏。
- RDP/VNC：runner 缺失、退出码、窗口关闭和网络断开需映射到 session 状态；不得让外部进程错误崩溃主窗口。
- Restore：快照格式错误、单连接凭据不可用、host key 未信任时，仅该项失败并保留其它 workspace。
- MCP：远程监听、token、危险命令开关和 sidecar 生命周期是独立安全边界。

## 7. 当前架构结论

Rust 领域模块和入口 lazy boundary 是可复用的结构资产；最大杠杆不是重写 Rust 或 UI，而是把 WorkspaceShell 中的状态所有权、事件适配和失败隔离逐层深化，并用测试固定现状。所有后续任务应避免复制状态或增加第二套存储事实来源。

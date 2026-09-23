# 当前架构与演进边界

> 2026-09-23（WF-00A）：本文区分三类内容——**现有结构**（§1–§4 描述的代码事实）、**选定方向**（§5a，已由维护者确认的目标模型，规则正文在 `docs/WORKFLOW_SPEC.md`）、**待实现项**（§5b，按 WF 包落地）。§5 原"渐进式 seam"列表保留，并标注对应 WF。

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

`src/features/layout/WorkspaceShell.tsx` 在 2026-09-09 审计时约 14,381 行、108 个 `useState`、40 个 `useEffect`；2026-09-23 按 `git show 45418f3:… | Measure-Object -Line` 为 13,076 行，split / sync / 会话指针已进 `src/features/workspace/` reducer（见 §4）。它仍维护五类会话集合、command sender history/targets、remote file tabs/layout、settings/tool 状态，并创建大量 lazy feature loader。这里的模块深度低于其职责广度：调用者、状态、渲染和副作用混在一个文件，导致测试局部性差、恢复和错误隔离难。行数不是里程碑；后续按 WF 包只在流程需要处继续抽取。

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
| ConnectionProfile | Rust connections + SQLite，前端树为投影 | 保存/校验/API 字段同步；树形分组的 `parentId` 目前只在 localStorage，SQLite 组仍平面（WF-04A） |
| Runtime session | Rust TerminalManager/RDP/VNC manager | 句柄和子进程不能泄露到 React；不作为实例身份、不进快照（WS-M01） |
| Split | `src/features/workspace/split/` reducer + controller（2026-09-19） | 纯状态转换与副作用分离；`terminalSplitMaxPanes = 4` 本轮不扩展 |
| Sync（MultiExec 雏形） | `src/features/workspace/multiExec/` reducer，仅 `off\|live` + targets + error | 目标改为会话实例（WS-X03，WF-04C）；不先固化"每连接一个目标" |
| Tab/view 指针 | `src/features/workspace/sessionTabs/` `SessionPointerState`（7 指针 + view + mode + homeActive + 2 记忆表） | 关闭/删除路径仍在 shell 内多 setter（WF-00B） |
| 会话集合 | WorkspaceShell 五个 useState（terminalTabs / localTerminalTabs / rdpSessions / vncSessions / remoteFileTabs） | 先用 selector 投影为实例视图（WS-M05，WF-01），不复制第二份数据 |
| Workspace snapshot | 尚未实现完整模型 | 契约在 WF-01 定义（WS-R01）、实现在 WF-07；只含非敏感引用 |
| Secrets | VaultState/encrypted files | UI 只收到最小必要结果，日志不含秘密；临时会话认证材料由 Rust 内存上下文持有（WS-C06） |
| Events | Rust event constants + payload structs | 事件名、payload、订阅/取消生命周期固定 |

## 5. 渐进式 seam（原 2026-09-09 列表，标注 WF 去向）

1. **WorkspaceState seam**：包装 active IDs、tab/view/snapshot 选择和恢复状态，先不改变渲染。→ 指针部分已完成（Task 04 2c）；实例投影 → WF-01。
2. **SessionTabs seam**：把 tab 建立、关闭、激活和运行时 session 映射抽为可测试状态转换。→ 激活已完成；关闭/删除 → WF-00B。
3. **SplitWorkspace seam**：把布局、pane、sync input 和 command sender target resolution 分离。→ split 已完成；target resolution → WF-04C。
4. **Feature controllers**：FileWorkspace、ToolPanelController、CommandSenderController 只接收已定义的 state/actions。→ Files 视图抽出 → WF-03；MultiExec → WF-04C。
5. **Runner adapters**：将 RDP/VNC 启动、退出、错误和窗口生命周期统一为可观察状态；平台实现留在 Rust。→ WF-05。
6. **Persistence adapter**：Workspace snapshot 与 SQLite migration 独立，读取/恢复失败按 session 隔离。→ WF-07。

这些 seam 是切分顺序和所有权假设，不是本轮要新增的公共 API。

### 5a. 选定方向（已确认，规则正文见 WORKFLOW_SPEC）

- 三层模型：保存配置 / 工作区会话实例 / 底层运行时句柄（WS-M01）；顶层标签代表实例（WS-M02）；当前上下文 = 活动工作区项 + 活动 pane（WS-M03）。
- 左侧 Sessions / Files 切换，Files 绑定活动 pane 的 SSH 上下文（WS-E04、WS-F01）；次级工具面板位置待确认（WS-E06）。
- 统一动作入口：菜单、工具栏、上下文菜单、快捷键共用动作与能力判断，复用 `src/features/shortcuts/`（WS-E01、WS-E10）。
- MultiExec 三态 `off/live/send`，目标为会话实例（WS-X03）。
- 临时会话（Quick Connect）的认证与 SFTP 上下文由 Rust 内存上下文持有，前端只持不透明引用（WS-C06）。
- 能力对象区分平台、依赖、可用模式与失败原因（WS-P02）。
- 恢复快照只含非敏感引用（WS-R01）。

### 5b. 待实现项（按 WF）

| 项 | WF | 拟触及模块（建议，非既定文件） |
| --- | --- | --- |
| 关闭/删除纯决策 action 与编排接入 | WF-00B | `sessionTabs/{actions,reducer,selectors}`、`WorkspaceShell` |
| 实例投影 selector、顺序表、统一动作入口、i18n 基础 | WF-01 | `sessionTabs/selectors`、`AppTitlebar`、`shortcuts/`、新 i18n 资源 |
| 保存并连接 / Quick Connect 解析与临时上下文 | WF-02A/B | `ConnectionDialog`、`saveConnectionFromDialog`、`runConnectionStep`、Rust `commands.rs` / `TerminalConnectRequest` |
| Files 视图抽出与 pane 绑定、跟随开关 | WF-03 | `RemoteFilePanel`、`remoteFilePanelStrategy`、`TerminalPanel` OSC7 |
| 分组树 schema 与迁移、批量打开、实例目标 MultiExec | WF-04A/B/C | `ConnectionPane`、`storage_sqlite.rs`、`sync_snapshot.rs`、`connection_transfer.rs`、`multiExec/`、`TerminalSplitSurface` |
| 能力对象与协议入口 | WF-05 | `platformCapabilities.ts`、`local_profiles.rs`、RDP/VNC provider |
| 隧道入口、多跳、X11 | WF-06A/B/C | `TunnelPanel`、`terminal/session.rs`、新 X11 模块（先 spike） |
| 快照持久化与恢复规划 | WF-07 | 拟新增 `src/features/workspace/restore/`、Rust storage/migration |

## 6. 关键失败路径

- SSH/PTY：连接失败、host key changed、认证失败和 reader 退出必须有区分状态；不能通过隐藏输出制造成功。
- SFTP/remote files：请求超时或权限错误不得破坏其它 tab。
- Tunnel：bind/forward/SOCKS 任一失败应可停止并释放资源，日志需脱敏。
- RDP/VNC：runner 缺失、退出码、窗口关闭和网络断开需映射到 session 状态；不得让外部进程错误崩溃主窗口。
- Restore：快照格式错误、单连接凭据不可用、host key 未信任时，仅该项失败并保留其它 workspace。
- MCP：远程监听、token、危险命令开关和 sidecar 生命周期是独立安全边界。

## 7. 当前架构结论

Rust 领域模块和入口 lazy boundary 是可复用的结构资产；最大杠杆不是重写 Rust 或 UI，而是把 WorkspaceShell 中的状态所有权、事件适配和失败隔离逐层深化，并用测试固定现状。所有后续任务应避免复制状态或增加第二套存储事实来源。

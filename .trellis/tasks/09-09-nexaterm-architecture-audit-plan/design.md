# 设计说明：NexaTerm 基线审计与渐进式架构深化

## 1. 设计目标

本阶段的设计对象是“如何可靠地验证和拆解需求”，不是新产品功能。输出必须让后续开发者能从证据追溯到源码，再从差距追溯到任务，不以“大重写”掩盖局部根因。

## 2. 当前系统边界

```
React entry (main.tsx)
  └─ App.tsx (query-selected view + Suspense)
      └─ WorkspaceShell.tsx (workspace orchestration hotspot)
          ├─ feature panels / dialogs / terminal tabs
          └─ shared/tauri/commands.ts (typed invoke wrappers)
              └─ Tauri invoke_handler (src-tauri/src/commands.rs)
                  ├─ connection/session/PTY managers
                  ├─ remote files/SFTP, tunnels, monitor, Docker
                  ├─ RDP/VNC runners and lifecycle managers
                  └─ SQLite/Vault/WebDAV/AI-MCP persistence and events
```

前端状态与 Rust 持久/运行时状态目前通过 typed command、Tauri event 和局部 React state 连接。事件常量集中在 `src-tauri/src/events.rs`，但跨模块状态归属仍主要由 WorkspaceShell 组合。

## 3. 状态与模型盘点

| 模型/状态 | 当前归属 | 证据 | 主要风险 |
| --- | --- | --- | --- |
| Connection profile | Rust connections/storage + 前端连接树 | `connections/mod.rs`、`storage_sqlite.rs` | 前后端校验和展示契约需持续同步 |
| Session/PTY | Rust TerminalManager、terminal/session/local/serial/telnet | `src-tauri/src/terminal/` | reader/thread/task 清理跨协议一致性 |
| Tab/view | WorkspaceShell 局部 state | `WorkspaceShell.tsx` 状态区约 880-1078 行 | 组合状态耦合，难以隔离恢复和测试 |
| Split | WorkspaceShell split state + terminal/sync handlers | `WorkspaceShell.tsx`、terminal panels | 多 tab、同步输入和重连状态容易产生交叉副作用 |
| Command Sender | WorkspaceShell history/targets/controller | source checks 与组件实现 | 契约漂移，激活 SSH tab 未完全同步 |
| Remote files | Rust remote_files/storage + lazy panels | `remote_files`、`RemoteFilePanel` | 文件 tab、编辑器和 session 生命周期耦合 |
| Workspace persistence | 当前仅 window geometry localStorage | `windowState.ts` | 没有 schema、版本和失败隔离的会话恢复 |
| RDP/VNC | Rust manager + platform/external runner + lazy UI | `rdp.rs`、`vnc.rs` | 外部进程失败和平台差异可能影响工作区 |
| Vault/secrets | Rust VaultState + encrypted files | `storage_vault.rs`、`secure_bundle.rs` | 错误传播、日志和迁移必须防泄露 |

## 4. 接口和 seam

当前最深的稳定接口是 typed Tauri command 与事件边界；它把 React 视图和 Rust 运行时隔开，但 `WorkspaceShell` 仍承担过多编排责任。优先寻找以下 seam：

1. **Workspace state seam**：集中描述 active connection/tab/view、恢复快照和跨面板选择，先包住现有状态，不改变外部行为。
2. **Session/tab seam**：把 tab 生命周期、连接状态和终端句柄的映射从渲染细节中分离，便于 reducer/状态测试。
3. **Split/sync seam**：把 split layout、输入同步和 command sender 目标解析成独立的纯状态转换。
4. **Runner adapter seam**：RDP/VNC 的启动、状态、退出和错误统一为生命周期适配层，平台 runner 细节留在 Rust。
5. **Persistence seam**：Workspace snapshot 使用独立 schema 版本和迁移策略，失败时按 session 隔离，不阻塞其他连接。

这些是渐进式切点，不是现在就新增公共接口。每个切点都应先由 characterization tests 固化现状，再做小批量移动。

## 5. 生命周期与失败隔离

- PTY/SSH/SFTP：连接、reader、子进程和 forward channel 必须有明确关闭路径；重连不能销毁 workspace 描述。
- RDP/VNC：runner 启动失败、退出、窗口关闭和外部依赖缺失都转换为可观察状态，不得让未处理异常穿透到主窗口。
- Workspace restore：快照读取、单 session 恢复和 credentials/known-host 校验分步执行；单项失败只标记该项，不吞错。
- Tunnel：本地 bind、remote forward、dynamic SOCKS 启停必须可观测，bind 地址和权限属于安全策略而非 UI 默认值。

## 6. 设计取舍

- **渐进提取优于重写**：保留当前 Tauri command/event 及模块边界，先抽局部控制器；降低回归面并允许每阶段回滚。
- **证据优先于状态标签**：需求表的 Confirmed 只有在源码和测试链路同时支持时才可升级为运行时确认。
- **平台能力显式化**：RDP、Serial、VNC、X11 和外部 runner 通过 capability matrix 表达，不用隐藏失败或静默降级。
- **迁移可逆**：SQLite schema 变更必须有 version、backup/rollback 和旧数据兼容路径，Workspace 快照失败不应损坏连接数据。
- **许可证文件级处理**：MPL 代码保持文件边界和版权/许可证通知，第三方清单与构建产物同步生成。

## 7. 设计风险

- 在依赖未安装时把 source-check 失败误报为功能缺失。
- 在 `WorkspaceShell` 抽取时复制状态而不是建立单一所有权，造成双写。
- 先做 UI 恢复入口而未定义 schema/迁移，导致不可回滚的脏快照。
- 将 RDP/VNC “能启动 runner”误认为跨平台互操作通过。
- 用去重、过滤或吞异常掩盖 terminal/PTY/event 根因；后续任务必须保留真实错误语义。

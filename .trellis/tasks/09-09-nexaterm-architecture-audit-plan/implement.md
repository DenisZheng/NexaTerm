# 执行说明：审计产物与后续任务编排

## 本轮执行（只做规划）

1. 固定需求来源：`AGENTS.md`、`NEXATERM_REQUIREMENTS.md`、Trellis workflow/spec。
2. 对 React/Rust 入口、WorkspaceShell、typed IPC、事件、terminal/PTY、RDP/VNC、storage/migration、Vault、WebDAV、MCP 做静态追踪。
3. 执行可安全执行的 source checks、Node 脚本测试、pnpm audit；记录缺失的 node_modules、Rust toolchain、cargo audit/deny 和真实平台环境。
4. 生成 `docs/` 审计文档和 `docs/tasks/` 可执行任务，不改产品源代码。

## 后续实现顺序

- Phase 0：重现基线并补齐工具链，锁定证据快照。
- Phase 1：安全/依赖、许可证、前端测试基础和平台矩阵。
- Phase 2：WorkspaceShell 状态 seam、session/tab/split characterization tests。
- Phase 3：Workspace Restore schema、迁移、失败隔离。
- Phase 4：Command Sender/MultiExec、Proxy/Jump、RDP/VNC/X11 capability 任务。
- Phase 5：i18n、品牌一致性、性能/稳定性和三平台互操作。
- Phase 6：发布签名、公证、SBOM/第三方清单和最终验收。

## 每项任务的执行规约

- 启动前重新读取 AGENTS、需求文档、架构文档和任务文件，并检查 `git status --short`。
- 先写失败测试或 characterization test，再做最小变更；跨层契约同步更新。
- UI 变更沿用现有 Radix/Lucide/共享 token；重模块维持 lazy boundary。
- 每阶段执行适用的 `pnpm run check`、`pnpm run build`、Rust tests、source checks 和平台命令；环境阻塞必须单独记录。
- 发现需求偏差时更新 `CURRENT_STATE.md`/差距文档和任务完成报告，不创建虚假成功状态。
- 每个任务保留回滚点：代码小批量、schema 可逆、runner/平台能力可禁用但不隐藏真实错误。

## 质量门禁

- 无 Critical/High 未评估依赖漏洞；cargo audit/deny 和 npm audit 均有可复核输出。
- 前端核心状态、连接对话框、Session Manager、MultiExec、Workspace Restore、i18n 有自动化测试。
- SSH/Host Key/SFTP、PTY 清理、Tunnel、RDP/VNC runner 错误隔离有集成或平台证据。
- Windows/macOS/Linux build/run matrix 完成；性能基线满足需求中的内存和 10 SSH + Split 场景约束。
- 许可证清单、MPL 文件级通知、bundled binary 和平台 runner 归档完整。
- 提交前人工检查 staged diff 和敏感信息；本审计任务本身不启动实现、不提交、不推送。

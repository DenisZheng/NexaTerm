# NexaTerm 需求基线架构审计与开发规划

## Goal

依据 `NEXATERM_REQUIREMENTS.md`，对当前 mXterm/NexaTerm 仓库进行可复核的源码、配置、测试脚本、依赖锁文件和项目文档审计，产出架构说明、需求差距分析、渐进式开发计划、测试计划、安全审查、许可证审计和可执行任务拆分。本任务只产出基线与规划，不实现产品功能。

## Requirements

- 以真实仓库证据验证需求状态，不把需求文档中的“Confirmed”直接当成运行时事实。
- 覆盖 SSH、Host Key、SFTP、WSL、Serial、Telnet、Jump、Proxy、Local/Remote/Dynamic Tunnel、Split、Sync Input、Command Sender、RDP、VNC、Workspace persistence、Vault、WebDAV、AI/MCP、Monitoring，以及 X11、i18n、前端测试和平台能力。
- 架构审计覆盖 App state、Session/Connection/Workspace/Tab/Split 模型、Rust IPC、PTY 生命周期、RDP/VNC runner 生命周期、存储 schema 和 migration。
- 形成以下文档：`docs/CURRENT_STATE.md`、`docs/GAP_ANALYSIS.md`、`docs/ARCHITECTURE.md`、`docs/DEVELOPMENT_PLAN.md`、`docs/TEST_STRATEGY.md`、`docs/SECURITY_REVIEW.md`、`docs/LICENSE_AUDIT.md`，以及 `docs/tasks/` 下的逐项执行任务。
- 依赖/安全计划必须包含 cargo audit、cargo deny、pnpm audit、russh 升级评估、MPL 文件级义务、bundled binary、secret、host key、tunnel bind 和日志审查。
- 许可证计划必须覆盖 MIT 主许可证、MPL-2.0 依赖、Cargo/pnpm 锁文件、字体/图标/资源、外部二进制、平台 runner、安装器依赖，并规划 `THIRD_PARTY_LICENSES.md`。
- 发展计划必须采用渐进式架构深化，优先处理 `WorkspaceShell.tsx`，禁止大规模重写；每项任务写清依赖、回滚点、验收和跨平台注意事项。
- 不新增依赖、不改变运行时、不修改产品源代码、不提交或推送 Git。

## Evidence Method

每个结论区分四种状态：源码已确认（静态证据充分）、部分确认（只有部分链路或平台）、未发现/缺失、环境阻塞（工具或运行环境缺失）。静态确认不等于三平台互操作通过；真实 SSH、硬件串口、RDP/VNC/X11、性能和签名验证留给后续任务。

## Initial Facts

- 技术栈为 Tauri 2 + React/TypeScript/Vite + Rust；入口 `src/main.tsx`、`src/App.tsx` 保持轻量并使用动态加载。
- `src/layout/WorkspaceShell.tsx` 约 14,381 行，集中持有连接、会话、tab、split、命令发送、远程文件和工具面板状态，是当前最主要的架构债务热点。
- Rust 侧存在连接、known hosts、terminal/PTY、SFTP/remote files、tunnels、RDP、VNC、storage/migration、Vault、WebDAV、AI/MCP 等模块；`src/shared/tauri/commands.ts` 为约 1,246 行的 typed invoke wrapper，Rust command registry 在 `commands.rs`。
- `storage_sqlite.rs` schema 版本为 2，已有迁移与加密 Vault；当前没有保存完整工作区会话布局的表或恢复链路。
- 前端 `package.json` 的 `test` 仍是 no-op；没有 Vitest/jsdom 基线。已有 source checks 和 Node 脚本测试，但部分依赖 TypeScript 或平台工具。
- 初次审计中启动边界检查通过；60 个 source checks 中 40 个通过、20 个失败，其中部分是契约漂移或缺少 node_modules/工具链；直接运行 Node 测试文件得到 4/7 通过、3 个因 TypeScript 缺失阻塞。
- npm 官方 registry 的 audit 结果为 0 critical、5 high、16 moderate、5 low；cargo、cargo-audit、cargo-deny 在当前环境不可用，Rust 依赖结论因此待复核。
- 主许可证为 MIT；package-lock 中发现 MPL-2.0 的 noVNC、双许可证的 dompurify 等，仓库尚未生成 `THIRD_PARTY_LICENSES.md`。

## Scope

- 只读检查源码、配置、锁文件、测试脚本、现有 Trellis spec，并写入本任务的 Markdown 规划产物。
- 给出文件级、命令级证据和后续实现顺序。
- 明确平台、互操作、性能、依赖和发布签名等尚未取得证据的边界。

## Out of Scope

- 任何产品功能、UI、IPC、数据库 schema、依赖版本或运行时行为修改。
- 连接真实服务器、硬件或桌面环境；本轮只定义验证方案。
- 发布、签名、公证、提交、推送、删除用户文件。
- 把外部项目代码直接复制进仓库。

## Acceptance Criteria

- [ ] 七份审计/规划文档及 `docs/tasks/` 任务文件已生成，引用具体源码路径、命令和证据状态。
- [ ] `CURRENT_STATE.md` 为每项能力标出 confirmed/partial/missing/environment-blocked，并注明静态与运行时边界。
- [ ] `ARCHITECTURE.md` 说明状态、IPC、事件、PTY、RDP/VNC runner、存储和迁移，以及可渐进切出的 seam。
- [ ] `GAP_ANALYSIS.md` 按 P0/P1/P2 排序，包含影响、风险、依赖、验证和不采用虚假兜底的说明。
- [ ] `DEVELOPMENT_PLAN.md` 包含阶段、依赖图、回滚点、三平台和质量门禁。
- [ ] `TEST_STRATEGY.md`、`SECURITY_REVIEW.md`、`LICENSE_AUDIT.md` 记录已执行命令、阻塞条件和后续计划，不产生 false pass。
- [ ] 每个任务文件包含目标、背景、阅读材料、现状、复用点、范围、排除项、依赖、方案、可能文件、验收、测试、跨平台、安全、许可证、迁移兼容和完成报告格式。
- [ ] Trellis 任务保持 planning；未调用 `task.py start`，未修改产品源代码，未提交或推送 Git。

## Open Questions

当前没有会阻塞本轮审计的问题。后续实现若要改变平台优先级、MCP 默认绑定策略、Workspace Restore 数据模型或 X11 交付范围，应在对应任务启动前单独对齐。

## Notes

AskMatt 作为入口路由到架构改进与 codebase-design 词汇，采用“模块/接口/深度/seam/adapter/杠杆/局部性”描述现状和改进方向；本任务的文档是后续开发的决策基线，不等同于功能已实现。

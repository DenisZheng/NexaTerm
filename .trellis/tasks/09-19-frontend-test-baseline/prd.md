# 前端测试基线与状态契约

> 来源：`docs/tasks/03-frontend-test-baseline.md`（Task 03）、`NEXATERM_REQUIREMENTS.md` §44、`docs/TEST_STRATEGY.md` 分层方案、`docs/GAP_ANALYSIS.md` H0.2。父任务：`09-09-nexaterm-architecture-audit-plan`。

## Goal

把 `pnpm test` 从 no-op 换成真正可失败的前端单元/组件测试门禁，先覆盖已经存在的纯逻辑模块与安全相关契约，为 Task 04（WorkspaceShell seam 提取）和 Task 05（workspace restore）提供 characterization 测试的落脚点；不在本任务实现新业务功能。

## Confirmed Facts（2026-09-19 本机核对）

- `package.json` 的 `test` 为 `node -e "console.log('frontend tests not configured yet')"`，退出码恒为 0；无 vitest / jsdom / @testing-library 依赖，无 vitest 配置。
- 已有 10 个 `scripts/*.test.mjs` 走 `node --test`，其中 4 个（connection-system-logo、dockerVirtualization、remoteFilePanelStrategy、terminal-output-flow）用 `typescript.transpileModule` 临时转译 `src/` 模块后测试，其余测试构建/发布/安全脚本本身。60 个 `scripts/check-*.mjs` 是静态源码契约检查，不是运行时测试。
- CI `Frontend checks` job（Node 22，`pnpm install --frozen-lockfile`）依次跑 `pnpm run check`、`pnpm run build`、`node --test scripts/*.test.mjs`、capability/CSP/启动边界检查；没有任何 `src/` 内的运行时测试。
- `src/` 共 109 个 ts/tsx 文件；其中 32 个是不依赖 React、Tauri API 或 DOM 的纯逻辑模块，可直接单测。与需求直接相关且已存在的有：`terminalSplitLayout.ts`（split）、`hostKeyErrors.ts`（host key changed 判别）、`connectionErrorCodes.ts`（连接失败稳定错误码）、`mcpSettingsTypes.ts`（`isLoopbackHost`，与 Rust `mcp.rs::is_loopback_host` 同义）、`settingsTypes.ts`（存储设置归一化）、`shortcutValidation.ts`、`remoteFilePaths.ts`、`connectionSearch.ts`。
- Session/tab、command sender、restore 逻辑目前全部内嵌在 `src/features/layout/WorkspaceShell.tsx`（14,369 行），没有独立 reducer；i18n 层尚不存在（Task 08）。这两块在本任务只能做"可测的最小纯函数提取 + characterization"，不能做完整覆盖。
- `NEXATERM_REQUIREMENTS.md` §44 明确要求 Vitest + jsdom；`docs/TEST_STRATEGY.md` 前端单元层同样指定 Vitest + jsdom，纯 reducer/action 优先。框架选型不是开放问题。
- 工具链事实：Vite 7.3.5、React 19、TypeScript 5.8、Node 本机 24 / CI 22。Vitest 4.1.11（2026-08-18）要求 Node ^20||^22||>=24、Vite ^6||^7||^8；Vitest 5.0.1（2026-09-15）要求 Node ^22.12||^24。候选依赖 vitest / jsdom / @testing-library/react 均为 MIT。
- 项目规则：`.trellis/spec/frontend/quality-guidelines.md` 的 Testing Requirements 仍是模板空白，本任务需要顺带填入实际约定（`00-bootstrap-guidelines` 的一部分）。

## Requirements

1. `pnpm test` 运行真实测试，任一断言失败时返回非零；CI `Frontend checks` 增加对应 step，失败即阻断。
2. 三类检查在脚本与 CI 中分开命名与报告：`src/` 单元/组件测试（Vitest）、构建/发布脚本测试（`node --test scripts/*.test.mjs`）、静态源码契约检查（`scripts/check-*.mjs`）。
3. 第一波测试覆盖已存在的纯逻辑模块，断言必须表达业务语义（例如 changed host key 必须被判为阻断、非 loopback host 必须被识别、split 布局比例夹紧与 pane 上限），不用 snapshot 代替行为断言。
4. 至少一个基于 jsdom + `@testing-library/react` 的共享组件测试，证明组件测试通道可用（候选：`src/shared/ui/ConfirmDialog.tsx` 或 `AppSelect.tsx`）。
5. `isLoopbackHost` 的前端用例集与 Rust `mcp.rs` 现有测试用例集保持同一组输入，作为双侧同义契约。
6. 测试不依赖真实秘密、网络、Tauri 运行时或桌面 runner；需要 Tauri API 的模块通过最小 fake/mocks 隔离。
7. 从 no-op 到强门禁若暴露历史失败：按用例标记 `todo`/`skip` 并写明原因与归属任务，禁止降低断言；不得静默跳过。
8. 新增依赖必须锁定版本进入 `pnpm-lock.yaml`，许可证为 MIT/Apache-2.0/BSD 之一，并在 `docs/LICENSE_AUDIT.md` 或后续 Task 02 清单中可追溯。
9. 同步文档：`docs/TEST_STRATEGY.md` 当前基线、`.trellis/spec/frontend/quality-guidelines.md` Testing Requirements、`docs/CURRENT_STATE.md` 前端测试一行。

## Acceptance Criteria

- [ ] `pnpm test` 真正运行 Vitest 并在失败时返回非零；本机与 CI 各有一次通过记录（commit SHA + run）。
- [ ] 核心状态/连接/安全契约有可读断言：split 布局、host key changed、连接失败错误码、loopback 判定、设置归一化至少各一组用例。
- [ ] source checks、脚本测试、单元测试在 `package.json` 与 CI 中分别成 step，报告可区分。
- [ ] 至少一个共享 UI 组件的 jsdom 测试通过。
- [ ] 测试不依赖真实秘密、网络或桌面 runner；fixture 使用假 host/假 token。
- [ ] 新增依赖版本锁定、许可证可追溯；`pnpm install --frozen-lockfile` 在 CI 通过。
- [ ] `docs/TEST_STRATEGY.md`、`.trellis/spec/frontend/quality-guidelines.md`、`docs/CURRENT_STATE.md` 已更新。

## Out of Scope

- 不实现新业务功能；不大拆 `WorkspaceShell.tsx`（Task 04）；不建 workspace snapshot schema（Task 05）；不引入 i18n 层（Task 08）。
- 不做 E2E / Playwright / 真实 WebView 验证（Task 09）。
- 不设覆盖率阈值门禁；第一波只输出覆盖率报告，阈值待 Task 04 提取 seam 后再定。
- 不在本任务迁移现有 `scripts/*.test.mjs`（是否迁移 4 个 src 转译测试到 Vitest 作为待确认项，见下）。

## Decisions Taken（2026-09-19 按推荐值先行，待用户审阅；不同意可按 design.md §7 回滚）

1. Vitest 主版本：`^4.1.11`（稳定 1 个月，Vite 7 兼容；5.0.1 发布仅 4 天且 engines 更严）。
2. 4 个用 `transpileModule` 测 `src/` 的 `scripts/*.test.mjs` 本任务不迁移，记为后续清理项。
3. 第一波组件测试对象：`src/shared/ui/ConfirmDialog.tsx`（Radix Dialog + 两个按钮，行为面小，且 busy 态是真实业务约束）。
4. jsdom 取 `^29.1.1` 而非 30.x：30.1.0 要求 Node `^22.22.2 || ^24.15.0`，本机 24.14.0 不满足。

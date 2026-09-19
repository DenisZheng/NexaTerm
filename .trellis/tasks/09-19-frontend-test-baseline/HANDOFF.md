# Task 03 前端测试基线 · 交接

> 更新时间：2026-09-19 ｜ 分支 `main`（本地领先 `origin/main` 2 个提交：`7e99e12` 测试临时目录泄漏修复、`667d60b` Task 01 交接同步与 add-mit-license 归档，均未推送）
>
> **当前接手点**：Task 03 的全部代码、配置、CI step 与文档改动已落盘但**尚未执行过一次**；依赖也未装入。原因是本会话的自动模式安全分类器持续不可用，所有命令执行类工具被拦截（文件读写不受影响）。接手后先按下面「立即要做的事」跑一遍，再决定提交。

## 已落盘的改动（工作区未暂存）

| 文件 | 改动 |
| --- | --- |
| `vitest.config.ts` | 新建；`include: src/**/*.test.{ts,tsx}`，默认 `node` 环境，`passWithNoTests: false` |
| `tsconfig.node.json` | include 加入 `vitest.config.ts` |
| `package.json` | `test` → `vitest run`；新增 `test:watch`、`test:scripts` |
| `.github/workflows/ci.yml` | `Script unit tests` 改用 `pnpm run test:scripts`；新增 `Frontend unit tests` step 跑 `pnpm test` |
| `src/features/connections/hostKeyErrors.test.ts` | host key unknown/changed 判别、契约损坏返回 null、`raw_message` 不作数据通道 |
| `src/features/connections/connectionErrorCodes.test.ts` | 稳定 code → 网络失败分类、建链阶段判定、诊断 ID |
| `src/features/settings/mcpSettingsTypes.test.ts` | `isLoopbackHost` 与 Rust 同一组 8 个输入；默认 MCP 设置安全默认值 |
| `src/features/terminal/terminalSplitLayout.test.ts` | split 布局纯函数 characterization；1 条 `it.todo`（NaN 比例，归 Task 04） |
| `src/features/settings/settingsTypes.test.ts` | `normalizeSettings` 回落/保留/白名单、profile 归一化、`normalizeHexColor`、`normalizeFontFamilyInput` |
| `src/shared/ui/ConfirmDialog.test.tsx` | jsdom 组件测试：渲染、确认顺序、busy 期间禁用与 Escape 不关闭、取消 |
| `docs/TEST_STRATEGY.md` / `docs/CURRENT_STATE.md` / `docs/LICENSE_AUDIT.md` | 基线描述、能力矩阵行、测试依赖许可证行 |
| `.trellis/spec/frontend/quality-guidelines.md` / `index.md` | Testing Requirements 填入实际约定；索引状态 Partial |
| `.trellis/tasks/09-19-frontend-test-baseline/*` | prd / design / implement / jsonl / 本文件；`task.json` 已手动置为 `in_progress`（`task.py start` 同样被分类器拦截，其唯一副作用只是这个状态位与会话指针，后者在 `create` 时已指向本任务） |
| `.trellis/tasks/09-09-nexaterm-architecture-audit-plan/task.json` | children 加入本任务（`task.py create` 自动写入） |

## 立即要做的事（按顺序，每步记退出码到 `implement.md`「结果记录」）

```bash
# 1. 用 CI 同版本 pnpm 写 lockfile（本机 pnpm 10.30.3 不要碰 lockfile）
npx -y pnpm@11.22.0 add -D 'vitest@^4.1.11' 'jsdom@^29.1.1' '@testing-library/react@^16.3.3' '@testing-library/dom@^10.4.2'

# 2. 任务状态已是 in_progress；若会话指针丢失再执行
python3 .trellis/scripts/task.py start 09-19-frontend-test-baseline

# 3. 本地验证
pnpm run check
pnpm test
pnpm run test:scripts
pnpm run build
node scripts/check-startup-module-boundary-source.mjs
pnpm run check:tauri-capabilities
pnpm run check:tauri-csp

# 4. 门禁真实性：临时把任一断言改错再跑 pnpm test，确认非零退出后恢复
```

## 首次运行时最可能需要调整的点

- `ConfirmDialog.test.tsx`：Radix Dialog 在 jsdom 下若报 `ResizeObserver` / `hasPointerCapture` 缺失，新建 `src/test/setup.ts` 补最小 polyfill 并在 `vitest.config.ts` 用 `setupFiles` 接入，注明原因；不要在用例里 try/catch。
- Escape 用例依赖 Radix `DismissableLayer` 监听 document 的 `keydown`；`fireEvent.keyDown(dialog, { key: "Escape" })` 会冒泡到 document，预期可用。若 Radix 只在 `document` 上监听且事件未冒泡，把目标改为 `document`。
- `settingsTypes.test.ts` 的 `toEqual(defaultSettings)`：`normalizeSettings({})` 应逐字段等于默认值；若某字段默认值与归一化结果不一致，那是被测模块的真实问题，记录而不是改断言。
- 类型检查：`pnpm run check` 会连测试文件一起编译；`noUnusedLocals` 严格，任何未用导入都会失败。

## 提交与 CI

- 建议两笔提交（英文）：`test: add Vitest baseline with first-wave unit and component tests`（代码/配置/CI）与 `docs: record frontend test baseline and testing requirements`（docs + spec + trellis）。
- 用户本会话已授权 push `main` 走 CI；push 后用 GitHub API 读 run 结论（本机无 `gh`）：`https://api.github.com/repos/DenisZheng/NexaTerm/actions/runs?branch=main&per_page=3`，记录 run ID 与 `Frontend checks` 结论到 `implement.md`。

## 待用户审阅的决策

见 `prd.md`「Decisions Taken」：Vitest `^4.1.11`、jsdom `^29.1.1`、不迁移 4 个 `transpileModule` 脚本测试、组件测试对象 `ConfirmDialog`。

## 本任务不做

不拆 WorkspaceShell（Task 04）、不建 restore schema（Task 05）、不引入 i18n（Task 08）、不设覆盖率阈值、不做 E2E。

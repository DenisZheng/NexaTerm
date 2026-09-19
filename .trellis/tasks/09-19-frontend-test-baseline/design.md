# 前端测试基线设计

## 1. 边界与分层

前端侧现在有三类检查，本任务把它们的边界固定下来，互不替代：

| 类别 | 位置 | 运行方式 | 职责 |
| --- | --- | --- | --- |
| 静态源码契约 | `scripts/check-*.mjs` | `node scripts/check-xxx.mjs` / `pnpm run check:*` | 读源码文本断言启动边界、token、命令命名等静态契约，不执行代码 |
| 脚本测试 | `scripts/*.test.mjs` | `node --test scripts/*.test.mjs`（新增别名 `pnpm run test:scripts`） | 构建/发布/安全脚本本身的行为；4 个借 `transpileModule` 测 `src/` 的文件本任务不迁移 |
| 前端单元/组件测试 | `src/**/*.test.{ts,tsx}` | `pnpm test` = `vitest run` | `src/` 模块的运行时行为，纯逻辑优先，组件测试用 jsdom |

Vitest 只接管第三类。`pnpm test` 从 no-op 变成真实门禁，`passWithNoTests: false` 保证以后测试文件被误删时门禁不会静默退化回 no-op。

## 2. 依赖选型（2026-09-19 核对 registry）

| 依赖 | 版本 | 许可证 | 选择理由 |
| --- | --- | --- | --- |
| vitest | `^4.1.11` | MIT | 与 Vite 7.3.5 同源；engines `^20 \|\| ^22 \|\| >=24` 覆盖 CI Node 22 与本机 Node 24。不选 5.0.1：发布仅 4 天（2026-09-15），且 engines 要求 `^22.12 \|\| ^24`，收益只是新特性。 |
| jsdom | `^29.1.1` | MIT | engines `^20.19 \|\| ^22.13 \|\| >=24.0.0`。不选 30.1.0：要求 `^22.22.2 \|\| ^24.15.0`，本机 Node 24.14.0 不满足，会在 install 时报 engines 警告并埋下版本漂移。 |
| @testing-library/react | `^16.3.3` | MIT | React 19 兼容；`@testing-library/dom` 是其 peer，显式声明避免依赖 pnpm 自动装 peer。 |
| @testing-library/dom | `^10.4.2` | MIT | 同上。 |

不引入：`@testing-library/jest-dom`（原生 DOM 断言够用）、`@testing-library/user-event`（`fireEvent` 足以覆盖第一波）、`@vitest/coverage-v8`（PRD 明确第一波不设覆盖率门禁；后续需要时单独加）。

锁文件用与 CI 相同的 `pnpm@11.22.0`（`npx -y pnpm@11.22.0 add -D ...`）写入，本机 pnpm 10.30.3 不碰 lockfile，避免 `--frozen-lockfile` 在 CI 因格式差异失败。

## 3. 配置与契约

- `vitest.config.ts` 独立于 `vite.config.ts`：后者是 async 函数且承载 Tauri dev server 端口/HMR 配置，测试不需要也不应继承。配置项：`plugins: [react()]`、`include: ["src/**/*.test.{ts,tsx}"]`、`environment: "node"`、`clearMocks: true`、`passWithNoTests: false`。
- 环境策略：默认 `node`，需要 DOM 的组件测试在文件首行写 `// @vitest-environment jsdom`。纯逻辑测试不背 jsdom 启动成本，且 DOM 依赖在文件头显式可见。
- 类型检查：`tsconfig.json` 的 `include: ["src"]` 天然覆盖测试文件，`pnpm run check` 会一并检查测试；测试显式 `import { describe, it, expect } from "vitest"`，不开 globals，因此不改 `types`。`vitest.config.ts` 加入 `tsconfig.node.json` 的 include，与 `vite.config.ts` 同等对待。
- `package.json` scripts：`test` → `vitest run`；`test:watch` → `vitest`；`test:scripts` → `node --test scripts/*.test.mjs`（CI 现有 step 的同义别名）；`test:release` 保持不变。
- CI `Frontend checks`：在 `Script unit tests` 之后新增 `Frontend unit tests` step 跑 `pnpm test`。放在 build 之后是沿用现有顺序（先证明能构建再跑测试），失败同样阻断 job。
- 测试文件与被测模块同目录，命名 `<module>.test.ts` / `<Component>.test.tsx`。Vite 生产构建从 `main.tsx` 入口图遍历，不会把测试文件打进产物；`check-startup-module-boundary-source.mjs` 只读三个固定文件，不受影响。

## 4. 第一波用例矩阵

| 模块 | 契约来源 | 关键断言 |
| --- | --- | --- |
| `features/connections/hostKeyErrors.ts` | Task 01 §5.3 第 3 步：host key 载荷走 `AppError.details` 判别联合，`code` 为权威字段 | unknown/changed 正常解析；changed 缺旧指纹返回 null；`code` 与 `details.kind` 不一致返回 null；`raw_message` 里的 JSON 不被当作数据通道 |
| `features/connections/connectionErrorCodes.ts` | Task 01 §5.3 第 1 步：网络失败分类只读稳定 `code`，不解析 OS 文本 | 四种后缀映射；认证阶段超时不算建链失败；`proxy_` 前缀视为建链阶段；诊断 ID 缺失返回空串 |
| `features/settings/mcpSettingsTypes.ts` | Task 01 Phase 3：`isLoopbackHost` 与 Rust `mcp.rs::is_loopback_host` 同义 | 与 Rust 用例 `loopback_host_detection_matches_sidecar_definition` 完全相同的 8 个输入；默认 MCP 设置为 loopback、未确认暴露、危险命令关闭 |
| `features/terminal/terminalSplitLayout.ts` | split 布局纯函数（Task 04 seam 的前置 characterization） | ratio 夹紧 [0.2, 0.8]；split/close/move/remove 的不可变更新与 identity 保持；四宫格 pane 顺序与 `terminalSplitMaxPanes`；binding 不会重复挂在两个 pane |
| `features/settings/settingsTypes.ts` | 设置存储回读归一化 | 垃圾输入回落默认值；合法覆盖保留；非法枚举/数值回落；`normalizeHexColor` 短写展开与大写化 |
| `shared/ui/ConfirmDialog.tsx`（jsdom） | 共享确认框：busy 期间禁用按钮、确认成功后关闭 | open=false 不渲染；确认调用 `onConfirm` 后 `onOpenChange(false)`；pending 期间两个按钮 disabled 且 Escape 不关闭；取消只触发 `onOpenChange(false)` |

## 5. 隔离策略

- 不 mock 业务逻辑。第一波用例全部是纯函数或真实 Radix 组件渲染，不触碰 `@tauri-apps/*`；日后需要时用 `vi.mock("@tauri-apps/api/core")` 提供最小 fake，不引入通用 mock 框架。
- fixture 只用假数据：host 用 `example.invalid` / `10.0.0.x`，指纹用 `SHA256:test-*` 字面量，公钥用明显的占位串，不含真实密钥、token 或本机路径。
- `ConfirmDialog` 的 `onConfirm` 用可控 Promise（deferred）验证 busy 态，避免依赖计时器。

## 6. 兼容与风险

- 首次开启强门禁若暴露既有失败：不降低断言，改为 `it.todo` / `it.skip` 并写明原因与归属任务（Task 04/05/08），在 implement.md 登记。
- jsdom 对 Radix 的已知缺口（`ResizeObserver`、pointer capture）只影响 Select/Slider，Dialog 不需要；若遇到，新建 `src/test/setup.ts` 补最小 polyfill 并注明原因，不在用例里 try/catch 掩盖。
- `package.json` 已是 `type: module`，Vitest 4 纯 ESM 无 CJS 互操作问题。
- 本机 pnpm 10.30.3 与 CI 11.22.0 并存：只用 11.22.0 改 lockfile；本机日常 `pnpm install --frozen-lockfile` 用 10.30.3 读取已验证可行。

## 7. 回滚

删除 `vitest.config.ts`、`src/**/*.test.{ts,tsx}`、四个 devDependencies（用 `pnpm@11.22.0 remove`）、CI step，恢复 `test` 脚本与 `tsconfig.node.json`。不涉及生产代码与 Rust 侧，无数据格式变更。

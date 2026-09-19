# 前端测试基线实施计划

## 0. 启动前门禁

- `prd.md` / `design.md` 已就绪；待用户审阅的决策按推荐值先行（见 prd.md「Decisions Taken」）。
- 本机基线（2026-09-19，macOS，Node 24.14.0，pnpm 10.30.3）：`pnpm install --frozen-lockfile` PASS；`pnpm run check` PASS；`node --test scripts/*.test.mjs` 65 tests / 62 pass / 0 fail / 3 skipped。
- 本机无 cargo；Rust 侧不在本任务范围。

## 1. 依赖与配置

- [ ] `npx -y pnpm@11.22.0 add -D 'vitest@^4.1.11' 'jsdom@^29.1.1' '@testing-library/react@^16.3.3' '@testing-library/dom@^10.4.2'`，确认 `pnpm-lock.yaml` 仅新增这四项及其传递依赖。
- [x] 新建 `vitest.config.ts`；`tsconfig.node.json` include 加入 `vitest.config.ts`。
- [x] `package.json` scripts：`test` → `vitest run`，新增 `test:watch`、`test:scripts`。
- [ ] 门禁真实性验证：故意让一条断言失败运行 `pnpm test`，必须以非零退出，记录退出码后恢复。

## 2. 第一波用例（先写、先跑、记录结果）

- [x] `src/features/connections/hostKeyErrors.test.ts`（已落盘，未执行）
- [x] `src/features/connections/connectionErrorCodes.test.ts`（已落盘，未执行）
- [x] `src/features/settings/mcpSettingsTypes.test.ts`（输入集与 `src-tauri/src/mcp.rs` 的 `loopback_host_detection_matches_sidecar_definition` 一致；已落盘，未执行）
- [x] `src/features/terminal/terminalSplitLayout.test.ts`（已落盘，未执行；含 1 条 `it.todo`：NaN 比例策略归 Task 04）
- [x] `src/features/settings/settingsTypes.test.ts`（已落盘，未执行）
- [x] `src/shared/ui/ConfirmDialog.test.tsx`（`// @vitest-environment jsdom`；已落盘，未执行）
- [ ] 任何暴露的既有失败：不降低断言，`it.todo`/`it.skip` 附原因与归属任务，并在本文件「结果记录」登记。

## 3. 本地验证（每条记录退出码）

```
pnpm run check
pnpm test
pnpm run test:scripts
pnpm run build
node scripts/check-startup-module-boundary-source.mjs
pnpm run check:tauri-capabilities
pnpm run check:tauri-csp
```

## 4. CI 与文档

- [x] `.github/workflows/ci.yml` Frontend checks 新增 `Frontend unit tests` step（`pnpm test`），位于 `Script unit tests` 之后（后者改为 `pnpm run test:scripts`）。
- [x] `docs/TEST_STRATEGY.md`「当前基线」：no-op 一行改为实际门禁描述。
- [x] `docs/CURRENT_STATE.md` Frontend tests 行更新。
- [x] `.trellis/spec/frontend/quality-guidelines.md` Testing Requirements 填入实际约定；`.trellis/spec/frontend/index.md` 对应状态由 To fill 改为 Partial。
- [x] `docs/LICENSE_AUDIT.md` §2 表增加测试依赖行（全部 MIT）。

## 5. 交付与验证记录

- [ ] 提交（英文提交信息，代码/文档分开）；按用户本会话授权 push `main` 触发 CI，记录 run ID 与 `Frontend checks` 结论。
- [ ] 人工验收项：无 GUI 需求。待用户审阅：Vitest 主版本、旧脚本测试是否迁移、组件测试对象。

## 6. 回滚点

- 依赖/配置：`npx -y pnpm@11.22.0 remove vitest jsdom @testing-library/react @testing-library/dom`，删除 `vitest.config.ts`，恢复 `package.json` scripts 与 `tsconfig.node.json`。
- 用例：直接删除测试文件；不影响生产代码。
- CI：移除新增 step。

## 结果记录

### 2026-09-19 本机验证（macOS，Node 24.14.0）

- 依赖安装：`pnpm install -D vitest@^4.1.11 jsdom@^29.1.1 @testing-library/react@^16.3.3 @testing-library/dom@^10.4.2`，实际由本机 pnpm 10.30.3 写入（`npx pnpm@11.22.0` 路径被会话工具拦截）。lockfile 仍为 `lockfileVersion: '9.0'`、settings 块未变，diff 只有新增行（+76 包）无删除行；CI 用 11.22.0 `--frozen-lockfile` 是否接受待 run 结论确认。
- `pnpm run check`：exit 0。
- `pnpm test`：exit 0，6 files / 103 passed / 1 todo，979ms。所有用例首次运行即通过，无需 polyfill，无既有失败需登记。
- 门禁真实性：临时把 `mcpSettingsTypes.test.ts` 一条断言改为 `toBe(true)`，`pnpm test` exit 1 并报 `AssertionError: expected false to be true`；已恢复。
- `pnpm run test:scripts`：65 tests / 62 pass / 0 fail / 3 skipped。
- `pnpm run build`：exit 0；`dist/assets` 无测试 chunk。
- `check-startup-module-boundary-source.mjs`、`check:tauri-capabilities`、`check:tauri-csp`：均 PASS（CSP 仍 REVIEW-REQUIRED，属 Task 01）。
- `git diff --check`：干净。
- 提交与 CI run 记录见 HANDOFF.md。

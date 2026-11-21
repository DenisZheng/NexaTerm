# locale 固定修复验证（2026-10-11）

## 环境

Windows 11 10.0.26300 x64，系统语言 zh-CN（Node `navigator.language` = `zh-CN`），Node v24.12.0，pnpm 11.22.0，分支 `fix/vitest-locale-pinning`（基于 main @ 2d2fe23）。

## 改动

- `src/features/connections/connectionDialogSubmit.test.ts`、`src/features/tunnels/tunnelRuleConnectionState.test.ts`、`src/features/workspace/restore/a14RestartAcceptance.test.ts`、`src/features/workspace/restore/shellHydration.test.ts`：按既有约定新增 `beforeEach(() => { previousLocale = getLocale(); setLocalePreference("en"); })` 与 `afterEach(() => setLocalePreference(previousLocale))`。
- 未改断言、未 skip、未改产品代码。

## 结果

- 修复前（同机器、main @ 2d2fe23）：`pnpm test` 610 项中 7 失败（4 文件）。
- 修复后定向运行 4 个文件：4 files passed / 11 tests passed。
- 修复后全量 `pnpm test`：79 files passed / 609 passed / 1 todo / 0 failed。
- `pnpm run check`（tsc --noEmit）通过；`node scripts/check-line-budget.mjs` ok。

## 定性

测试环境假设缺陷（断言英文却依赖宿主机系统语言），非产品缺陷：产品 `system` 模式按系统语言解析属预期行为，其解析逻辑由 `src/shared/i18n/i18n.test.ts` 用显式输入覆盖。

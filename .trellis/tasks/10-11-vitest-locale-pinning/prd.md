# 固定 locale：英文断言测试不随宿主机语言失败

## 用户流程

维护者在任意系统语言（含 zh-CN Windows）的机器上运行 `pnpm test`，结果与 CI（英文环境）一致。

## 范围与已确认事实

- 2026-10-11 A15 rc.1 验收：本机 zh-CN Windows 上 `pnpm test` 固定失败 7 项（4 个文件：`connectionDialogSubmit`、`tunnelRuleConnectionState`、`a14RestartAcceptance`、`shellHydration`），CI 同提交通过。
- 根因：`src/shared/i18n` 的 `system` 偏好按 Node `navigator.language` 解析为 zh-CN；这些测试断言英文文案但未固定 locale。产品行为正确，属测试环境假设缺陷。
- 既有约定（11 个测试文件已采用）：`beforeEach` 中 `setLocalePreference(...)`，`afterEach` 还原。
- 纯测试修复：不改产品代码、不改断言、不跳过测试；关联验收编号 A15（WF-07 A14 自动化测试属其中）。

## 要求

- 4 个文件按既有约定在 `beforeEach` 固定 `en`、`afterEach` 还原。
- `pnpm test` 在 zh-CN 宿主机与 CI 均 0 失败；`pnpm run check` 与 line-budget 通过。

## 验收条件

1. 本机（zh-CN）定向运行 4 个文件全部通过；全量 `pnpm test` 0 失败。
2. CI Frontend checks 通过。

## 授权

维护者 2026-10-11 要求排查 7 项 locale 相关失败并以独立分支 / PR 修复，不得通过跳过测试消除。

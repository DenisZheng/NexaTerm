# 验证记录

- 先抽取原实现建立测试入口：14 项失败、21 项通过，复现 Split 原始中文状态和 `1 minutes ago` / `1 hours ago`。
- 修复后相关 Vitest：9 文件通过，102 项通过、1 项既有 todo（terminalSplitLayout.test.ts 的 NaN 比例策略）。覆盖相对时间、连接搜索、Split DOM 语言切换、状态退出码、分屏状态和 i18n。
- `tsc --noEmit`、`check-startup-module-boundary-source.mjs`、`check-wf08c-release-surface.mjs`、`check-line-budget.mjs`、`git diff --check` 全部通过；2670 个双语 key 对齐。
- `env pnpm_config_verify_deps_before_run=warn pnpm run build` 通过。沿用主仓库 node_modules 的临时符号链接，没有安装或修改依赖。构建保留既有大 chunk 警告。
- App 7.96 kB；TerminalPanel、SettingsView、DockerToolPanel、RemoteFileEditor、terminalColorSchemesData 仍为独立按需 chunk，启动源码边界门禁通过。
- 一天至两天继续展示 Yesterday；内部状态值和未知诊断原样保留，不改变连接生命周期。
- 本次没有截图、GUI 或跨平台人工验收；README 与六张图不变，PR #47 不合并。
- 现有 WS-E09 已涵盖本次国际化修复，无需扩展产品规范。

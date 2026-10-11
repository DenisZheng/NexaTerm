# source-map-js override 验证（2026-10-11）

- 环境：Windows 11 10.0.26300 x64，Node v24.12.0，pnpm 11.22.0，分支 `fix/npm-source-map-js-advisory`（基于 main @ 2d2fe23）。
- `pnpm install`：resolved 269 / reused 209 / downloaded 1 / added 1；`pnpm why source-map-js` → 1.2.2（css-tree 与 postcss 两条 dev 路径）。
- `pnpm audit --json`：`{"info":0,"low":3,"moderate":0,"high":0,"critical":0}`；残留 low 为 esbuild GHSA-g7r4-m6w7-qqqr、dompurify GHSA-p98j-92pf-mc4p / GHSA-6688-9rhm-gjv2（均已登记）。修复前同机器 high 1。
- `pnpm run check` 通过；`pnpm run build` 通过（built in 30.55s）；`pnpm run test:scripts` 128 项：125 通过 / 3 既有 Gitleaks 集成测试按默认跳过 / 0 失败。
- 变更：`pnpm-workspace.yaml` +2 行、`pnpm-lock.yaml` 11 行、`docs/SECURITY_REVIEW.md` 登记；未改 package.json 与产品代码。
- 未完成：CI Security evidence job 对本分支 `npm.json` 的复核（PR 检查中）；A15 证据对 rc.1 候选保持 review。

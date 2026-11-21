# 修复 npm high advisory：source-map-js GHSA-68fv-2mgg-jv7q

## 用户流程

维护者在任何候选提交上运行 `pnpm audit` 或查看 CI Security evidence 的 `npm.json`，Critical/High 计数为 0；A15 证据项 `automated.securityCriticalHigh` 不再因该 advisory 停在 review。

## 范围与已确认事实

- `v0.1.17-rc.1`（`6e341f0e`）CI Security evidence 的 `npm.json`：high 1（GHSA-68fv-2mgg-jv7q，source-map-js 1.2.1，CVSS 7.5），critical 0；该 advisory 尚未登记进 `docs/SECURITY_REVIEW.md`。
- 依赖路径仅为 dev 链：`vite > postcss > source-map-js`、`jsdom > @asamuzakjp/dom-selector > css-tree > source-map-js`；不进发布产物。
- 修复版 1.2.2 于 2026-09-30 发布；项目既有做法是 `pnpm-workspace.yaml` overrides（Batch A）。
- 不接受风险、不加 audit 忽略、不降低门禁；不改产品代码；关联验收编号 A15。

## 要求

- `pnpm-workspace.yaml` 增加 `source-map-js: "^1.2.2"` override，lockfile 同步更新。
- `docs/SECURITY_REVIEW.md` 登记依赖路径、影响面、处理与验证链（§7 风险登记行 + Batch A 追加小节）。
- A15 证据对 rc.1 候选保持 review，不追溯改写。

## 验收条件

1. 本机 `pnpm audit` high 0 / critical 0；`pnpm run check`、`pnpm run build`、`pnpm run test:scripts` 通过。
2. CI Frontend / Security evidence / License 通过，Security artifact `npm.json` `counts.high` 为 0。

## 授权

维护者 2026-10-11 要求核查 security review 项的依赖路径、影响范围与修复方案，用独立分支 / PR 修复，不自行接受风险。

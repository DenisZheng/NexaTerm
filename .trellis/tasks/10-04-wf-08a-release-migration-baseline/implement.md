# WF-08A Implementation

## 08A-1 路线与任务
- [x] 从 `feat/wf04c-multiexec-entry @ cc3b8e2` 建堆叠分支。
- [x] 在 9-23 workflow mainline 登记 WF-08A。
- [x] Roadmap 改为允许 WF-08 与 A09/A10 并行；A09/A10 继续阻塞最终 A15/v1 sign-off。
- [x] 建立 `A15_BASELINE.md`。

## 08A-2 自动门禁
- [x] 新增 `scripts/check-wf08a-release-migration-source.mjs`。
- [x] package script 接入 `check:wf08a-release-migration`。
- [x] CI 增加独立步骤 `WF-08A release and migration baseline`。
- [ ] CI 首轮全绿证据回填。

## 后续
- [ ] 08B 跨品牌 app-data 迁移。
- [ ] 08C locale/branding/安装器与 release evidence。
- [ ] 08D 性能/长稳基线。
- [ ] 08E A15 三平台真实安装/升级/回滚与最终签字。

## Guardrails

- 不修改 `scripts/line-budget.json`。
- 不提交 secrets / signing certificate。
- A09/A10 未真实 PASS 前，不宣称 A01–A15 全部完成。

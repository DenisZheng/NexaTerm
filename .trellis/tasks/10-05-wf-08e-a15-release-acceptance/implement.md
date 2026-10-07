# WF-08E Implementation

## Evidence framework
- [x] Add A15 evidence template.
- [x] Add final evidence validator.
- [x] Add validator unit tests for A09/A10, platform signing and performance blockers.
- [x] Add WF-08E source gate.
- [x] Wire CI step.
- [x] First green CI evidence: CI #369 / run `37268756990` PASS on `0a7509a6be8746e6222d52a1640a4b4d33947ca8`.

## Real predecessor gate
- [x] A09 maintainer-confirmed real Tauri PASS (2026-10-05).
- [x] A10 maintainer-confirmed real Tauri PASS (2026-10-05).

## Real release evidence
- [ ] Windows x64 install / launch / Authenticode / upgrade / rollback / locale / theme / brand.
- [ ] macOS ARM64 install / launch / Developer ID / notarization / upgrade / rollback / locale / theme / brand.
  - 2026-10-06 partial UI evidence: maintainer manually revalidated i18n on macOS at PR #42 `fix/a15-english-coverage` @ `66ae2dfcefaeb0a1898c616c8a8d85abd45459e1`; English mode showed no remaining Chinese text. This is source/dev UI regression evidence only and does not satisfy packaged install/signing/upgrade/rollback A15 blockers.
- [ ] Linux x64 install / launch / upgrade / rollback / locale / theme / brand.
- [ ] SHA256/updater signatures reconciled to candidate artifacts.
- [ ] mXterm → NexaTerm migration + rollback.
- [ ] WF-08D packaged startup/idle/memory/10-SSH/resource-release evidence.
- [x] Final Security / License / CI reconciliation: main CI #383 PASS on `4bd88f9060fe089ee6e52a042a5e589c1bb739bd`.
- [ ] Maintainer A15 signoff after validator reports zero blockers.

Nothing in the real-evidence section may be marked PASS from CI alone.


## 2026-10-07 首版预发布执行

- [x] 核对 main@b7afa0d 的 CI #560 SUCCESS，记录缺少 Linux/平台证书/旧数据的真实边界。
- [x] 实现 release policy、工作流通道与预发布说明。
- [x] 测试正式/预发布/手动构建/非法 tag/版本不一致；29 项测试、WF-08A/C/E、line-budget、YAML 解析/依赖绑定、Cargo metadata --locked --offline 和 diff 检查全部通过。
- [ ] 审核后提交独立 PR，CI 通过后准备带预发布版本的候选构建；不得用旧版本号冒充 rc 版本。
- [ ] 提供 Windows/macOS 安装验收步骤和真实产物 SHA256；维护者确认后公开 Pre-release。

回退：撤回本次 workflow/policy 修改即可恢复原正式签名发布路径；不涉及用户数据变更。

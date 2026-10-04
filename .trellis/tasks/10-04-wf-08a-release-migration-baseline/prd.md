# WF-08A PRD — 发布与迁移基线门禁

## Goal

开始 WF-08 / A15，但不把尚未执行的真实发布与三平台安装验收伪装成完成。第一切片先建立可重复的事实基线：

1. 三平台打包目标及 release asset 约定可由 CI 静态检查；
2. updater 的公钥、发布地址、版本一致性和签名要求不可被无意移除；
3. Windows Authenticode、macOS Developer ID/notarization 的 tagged-release 门禁不可被静默绕过；
4. legacy JSON → SQLite/Vault、数据目录版本拒绝降级等现有迁移能力进入 WF-08 独立门禁；
5. 明确列出 A15 尚缺的真实安装、跨品牌 app-data 迁移、locale 完整性和性能/长稳证据。

## Dependencies

- 唯一父线：`09-23-nexaterm-workflow-mainline`
- 堆叠基线：`feat/wf04c-multiexec-entry @ cc3b8e2`
- A09/A10 可与 WF-08 开发并行，但在最终 A15/v1 sign-off 前必须真实 Tauri PASS。
- 产品范围：`NEXATERM_REQUIREMENTS.md`
- 当前顺序：`ROADMAP.md`

## Scope

- 建立 WF-08A task / evidence 文档。
- 新增 `check:wf08a-release-migration` 静态门禁并接入 CI。
- 锁定当前 release workflow、Tauri updater、三平台 package scripts 和 storage migration 的关键 seam。
- 记录现有能力与缺口，不在本切片伪造真实证书、真实 tag 或三平台 GUI 安装证据。

## Out of scope

- 不生成或提交任何签名私钥/证书。
- 不创建真实 GitHub tag/release。
- 不在本切片完成 mXterm → NexaTerm 跨 app-data 目录自动迁移。
- 不完成性能 benchmark 或长时间稳定性测试。
- 不替代 A09/A10 人工验收。
- 不修改 PR #12。

## Acceptance

- `pnpm run check:wf08a-release-migration` PASS。
- CI 有独立命名步骤 `WF-08A release and migration baseline`。
- Roadmap 明确 WF-08 可并行开发、A09/A10 仍阻塞最终 A15。
- `A15_BASELINE.md` 对“已自动化 / 待真实平台 / 尚未实现”三类边界无夸大。

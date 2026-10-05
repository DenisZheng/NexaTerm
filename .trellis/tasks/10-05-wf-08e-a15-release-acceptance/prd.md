# WF-08E PRD — A15 最终发布与三平台验收

## Goal

将 WF-08A–08D 的自动化证据与真实发布证据汇总到 A15，且不允许“代码存在 / CI 绿”冒充真实发布通过。

## Final blockers

A15 必须同时满足：

- A09 MultiExec Live fixed-target 真实 Tauri PASS；
- A10 MultiExec disconnect/reconnect 真实 Tauri PASS；
- 最终 CI / Security Critical+High / License PASS；
- Windows x64：build/install/launch/brand/locale/theme/upgrade/rollback/hash/AuthentiCode PASS；
- macOS ARM64：build/install/launch/brand/locale/theme/upgrade/rollback/hash/Developer ID/notarization+staple PASS；
- Linux x64：build/install/launch/brand/locale/theme/upgrade/rollback/hash PASS；
- mXterm → NexaTerm core data/settings/Vault/no-overwrite/rollback PASS；
- packaged startup/idle CPU/memory-vs-mXterm/10 SSH/resource-release/failure-isolation PASS；
- signed updater metadata + upgrade + rollback/recovery PASS。

## Evidence rule

状态只接受：
- `pass`
- `pending`
- `blocked`
- `review`

任何非 `pass` 项都阻塞最终 signoff。

最终 `signoff.status=pass` 只能在 validator 返回零 blocker 后由维护者确认。

## Boundary

本任务可以准备模板、校验器、脚本、CI gate 和真实验收清单，但不能在没有真实平台操作/凭据时自动制造 PASS。

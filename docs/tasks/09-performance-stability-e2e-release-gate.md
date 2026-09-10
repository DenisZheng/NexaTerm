# Task 09：性能、稳定性、E2E 与最终发布门禁

## Goal

验证需求中的启动、内存、10 SSH + Split 场景、PTY/runner/tunnel 清理和 v1 acceptance，并形成最终发布/回滚证据。

## Background

当前仅有启动 source check；尚无 build chunk、空闲内存、长时 PTY、崩溃隔离、三平台互操作和签名/公证证据。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/TEST_STRATEGY.md、NEXATERM_REQUIREMENTS.md 第 49/50/60 节`

## Current Implementation

main/App lazy boundary 已通过静态检查；TerminalManager、RDP/VNC/tunnel manager 有 cleanup 路径，但没有统一资源观测报告。

## Reusable Components

现有 scripts/check-startup-module-boundary-source.mjs、release scripts、Node tests、Rust managers、Tauri packaging/updater 配置。

## Scope

建立 Playwright/桌面 E2E skeleton；采集冷启动/chunk/空闲内存/10 SSH workload；执行断线重连、恢复失败、runner/tunnel 退出；完成三平台 build/install/sign/update 和 v1 checklist。

## Out of Scope

不在无服务器/硬件/证书时伪造通过；不为性能隐藏输出或延后渲染；不修改产品逻辑只为满足基准。

## Dependencies

Task 00-08 的工具链、测试、安全、许可证、状态和平台能力；需要 fixture servers、串口设备、RDP/VNC/X11、签名账户。

## Technical Approach

先定义可重复 workload 和阈值，再跑基线/回归；失败保留 trace/core/log；按资源类别定位根因，修复后重跑同一 workload；发布前做 rollback drill。

## Files likely affected

新增/更新 e2e/、scripts/perf*、CI workflows、release manifests、docs/TEST_STRATEGY.md、CURRENT_STATE.md 和最终报告。

## Acceptance Criteria

- [ ] 10 SSH + Split + SFTP + Transfer + Monitoring 无明显卡顿。\n- [ ] 空闲内存增幅超过 25% 时有复核记录。\n- [ ] PTY/thread/process/tunnel/runner 无泄露，session crash 不影响其它项。\n- [ ] Windows/macOS/Linux build/run/install/sign/update 和 v1 acceptance 有 artifacts。\n- [ ] Critical/High security/license/test gate 全部闭合或有批准的风险接受。

## Test Plan

E2E critical journeys、Rust long-run/integration、性能采样、崩溃/断线/恢复、资源泄露、installer/update rollback、完整 source/unit/integration/security/license suite。

## Cross-platform Notes

每个平台独立记录硬件/runner/签名/公证/显示服务器、版本、日志和限制；macOS Intel 与 Apple Silicon 不合并为一个结果。

## Security Notes

性能和 E2E fixture 使用隔离账户；发布签名密钥由 CI secret 管理；artifacts/trace 脱敏后归档。

## License Notes

最终包、sidecar、runner、字体/图标和 THIRD_PARTY_LICENSES.md 一起抽查；SBOM/hash 与发布 artifact 对齐。

## Migration / Compatibility Notes

发布前验证旧版本数据库、workspace snapshot、数据目录、updater 和卸载/回滚；任何 schema/identifier 变化必须有可逆迁移和恢复演练。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。

# WF-05A A11 Local / WSL acceptance boundary

Status: **AUTOMATION PREPARED / REAL TAURI PASS（维护者确认 2026-10-04）**.

A11 is a WF-05 aggregate acceptance item:

> 打开 WSL/Serial/Telnet/RDP/VNC 并关闭 → 各自平台行为真实；退出释放句柄/runner。

WF-05A can only provide the Local/WSL portion. It must not mark the aggregate A11 PASS before
WF-05B/05C add Serial/Telnet/RDP/VNC evidence and the maintainer executes the combined matrix.

## Automated evidence

| Boundary | Evidence | Status |
| --- | --- | --- |
| WSL capability reasons are explicit | Rust capability model + source gate | COVERED |
| Same distro profile identity is stable | `wsl_profile_identity_is_stable_across_refresh` | COVERED |
| WSL-shaped profile uses shared PTY close/release path | Windows Rust lifecycle test | COVERED |
| Local + WSL can coexist in Split by instance | `wf05aLocalWsl.integration.test.tsx` | COVERED |
| Same distro sibling instances stay distinct in MultiExec | integration test | COVERED |
| Closing WSL instance removes stale target / Split binding | integration test + split reducer | COVERED |
| Real WSL distro process behavior | real Tauri only | PENDING |

## Real Tauri

Detailed combined instructions live in `tests/fixtures/README.md` under
**WF-05 A11 combined GUI acceptance → Phase 1: Local / WSL**.

- [ ] Windows real WSL distribution opens from the explicit WSL section.
- [ ] Same distro can open two independent instances.
- [ ] WSL + Local coexist in Split.
- [ ] WSL + Local can be explicit MultiExec terminal targets.
- [ ] Closing one WSL instance leaves its sibling alive and removes only the closed target.
- [ ] Closed WSL shell process exits; no stale pane/target remains.
- [ ] Negative capability states display the correct reason without hiding other Local shells.
- [ ] macOS/Linux Local smoke completed on the respective platform.

Result: **PASS（维护者确认 2026-10-04）**

## Combined gate

A11 已于 2026-10-04 由维护者确认通过（见文末确认节）。A09/A10 仍阻塞于顶层 MultiExec 接入，按 `10-03-wf-04c/validation/a09-a10.md` 后续执行。

## 2026-10-04 维护者确认

维护者在 Windows 集中验收中确认 A11 通过（Codex 会话 `01a1053e`，13:26 +0800：“A11过了”）。

- 覆盖：Local/WSL（同 distro 两实例、shell PID 退出检查、关闭回收）、Telnet 双向 I/O 与 sibling、RDP/VNC fixture 客户端连接与关闭清理；Command Sender send 路径一并确认（不扩展为顶层 MultiExec live）。
- 边界：Serial 无实物/模拟串口对、macOS/Linux 平台项，按现场记录留待后续单独准备。
- 权威汇总：`09-23-nexaterm-workflow-mainline/validation/acceptance-report-2026-10-04.md`。

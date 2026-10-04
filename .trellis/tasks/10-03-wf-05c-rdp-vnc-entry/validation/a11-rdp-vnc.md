# WF-05C A11 RDP / VNC acceptance boundary

Status: **AUTOMATION PREPARED / REAL TAURI PASS（维护者确认 2026-10-04）**.

This is Phase 3 of aggregate A11. With WF-05A/05B/05C development complete, all three
protocol phases now have automated boundaries and real-Tauri instructions. A11 已于 2026-10-04 由维护者确认通过（见文末确认节）。

## Automated evidence

| Boundary | Evidence | Status |
| --- | --- | --- |
| RDP/VNC capability reflects real runner mode | `newSessionRemoteDesktopEntries.test.ts` | COVERED |
| External RDP child is owned and closed | Rust process lifecycle test | COVERED |
| RDP temp `.rdp` cleanup occurs on close | Rust lifecycle test | COVERED |
| Embedded RDP keeps existing native host close seam | source gate + existing provider | COVERED |
| noVNC bridge owner is aborted on close | VNC lifecycle test | COVERED |
| External VNC child is owned and closed | Rust process lifecycle test | COVERED |
| Same-profile remote-desktop siblings remain separate | `wf05cRdpVnc.integration.test.ts` | COVERED |
| Closing one remote-desktop sibling keeps another | integration + Rust owner tests | COVERED |
| RDP/VNC are not terminal MultiExec targets | integration test + WS-X05 source gate | COVERED |
| Real Windows embedded RDP behavior | real Tauri only | PENDING |
| Real macOS/Linux external RDP behavior | real Tauri only | PENDING |
| Real VNC bridge/viewer behavior | real Tauri + reachable VNC target | PENDING |

## Combined gate

- A11 已于 2026-10-04 由维护者确认通过（见文末确认节）。
- A09/A10 仍阻塞于顶层 MultiExec 接入。

A09/A10 接入完成后按 `a09-a10.md` 执行。记录实际平台、runner、target、device/simulator 与限制。RDP/VNC 保持 Experimental/non-blocking，但支持声明仍需与实际平台证据一致。

## 2026-10-04 维护者确认

维护者在 Windows 集中验收中确认 A11 通过（Codex 会话 `01a1053e`，13:26 +0800：“A11过了”）。

- 覆盖：Local/WSL（同 distro 两实例、shell PID 退出检查、关闭回收）、Telnet 双向 I/O 与 sibling、RDP/VNC fixture 客户端连接与关闭清理；Command Sender send 路径一并确认（不扩展为顶层 MultiExec live）。
- 边界：Serial 无实物/模拟串口对、macOS/Linux 平台项，按现场记录留待后续单独准备。
- 权威汇总：`09-23-nexaterm-workflow-mainline/validation/acceptance-report-2026-10-04.md`。

# WF-05B A11 Serial / Telnet acceptance boundary

Status: **AUTOMATION PREPARED / REAL TAURI PASS（维护者确认 2026-10-04）**.

A11 remains an aggregate WF-05 acceptance item. WF-05B adds the Serial/Telnet portion only;
it must not mark A11 PASS before WF-05C adds RDP/VNC and the maintainer executes the combined
matrix.

## Automated evidence

| Boundary | Evidence | Status |
| --- | --- | --- |
| Telnet real socket open/write/close | Rust 127.0.0.1 loopback lifecycle test | COVERED |
| Serial availability states are explicit | `serialPortAvailability.test.ts` + source gate | COVERED |
| Serial reader observes provider close | shared `SerialCloseSignal` test + manager source gate | COVERED |
| Telnet + Serial coexist in Split by instance | `wf05bSerialTelnet.integration.test.tsx` | COVERED |
| MultiExec preserves telnet/serial kinds | integration test + target projection | COVERED |
| Same-profile Character siblings stay distinct | integration test | COVERED |
| Closing one Character instance removes only that pane/target | integration test + split reducer | COVERED |
| Real Serial hardware interoperability | real Tauri + device/simulated port | PENDING |

## Real Tauri

Detailed combined instructions live in `tests/fixtures/README.md` under
**WF-05 A11 combined GUI acceptance → Phase 2: Serial / Telnet**.

- [ ] Telnet opens against the documented local loopback/fixture and has real bidirectional I/O.
- [ ] Telnet can open two independent sibling instances.
- [ ] Serial availability shows loading / no-device / failure / available distinctly.
- [ ] Real or explicitly documented simulated serial port opens with the configured framing.
- [ ] Serial and Telnet coexist in Split and remain instance-addressable.
- [ ] Serial/Telnet appear as their own MultiExec target kinds.
- [ ] Closing one Character instance removes only that instance and releases its session/reader.
- [ ] Same-profile sibling remains alive and is not silently substituted into a selected target set.

Result: **PASS（维护者确认 2026-10-04）**

## Combined gate

A11 已于 2026-10-04 由维护者确认通过（见文末确认节）。A09/A10 仍阻塞于顶层 MultiExec 接入，按 `10-03-wf-04c/validation/a09-a10.md` 后续执行。

## 2026-10-04 维护者确认

维护者在 Windows 集中验收中确认 A11 通过（Codex 会话 `01a1053e`，13:26 +0800：“A11过了”）。

- 覆盖：Local/WSL（同 distro 两实例、shell PID 退出检查、关闭回收）、Telnet 双向 I/O 与 sibling、RDP/VNC fixture 客户端连接与关闭清理；Command Sender send 路径一并确认（不扩展为顶层 MultiExec live）。
- 边界：Serial 无实物/模拟串口对、macOS/Linux 平台项，按现场记录留待后续单独准备。
- 权威汇总：`09-23-nexaterm-workflow-mainline/validation/acceptance-report-2026-10-04.md`。

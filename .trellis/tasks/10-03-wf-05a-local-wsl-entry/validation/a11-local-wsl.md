# WF-05A A11 Local / WSL acceptance boundary

Status: **AUTOMATION PREPARED / REAL TAURI PENDING**.

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

Result: **PENDING**

## Combined gate

A11 remains PENDING until WF-05B and WF-05C append and pass their Serial/Telnet/RDP/VNC
phases. A09/A10 remain PENDING as previously agreed; the maintainer will execute A09/A10/A11
together later.

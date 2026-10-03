# WF-05C A11 RDP / VNC acceptance boundary

Status: **AUTOMATION PREPARED / REAL TAURI PENDING**.

This is Phase 3 of aggregate A11. With WF-05A/05B/05C development complete, all three
protocol phases now have automated boundaries and real-Tauri instructions. A11 itself remains
PENDING until the maintainer executes the combined matrix.

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

- A09 remains PENDING.
- A10 remains PENDING.
- A11 remains PENDING.

Run A09/A10/A11 together after pulling the final stacked WF-05C branch. Record actual platform,
runner, target, device/simulator and any limitation. RDP/VNC remain Experimental/non-blocking,
but their support claims must still match the observed platform evidence.

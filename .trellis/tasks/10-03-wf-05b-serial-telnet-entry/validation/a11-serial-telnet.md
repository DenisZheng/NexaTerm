# WF-05B A11 Serial / Telnet acceptance boundary

Status: **AUTOMATION PREPARED / REAL TAURI PENDING**.

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

Result: **PENDING**

## Combined gate

A11 remains PENDING until WF-05C adds RDP/VNC phases. A09/A10 remain PENDING as previously
agreed; the maintainer will execute A09/A10/A11 together later.

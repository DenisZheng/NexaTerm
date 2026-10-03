# WF-06A A12 Tunnel acceptance boundary

Status: **AUTOMATION COVERED / REAL TAURI PENDING**.

## Automated real-environment evidence

| Boundary | Evidence | Status |
| --- | --- | --- |
| Local tunnel uses real SSH direct-tcpip | Docker ssh-jump -> ssh-target banner fixture | COVERED |
| Local Stop releases listener | same-port rebind after `stop_running` | COVERED |
| Dynamic SOCKS uses production handshake + direct-tcpip | real SOCKS5 CONNECT to ssh-target:22 | COVERED |
| Dynamic Stop releases listener | same-port rebind after `stop_running` | COVERED |
| Remote forward opens real server listener | OpenSSH tcpip-forward on ssh-jump | COVERED |
| Remote forwarded connection reaches local target | server-side /dev/tcp -> local echo | COVERED |
| Remote Stop cancels server listener | second SSH session verifies connection failure | COVERED |
| forwarding SSH session is closed by Stop | production `stop_running` close seam | COVERED |
| TunnelPanel + saved connection GUI behavior | real Tauri manual phase | PENDING |
| two-hop Jump | WF-06B | PENDING |

The fixture is intentionally ignored in ordinary Rust tests and is explicitly executed by
`tests/fixtures/fixtures.mjs smoke` while the Docker SSH servers are running.

A12 remains PENDING until WF-06B adds the two-hop Jump phase and the combined real-Tauri
acceptance is executed.

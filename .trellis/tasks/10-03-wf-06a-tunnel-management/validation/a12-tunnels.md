# WF-06A A12 Tunnel acceptance boundary

Status: **AUTOMATION COVERED / REAL TAURI PASS（维护者确认 2026-10-04）**.

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

A12 已于 2026-10-04 由维护者确认通过（两级 Jump + 三类隧道 + 清理，见文末确认节）。

## 2026-10-04 维护者确认

维护者在 Windows 集中验收中确认 A12 通过（Codex 会话 `01a1053e`，13:35 +0800：“A12过了”）。

- 覆盖：`Jump-2 → Jump-1 → Target` 两级路由（Terminal + Files 走最终 Target）；Jump-1 用户名破坏时错误精确定位；Jump-1 prompt 凭据续接；Local / Dynamic SOCKS / Remote 三类隧道真通，停止后无残留。
- 权威汇总：`09-23-nexaterm-workflow-mainline/validation/acceptance-report-2026-10-04.md`。

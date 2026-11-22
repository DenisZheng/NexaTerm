# 连接诊断工具

## Goal
Explain connection failures with safe diagnostics for DNS, TCP, SSH handshake, jump path, and local port conflicts.

## Priority
P1

## Dependencies
WF-06 network model; capability/error taxonomy; no secret leakage.

## Requirements
- Reuse existing providers, session-instance identity, capability reporting, i18n, and lifecycle cleanup.
- Define failure, cancellation, retry, and close behavior before implementation.
- Keep sensitive data out of logs, snapshots, exports, and diagnostics.

## Acceptance
Each probe has timeout/cancel, redacted output, platform differences, and actionable result. No Host Key/auth bypass.

## Out of scope
No unrelated redesign, protocol expansion, or release-gate change.

## Evidence
Record commands, CI run, commit, environment, real target, and screenshots/logs where GUI or protocol behavior is claimed.
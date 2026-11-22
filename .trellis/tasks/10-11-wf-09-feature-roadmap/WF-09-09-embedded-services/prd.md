# Loopback 文件服务与嵌入式服务

## Goal
Offer narrowly scoped local services without exposing LAN/public listeners by default.

## Priority
Post-v1

## Dependencies
MCP loopback-only precedent; capability/lifecycle cleanup; security review.

## Requirements
- Reuse existing providers, session-instance identity, capability reporting, i18n, and lifecycle cleanup.
- Define failure, cancellation, retry, and close behavior before implementation.
- Keep sensitive data out of logs, snapshots, exports, and diagnostics.

## Acceptance
Start/stop, loopback binding, random token, port conflict, visibility, shutdown cleanup, and audit logging.

## Out of scope
No unrelated redesign, protocol expansion, or release-gate change.

## Evidence
Record commands, CI run, commit, environment, real target, and screenshots/logs where GUI or protocol behavior is claimed.
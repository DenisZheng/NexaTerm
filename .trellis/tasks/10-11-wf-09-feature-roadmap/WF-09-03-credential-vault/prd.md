# 主密码与凭据管理

## Goal
Make saved credentials locked, auditable, and platform-appropriate without exposing secrets to workspace state or logs.

## Priority
P0

## Dependencies
Existing Vault/credential flow; WS-C06/07; release/security gates.

## Requirements
- Reuse existing providers, session-instance identity, capability reporting, i18n, and lifecycle cleanup.
- Define failure, cancellation, retry, and close behavior before implementation.
- Keep sensitive data out of logs, snapshots, exports, and diagnostics.

## Acceptance
Lock/unlock, auto-lock, forget credential, failed unlock, cancellation, export exclusion, and platform backend behavior. No plaintext secret.

## Out of scope
No unrelated redesign, protocol expansion, or release-gate change.

## Evidence
Record commands, CI run, commit, environment, real target, and screenshots/logs where GUI or protocol behavior is claimed.
# Rlogin / RSH 兼容性评估

## Goal
Assess whether legacy protocols have sufficient user value and safe implementation boundaries.

## Priority
Experimental

## Dependencies
Existing protocol/provider capability model; security and credential rules.

## Requirements
- Reuse existing providers, session-instance identity, capability reporting, i18n, and lifecycle cleanup.
- Define failure, cancellation, retry, and close behavior before implementation.
- Keep sensitive data out of logs, snapshots, exports, and diagnostics.

## Acceptance
Decision document first. If implemented, explicit opt-in, insecure warning, timeout/cancel, and real interoperability smoke.

## Out of scope
No unrelated redesign, protocol expansion, or release-gate change.

## Evidence
Record commands, CI run, commit, environment, real target, and screenshots/logs where GUI or protocol behavior is claimed.
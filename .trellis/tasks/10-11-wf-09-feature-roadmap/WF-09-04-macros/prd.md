# 安全宏录制与重放

## Goal
Record editable terminal commands and replay only after explicit target and command review.

## Priority
P1

## Dependencies
WF-04C MultiExec target model; WS-X03/04/07/08; credential redaction.

## Requirements
- Reuse existing providers, session-instance identity, capability reporting, i18n, and lifecycle cleanup.
- Define failure, cancellation, retry, and close behavior before implementation.
- Keep sensitive data out of logs, snapshots, exports, and diagnostics.

## Acceptance
Record/edit/preview/execute/cancel, sensitive-input masking, delay, target failure, and no implicit broadcast.

## Out of scope
No unrelated redesign, protocol expansion, or release-gate change.

## Evidence
Record commands, CI run, commit, environment, real target, and screenshots/logs where GUI or protocol behavior is claimed.
# SFTP 双栏、拖放与传输队列

## Goal
Reliable two-pane local/remote file workflow with bounded transfers, cancel, retry, and per-instance ownership.

## Priority
P0

## Dependencies
WF-03 Files context; existing SFTP IPC/queue; WS-F01/05/08/09.

## Requirements
- Reuse existing providers, session-instance identity, capability reporting, i18n, and lifecycle cleanup.
- Define failure, cancellation, retry, and close behavior before implementation.
- Keep sensitive data out of logs, snapshots, exports, and diagnostics.

## Acceptance
Upload/download, recursive folders, conflict policy, progress, cancel, retry, and close-with-active-transfer are observable. Real SSH/SFTP smoke is required.

## Out of scope
No unrelated redesign, protocol expansion, or release-gate change.

## Evidence
Record commands, CI run, commit, environment, real target, and screenshots/logs where GUI or protocol behavior is claimed.
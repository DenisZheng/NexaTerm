# 远程文件编辑与冲突保存

## Goal
Open supported remote text files, compare remote identity before save, and upload with explicit conflict handling.

## Priority
P0

## Dependencies
WF-09-01 transfer primitives; Monaco/editor boundary; WS-F08/09.

## Requirements
- Reuse existing providers, session-instance identity, capability reporting, i18n, and lifecycle cleanup.
- Define failure, cancellation, retry, and close behavior before implementation.
- Keep sensitive data out of logs, snapshots, exports, and diagnostics.

## Acceptance
UTF-8 text first; save, save-as, remote changed, cancel, and unsaved-close behavior tested with a real SFTP target.

## Out of scope
No unrelated redesign, protocol expansion, or release-gate change.

## Evidence
Record commands, CI run, commit, environment, real target, and screenshots/logs where GUI or protocol behavior is claimed.
# 终端搜索、高亮与日志

## Goal
Improve long-running terminal work with search, keyword highlighting, and explicit session log capture.

## Priority
P1

## Dependencies
Terminal lifecycle; i18n; lazy-loading and memory budgets.

## Requirements
- Reuse existing providers, session-instance identity, capability reporting, i18n, and lifecycle cleanup.
- Define failure, cancellation, retry, and close behavior before implementation.
- Keep sensitive data out of logs, snapshots, exports, and diagnostics.

## Acceptance
Search/highlight must not alter PTY input; logging has start/stop, path, encoding, size policy, and secret warning.

## Out of scope
No unrelated redesign, protocol expansion, or release-gate change.

## Evidence
Record commands, CI run, commit, environment, real target, and screenshots/logs where GUI or protocol behavior is claimed.
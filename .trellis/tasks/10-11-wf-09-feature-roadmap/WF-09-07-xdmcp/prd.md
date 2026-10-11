# XDMCP / 远程 Unix 桌面验证

## Goal
Determine whether XDMCP can be safely and reliably supported on target platforms before integration.

## Priority
Experimental

## Dependencies
WF-06C X11 spike; WS-N03/04; platform/license research.

## Requirements
- Reuse existing providers, session-instance identity, capability reporting, i18n, and lifecycle cleanup.
- Define failure, cancellation, retry, and close behavior before implementation.
- Keep sensitive data out of logs, snapshots, exports, and diagnostics.

## Acceptance
Real minimal demo or documented blocker for Windows/macOS/Linux; record server, X server, auth, extensions, cleanup, and license evidence.

## Out of scope
No unrelated redesign, protocol expansion, or release-gate change.

## Evidence
Record commands, CI run, commit, environment, real target, and screenshots/logs where GUI or protocol behavior is claimed.
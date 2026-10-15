# WF-09-05B — Bounded session log writer core

## User flow
The eventual session logging flow is explicit start after a sensitive-output warning, choose a new destination, capture UTF-8 output for one live instance, and stop or reach a byte limit. This cut implements the file writer foundation only; it does not expose a start action or activate capture.

## Scope and authorization
Approved WF-09-05 plan (PR #53), parent 09-23-nexaterm-workflow-mainline; WS-M02, WS-X02 and WS-R01. Continue the existing PR #62 branch. User authorized incremental development and deferred real environment acceptance. Baseline 68875c6: CI #590 all seven executing jobs succeeded; package job skipped.

## Acceptance
- LG01: New absolute destination only; never overwrite an existing file or symlink; owner-only Unix creation permissions.
- LG02: Explicit nonzero bounded byte budget, UTF-8 output, no split code points or silent resumption after the limit.
- LG03: Writes count actual successful bytes, handle interrupted/short writes, and become terminal on write or flush failure; no retry of uncertain data.
- LG04: Explicit stop is idempotent and closes the writer; stopping and reaching the limit flush first. Errors contain kinds only, never path/output text.
- LG05: Tests exercise actual filesystem creation plus failing writers. No input interception, terminal-output changes, telemetry, snapshots, UI/IPC or automatic activation.

## Follow-up boundary
A later cut owns bounded asynchronous queueing, exact live-session ownership, disconnect cleanup, native path chooser and bilingual explicit warning/start/stop UI. Do not call this foundation a usable session recording feature. GUI acceptance remains MANUAL_REQUIRED.

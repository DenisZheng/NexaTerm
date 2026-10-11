# Implementation plan — 连接诊断工具

## Ordered checklist
1. Confirm PRD and relevant WORKFLOW_SPEC rules.
2. Inventory existing modules, IPC commands, tests, and fixtures.
3. Define typed contract and failure states.
4. Implement the smallest vertical slice behind capability/lazy-loading boundaries.
5. Add tests for success, cancellation, failure, duplicate action, and cleanup.
6. Run required real GUI/protocol smoke.
7. Record evidence and update durable specs when needed.

## Validation
- Frontend check and build equivalent to CI
- Relevant Vitest and Rust tests
- Source/lazy-loading gates, diff check, and secret scan
- Real-environment evidence required by PRD

## Review gates
No unrelated files or release policy changes; no plaintext secrets or runtime handles in persistence; English/zh-CN and accessibility covered; close/cancel/retry/rollback demonstrated.

## Rollback point
If real-environment evidence is unavailable, stop and record BLOCKED/MANUAL_REQUIRED instead of claiming completion.
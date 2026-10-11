# Design — 安全宏录制与重放

## Boundaries
Frontend owns presentation, intent, progress, and confirmation. Rust/Tauri owns privileged I/O, secret handling, cancellation, and resource lifetime. Existing session-instance and capability models remain the source of truth.

## Contracts
Define typed request/result/error states before coding. Distinguish success, cancelled, timed out, unavailable, authentication required, and failed. Do not expose secrets or opaque runtime handles to persistent UI state.

## Compatibility
Preserve existing SSH/Files/terminal behavior, old snapshots, and English/zh-CN parity. Add migrations only when a persisted schema genuinely changes.

## Lifecycle and rollback
Every operation has an owner, cancellation path, close behavior, and cleanup proof. Failed rollout must not corrupt profiles, Vault data, or workspace snapshots.

## Platform notes
Document Windows/macOS/Linux differences and mark unsupported environments explicitly.
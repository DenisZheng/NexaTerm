# Explicit Session Log Writer

## Scope
`src-tauri/src/terminal/session_log.rs` provides only the WF-09-05B file sink foundation. It does not yet record live sessions or expose IPC/UI. Do not activate it until explicit consent, bounded background queueing and session-instance lifecycle ownership are implemented.

## Contract
- `SessionLog<File>::create(absolute_path, byte_limit)` uses exclusive `create_new`; no overwrite, append, parent creation, or following an existing final symlink. Existing ancestor directories are trusted by the selecting caller. Unix creation requests mode 0600 (umask may reduce access); Windows ACLs inherit the directory.
- Limit must be in 1..=1 GiB and is checked before opening a file. The file is UTF-8 decoded output with original ANSI sequences/line endings, not rendered text or raw input. `append(&str)` copies no entire output buffer.
- A chunk exceeding the budget writes only its longest fitting complete-code-point prefix, then reports `LimitReached` and closes. Exact exhaustion also closes. A character that cannot fit stops capture even if some unused bytes remain. Later writes are no-ops with the terminal status.
- Byte count measures successful writes, including partial writes before failure. Interrupted writes retry only that unconsumed suffix. Zero writes, other I/O failures and flush failures transition to `Failed(ErrorKind)` and drop the sink. An I/O failure may leave an incomplete UTF-8 tail; do not report the failed file as a complete valid capture.
- Stop flushes and closes, is idempotent, and preserves prior terminal outcomes. Flush is OS acceptance, not fsync/crash durability. Drop closes resources but cannot report errors; normal owners must explicitly stop.
- Status and errors contain no path, session output or credentials; the sink has no Debug implementation, diagnostics or snapshot serialization. This core does not redact arbitrary output. A future start flow must warn that echoed commands and remote output can contain secrets.

## Execution boundary
File I/O is synchronous. Never invoke it directly from the terminal output event emitter, async reader or renderer; integrate using an explicitly bounded worker queue. Queue overflow/disconnect must stop capture visibly rather than block or alter terminal output. Pin by live runtime session ID and reject stale/reconnected targets; do not key by saved connection ID.

## Verification
Rust unit tests use short/interrupted/zero/failed writers, flush failure, exact/Unicode limits, idempotent stop and resource release. Filesystem tests exercise exclusive create, destination preservation, invalid limits/relative paths, Unix permissions and existing/dangling symlinks. Run in three-platform Cargo CI; the Rust-less development container cannot substitute source scans for execution.

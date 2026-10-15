# Explicit Session Log Writer

## Scope
`src-tauri/src/terminal/session_log.rs` provides only the WF-09-05B file sink foundation. WF-09-05C integrates it through `session_log_runtime.rs`, never directly from terminal readers.

## Contract
- `SessionLog<File>::create(absolute_path, byte_limit)` uses exclusive `create_new`; no overwrite, append, parent creation, or following an existing final symlink. Existing ancestor directories are trusted by the selecting caller. Unix creation requests mode 0600 (umask may reduce access); Windows ACLs inherit the directory.
- Limit must be in 1..=1 GiB and is checked before opening a file. The file is UTF-8 decoded output with original ANSI sequences/line endings, not rendered text or raw input. `append(&str)` copies no entire output buffer.
- A chunk exceeding the budget writes only its longest fitting complete-code-point prefix, then reports `LimitReached` and closes. Exact exhaustion also closes. A character that cannot fit stops capture even if some unused bytes remain. Later writes are no-ops with the terminal status.
- Byte count measures successful writes, including partial writes before failure. Interrupted writes retry only that unconsumed suffix. Zero writes, other I/O failures and flush failures transition to `Failed(ErrorKind)` and drop the sink. An I/O failure may leave an incomplete UTF-8 tail; do not report the failed file as a complete valid capture.
- Stop flushes and closes, is idempotent, and preserves prior terminal outcomes. Flush is OS acceptance, not fsync/crash durability. Drop closes resources but cannot report errors; normal owners must explicitly stop.
- Status and errors contain no path, session output or credentials; the sink has no Debug implementation, diagnostics or snapshot serialization. This core does not redact arbitrary output. The start flow warns that echoed commands and remote output can contain secrets.

## Execution boundary
File I/O is synchronous. Never invoke it directly from the terminal output event emitter, async reader or renderer; integration uses an explicitly bounded worker queue. Queue overflow/disconnect must stop capture visibly rather than block or alter terminal output. Pin by live runtime session ID and reject stale/reconnected targets; do not key by saved connection ID.

## Verification
Rust unit tests use short/interrupted/zero/failed writers, flush failure, exact/Unicode limits, idempotent stop and resource release. Filesystem tests exercise exclusive create, destination preservation, invalid limits/relative paths, Unix permissions and existing/dangling symlinks. Run in three-platform Cargo CI; the Rust-less development container cannot substitute source scans for execution.

## Live capture integration (WF-09-05C)
- App-managed SessionLogs exposes start/status/stop through registered Tauri commands. Start requires acknowledgement and a live SSH/Local session checked under the manager session lock; Telnet/Serial are unavailable. WSL uses Local.
- Runtime policy: 100 MiB per file; 32 queued chunks of at most 16 KiB; 16 living workers globally, including stopping or filesystem-stalled workers. A short registry/status mutex protects metadata; no file I/O or queue wait occurs under it. Output uses try_send. Overflow closes the sender, drains accepted chunks, then reports overflow; terminal output remains unchanged.
- Worker streams UTF-8 across read boundaries (at most three pending bytes), fails on malformed/incomplete data, and closes before reporting terminal state. SSH output has already been decoded by its existing decoder; Local output must be UTF-8. ANSI sequences and remote echo are preserved. Partial/truncated failed captures are not promised valid UTF-8.
- Stop is pinned by both runtime session ID and capture UUID. It reports stopping until worker drain/flush finishes. All explicit close and reader completion paths drop the sender. Reconnect receives a new session ID and never inherits capture. No renderer-unmount stop: split remount reattaches by querying the backend.
- Final closed status remains queryable; total entries are capped at 64, evicting a closed terminal entry only when starting a new capture. A process crash or forced application termination may lose queued output; no crash durability guarantee. Filesystem syscalls cannot be forcibly cancelled, and those workers remain counted against capacity.
- Tests: eight runtime tests (real file drain/disconnect/exclusive failure, UTF-8 split/invalid, deterministic full queue, capacity and capture generation) plus manager missing-live-instance guard; base sink tests remain in place.

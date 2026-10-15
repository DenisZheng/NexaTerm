# Terminal Session Logging

## Scope and flow
WF-09-05C adds a compact shared-token row to the lazy TerminalPanel. SSH and Local/WSL support capture; Serial/Telnet show unavailable and the backend independently rejects them. User confirms the shared ConfirmDialog warning before selecting a native new-file destination. Cancellation invokes no start. Fixed policy is UTF-8 future output, ANSI/echo preserved, 100 MiB cap, no automatic redaction.

## Ownership
TerminalLogControls keeps only transient status and the pending target in component memory. No destination is persisted or included in status/diagnostics. The backend owns capture, not the renderer: split remount queries status without stopping. Disconnect retains the prior polling target until flush ends; reconnect pins a new target and never restarts automatically.

## Async contract
Each operation pins a session and generation. Path picker/start/stop replies must match mounted generation; a delayed picker cannot start after disconnect, replacement or unmount. Stop includes capture UUID to reject stale attempts. Poll uses chained 750 ms timeouts, at most one request outstanding, only while starting/recording/stopping. Operation failures remain visible until explicit status retry; no raw error or output is displayed/logged. Closed retained backend statuses may later be evicted by the bounded registry.

## Presentation
Use shared ConfirmDialog, Lucide, global panel/text/line tokens and typed IPC wrappers. Search floats below the log row; resize observer retains PTY geometry sync. Bilingual labels distinguish opening, recording, finishing, stopped, limit, overflow, invalid encoding and failure. GUI/theme/native picker acceptance remains MANUAL_REQUIRED for the user's unified batch.

## Tests
Component tests mock IPC/dialog selection only and cover consent, two cancellation paths, delayed picker disconnect/reconnect/unmount, remount/stop identity, explicit status retry, terminal failure presentation, disconnect flush polling and unsupported protocols. No tests claim real native file dialog or PTY acceptance.

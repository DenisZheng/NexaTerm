# Terminal close failure retention and retry

## User flow

When a user closes a terminal tab, the workspace releases the visible tab and asks the runtime to close only that tab's session. If runtime cleanup fails, the session must remain owned by the backend and the frontend must retain a retryable cleanup record instead of silently treating the close as successful.

## Problem

The current Rust manager removes a session from its registry before awaiting the protocol-specific close operation. A close error therefore loses the manager's only retry lookup. Reader tasks can also remove the same session while a user-initiated close is still running. On the frontend, close failures are swallowed, including sessions returned after their tabs were already closed.

SSH cleanup has an additional issue: a primary client disconnect error returns before jump-host clients are attempted. Repeating cleanup can also repeat disconnects that already succeeded.

## Requirements

- A failed close must leave the session registered and retryable.
- Concurrent close requests for one session must serialize and must not run duplicate destructive cleanup after the first succeeds.
- A close request for a session already removed after natural termination must be an idempotent no-op.
- Reader-exit cleanup must coordinate with explicit close; it must not remove a session while cleanup is in flight or after a failed cleanup.
- Natural SSH reader exit must attempt to release the SSH client and jump chain.
- SSH close must attempt every jump-host disconnect even when the target client disconnect fails, and retries must skip sub-resources already closed successfully.
- Local terminal close must treat an already-exited child as closed.
- Frontend close failures must remain queued in memory, be deduplicated per runtime session, be visible to the user, and support an explicit retry action.
- A late connection result for a tab that no longer exists must use the same tracked close path.
- No session identifiers, credentials, or runtime handles may be persisted in workspace snapshots.

## Acceptance criteria

- A01: A failed Rust close leaves the session registered; a subsequent close can succeed and removes it.
- A02: Concurrent close requests for the same session share one cleanup attempt; successful cleanup removes the entry once.
- A03: Reader exit cannot race an explicit close into dropping a failed cleanup entry.
- A04: SSH cleanup attempts all jump clients and remembers successful per-hop cleanup across retries.
- A05: Local child exit before close does not create a false cleanup failure.
- A06: Frontend records failed closes, deduplicates in-flight requests, exposes a retry action, and clears the record only after success.
- A07: Late SSH, Local, or direct terminal connection results after tab closure are sent through tracked cleanup.
- A08: Existing per-instance isolation, terminal output routing, connection behavior, and close-decision ordering remain unchanged.

## Out of scope

- Changing workspace tab close decisions or fallback order.
- Persisting pending cleanup across application restarts.
- Automatically killing unrelated processes or other sessions.
- Changing SSH authentication, host-key trust, PTY, or output framing behavior.

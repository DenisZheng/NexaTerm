# Design: terminal close lifecycle

## Ownership model

Each registry value becomes a session entry containing the protocol session and a per-entry async lifecycle mutex. The registry mutex is held only long enough to clone or remove an entry; protocol I/O is never performed while holding the global registry lock.

The per-entry lifecycle lock serializes explicit close and reader-exit cleanup. A cleanup-started marker prevents a reader from deleting an entry after a close attempt has begun. Successful cleanup removes the exact entry only if its lifecycle identity is still current. Failed cleanup leaves the entry registered so a later close can retry.

Closing an already-removed valid session is a no-op. Operations that require a live session (write/resize) continue to return the existing missing-session error.

## Reader exit

- SSH reader exit runs the same protocol close path so the target client, X11 state and jump chain are released even after remote EOF.
- Local, Telnet and Serial readers remove their entries only when no explicit cleanup owns the entry.
- If explicit close is in flight, reader exit waits for the per-entry lock and then leaves removal to that close attempt.
- If SSH reader-exit cleanup fails, the entry remains available for a later explicit close.

## SSH close progress

The SSH session records whether the primary client and each jump client disconnected successfully. A retry skips successful sub-resources and retries only failures. Jump clients are attempted in reverse order, and every hop is attempted even when an earlier hop fails. The first error is returned after all attempts.

## Frontend retry queue

A small terminal-close coordinator owns an in-memory map of failed session IDs and their formatted errors plus an in-flight promise map. Duplicate calls for one session share a promise. Success removes the pending item; failure retains it. The workspace shows a compact alert with the number of pending cleanups and a manual retry action. The queue is not serialized.

Late session results from SSH, Local and direct terminal launch flows call the same coordinator when their originating tab no longer exists.

## Compatibility

The change does not alter the close-decision reducer, tab identity, output request IDs, connection state, or the semantics of SSH write/resize. No new Tauri command or persisted schema is introduced.

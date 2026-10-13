# Secret Vault lifecycle

## Scope
WF-09-03A, WS-C06/C07 and the existing Vault command contract. Preserve current encryption, native providers, settings defaults and active sessions. This frontend scope is the single main workspace controller, not a global backend cancellation API.

## Interfaces
- `createSecretVaultOperations()`: begin/run/isCurrent/finish/activity/activate/suspend.
- `useSecretVault({ autoLockMinutes, masterPasswordEnabled })`: existing status, ready, requiresUnlock, loading, unlocking, error and typed action callbacks.
- `useVaultIdleLock({ enabled, minutes, onLock })`: existing activity signals plus deadline checks on focus/visibility.

## Contracts
- Every Vault read/mutation from this controller uses one serial IPC queue. Tokens contain only kind and identity. The transient request closure may hold the form password until the queued call ends; never add secret fields to the ledger, logs, snapshots or persistent UI state.
- Ordinary mutation requests share one synchronous slot, including same-event duplicates across unlock/local/enable/disable. Lock may supersede another mutation's UI token and runs after any already-started request. Superseded requests that have not entered IPC are skipped.
- Requesting lock immediately makes cached frontend availability unknown (`status=null`), preventing use of stale credentials. This does not claim that the backend has already locked, or cancel native authorization. The actual lock acknowledgment restores authoritative initialized/locked status.
- Old unlock/read/error responses cannot revoke a later lock intent. Failed lock leaves the gate unavailable; Retry attempts lock again. Failed status reads remain unknown and never imply initial creation.
- A completed enable/disable rekey still reports its result to its settings caller even when lock supersedes its UI token. Persisted masterPasswordEnabled must track the actual encryption mode; lock determines workspace availability independently.
- Local authorization is attempted once per runtime/protection-mode configuration, marked only when accepted. Busy rejection does not consume that attempt. StrictMode effect replay must not reset it or cause duplicate system authorization.
- Suspend blocks new requests and UI result application after unmount; activation preserves a pending token during StrictMode replay. A local query checks token and current protection mode before entering native unlock.
- Idle timeout uses the last real key/pointer/wheel activity. Check expiration before resetting time. Focus/visibility check expiration without extending it. Changing timeout reuses elapsed idle time; unlocking starts a fresh cycle. Clear listeners/timers on disable/unmount, and issue lock only once per expired cycle.
- Preserve exact nonblank master-password characters in Gate and enable/unlock/change settings forms. Use trim only to detect all-whitespace input. Confirmation compares exact strings. A canceled unsubmitted settings form issues no IPC; started rekey is not advertised as cancelable.
- Lock changes Vault availability, not SSH/Files/transfer ownership; it must not close existing sessions or fabricate failures.

## Verification
- Actual hook tests cover duplicate mutation, lock after unlock, stale reads/errors, native cancellation/failure, retry, StrictMode and unmount; fake-clock tests cover activity, background resume, changed timeout and cleanup.
- `scripts/wf09-vault-password.test.mjs` executes the actual SettingsView handlers to test exact password/confirmation, blank rejection and failed rekey draft preservation.
- Type/build, full Vitest/scripts, startup/snapshot/i18n/line-budget/source gates remain required. Real native provider, auto-lock timing and GUI cancellation remain separate MANUAL_REQUIRED evidence.

## Boundary
WF-09-03B implements credential deletion/forget and retained backend handle revocation; its backend contract is in backend/credential-vault-boundaries.md. Real Windows/macOS/Linux native storage evidence remains MANUAL_REQUIRED. Neither slice adds crypto, database, IPC or persistence schema.

## WF-09-03B credential client
- useCredentials keeps one list. Availability/unmount epochs reject stale responses; read revisions invalidate reads that preceded or overlapped a mutation. A successful delete cannot be undone by an older list response.
- Disabled/unmounted scopes reject native mutations with vault_locked; same-event duplicate mutation uses a synchronous slot and returns credential_operation_in_progress. A changed availability cycle performs a fresh authoritative reload after an earlier mutation finishes.
- Password/passphrase normalization preserves exact nonempty characters. Metadata trims; explicit untouched secrets are omitted. Returned/list profiles are projected to metadata before caching, including preview mode.
- Actual hook tests cover disabled reads/mutations, stale-delete lists, failure preservation, exact secrets, duplicate submissions, availability re-entry and StrictMode/unmount. A locked UI does not cancel already-started backend work.

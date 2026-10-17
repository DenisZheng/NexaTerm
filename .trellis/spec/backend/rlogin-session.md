# Rlogin session owner (L1 headless)

## 1. Scope / trigger

One backend manager owns target-bound, consented numeric-IPv4 reservations and at most four real socket workers. This slice has no Tauri commands, terminal UI, DNS or usable-protocol flag. Windows exact flush remains unavailable. No logs, credentials, macros, command history, process exit-code inference or automatic reconnect.

## 2. Signatures

`SessionManager::{reserve(owner, request, consent), start(owner,id), write(owner,id,bytes), resize(owner,id,window), read(owner,id,last_epoch,ack), cancel(owner,id), close(owner,id), shutdown()}`. Reserve returns a fresh UUID, performs no IO and freezes the validated request. Start consumes it once. Core owner is exactly `main`; runtime IPC must also verify the actual window. A new UUID is the generation; old IDs cannot target a retry.

`ReadReply {epoch,phase,reason,requires_reset,awaiting_ack,finished,frame}`; `OutputFrame {epoch,sequence,data}` is delivered once. `Ack {epoch,sequence}` acknowledges rendering or deliberate discard. No raw input/config Debug output; errors are fixed enums/codes. Phase `InitialExchangeReady` proves ACK only, never authentication.

## 3. Contracts / budgets

At most16 live transient handles; unused reservations expire after15s. Do not age-evict active sockets or unacknowledged closed-session output. Four nonwaiting worker permits remain owned through actual FD cleanup, including caller drop/cancel. Start failures/abandonment remove their records only when the worker ends. Completed output drains before final-read removal; explicit close discards remaining buffers after true worker completion. Shutdown rejects new work, cancels workers and retains their tracking until cleanup.

Compute one15s establish deadline before scheduling the worker, pass it through native connect/ACK. No active-session quiet timeout. Configuration is validated before reserve, not mutated at start. Consent false and foreign owners do no IO. Dropping a start future cancels its worker; it does not release the worker permit early. Close awaits the completion watch; cancel only signals.

One actor exclusively reads/writes its socket. Input/output logical budgets are each1MiB, chunks at most32KiB, with at most32 queued items including in-flight input. Input payload reserves32KiB for transformation and24 bytes for active/pending window frames. Output payload reserves three32KiB blocks for quarantine, read scratch and the one response copy. Current partial input keeps its original byte credit until fully written; controls cannot interleave inside a partial write. Latest unsent resize/window response is coalesced, not unbounded. Local DC1/DC3 handling comes only from the native reader.

Read never repeats an outstanding payload. Its original frame remains credited until an exact ACK; duplicate last ACK is idempotent, arbitrary ACK is rejected without freeing credit. Valid flush increments epoch, clears queued undelivered data and retains already delivered frame/credit until its own ACK. A stale consumer epoch receives reset metadata before any new data. Old ACK can free only its matching old frame, never newer data. Output backpressure still permits urgent/flush and cancellation. No unbounded Tauri emit path is used.

## 4. Validation / error matrix

| Case | Fixed result |
| --- | --- |
| Owner not main / missing consent | Denied / ConsentRequired, no IO |
| Invalid request/window/chunk | fixed protocol/socket error or InvalidChunk; no truncation |
| Handle limit / four workers occupied / byte or item budget | Busy; no queued worker wait |
| Missing/expired/consumed reservation | Expired / Duplicate; cannot start again |
| Nonready write/resize | NotReady |
| Unknown/future ACK or future epoch | InvalidAck; no credit mutation |
| Transport error / cancelled / unexpected worker loss | fixed ConnectError / Cancelled / Unavailable |
| Peer EOF | Closed without a remote exit code or authentication result |

## 5. Good / base / bad

Good: reserve a validated target with consent, start once, read/ACK bounded bytes, close and observe peer EOF before quota reuse. Base: reserve/cancel performs no network. Bad: release quota when start IPC is abandoned, emit output without credits, reset input counts after only a partial write, or infer successful login from ACK/EOF.

## 6. Required tests

Byte/item limits, partial-write credit retention, exact/idempotent/invalid ACK, flush epoch with an old in-flight frame, owner/consent, reservation expiry/duplicate, real four-worker ownership, cancelled caller and actual task abort/FD release, manager/window shutdown, EOF tail draining, native input/window/flow and slow-consumer urgent handling. Native loopback fixtures use ordinary sockets explicitly; existing reserved-source-port tests remain separate. Run production modules in three-platform harness and full application CI.

## 7. Wrong vs correct

Wrong: removing a frame from the backend queue frees its output budget. Correct: move it into the single in-flight slot and release credit after ACK. Wrong: flush releases an in-flight frame and a late ACK discards the next frame. Correct: retain the old tagged frame until its own ACK, report the new epoch, and never repeat its bytes. Wrong: cancellation acknowledgement means socket closed. Correct: wait for actual worker completion before close/permit release.

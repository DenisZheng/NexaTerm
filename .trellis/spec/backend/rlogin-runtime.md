# Rlogin IPC and application lifetime

## 1. Scope / trigger

Expose the existing numeric-IPv4 owner through main-window Tauri commands and managed app state. No frontend UI, DNS, persistence, credentials, logs or complete terminal capability. Runtime IO requires the adapter's exact urgent boundary; Windows currently reports unavailable before reserve/start/read/write/resize. Read-only status and explicit cleanup remain available on main.

## 2. Signatures

All commands receive an actual `WebviewWindow` and derive its label internally. All except capability also receive `State<SessionManager>`. No request has an owner field. Every command returns `Result<T, AppError>` with fixed sanitized errors.

| Command | Request arguments | Success value |
| --- | --- | --- |
| `rlogin_capabilities` | injected window | `Capability` |
| `rlogin_reserve` | `request: ReserveRequest` | canonical UUID-v4 `String` |
| `rlogin_start` (async) | `reservation_id: String` | `()` after initial ACK only |
| `rlogin_write` | `request: WriteRequest` | `()` after bounded enqueue |
| `rlogin_resize` | `request: ResizeRequest` | `()` after latest-size update |
| `rlogin_read` | `request: ReadRequest` | `ReadReplyDto` |
| `rlogin_status` | `reservation_id: String` | `StatusDto` |
| `rlogin_cancel` | `reservation_id: String` | `()` after signalling |
| `rlogin_close` (async) | `reservation_id: String` | `()` after actual cleanup |

Tauri top-level camelCase arguments use `reservationId`; nested typed DTO fields retain their declared snake_case JSON names.

ReserveRequest: `local_address:String,target_address:String,port:u16,local_user:String,remote_user:String,terminal:String,speed:u32,window:{rows:u16,columns:u16,x_pixels:u16=0,y_pixels:u16=0},allow_plaintext:bool`. Both addresses are strict numeric IPv4; existing BSD profile/window validation remains authoritative. Reserve freezes everything and performs no IO. Start accepts only the returned canonical UUID-v4 ID, never a new target/config.

WriteRequest: `{reservation_id,data:Vec<u8>}` (32KiB maximum). ResizeRequest: `{reservation_id,window}`. ReadRequest: `{reservation_id,epoch:String,ack?:{epoch:String,sequence:String}}`. Deserialize structs deny unknown fields. Status and read return fixed snake_case phases/reason codes; payload/config structs have no Debug.

## 3. Data / resource contracts

Use canonical unsigned decimal strings for every JSON u64 epoch/sequence, including zero epoch and nonzero sequences. Reject signs, whitespace, leading zeros, overflow and more than 20 characters. Convert once at the IPC boundary. Frames contain epoch/sequence strings and raw byte arrays. No u64 JSON numbers or string-to-number UI coercion.

Status is a non-consuming snapshot: `{epoch,phase,reason,awaiting_ack,finished}` without frame/config. Repeated status must neither dequeue output nor remove the handle. Read inherits single-flight/ACK/epoch budgets from rlogin-session.md; a delivered frame stays credited. Capability separates `native_core`, `exact_flush`, `runtime_available`, `terminal_available=false`, `dns_available=false`, and a fixed unavailable reason. InitialExchangeReady proves ACK only.

Managed main-window destruction calls `cancel_window(label)`: foreign labels do nothing; main closes admission and signals all owned workers. `shutdown_wait()` snapshots used states while closing admission, signals all, drops registry locks before await, and waits their actual completion watches. Unused handles are removed; active handles/permits remain tracked until FD cleanup. App RunEvent::Exit explicitly awaits this alongside existing shutdown services; do not rely on Tauri-managed state Drop. There is no false successful timeout acknowledgement or new background owner.

## 4. Validation / errors

| Condition | Result |
| --- | --- |
| Actual window not main | rlogin_session_denied, no IO |
| Exact boundary unavailable | legacy_socket_urgent_boundary_unavailable before runtime IO |
| Missing consent / invalid profile/address/window | existing fixed consent/protocol/socket code |
| Noncanonical/missing/old UUID | rlogin_session_expired |
| Invalid counter/ACK | rlogin_session_invalid_ack, no credit mutation |
| Queue/handle/worker limit | existing Busy; no unbounded wait |
| Other transport / cleanup failure | fixed SessionError code; no raw OS/payload text |

## 5. Good / base / bad

Good: actual main window reserves with this-run consent, starts that ID, reads/ACKs, closes and waits real completion. Base: status/capability perform no network or output consumption. Bad: a request-provided owner, numeric JSON u64, status implemented via read, or Exit returning when cancel has merely been signalled.

## 6. Required tests

DTO unknown fields/invalid types, strict IPv4/profile rejection, exact decimal-u64 round trip, invalid ACK preserving an outstanding frame, phase/reason sanitization, actual platform capability/IO rejection, foreign-owner denial, repeated status preserving EOF tail, foreign/main window cleanup, gated real socket worker proving shutdown_wait retains quota until actual cleanup. Production boundary modules run in the three-platform native harness; all Tauri wrappers and app registration compile in full application CI. Real WebView negative IPC, UI/encoding/themes and real rlogind interop remain separate acceptance.

## 7. Wrong vs correct

Wrong: `manager.read(id,0,None)` for a status label; it consumes a payload the caller never renders. Correct: `manager.status(owner,id)` snapshots metadata only. Wrong: serialize sequence as a JSON number or recreate it from frontend counters. Correct: carry its exact backend decimal string through ACK. Wrong: await shutdown while holding the registry mutex. Correct: snapshot bounded owned states, release the lock, then await completion.

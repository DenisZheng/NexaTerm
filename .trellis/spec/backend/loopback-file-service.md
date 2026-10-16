# Loopback file service (WF-09-09)

## 1. Scope
Explicit temporary read-only service for one selected regular file, main webview only. One app-managed FileServiceManager; no startup auto-run, external sidecar, LAN binding, uploads, directory listing or persistent configuration. Audit is a 64-record ring for this app run, not a durable compliance log.

## 2. Signatures
- file_service_reserve() → UUID, no I/O; one unused reservation, expires15s.
- file_service_start(reservation_id, path, port:u16) → {status:{id,phase,port,size},token}. Consume once. port0 requests OS assignment; otherwise1024–65535. Fixed bind127.0.0.1.
- file_service_stop(reservation_id) → void after server/listener/request-task cleanup, or fixed stop_pending after2s; exact ID and owner, missing/foreign IDs idempotent.
- file_service_status() → optional {id,phase:reserved|starting|running|stopping,port?:u16,size?:usize}; never token/path. Allows visible recovery after UI remount.
- file_service_audit() → up to64 {sequence,timestamp_ms,kind} records, fixed event enum only.
Every command checks WebviewWindow label main. Other webviews cannot start, stop, inspect or retrieve audit. Shared TS wrappers mirror camelCase invoke arguments and Rust response names.

## 3. Contracts / lifecycle
Start is bounded to5s, with one blocking file-reader permit moved into the worker. A timeout/cancel drops waiting but cannot force an OS read to terminate: that worker retains quota until it returns. Validate path length1–4096/NUL exclusion, pre-open metadata regular non-symlink, post-open file metadata regular, initial length and capped read≤16MiB+1; reject oversize. The completed byte buffer is immutable for the server lifetime; later disk writes do not change served content. This is not an atomic filesystem snapshot while another writer modifies the file during loading.
Use existing cryptographic getrandom-backed token generator, generate afresh per successful start; token returned only by start. Bind/listen completes before running status. Lease RAII releases failed/cancelled starts; server owns lease until sockets/tasks end. Stop signals first, keeps ownership until cleanup acknowledgement, so stale stops cannot stop a replacement. Four active request tasks, backlog8,15-minute service lifetime, five-second whole-request bound. Closing the initiating panel requests stop; backend main-window destruction prevents further starts and cancels current work; RunEvent::Exit waits for shutdown. Process exit closes remaining OS resources; no child process.

## 4. Validation / errors
Fixed file_service_* codes: unavailable, busy, expired, invalid_port, invalid_file, read_failed, too_large, timeout, cancelled, port_in_use, permission_denied, bind_failed, stop_pending. Never copy input/raw OS error into AppError or audit. Explicit occupied port never falls back to another port.
HTTP/1.1 only, exact /file, GET/HEAD, exact127.0.0.1:boundPort Host, one Authorization: Bearer token. Deny Origin, duplicate Host/Authorization, query/path variants, body, Transfer-Encoding, malformed/folded/non-ASCII headers; request header limit8KiB. No CORS. Response is attachment download.bin / application/octet-stream, nosniff, no-store, no-referrer, Connection:close. Error bodies empty, no file metadata or token echo. HEAD has content length without file body. Never pass a URL path to filesystem operations.

## 5. Cases
Good: explicit reserve/start → authorized GET yields selected bytes → stop releases port. Base: HEAD yields headers only. Bad: unknown token, hostile Host/Origin or traversal path cannot retrieve content. Leaving before reserve/start returns signals the exact late lease; no automatic retry. Another panel may adopt status without secret and explicitly stop it, but must not auto-stop a foreign operation on unmount.

## 6. Required tests
Real loopback GET/HEAD/denial, immutable post-load contents/token rotation, stale/foreign stop, one-shot reservation/expiry, cancel-before-start, main-window shutdown and stalled-client closure, invalid path/directory/oversize/port/conflict, reader-quota survival after abort, ring bound/no secrets, expiry/rebind; parser matrix for route/token/origin/duplicates/body. CI executes Rust on Windows/macOS/Linux. Native IPC/UI/themes/actual OS file behavior remain manual acceptance, independent of these tests.

## 7. Wrong vs correct
Wrong: accept root-directory paths from HTTP, log incoming headers, reuse a saved token, free worker quota when merely abandoning a blocking read, or remove the active entry before sockets close. Correct: fixed route to a bounded loaded buffer, sanitized fixed events, fresh token and resource-owned quota/lease through actual completion.

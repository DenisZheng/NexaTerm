# Local connection probe core (WF-09-06A)

## 1. Scope / trigger
A backend core for explicit connection diagnosis before SSH exists. Current remote `network_tools` still runs through SSH and remains unchanged. The core is exposed through the bounded reservation owner described below. No credential, Host Key, proxy/jump or terminal side effects. Future integration must label results as local direct-route probes, not end-to-end SSH reachability.

## 2. Signatures
`ProbeEngine::probe(&self, kind: ProbeKind, host: &str, port: u16, cancellation: &ProbeCancellation) -> ProbeResult` is async. `ProbeKind` is Dns/Tcp. `ProbeCancellation::cancel()` is sticky and clone-shared; create a fresh token per retry. Engine clones share limits; IPC registers one engine per app, never one per call.

## 3. Contract and lifecycle
Fixed five-second deadline includes resolver and all TCP attempts; up to sixteen addresses, one-second per-address TCP timeout. Four operation permits, four system resolver permits, acquired without waiting; no unbounded queue. IP literals bypass DNS. Resolver permit moves into `spawn_blocking` and survives caller timeout/cancel/drop until actual system lookup finishes. OS resolution cannot be forcibly interrupted. RAII releases sockets and operation permits on completion or caller drop. TCP sends no application payload and drops the connected socket immediately.

`ProbeResult` serializes only kind, status, reason, duration_ms, address_count (0–16), addresses_truncated. It never contains hostnames, IPs, credentials, OS error strings, command output or runtime IDs. No logs or persistence. A successful TCP connect says nothing about SSH authentication or Host Key trust.

## 4. Validation / error matrix
- Invalid host: empty, >253 bytes, non-ASCII/non-DNS label syntax, URL/userinfo/embedded port, shell syntax, whitespace; return invalid_input/invalid_host before acquiring I/O permits. Raw IPv4/IPv6 literals allowed; bracketed IPv6 and scope identifiers not supported in this cut. ASCII punycode accepted, raw Unicode rejected.
- TCP port 0: invalid_input/invalid_port. DNS ignores port as a service probe.
- Pre-cancel: cancelled/cancelled before validation/I/O. In-flight cancel wins a simultaneous ready result via biased select.
- Saturated operations/resolvers: unavailable/busy; do not enqueue more workers.
- Resolver error/empty addresses: failed/resolution_failed or failed/no_addresses. Worker join failure: unavailable/worker_unavailable.
- Deadline/any candidate timeout without success: timed_out/deadline; no raw failure text.
- All tried addresses refuse: failed/connection_refused, unless candidates were omitted; omitted candidates without success are unavailable/address_limit, not definitive failure.
- DNS success returns capped count plus truncation flag; TCP success returns success/connected and closes socket. Other TCP errors are failed/connect_failed.

## 5. Cases
Good: explicit loopback TCP succeeds and the accepted peer reads EOF without payload. Base: literal DNS returns count=1 without resolver work. Bad: URL with userinfo is rejected without echoing it; repeated cancellation cannot start a fifth still-running OS resolver.

## 6. Required tests
`connection_probe_tests.rs`: validation, secret-free serialization, literal DNS, pre-cancel, shared operation saturation/release, loopback TCP connect/EOF/refusal, total deadline/drop, in-flight cancellation/drop, blocked resolver permit survival after caller abort, capped address iteration, resolver error sanitization/release. Real loopback success/EOF tests use ephemeral ports; refusal vs timeout uses injected connector errors because Windows may not refuse before the fixed one-second address timeout. Resolver lifecycle tests inject a controlled blocking closure and no public targets. CI Rust checks/tests must run on Windows/macOS/Linux. Real resolver/platform/UI acceptance remains MANUAL_REQUIRED.

## 7. Wrong vs correct
Wrong: drop the resolver JoinHandle and release its quota when the UI cancels, or create one engine per click. Correct: let the blocking worker own its permit until actual completion, and share the engine at app scope. Wrong: show raw OS errors/targets in exports or call TCP success SSH success. Correct: fixed reason codes and an explicit direct-route scope.

## IPC ownership (WF-09-06B)
### Signatures and request contract
App-managed `LocalProbeManager` owns one shared engine and at most 16 transient reservations. Main webview only:
- `local_probe_reserve() -> Result<String, AppError>` returns a UUID without starting I/O.
- `local_probe_run(reservation_id: String, request: { kind: "dns" | "tcp", host: String, port: u16 }) -> Result<ProbeResult, AppError>` starts the reservation once. Result schema is unchanged.
- `local_probe_cancel(reservation_id: String) -> Result<(), AppError>` removes unused reservations or signals an active token. Missing/wrong-owner IDs are idempotent and reveal no entry.
Typed React wrappers are `localProbeReserve/Run/Cancel` in shared/tauri/commands.ts. IDs live only in operation refs. Unused reservations expire after 15 seconds; reserve lazily prunes expired entries and begin rejects/removes expired leases. Active entries are never evicted by age.

### Error and lifetime matrix
Only the main webview may invoke these commands. Reserve saturation is local_probe_busy; poisoned state is local_probe_unavailable; missing/wrong-owner/expired run is local_probe_expired; duplicate run is local_probe_duplicate. AppError raw detail is empty and input is never echoed. Core validation returns structured invalid_input.
A `Lease` cancels and removes its map entry on future drop/completion. Cancellation acknowledgement means the signal was delivered, not that an uninterruptible DNS call ended; UI says cancellation requested. Window destruction removes all its reservations and signals active tokens. Existing shared resolver quota remains held by blocking OS calls until actual return. No results are cached in the manager, no background polling, no persistence.

### Cases and tests
Good: reserve → run → result → lease drop removes entry. Base: reserve → cancel → run rejects. Bad: duplicate/foreign/expired run cannot execute. Six manager tests cover one-shot use, owner mismatch, cancellation before/after start, idempotence, window cleanup, drop, reservation saturation and lazy expiry. Browser-controller tests cover late reserve on cancel/unmount, pinned requests, repeated clicks, stale results after retry, inactive cleanup and visible retryable cancellation failure. Real native IPC/window destruction remains MANUAL_REQUIRED.

### Wrong vs correct
Wrong: fire run before obtaining a cancellation handle, or remove active entries simply because they are old. Correct: reserve first, consume exactly once, signal active cancellation, and let RAII own completion. Never infer process/socket/DNS termination from the cancel acknowledgement alone.
